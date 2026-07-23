from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tools" / "render" / "generated"
PUBLIC_ASSETS = ROOT / "public" / "assets"
ROWS = (("male_chop", "male"), ("female_chop", "female"))


def run_dir(gender: str, high_definition: bool) -> Path:
    suffix = "-hd-v2" if high_definition else "-v2"
    return GENERATED / f"resident-woodcutter-video-{gender}-work{suffix}"


def compose(high_definition: bool) -> Image.Image:
    cell = (56, 80) if high_definition else (28, 40)
    output = Image.new("RGBA", (cell[0] * 3, cell[1] * len(ROWS)))
    for target_row, (_, gender) in enumerate(ROWS):
        source_dir = run_dir(gender, high_definition)
        manifest = json.loads((source_dir / "manifest.json").read_text(encoding="utf-8"))
        layout = manifest["frame_layout"]
        if (layout["cellWidth"], layout["cellHeight"]) != cell:
            raise ValueError(f"{source_dir}: unexpected cell size")
        rects = layout["rows"]["chop"]
        if len(rects) != 3:
            raise ValueError(f"{source_dir}: expected baked 1-2-3 layout")
        with Image.open(source_dir / manifest["game_input"]) as source_file:
            source = source_file.convert("RGBA")
            for column, rect in enumerate(rects[:3]):
                frame = source.crop((
                    rect["x"],
                    rect["y"],
                    rect["x"] + rect["w"],
                    rect["y"] + rect["h"],
                ))
                output.alpha_composite(frame, (column * cell[0], target_row * cell[1]))
    return output


def preview(standard: Image.Image, high_definition: Image.Image) -> Image.Image:
    standard_scaled = standard.resize(
        (standard.width * 4, standard.height * 4),
        Image.Resampling.NEAREST,
    )
    hd_scaled = high_definition.resize(
        (high_definition.width * 2, high_definition.height * 2),
        Image.Resampling.NEAREST,
    )
    margin = 16
    label_height = 28
    width = standard_scaled.width + hd_scaled.width + margin * 3
    height = max(standard_scaled.height, hd_scaled.height) + label_height + margin * 2
    output = Image.new("RGBA", (width, height), (225, 225, 225, 255))
    draw = ImageDraw.Draw(output)
    draw.text((margin, margin), "standard 28x40 (4x)", fill=(24, 24, 24, 255))
    second_x = margin * 2 + standard_scaled.width
    draw.text((second_x, margin), "HD 56x80 (2x)", fill=(24, 24, 24, 255))
    y = margin + label_height
    output.alpha_composite(standard_scaled, (margin, y))
    output.alpha_composite(hd_scaled, (second_x, y))
    return output


def main() -> None:
    PUBLIC_ASSETS.mkdir(parents=True, exist_ok=True)
    standard = compose(False)
    high_definition = compose(True)
    standard_path = PUBLIC_ASSETS / "resident-woodcutter-video-work-v2.png"
    high_definition_path = PUBLIC_ASSETS / "resident-woodcutter-video-work-hd-v2.png"
    preview_path = GENERATED / "resident-woodcutter-video-work-v2-comparison.png"
    standard.save(standard_path)
    high_definition.save(high_definition_path)
    preview(standard, high_definition).save(preview_path)
    print(standard_path)
    print(high_definition_path)
    print(preview_path)


if __name__ == "__main__":
    main()
