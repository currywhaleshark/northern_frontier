from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tools" / "render" / "generated"
PUBLIC_ASSETS = ROOT / "public" / "assets"

ROWS = (
    ("male_axe_walk", "male", "axe_walk"),
    ("female_axe_walk", "female", "axe_walk"),
    ("male_jige_walk", "male", "jige_walk"),
    ("female_jige_walk", "female", "jige_walk"),
)


def run_dir(gender: str, high_definition: bool) -> Path:
    suffix = "-hd-v2" if high_definition else "-v2"
    return GENERATED / f"resident-woodcutter-video-{gender}{suffix}"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compose(high_definition: bool) -> Image.Image:
    expected_cell = (56, 80) if high_definition else (28, 40)
    output = Image.new("RGBA", (expected_cell[0] * 3, expected_cell[1] * len(ROWS)))

    for target_row, (_, gender, state) in enumerate(ROWS):
        source_dir = run_dir(gender, high_definition)
        manifest = read_json(source_dir / "manifest.json")
        layout = manifest["frame_layout"]
        cell = (layout["cellWidth"], layout["cellHeight"])
        if cell != expected_cell:
            raise ValueError(f"{source_dir}: expected cell {expected_cell}, got {cell}")
        if manifest.get("game_input") != "sprite-sheet-alpha.png":
            raise ValueError(f"{source_dir}: canonical game input is not the alpha sheet")

        rects = layout["rows"][state]
        if len(rects) != 4 or rects[0] != rects[2]:
            raise ValueError(f"{source_dir}/{state}: expected baked 1-2-1-3 layout")

        with Image.open(source_dir / manifest["game_input"]) as source_file:
            source = source_file.convert("RGBA")
            for target_column, source_index in enumerate((0, 1, 3)):
                rect = rects[source_index]
                box = (
                    rect["x"],
                    rect["y"],
                    rect["x"] + rect["w"],
                    rect["y"] + rect["h"],
                )
                frame = source.crop(box)
                output.alpha_composite(
                    frame,
                    (target_column * expected_cell[0], target_row * expected_cell[1]),
                )
    return output


def checkerboard(size: tuple[int, int], block: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (236, 236, 236, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], block):
        for x in range(0, size[0], block):
            if (x // block + y // block) % 2:
                draw.rectangle((x, y, x + block - 1, y + block - 1), fill=(205, 205, 205, 255))
    return image


def comparison(standard: Image.Image, high_definition: Image.Image) -> Image.Image:
    standard_preview = standard.resize(
        (standard.width * 4, standard.height * 4),
        Image.Resampling.NEAREST,
    )
    high_definition_preview = high_definition.resize(
        (high_definition.width * 2, high_definition.height * 2),
        Image.Resampling.NEAREST,
    )
    margin = 16
    label_height = 28
    width = standard_preview.width + high_definition_preview.width + margin * 3
    height = max(standard_preview.height, high_definition_preview.height) + label_height + margin * 2
    output = checkerboard((width, height))
    draw = ImageDraw.Draw(output)
    draw.text((margin, margin), "standard 28x40 (4x preview)", fill=(24, 24, 24, 255))
    second_x = margin * 2 + standard_preview.width
    draw.text((second_x, margin), "HD 56x80 (2x preview)", fill=(24, 24, 24, 255))
    y = margin + label_height
    output.alpha_composite(standard_preview, (margin, y))
    output.alpha_composite(high_definition_preview, (second_x, y))
    return output


def main() -> None:
    PUBLIC_ASSETS.mkdir(parents=True, exist_ok=True)
    standard = compose(False)
    high_definition = compose(True)
    standard_path = PUBLIC_ASSETS / "resident-woodcutter-video-walk-v2.png"
    high_definition_path = PUBLIC_ASSETS / "resident-woodcutter-video-walk-hd-v2.png"
    preview_path = GENERATED / "resident-woodcutter-video-walk-v2-comparison.png"
    standard.save(standard_path)
    high_definition.save(high_definition_path)
    comparison(standard, high_definition).save(preview_path)
    print(standard_path)
    print(high_definition_path)
    print(preview_path)


if __name__ == "__main__":
    main()
