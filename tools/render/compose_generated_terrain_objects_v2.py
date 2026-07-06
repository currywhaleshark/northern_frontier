from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from extract_generated_terrain_objects import fit_to_cell, remove_key


def compose_v2(base: Path, snow_pine_source: Path, output: Path, tile_size: int) -> None:
    base_sheet = Image.open(base).convert("RGBA")
    if base_sheet.size != (tile_size * 4, tile_size * 2):
        raise ValueError(f"expected 4x2 base sheet, got {base_sheet.size}")

    sheet = Image.new("RGBA", (tile_size * 5, tile_size * 2), (0, 0, 0, 0))
    sheet.alpha_composite(base_sheet.crop((0, 0, tile_size * 4, tile_size)), (0, 0))
    sheet.alpha_composite(base_sheet.crop((0, tile_size, tile_size * 4, tile_size * 2)), (0, tile_size))

    snow_src = Image.open(snow_pine_source).convert("RGB")
    snow_cell = fit_to_cell(remove_key(snow_src), tile_size)
    sheet.alpha_composite(snow_cell, (tile_size * 4, 0))

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--snow-pine-source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--tile-size", type=int, default=28)
    args = parser.parse_args()
    compose_v2(args.base, args.snow_pine_source, args.output, args.tile_size)


if __name__ == "__main__":
    main()
