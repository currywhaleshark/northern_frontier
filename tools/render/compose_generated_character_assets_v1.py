from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "render" / "source_images" / "generated-characters-v1.png"
OUTPUT = ROOT / "public" / "assets" / "folk-characters-generated-v1.png"

RESIDENT_WIDTH = 28
MOUNTED_WIDTH = 56
SPRITE_HEIGHT = 40
RESIDENT_COLUMNS = 10
TOTAL_COLUMNS = 11
ROWS = 2


def is_key_pixel(r: int, g: int, b: int) -> bool:
    return r > 190 and g < 100 and b > 170


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
            elif a > 0:
                pixels[x, y] = (r, g, b, a)
    return rgba


def contiguous_runs(values: list[int], gap: int = 2) -> list[tuple[int, int]]:
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


def detect_contact_sheet_boxes(image: Image.Image) -> list[list[tuple[int, int, int, int]]]:
    rgb = image.convert("RGB")
    row_pixels = [
        y
        for y in range(rgb.height)
        if any(not is_key_pixel(*rgb.getpixel((x, y))) for x in range(rgb.width))
    ]
    row_runs = [run for run in contiguous_runs(row_pixels) if run[1] - run[0] > 16]
    if len(row_runs) != ROWS:
        raise ValueError(f"expected {ROWS} rows, found {len(row_runs)}: {row_runs}")

    rows: list[list[tuple[int, int, int, int]]] = []
    for top, bottom in row_runs:
        column_pixels = [
            x
            for x in range(rgb.width)
            if any(not is_key_pixel(*rgb.getpixel((x, y))) for y in range(top, bottom + 1))
        ]
        column_runs = [run for run in contiguous_runs(column_pixels) if run[1] - run[0] > 10]
        if len(column_runs) != TOTAL_COLUMNS:
            raise ValueError(
                f"expected {TOTAL_COLUMNS} columns in row {top}-{bottom}, "
                f"found {len(column_runs)}: {column_runs}",
            )
        rows.append([(left, top, right + 1, bottom + 1) for left, right in column_runs])
    return rows


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cell contains no non-key pixels")
    return bbox


def trim_sparse_alpha_edges(image: Image.Image, row_ratio: float, column_ratio: float) -> Image.Image:
    alpha = image.getchannel("A")
    row_min = max(1, round(image.width * row_ratio))
    column_min = max(1, round(image.height * column_ratio))
    row_pixels = [
        y
        for y in range(image.height)
        if sum(1 for x in range(image.width) if alpha.getpixel((x, y)) > 0) >= row_min
    ]
    column_pixels = [
        x
        for x in range(image.width)
        if sum(1 for y in range(image.height) if alpha.getpixel((x, y)) > 0) >= column_min
    ]
    if not row_pixels or not column_pixels:
        return image
    return image.crop((min(column_pixels), min(row_pixels), max(column_pixels) + 1, max(row_pixels) + 1))


def fit_to_cell(sprite: Image.Image, cell_width: int, cell_height: int, max_width: int, max_height: int) -> Image.Image:
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
    cell = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
    x = (cell_width - resized.width) // 2
    y = cell_height - resized.height - 1
    cell.alpha_composite(resized, (x, y))
    return cell


def paste_cell(output: Image.Image, source: Image.Image, box: tuple[int, int, int, int], row: int, col: int) -> None:
    crop = remove_key(source.crop(box))
    if col < RESIDENT_COLUMNS:
        cell = fit_to_cell(crop, RESIDENT_WIDTH, SPRITE_HEIGHT, 24, 34)
        output.alpha_composite(cell, (col * RESIDENT_WIDTH, row * SPRITE_HEIGHT))
    else:
        crop = trim_sparse_alpha_edges(crop, 0.14, 0.10)
        cell = fit_to_cell(crop, MOUNTED_WIDTH, SPRITE_HEIGHT, 54, 38)
        output.alpha_composite(cell, (RESIDENT_COLUMNS * RESIDENT_WIDTH, row * SPRITE_HEIGHT))


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    rows = detect_contact_sheet_boxes(source)
    output = Image.new(
        "RGBA",
        (RESIDENT_COLUMNS * RESIDENT_WIDTH + MOUNTED_WIDTH, ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    for row_index, boxes in enumerate(rows):
        for col_index, box in enumerate(boxes):
            paste_cell(output, source, box, row_index, col_index)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
