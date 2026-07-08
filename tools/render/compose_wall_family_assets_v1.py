from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
OUTPUT = ROOT / "public" / "assets" / "wall-family-generated-v1.png"
PREVIEW = ROOT / "docs" / "assets" / "walls" / "wall-family-generated-v1-preview-4x.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
CONTENT_SIZE = TILE_SIZE
SOURCE_COLUMNS = 4
SOURCE_ROWS = 4
OUTPUT_COLUMNS = 16
OUTPUT_ROWS = 12
SUSPICIOUS_EDGE_MARGIN = 8
MIN_EXPECTED_SHEET_SCALE = 0.18
MAX_EXPECTED_SHEET_SCALE = 1.0

SOURCE_FILENAMES = [
    "wall-family-palisade-normal-source-v1.png",
    "wall-family-earthfort-normal-source-v1.png",
    "wall-family-stonewall-normal-source-v1.png",
    "wall-family-gate-wood-normal-source-v1.png",
    "wall-family-gate-earth-normal-source-v1.png",
    "wall-family-gate-stone-normal-source-v1.png",
    "wall-family-palisade-winter-source-v1.png",
    "wall-family-earthfort-winter-source-v1.png",
    "wall-family-stonewall-winter-source-v1.png",
    "wall-family-gate-wood-winter-source-v1.png",
    "wall-family-gate-earth-winter-source-v1.png",
    "wall-family-gate-stone-winter-source-v1.png",
]


def is_key_pixel(r: int, g: int, b: int) -> bool:
    magenta = r >= 190 and b >= 190 and g <= 120 and min(r, b) - g >= 90
    green = g >= 190 and r <= 120 and b <= 120 and g - max(r, b) >= 90
    return magenta or green


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a > 0 and is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def source_cell_label(source_name: str | None, mask_index: int | None) -> str:
    if source_name is None:
        return "source cell"
    if mask_index is None:
        return source_name
    return f"{source_name} mask index {mask_index}"


def alpha_bbox(
    image: Image.Image,
    source_name: str | None = None,
    mask_index: int | None = None,
) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"{source_cell_label(source_name, mask_index)} contains no non-key pixels")
    return bbox


def union_alpha_bbox(
    images: list[Image.Image],
    source_name: str | None = None,
) -> tuple[int, int, int, int]:
    boxes = [alpha_bbox(image, source_name, index) for index, image in enumerate(images)]
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def alpha_components(image: Image.Image) -> list[tuple[int, tuple[int, int, int, int]]]:
    alpha = image.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[tuple[int, tuple[int, int, int, int]]] = []

    for start_y in range(height):
        for start_x in range(width):
            start_offset = start_y * width + start_x
            if visited[start_offset] or pixels[start_x, start_y] == 0:
                continue

            visited[start_offset] = 1
            stack = [(start_x, start_y)]
            area = 0
            left = right = start_x
            top = bottom = start_y

            while stack:
                x, y = stack.pop()
                area += 1
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)

                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    offset = ny * width + nx
                    if visited[offset] or pixels[nx, ny] == 0:
                        continue
                    visited[offset] = 1
                    stack.append((nx, ny))

            components.append((area, (left, top, right + 1, bottom + 1)))

    return components


def component_near_edge(bbox: tuple[int, int, int, int], width: int, height: int) -> bool:
    left, top, right, bottom = bbox
    return (
        left < SUSPICIOUS_EDGE_MARGIN
        or top < SUSPICIOUS_EDGE_MARGIN
        or right > width - SUSPICIOUS_EDGE_MARGIN
        or bottom > height - SUSPICIOUS_EDGE_MARGIN
    )


def validate_source_cell(image: Image.Image, source_name: str, mask_index: int) -> None:
    components = alpha_components(image)
    if not components:
        raise ValueError(f"{source_cell_label(source_name, mask_index)} contains no non-key pixels")

    for _, bbox in components:
        if component_near_edge(bbox, image.width, image.height):
            raise ValueError(
                f"{source_cell_label(source_name, mask_index)} has suspicious off-key artifact "
                f"near cell edge at {bbox}",
            )


def validate_sheet_transform(
    crop_box: tuple[int, int, int, int],
    scale: float,
    source_name: str,
) -> None:
    if MIN_EXPECTED_SHEET_SCALE <= scale <= MAX_EXPECTED_SHEET_SCALE:
        return
    raise ValueError(
        f"{source_name} sheet union bbox {crop_box} creates unexpected scale {scale:.3f}",
    )


def grid_crop(image: Image.Image, index: int) -> Image.Image:
    col = index % SOURCE_COLUMNS
    row = index // SOURCE_COLUMNS
    left = round((image.width * col) / SOURCE_COLUMNS)
    top = round((image.height * row) / SOURCE_ROWS)
    right = round((image.width * (col + 1)) / SOURCE_COLUMNS)
    bottom = round((image.height * (row + 1)) / SOURCE_ROWS)
    return image.crop((left, top, right, bottom))


def fit_to_cell(
    sprite: Image.Image,
    crop_box: tuple[int, int, int, int],
    scale: float,
) -> Image.Image:
    cropped = sprite.crop(crop_box)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    cell = Image.new("RGBA", (TILE_SIZE, SPRITE_HEIGHT), (0, 0, 0, 0))
    x = (TILE_SIZE - resized.width) // 2
    y = SPRITE_HEIGHT - resized.height
    cell.alpha_composite(resized, (x, y))
    return remove_key(cell)


def fit_sheet_cells(cells: list[Image.Image], source_name: str) -> list[Image.Image]:
    crop_box = union_alpha_bbox(cells, source_name)
    crop_width = crop_box[2] - crop_box[0]
    crop_height = crop_box[3] - crop_box[1]
    scale = min(TILE_SIZE / crop_width, CONTENT_SIZE / crop_height)
    validate_sheet_transform(crop_box, scale, source_name)
    return [fit_to_cell(cell, crop_box, scale) for cell in cells]


def compose_wall_family_assets(
    source_dir: Path = SOURCE_DIR,
    output_path: Path = OUTPUT,
    preview_path: Path = PREVIEW,
) -> None:
    output = Image.new(
        "RGBA",
        (OUTPUT_COLUMNS * TILE_SIZE, OUTPUT_ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )

    for row, filename in enumerate(SOURCE_FILENAMES):
        source_path = source_dir / filename
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        image = Image.open(source_path).convert("RGBA")
        cells = []
        for index in range(SOURCE_COLUMNS * SOURCE_ROWS):
            cell = remove_key(grid_crop(image, index))
            validate_source_cell(cell, filename, index)
            cells.append(cell)
        for index, cell in enumerate(fit_sheet_cells(cells, filename)):
            output.alpha_composite(cell, (index * TILE_SIZE, row * SPRITE_HEIGHT))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path)
    print(f"wrote {output_path}")

    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview = output.resize((output.width * 4, output.height * 4), Image.Resampling.NEAREST)
    preview.save(preview_path)
    print(f"wrote {preview_path}")


def main() -> None:
    compose_wall_family_assets()


if __name__ == "__main__":
    main()
