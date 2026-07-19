from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets" / "tactical"
SPRITE_HEIGHT = 120


def normalized_generated(source_path: Path, size: tuple[int, int]) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    if source.size != size:
        source = source.resize(size, Image.Resampling.LANCZOS)
    return source


def replace_attack_cells(
    asset_name: str,
    generated_path: Path,
    columns: int,
    sprite_width: int,
    target_columns: tuple[int, ...],
    clear_top: int = 0,
) -> None:
    asset_path = ASSETS / asset_name
    original = Image.open(asset_path).convert("RGBA")
    generated = normalized_generated(generated_path, original.size)
    for column in target_columns:
        box = (
            column * sprite_width,
            SPRITE_HEIGHT,
            (column + 1) * sprite_width,
            SPRITE_HEIGHT * 2,
        )
        cell = generated.crop(box)
        if clear_top:
            cell.paste((0, 0, 0, 0), (0, 0, cell.width, clear_top))
        if cell.getchannel("A").getbbox() is None:
            raise ValueError(f"empty generated attack cell {asset_name} column={column}")
        original.paste((0, 0, 0, 0), box)
        original.alpha_composite(cell, (box[0], box[1]))
    original.save(asset_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weapons", type=Path, required=True)
    parser.add_argument("--court", type=Path, required=True)
    args = parser.parse_args()
    replace_attack_cells("defender-weapons-poses-v2.png", args.weapons, 6, 84, (4, 5))
    replace_attack_cells("court-army-poses-v2.png", args.court, 5, 168, (0, 4), clear_top=18)
    print(ASSETS / "defender-weapons-poses-v2.png")
    print(ASSETS / "court-army-poses-v2.png")


if __name__ == "__main__":
    main()
