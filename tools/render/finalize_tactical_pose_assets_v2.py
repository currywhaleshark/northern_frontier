from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "tactical"
REFERENCE = ROOT / "tmp" / "imagegen" / "tactical-poses-v2"

SPECS = {
    "roles": ("defender-roles-poses-v2.png", "defender-roles-idle-reference.png", 8, 84),
    "weapons": ("defender-weapons-poses-v2.png", "defender-weapons-idle-reference.png", 6, 84),
    "raiders": ("faction-raiders-poses-v2.png", "faction-raiders-idle-reference.png", 6, 168),
    "court": ("court-army-poses-v2.png", "court-army-idle-reference.png", 5, 168),
}

SPRITE_HEIGHT = 120
POSE_ROWS = 4


def normalize_atlas(source_path: Path, reference_path: Path, columns: int, sprite_width: int) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    alpha_box = source.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError(f"{source_path} has no opaque pixels")
    source = source.crop(alpha_box)
    target_size = (columns * sprite_width, POSE_ROWS * SPRITE_HEIGHT)
    source = source.resize(target_size, Image.Resampling.LANCZOS)

    reference = Image.open(reference_path).convert("RGBA")
    if reference.size != (target_size[0], SPRITE_HEIGHT):
        raise ValueError(f"unexpected idle reference size: {reference.size}")
    source.paste((0, 0, 0, 0), (0, 0, target_size[0], SPRITE_HEIGHT))
    source.alpha_composite(reference, (0, 0))

    for row in range(POSE_ROWS):
        for column in range(columns):
            bounds = (
                column * sprite_width,
                row * SPRITE_HEIGHT,
                (column + 1) * sprite_width,
                (row + 1) * SPRITE_HEIGHT,
            )
            cell = source.crop(bounds)
            bbox = cell.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"empty pose cell row={row} column={column} in {source_path}")
            alpha_histogram = cell.getchannel("A").histogram()
            coverage = sum(alpha_histogram[17:]) / (sprite_width * SPRITE_HEIGHT)
            if coverage < 0.015 or coverage > 0.92:
                raise ValueError(
                    f"implausible alpha coverage {coverage:.3f} row={row} column={column} in {source_path}"
                )
    return source


def main() -> None:
    parser = argparse.ArgumentParser()
    for key in SPECS:
        parser.add_argument(f"--{key}", type=Path, required=True)
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for key, (output_name, reference_name, columns, sprite_width) in SPECS.items():
        atlas = normalize_atlas(getattr(args, key), REFERENCE / reference_name, columns, sprite_width)
        atlas.save(OUTPUT / output_name)
        print(OUTPUT / output_name)


if __name__ == "__main__":
    main()
