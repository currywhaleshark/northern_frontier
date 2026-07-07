from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
BUILDING_NORMAL_SOURCE = SOURCE_DIR / "promotion-buildings-topdown-normal-v1.png"
BUILDING_WINTER_SOURCE = SOURCE_DIR / "promotion-buildings-topdown-winter-v1.png"
CHARACTER_SOURCE = SOURCE_DIR / "promotion-characters-draft-v1.png"
BUILDING_OUTPUT = ROOT / "public" / "assets" / "promotion-buildings-generated-v1.png"
LARGE_BUILDING_OUTPUT = ROOT / "public" / "assets" / "promotion-buildings-generated-large-v1.png"
CHARACTER_OUTPUT = ROOT / "public" / "assets" / "promotion-characters-generated-v1.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
LARGE_TILE_SIZE = 56
LARGE_SPRITE_HEIGHT = 80
BUILDING_COLUMNS = 12
BUILDING_ROWS = 2
SOURCE_BUILDING_COLUMNS = 4
SOURCE_BUILDING_ROWS = 3
CHARACTER_COLUMNS = 6
CHARACTER_ROWS = 2


def is_key_pixel(r: int, g: int, b: int) -> bool:
    return r > 190 and g < 110 and b > 160


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a > 0 and is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
    return rgba


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cell contains no non-key pixels")
    return bbox


def grid_crop(image: Image.Image, columns: int, rows: int, index: int) -> Image.Image:
    col = index % columns
    row = index // columns
    left = round((image.width * col) / columns)
    top = round((image.height * row) / rows)
    right = round((image.width * (col + 1)) / columns)
    bottom = round((image.height * (row + 1)) / rows)
    return image.crop((left, top, right, bottom))


def fit_to_cell(
    sprite: Image.Image,
    max_width: int,
    max_height: int,
    bottom_aligned: bool = True,
    tile_size: int = TILE_SIZE,
    sprite_height: int = SPRITE_HEIGHT,
) -> Image.Image:
    cropped = sprite.crop(alpha_bbox(sprite))
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    cell = Image.new("RGBA", (tile_size, sprite_height), (0, 0, 0, 0))
    x = (tile_size - resized.width) // 2
    y = sprite_height - resized.height if bottom_aligned else (sprite_height - resized.height) // 2
    cell.alpha_composite(remove_key(resized), (x, y))
    return remove_key(cell)


def compose_building_row(
    output: Image.Image,
    source: Path,
    output_row: int,
    tile_size: int = TILE_SIZE,
    sprite_height: int = SPRITE_HEIGHT,
    max_width: int = 26,
    default_max_height: int = 36,
) -> None:
    image = Image.open(source).convert("RGB")
    for index in range(BUILDING_COLUMNS):
        crop = remove_key(grid_crop(image, SOURCE_BUILDING_COLUMNS, SOURCE_BUILDING_ROWS, index))
        max_height = round(default_max_height * (30 / 36)) if index in (1, 9) else default_max_height
        sprite = fit_to_cell(crop, max_width, max_height, tile_size=tile_size, sprite_height=sprite_height)
        output.alpha_composite(sprite, (index * tile_size, output_row * sprite_height))


def compose_buildings() -> None:
    output = Image.new(
        "RGBA",
        (BUILDING_COLUMNS * TILE_SIZE, BUILDING_ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    compose_building_row(output, BUILDING_NORMAL_SOURCE, 0)
    compose_building_row(output, BUILDING_WINTER_SOURCE, 1)
    BUILDING_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(BUILDING_OUTPUT)
    print(f"wrote {BUILDING_OUTPUT}")

    large_output = Image.new(
        "RGBA",
        (BUILDING_COLUMNS * LARGE_TILE_SIZE, BUILDING_ROWS * LARGE_SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    compose_building_row(
        large_output,
        BUILDING_NORMAL_SOURCE,
        0,
        tile_size=LARGE_TILE_SIZE,
        sprite_height=LARGE_SPRITE_HEIGHT,
        max_width=52,
        default_max_height=72,
    )
    compose_building_row(
        large_output,
        BUILDING_WINTER_SOURCE,
        1,
        tile_size=LARGE_TILE_SIZE,
        sprite_height=LARGE_SPRITE_HEIGHT,
        max_width=52,
        default_max_height=72,
    )
    large_output.save(LARGE_BUILDING_OUTPUT)
    print(f"wrote {LARGE_BUILDING_OUTPUT}")


def compose_characters() -> None:
    image = Image.open(CHARACTER_SOURCE).convert("RGB")
    output = Image.new(
        "RGBA",
        (CHARACTER_COLUMNS * TILE_SIZE, CHARACTER_ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    for row in range(CHARACTER_ROWS):
        for col in range(CHARACTER_COLUMNS):
            index = row * CHARACTER_COLUMNS + col
            crop = remove_key(grid_crop(image, CHARACTER_COLUMNS, CHARACTER_ROWS, index))
            sprite = fit_to_cell(crop, 23, 36)
            output.alpha_composite(sprite, (col * TILE_SIZE, row * SPRITE_HEIGHT))
    CHARACTER_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(CHARACTER_OUTPUT)
    print(f"wrote {CHARACTER_OUTPUT}")


def main() -> None:
    compose_buildings()
    compose_characters()


if __name__ == "__main__":
    main()
