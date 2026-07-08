from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
OUTPUT = ROOT / "public" / "assets" / "wall-family-generated-v1.png"
PREVIEW = ROOT / "docs" / "assets" / "walls" / "wall-family-generated-v1-preview-4x.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
SOURCE_COLUMNS = 4
SOURCE_ROWS = 4
OUTPUT_COLUMNS = 16
OUTPUT_ROWS = 12

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
    magenta = r > 200 and g < 80 and b > 200
    green = r < 80 and g > 200 and b < 80
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


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source cell contains no non-key pixels")
    return bbox


def grid_crop(image: Image.Image, index: int) -> Image.Image:
    col = index % SOURCE_COLUMNS
    row = index // SOURCE_COLUMNS
    left = round((image.width * col) / SOURCE_COLUMNS)
    top = round((image.height * row) / SOURCE_ROWS)
    right = round((image.width * (col + 1)) / SOURCE_COLUMNS)
    bottom = round((image.height * (row + 1)) / SOURCE_ROWS)
    return image.crop((left, top, right, bottom))


def fit_to_cell(sprite: Image.Image) -> Image.Image:
    cropped = sprite.crop(alpha_bbox(sprite))
    scale = min(TILE_SIZE / cropped.width, 28 / cropped.height)
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
    return cell


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
        image = Image.open(source_path).convert("RGB")
        for index in range(16):
            crop = remove_key(grid_crop(image, index))
            cell = fit_to_cell(crop)
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
