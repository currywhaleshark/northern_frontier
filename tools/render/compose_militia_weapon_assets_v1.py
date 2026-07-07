from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "render" / "source_images" / "militia-weapons-v1.png"
OUTPUT = ROOT / "public" / "assets" / "militia-weapons-generated-v1.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
COLUMNS = 3
ROWS = 2


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


def fit_to_cell(sprite: Image.Image) -> Image.Image:
    cropped = sprite.crop(alpha_bbox(sprite))
    scale = min(24 / cropped.width, 36 / cropped.height)
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
    cell.alpha_composite(remove_key(resized), (x, y))
    return remove_key(cell)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    output = Image.new(
        "RGBA",
        (COLUMNS * TILE_SIZE, ROWS * SPRITE_HEIGHT),
        (0, 0, 0, 0),
    )
    for row in range(ROWS):
        for col in range(COLUMNS):
            index = row * COLUMNS + col
            sprite = fit_to_cell(remove_key(grid_crop(source, COLUMNS, ROWS, index)))
            output.alpha_composite(sprite, (col * TILE_SIZE, row * SPRITE_HEIGHT))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
