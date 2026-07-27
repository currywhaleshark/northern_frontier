#!/usr/bin/env python3
"""Build a toroidal terrain texture from a larger generated material sample.

The output is assembled without alpha feathering. A minimum-error cut chooses
where two source regions meet, while the exported outer edges remain adjacent
pixels from the source image. This keeps pixel detail crisp and makes the
result safe to repeat in both axes.
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--reference-sheet", type=Path, required=True)
    parser.add_argument("--season-row", type=int, choices=range(4), required=True)
    parser.add_argument("--reference-column", type=int, choices=range(6), default=0)
    parser.add_argument("--output-hd", type=Path, required=True)
    parser.add_argument("--output-standard", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True)
    parser.add_argument("--size", type=int, default=448)
    parser.add_argument("--overlap", type=int, default=64)
    parser.add_argument("--candidates", type=int, default=48)
    parser.add_argument("--seed", type=int, default=73021)
    return parser.parse_args()


def match_reference_color(source: np.ndarray, reference: np.ndarray) -> np.ndarray:
    source_float = source.astype(np.float32)
    reference_float = reference.astype(np.float32)
    source_mean = source_float.mean(axis=(0, 1), keepdims=True)
    source_std = source_float.std(axis=(0, 1), keepdims=True)
    reference_mean = reference_float.mean(axis=(0, 1), keepdims=True)
    reference_std = reference_float.std(axis=(0, 1), keepdims=True)
    contrast = np.clip(reference_std / np.maximum(source_std, 1.0), 0.75, 1.6)
    matched = (source_float - source_mean) * contrast + reference_mean
    return np.clip(np.rint(matched), 0, 255).astype(np.uint8)


def minimum_path(cost: np.ndarray) -> tuple[np.ndarray, float]:
    rows, columns = cost.shape
    cumulative = cost.astype(np.float64).copy()
    parent = np.zeros((rows, columns), dtype=np.int16)
    for row in range(1, rows):
        previous = cumulative[row - 1]
        for column in range(columns):
            left = max(0, column - 1)
            right = min(columns, column + 2)
            offset = int(np.argmin(previous[left:right]))
            chosen = left + offset
            cumulative[row, column] += previous[chosen]
            parent[row, column] = chosen
    path = np.zeros(rows, dtype=np.int16)
    path[-1] = int(np.argmin(cumulative[-1]))
    for row in range(rows - 1, 0, -1):
        path[row - 1] = parent[row, path[row]]
    return path, float(cumulative[-1, path[-1]] / rows)


def wrap_horizontal(
    window: np.ndarray,
    output_width: int,
    overlap: int,
) -> tuple[np.ndarray, float]:
    base = window[:, :output_width].copy()
    continuation = window[:, output_width : output_width + overlap]
    # A cut at k joins continuation[k - 1] to base[k].
    cost = np.abs(
        continuation[:, :-1].astype(np.int16) - base[:, 1:overlap].astype(np.int16)
    ).mean(axis=2)
    path, score = minimum_path(cost)
    for row, path_column in enumerate(path):
        cut = int(path_column) + 1
        base[row, :cut] = continuation[row, :cut]
    return base, score


def make_toroidal(
    window: np.ndarray,
    size: int,
    overlap: int,
) -> tuple[np.ndarray, float]:
    horizontal, score_x = wrap_horizontal(window, size, overlap)
    vertical_transposed, score_y = wrap_horizontal(
        np.transpose(horizontal, (1, 0, 2)),
        size,
        overlap,
    )
    return np.transpose(vertical_transposed, (1, 0, 2)), score_x + score_y


def choose_best_texture(
    source: np.ndarray,
    size: int,
    overlap: int,
    candidates: int,
    seed: int,
) -> tuple[np.ndarray, tuple[int, int], float]:
    window_size = size + overlap
    if source.shape[0] < window_size or source.shape[1] < window_size:
        raise ValueError(
            f"input must be at least {window_size}x{window_size}, got "
            f"{source.shape[1]}x{source.shape[0]}"
        )
    rng = random.Random(seed)
    origins = {(0, 0)}
    max_x = source.shape[1] - window_size
    max_y = source.shape[0] - window_size
    while len(origins) < candidates:
        origins.add((rng.randint(0, max_x), rng.randint(0, max_y)))

    best_texture: np.ndarray | None = None
    best_origin = (0, 0)
    best_score = float("inf")
    for x, y in sorted(origins):
        window = source[y : y + window_size, x : x + window_size]
        texture, score = make_toroidal(window, size, overlap)
        if score < best_score:
            best_texture = texture
            best_origin = (x, y)
            best_score = score
    assert best_texture is not None
    return best_texture, best_origin, best_score


def seam_metrics(texture: np.ndarray) -> tuple[float, float, float]:
    pixels = texture.astype(np.int16)
    seam = (
        np.abs(pixels[:, -1] - pixels[:, 0]).mean()
        + np.abs(pixels[-1] - pixels[0]).mean()
    ) / 2
    internal = (
        np.abs(pixels[:, 1:] - pixels[:, :-1]).mean()
        + np.abs(pixels[1:] - pixels[:-1]).mean()
    ) / 2
    return float(seam), float(internal), float(seam / max(internal, 0.001))


def save_outputs(
    texture: np.ndarray,
    output_hd: Path,
    output_standard: Path,
    qa_path: Path,
) -> None:
    output_hd.parent.mkdir(parents=True, exist_ok=True)
    output_standard.parent.mkdir(parents=True, exist_ok=True)
    qa_path.parent.mkdir(parents=True, exist_ok=True)
    hd = Image.fromarray(texture, mode="RGB")
    hd.save(output_hd, optimize=True)
    standard = hd.resize((hd.width // 2, hd.height // 2), Image.Resampling.BOX)
    standard.save(output_standard, optimize=True)
    qa = Image.new("RGB", (hd.width * 3, hd.height * 3))
    for row in range(3):
        for column in range(3):
            qa.paste(hd, (column * hd.width, row * hd.height))
    qa.save(qa_path, optimize=True)


def main() -> None:
    args = parse_args()
    source = np.asarray(Image.open(args.input).convert("RGB"))
    sheet = np.asarray(Image.open(args.reference_sheet).convert("RGB"))
    reference_x = args.reference_column * 56
    reference = sheet[
        args.season_row * 56 : (args.season_row + 1) * 56,
        reference_x : reference_x + 56,
    ]
    matched_source = match_reference_color(source, reference)
    texture, origin, score = choose_best_texture(
        matched_source,
        args.size,
        args.overlap,
        args.candidates,
        args.seed + args.season_row,
    )
    save_outputs(texture, args.output_hd, args.output_standard, args.qa)
    seam, internal, ratio = seam_metrics(texture)
    print(
        f"origin={origin} cut_score={score:.3f} "
        f"seam={seam:.3f} internal={internal:.3f} ratio={ratio:.3f}"
    )


if __name__ == "__main__":
    main()
