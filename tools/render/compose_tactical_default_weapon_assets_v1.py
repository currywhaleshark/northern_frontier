from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from reflow_tactical_pose_assets_v2 import alpha_components, component_stats


ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tools" / "render" / "generated" / "default-weapons-v1"
SOURCE_IMAGES = ROOT / "tools" / "render" / "source_images"
OUTPUT = ROOT / "public" / "assets" / "tactical" / "defender-default-weapons-poses-v1.png"
PREVIEW = GENERATED / "default-weapons-preview-v1.png"
QC_REPORT = GENERATED / "default-weapons-qc-v1.json"

ROWS = 4
SOURCE_COLUMNS = 2
CELL_WIDTH = 84
CELL_HEIGHT = 120
SAFE_PADDING = 4
ALPHA_THRESHOLD = 32
MIN_COMPONENT_AREA = 8
PREVIEW_SCALE = 4

VARIANTS = (
    ("bamboo-spear", SOURCE_IMAGES / "default-bamboo-spear-poses-clean-v1.png"),
    ("farm-tools", SOURCE_IMAGES / "default-farm-tools-poses-clean-v1.png"),
    ("watchman-baton", SOURCE_IMAGES / "default-watchman-baton-poses-clean-v1.png"),
)


def assigned_components(
    source: Image.Image,
    components: list[list],
    row: int,
    column: int,
) -> list[list]:
    source_column_width = source.width / SOURCE_COLUMNS
    source_row_height = source.height / ROWS
    result: list[list] = []
    for component in components:
        area, _left, _top, _right, _bottom, center_x, center_y = component_stats(component)
        if area < MIN_COMPONENT_AREA:
            continue
        assigned_column = min(SOURCE_COLUMNS - 1, max(0, int(center_x / source_column_width)))
        assigned_row = min(ROWS - 1, max(0, int(center_y / source_row_height)))
        if assigned_row == row and assigned_column == column:
            result.append(component)
    return result


def extract_frame(source: Image.Image, components: list[list]) -> tuple[Image.Image, dict[str, object]]:
    if not components:
        raise ValueError("default weapon pose cell has no source components")

    stats = [component_stats(component) for component in components]
    left = min(item[1] for item in stats)
    top = min(item[2] for item in stats)
    right = max(item[3] for item in stats)
    bottom = max(item[4] for item in stats)
    if left <= 0 or top <= 0 or right >= source.width or bottom >= source.height:
        raise ValueError(f"source sprite touches the generated image edge: {(left, top, right, bottom)}")

    crop = source.crop((left, top, right, bottom))
    mask = np.zeros((bottom - top, right - left), dtype=np.uint8)
    for component in components:
        for run in component:
            mask[run.y - top, run.left - left:run.right - left + 1] = 255
    alpha = np.asarray(crop.getchannel("A"), dtype=np.uint16)
    crop.putalpha(Image.fromarray(((alpha * mask) // 255).astype(np.uint8), "L"))

    usable_width = CELL_WIDTH - SAFE_PADDING * 2
    usable_height = CELL_HEIGHT - SAFE_PADDING * 2
    scale = min(usable_width / crop.width, usable_height / crop.height)
    target_width = max(1, round(crop.width * scale))
    target_height = max(1, round(crop.height * scale))
    crop = crop.resize((target_width, target_height), Image.Resampling.LANCZOS)

    cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    paste_left = (CELL_WIDTH - target_width) // 2
    paste_top = CELL_HEIGHT - SAFE_PADDING - target_height
    cell.alpha_composite(crop, (paste_left, paste_top))

    final_bbox = cell.getchannel("A").getbbox()
    if final_bbox is None:
        raise ValueError("default weapon pose became empty after extraction")
    if (
        final_bbox[0] < SAFE_PADDING
        or final_bbox[1] < SAFE_PADDING
        or final_bbox[2] > CELL_WIDTH - SAFE_PADDING
        or final_bbox[3] > CELL_HEIGHT - SAFE_PADDING
    ):
        raise ValueError(f"default weapon pose violates safe padding: {final_bbox}")

    return cell, {
        "source_bbox": [left, top, right, bottom],
        "source_components": len(components),
        "source_size": [source.width, source.height],
        "final_bbox": list(final_bbox),
        "final_opaque_pixels": int(np.count_nonzero(np.asarray(cell.getchannel("A")) > ALPHA_THRESHOLD)),
    }


def render_preview(sheet: Image.Image) -> Image.Image:
    width = sheet.width * PREVIEW_SCALE
    height = sheet.height * PREVIEW_SCALE
    preview = Image.new("RGBA", (width, height), (36, 40, 44, 255))
    draw = ImageDraw.Draw(preview)
    tile = 24
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            if (x // tile + y // tile) % 2 == 0:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(49, 54, 59, 255))
    enlarged = sheet.resize((width, height), Image.Resampling.NEAREST)
    preview.alpha_composite(enlarged)
    draw = ImageDraw.Draw(preview)
    for column in range(len(VARIANTS) * SOURCE_COLUMNS + 1):
        x = column * CELL_WIDTH * PREVIEW_SCALE
        draw.line((x, 0, x, height), fill=(225, 194, 107, 220), width=2)
    for row in range(ROWS + 1):
        y = row * CELL_HEIGHT * PREVIEW_SCALE
        draw.line((0, y, width, y), fill=(225, 194, 107, 220), width=2)
    return preview


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (len(VARIANTS) * SOURCE_COLUMNS * CELL_WIDTH, ROWS * CELL_HEIGHT), (0, 0, 0, 0))
    report: dict[str, object] = {
        "cell_size": [CELL_WIDTH, CELL_HEIGHT],
        "safe_padding": SAFE_PADDING,
        "variants": {},
    }

    for variant_index, (variant, source_path) in enumerate(VARIANTS):
        source = Image.open(source_path).convert("RGBA")
        components = alpha_components(source)
        variant_report: list[dict[str, object]] = []
        for row in range(ROWS):
            for column in range(SOURCE_COLUMNS):
                frame_components = assigned_components(source, components, row, column)
                frame, frame_report = extract_frame(source, frame_components)
                output_column = variant_index * SOURCE_COLUMNS + column
                sheet.alpha_composite(frame, (output_column * CELL_WIDTH, row * CELL_HEIGHT))
                variant_report.append({"row": row, "column": column, **frame_report})
        report["variants"][variant] = variant_report

    sheet.save(OUTPUT)
    render_preview(sheet).save(PREVIEW)
    QC_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(OUTPUT)
    print(PREVIEW)
    print(QC_REPORT)


if __name__ == "__main__":
    main()
