from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def is_key_pixel(r: int, g: int, b: int) -> bool:
    return r > 200 and g < 80 and b > 200


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
            elif a > 0:
                # Lightly despill magenta edges without flattening the generated palette.
                r = min(r, int((g + b) * 0.72))
                b = min(b, int((r + g) * 0.78))
                pixels[x, y] = (r, g, b, a)
    return rgba


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("cell contains no non-key pixels")
    return bbox


def fit_to_cell(sprite: Image.Image, tile_size: int) -> Image.Image:
    bbox = alpha_bbox(sprite)
    cropped = sprite.crop(bbox)
    scale = min((tile_size - 2) / cropped.width, (tile_size - 2) / cropped.height)
    new_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(new_size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))
    x = (tile_size - resized.width) // 2
    y = tile_size - resized.height - 1
    cell.alpha_composite(resized, (x, y))
    return cell


def extract_sheet(source: Path, output: Path, columns: int, rows: int, tile_size: int) -> None:
    src = Image.open(source).convert("RGB")
    cell_w = src.width // columns
    cell_h = src.height // rows
    out = Image.new("RGBA", (columns * tile_size, rows * tile_size), (0, 0, 0, 0))

    for row in range(rows):
        for col in range(columns):
            crop = src.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
            sprite = fit_to_cell(remove_key(crop), tile_size)
            out.alpha_composite(sprite, (col * tile_size, row * tile_size))

    output.parent.mkdir(parents=True, exist_ok=True)
    out.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=2)
    parser.add_argument("--tile-size", type=int, default=28)
    args = parser.parse_args()
    extract_sheet(args.source, args.output, args.columns, args.rows, args.tile_size)


if __name__ == "__main__":
    main()
