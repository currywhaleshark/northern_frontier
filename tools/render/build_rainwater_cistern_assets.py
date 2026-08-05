#!/usr/bin/env python3
"""Build the rainwater-cistern seasonal sheets from HD transparent sources.

The 8x runtime sheet is composed first.  The 2x sheet is then derived from
that result so both zoom paths share one visual source of truth.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images" / "rainwater-cistern-v1"
OUTPUT_DIR = ROOT / "public" / "assets"

HD_CELL = (224, 320)
STANDARD_CELL = (56, 80)
HD_SAFE_SIZE = (208, 296)
BOTTOM_MARGIN = 6

SOURCES = (
    SOURCE_DIR / "rainwater-cistern-normal-alpha.png",
    SOURCE_DIR / "rainwater-cistern-winter-alpha.png",
)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= 12 else 0).getbbox()
    if bbox is None:
        raise ValueError("source has no visible pixels")
    return bbox


def compose_hd_cell(source_path: Path) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    source = source.crop(alpha_bbox(source))
    ratio = min(HD_SAFE_SIZE[0] / source.width, HD_SAFE_SIZE[1] / source.height)
    target = (
        max(1, round(source.width * ratio)),
        max(1, round(source.height * ratio)),
    )
    sprite = source.resize(target, Image.Resampling.LANCZOS)
    sprite = sprite.filter(ImageFilter.UnsharpMask(radius=0.7, percent=55, threshold=3))

    cell = Image.new("RGBA", HD_CELL, (0, 0, 0, 0))
    x = (HD_CELL[0] - sprite.width) // 2
    y = HD_CELL[1] - BOTTOM_MARGIN - sprite.height
    cell.alpha_composite(sprite, (x, y))
    return cell


def derive_standard_cell(hd_cell: Image.Image) -> Image.Image:
    # BOX gives stable area averaging and avoids the isolated high-contrast dots
    # that appeared when runtime-sized art was sampled directly from generated art.
    return hd_cell.resize(STANDARD_CELL, Image.Resampling.BOX)


def join_cells(cells: list[Image.Image]) -> Image.Image:
    sheet = Image.new("RGBA", (sum(cell.width for cell in cells), cells[0].height), (0, 0, 0, 0))
    x = 0
    for cell in cells:
        sheet.alpha_composite(cell, (x, 0))
        x += cell.width
    return sheet


def main() -> None:
    hd_cells = [compose_hd_cell(path) for path in SOURCES]
    standard_cells = [derive_standard_cell(cell) for cell in hd_cells]
    join_cells(hd_cells).save(OUTPUT_DIR / "rainwater-cistern-building-hd-v1.png", optimize=True)
    join_cells(standard_cells).save(OUTPUT_DIR / "rainwater-cistern-building-v1.png", optimize=True)
    print("built rainwater cistern sheets: HD first, standard derived from HD")


if __name__ == "__main__":
    main()
