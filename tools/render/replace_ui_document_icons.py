#!/usr/bin/env python3
"""Replace the petition and decree cells with East Asian scroll icons."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ATLAS_PATH = ROOT / "public" / "assets" / "ui" / "action-symbol-icons-v1.png"
CELL_SIZE = 64
PETITION_CELL = (3, 0)
DECREE_CELL = (3, 3)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--petition", type=Path, required=True)
    parser.add_argument("--decree", type=Path, required=True)
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=ROOT / "tmp" / "imagegen" / "ui-document-icons-v1",
    )
    return parser.parse_args()


def fit_icon(source_path: Path, max_extent: int = 54) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    alpha_bounds = source.getchannel("A").getbbox()
    if alpha_bounds is None:
        raise ValueError(f"{source_path} contains no visible pixels")
    cropped = source.crop(alpha_bounds)
    scale = min(max_extent / cropped.width, max_extent / cropped.height)
    target_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(target_size, Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    position = (
        (CELL_SIZE - resized.width) // 2,
        (CELL_SIZE - resized.height) // 2,
    )
    frame.alpha_composite(resized, position)
    if any(frame.getpixel(corner)[3] for corner in (
        (0, 0),
        (CELL_SIZE - 1, 0),
        (0, CELL_SIZE - 1),
        (CELL_SIZE - 1, CELL_SIZE - 1),
    )):
        raise AssertionError(f"{source_path} touches a frame corner")
    return frame


def replace_cell(atlas: Image.Image, cell: tuple[int, int], frame: Image.Image) -> None:
    left = cell[0] * CELL_SIZE
    top = cell[1] * CELL_SIZE
    atlas.paste((0, 0, 0, 0), (left, top, left + CELL_SIZE, top + CELL_SIZE))
    atlas.alpha_composite(frame, (left, top))


def checkerboard(size: tuple[int, int], square: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (48, 51, 58, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle(
                    (x, y, x + square - 1, y + square - 1),
                    fill=(74, 78, 87, 255),
                )
    return image


def main() -> None:
    args = parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    if atlas.size != (CELL_SIZE * 4, CELL_SIZE * 4):
        raise ValueError(f"unexpected action atlas size: {atlas.size}")

    petition = fit_icon(args.petition)
    decree = fit_icon(args.decree)
    replace_cell(atlas, PETITION_CELL, petition)
    replace_cell(atlas, DECREE_CELL, decree)
    atlas.save(ATLAS_PATH, optimize=True)

    petition_path = args.work_dir / "petition-rolled-64.png"
    decree_path = args.work_dir / "decree-unrolled-64.png"
    petition.save(petition_path, optimize=True)
    decree.save(decree_path, optimize=True)

    preview = checkerboard((CELL_SIZE * 2, CELL_SIZE))
    preview.alpha_composite(petition, (0, 0))
    preview.alpha_composite(decree, (CELL_SIZE, 0))
    preview = preview.resize(
        (preview.width * 4, preview.height * 4),
        Image.Resampling.NEAREST,
    )
    preview_path = args.work_dir / "ui-document-icons-preview-4x.png"
    preview.save(preview_path, optimize=True)

    print(ATLAS_PATH)
    print(petition_path)
    print(decree_path)
    print(preview_path)


if __name__ == "__main__":
    main()
