#!/usr/bin/env python3
"""Compose the generated court-grant and footwear sheet into a 4x4 UI atlas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "public" / "assets" / "ui" / "court-item-icons-v1.png"
DEFAULT_PREVIEW = ROOT / "tmp" / "imagegen" / "court-item-icons-v1" / "preview-4x.png"
GRID_SIZE = 4
CELL_SIZE = 128
MAX_EXTENT = 106
EMPTY_FRAME = 15


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="transparent 4x4 source sheet")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--preview", type=Path, default=DEFAULT_PREVIEW)
    return parser.parse_args()


def transparent_gutter_boundaries(
    alpha: Image.Image,
    axis: str,
) -> list[int]:
    extent = alpha.width if axis == "x" else alpha.height
    cross_extent = alpha.height if axis == "x" else alpha.width
    search_radius = max(12, round(extent / 16))
    pixels = alpha.load()
    boundaries = [0]
    for division in range(1, GRID_SIZE):
        nominal = round(division * extent / GRID_SIZE)
        start = max(boundaries[-1] + 1, nominal - search_radius)
        end = min(extent - 1, nominal + search_radius)
        scores: list[tuple[int, int, int]] = []
        for position in range(start, end + 1):
            if axis == "x":
                score = sum(pixels[position, offset] for offset in range(cross_extent))
            else:
                score = sum(pixels[offset, position] for offset in range(cross_extent))
            scores.append((score, abs(position - nominal), position))
        boundaries.append(min(scores)[2])
    boundaries.append(extent)
    return boundaries


def source_cell(
    sheet: Image.Image,
    x_boundaries: list[int],
    y_boundaries: list[int],
    column: int,
    row: int,
) -> Image.Image:
    left = x_boundaries[column]
    right = x_boundaries[column + 1]
    top = y_boundaries[row]
    bottom = y_boundaries[row + 1]
    return sheet.crop((left, top, right, bottom))


def fit_frame(source: Image.Image, index: int) -> Image.Image:
    frame = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    bounds = source.getchannel("A").getbbox()
    if index == EMPTY_FRAME:
        if bounds is not None:
            visible = source.crop(bounds)
            if visible.getchannel("A").getextrema()[1] > 16:
                raise ValueError("the reserved final atlas cell is not empty")
        return frame
    if bounds is None:
        raise ValueError(f"atlas source cell {index + 1} is empty")

    cropped = source.crop(bounds)
    scale = min(MAX_EXTENT / cropped.width, MAX_EXTENT / cropped.height)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    position = (
        (CELL_SIZE - resized.width) // 2,
        (CELL_SIZE - resized.height) // 2,
    )
    frame.alpha_composite(resized, position)
    return frame


def checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (43, 46, 52, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (x, y, x + square - 1, y + square - 1),
                    fill=(67, 71, 80, 255),
                )
    return image


def main() -> None:
    args = parse_args()
    sheet = Image.open(args.input).convert("RGBA")
    alpha = sheet.getchannel("A")
    x_boundaries = transparent_gutter_boundaries(alpha, "x")
    y_boundaries = transparent_gutter_boundaries(alpha, "y")
    atlas = Image.new(
        "RGBA",
        (GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE),
        (0, 0, 0, 0),
    )

    for index in range(GRID_SIZE * GRID_SIZE):
        column = index % GRID_SIZE
        row = index // GRID_SIZE
        frame = fit_frame(
            source_cell(sheet, x_boundaries, y_boundaries, column, row),
            index,
        )
        atlas.alpha_composite(frame, (column * CELL_SIZE, row * CELL_SIZE))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, optimize=True)

    preview = checkerboard(atlas.size)
    preview.alpha_composite(atlas)
    preview = preview.resize(
        (preview.width * 2, preview.height * 2),
        Image.Resampling.NEAREST,
    )
    args.preview.parent.mkdir(parents=True, exist_ok=True)
    preview.save(args.preview, optimize=True)

    print(args.output)
    print(args.preview)
    print(f"x boundaries: {x_boundaries}")
    print(f"y boundaries: {y_boundaries}")


if __name__ == "__main__":
    main()
