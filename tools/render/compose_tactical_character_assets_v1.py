from __future__ import annotations

from pathlib import Path

from PIL import Image

import compose_generated_character_assets_v1 as folk
import compose_militia_weapon_assets_v1 as militia
import compose_specialized_assets_v1 as specialized


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
OUTPUT_DIR = ROOT / "public" / "assets" / "tactical"

RESIDENT_WIDTH = 84
MOUNTED_WIDTH = 168
SPRITE_HEIGHT = 120


def fit_rgba(sprite: Image.Image, width: int, height: int, max_width: int, max_height: int) -> Image.Image:
    alpha = sprite.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("source cell has no painted pixels")
    cropped = sprite.crop(bbox)
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    output.alpha_composite(resized, ((width - resized.width) // 2, height - resized.height))
    return specialized.remove_key(output)


def compose_folk() -> None:
    source = Image.open(SOURCE_DIR / "generated-characters-v1.png").convert("RGB")
    rows = folk.detect_contact_sheet_boxes(source)
    output = Image.new("RGBA", (10 * RESIDENT_WIDTH + MOUNTED_WIDTH, 2 * SPRITE_HEIGHT), (0, 0, 0, 0))
    for row_index, boxes in enumerate(rows):
        for col_index, box in enumerate(boxes):
            crop = folk.remove_key(source.crop(box))
            if col_index < 10:
                cell = fit_rgba(crop, RESIDENT_WIDTH, SPRITE_HEIGHT, 72, 102)
                output.alpha_composite(cell, (col_index * RESIDENT_WIDTH, row_index * SPRITE_HEIGHT))
            else:
                crop = folk.trim_sparse_alpha_edges(crop, 0.14, 0.10)
                cell = fit_rgba(crop, MOUNTED_WIDTH, SPRITE_HEIGHT, 162, 114)
                output.alpha_composite(cell, (10 * RESIDENT_WIDTH, row_index * SPRITE_HEIGHT))
    output.save(OUTPUT_DIR / "folk-characters-tactical-v1.png")


def compose_militia() -> None:
    source = Image.open(SOURCE_DIR / "militia-weapons-v1.png").convert("RGB")
    output = Image.new("RGBA", (3 * RESIDENT_WIDTH, 2 * SPRITE_HEIGHT), (0, 0, 0, 0))
    for row in range(2):
        for col in range(3):
            crop = militia.remove_key(militia.grid_crop(source, 3, 2, row * 3 + col))
            cell = fit_rgba(crop, RESIDENT_WIDTH, SPRITE_HEIGHT, 72, 108)
            output.alpha_composite(cell, (col * RESIDENT_WIDTH, row * SPRITE_HEIGHT))
    output.save(OUTPUT_DIR / "militia-weapons-tactical-v1.png")


def compose_raiders() -> None:
    source = Image.open(SOURCE_DIR / "faction-raiders-v1.png").convert("RGB")
    output = Image.new("RGBA", (6 * MOUNTED_WIDTH, SPRITE_HEIGHT), (0, 0, 0, 0))
    for col in range(6):
        crop = specialized.remove_key(specialized.grid_cell(source, 6, 1, col, 0))
        cell = fit_rgba(crop, MOUNTED_WIDTH, SPRITE_HEIGHT, 162, 114)
        output.alpha_composite(cell, (col * MOUNTED_WIDTH, 0))
    output.save(OUTPUT_DIR / "faction-raiders-tactical-v1.png")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    compose_folk()
    compose_militia()
    compose_raiders()
    print("wrote tactical high-resolution character assets")


if __name__ == "__main__":
    main()
