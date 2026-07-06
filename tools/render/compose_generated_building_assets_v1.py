from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
NORMAL_SOURCE = SOURCE_DIR / "generated-buildings-normal-v1.png"
SNOW_SOURCE = SOURCE_DIR / "generated-buildings-snow-v1.png"
FIELD_SOURCE = SOURCE_DIR / "generated-fields-seasons-v1.png"
TOPDOWN_FIELD_SOURCE = SOURCE_DIR / "generated-fields-topdown-v1.png"
OUTPUT = ROOT / "public" / "assets" / "folk-buildings-generated-v1.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
OUTPUT_COLUMNS = 15
OUTPUT_ROWS = 3
SOURCE_COLUMNS = 5
SOURCE_ROWS = 3

# Source generation order:
# 0 center, 1 hut, 2 ondol, 3 storehouse, 4 lumberCamp,
# 5 huntLodge, 6 herbHut, 7 smithy, 8 tannery, 9 market,
# 10 palisade, 11 watchtower, 12 beacon, 13 garrison, 14 spare utility hut.
# Final order follows BuildingTypeId, with field at column 7.
BUILDING_SOURCE_INDEX_BY_FINAL_COLUMN: list[int | None] = [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    None,
    7,
    8,
    12,
    10,
    11,
    13,
    9,
]


def is_key_pixel(r: int, g: int, b: int) -> bool:
    return r > 190 and g < 90 and b > 170


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
            elif a > 0:
                pixels[x, y] = (min(r, int((g + b) * 0.76)), g, min(b, int((r + g) * 0.82)), a)
    return rgba


def contiguous_runs(values: list[int], gap: int = 1) -> list[tuple[int, int]]:
    if not values:
        return []
    runs: list[tuple[int, int]] = []
    start = previous = values[0]
    for value in values[1:]:
        if value <= previous + gap:
            previous = value
        else:
            runs.append((start, previous))
            start = previous = value
    runs.append((start, previous))
    return runs


def detect_contact_sheet_boxes(
    image: Image.Image,
    expected_columns: int,
    expected_rows: int,
) -> list[tuple[int, int, int, int]]:
    rgb = image.convert("RGB")
    row_pixels = [
        y
        for y in range(rgb.height)
        if any(not is_key_pixel(*rgb.getpixel((x, y))) for x in range(rgb.width))
    ]
    row_runs = [run for run in contiguous_runs(row_pixels) if run[1] - run[0] > 10]
    if len(row_runs) != expected_rows:
        raise ValueError(f"expected {expected_rows} rows, found {len(row_runs)}: {row_runs}")

    boxes: list[tuple[int, int, int, int]] = []
    for top, bottom in row_runs:
        column_pixels = [
            x
            for x in range(rgb.width)
            if any(not is_key_pixel(*rgb.getpixel((x, y))) for y in range(top, bottom + 1))
        ]
        column_runs = [run for run in contiguous_runs(column_pixels) if run[1] - run[0] > 10]
        if len(column_runs) != expected_columns:
            raise ValueError(
                f"expected {expected_columns} columns in row {top}-{bottom}, "
                f"found {len(column_runs)}: {column_runs}",
            )
        boxes.extend((left, top, right + 1, bottom + 1) for left, right in column_runs)
    return boxes


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cell contains no non-key pixels")
    return bbox


def fit_to_cell(sprite: Image.Image, max_width: int, max_height: int) -> Image.Image:
    bbox = alpha_bbox(sprite)
    cropped = sprite.crop(bbox)
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    cell = Image.new("RGBA", (TILE_SIZE, SPRITE_HEIGHT), (0, 0, 0, 0))
    x = (TILE_SIZE - resized.width) // 2
    y = SPRITE_HEIGHT - resized.height - 1
    cell.alpha_composite(resized, (x, y))
    return cell


def source_cell(image: Image.Image, boxes: list[tuple[int, int, int, int]], index: int) -> Image.Image:
    return image.crop(boxes[index])


def compose_building_row(output: Image.Image, source: Path, row: int, fallback_field_index: int) -> None:
    image = Image.open(source).convert("RGB")
    field_image = Image.open(TOPDOWN_FIELD_SOURCE).convert("RGB")
    building_boxes = detect_contact_sheet_boxes(image, SOURCE_COLUMNS, SOURCE_ROWS)
    field_boxes = detect_contact_sheet_boxes(field_image, 4, 1)
    for final_col, source_index in enumerate(BUILDING_SOURCE_INDEX_BY_FINAL_COLUMN):
        if source_index is None:
            crop = source_cell(field_image, field_boxes, fallback_field_index)
            sprite = fit_to_cell(remove_key(crop), 26, 26)
        else:
            crop = source_cell(image, building_boxes, source_index)
            sprite = fit_to_cell(remove_key(crop), 26, 38)
        output.alpha_composite(sprite, (final_col * TILE_SIZE, row * SPRITE_HEIGHT))


def compose_field_row(output: Image.Image) -> None:
    image = Image.open(TOPDOWN_FIELD_SOURCE).convert("RGB")
    field_boxes = detect_contact_sheet_boxes(image, 4, 1)
    for col in range(4):
        crop = source_cell(image, field_boxes, col)
        sprite = fit_to_cell(remove_key(crop), 26, 26)
        output.alpha_composite(sprite, (col * TILE_SIZE, 2 * SPRITE_HEIGHT))


def main() -> None:
    output = Image.new(
        "RGBA",
        (OUTPUT_COLUMNS * TILE_SIZE, OUTPUT_ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    compose_building_row(output, NORMAL_SOURCE, 0, fallback_field_index=0)
    compose_building_row(output, SNOW_SOURCE, 1, fallback_field_index=3)
    compose_field_row(output)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
