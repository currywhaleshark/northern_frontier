from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
ASSET_DIR = ROOT / "public" / "assets"

BUILDING_SOURCE = SOURCE_DIR / "specialized-buildings-v1.png"
WORKER_SOURCE = SOURCE_DIR / "specialized-workers-v1.png"
RAIDER_SOURCE = SOURCE_DIR / "faction-raiders-v1.png"
DAMAGE_FUEL_SOURCE = SOURCE_DIR / "damage-fuel-v1.png"


def is_key_pixel(r: int, g: int, b: int) -> bool:
    return (
        r > 135
        and b > 120
        and g < 150
        and min(r, b) - g > 58
        and abs(r - b) < 105
    )


def remove_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if is_key_pixel(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
            elif a > 0:
                # Suppress magenta spill without flattening the painted colors.
                excess = max(0, min(r, b) - g - 18)
                pixels[x, y] = (max(0, r - excess // 2), g, max(0, b - excess), a)
    return rgba


def grid_cell(image: Image.Image, columns: int, rows: int, column: int, row: int, inset: int = 4) -> Image.Image:
    left = round(column * image.width / columns) + inset
    right = round((column + 1) * image.width / columns) - inset
    top = round(row * image.height / rows) + inset
    bottom = round((row + 1) * image.height / rows) - inset
    return image.crop((left, top, right, bottom))


def fit_cell(
    source: Image.Image,
    width: int,
    height: int,
    max_width: int,
    max_height: int,
    bottom_padding: int = 1,
) -> Image.Image:
    keyed = remove_key(source)
    bbox = keyed.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source cell has no painted pixels")
    cropped = keyed.crop(bbox)
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    resized = remove_key(resized)
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = (width - resized.width) // 2
    y = height - resized.height - bottom_padding
    output.alpha_composite(resized, (x, y))
    return remove_key(output)


def compose_buildings(tile_size: int, sprite_height: int, output_name: str) -> None:
    source = Image.open(BUILDING_SOURCE).convert("RGB")
    output = Image.new("RGBA", (6 * tile_size, 2 * sprite_height), (0, 0, 0, 0))
    for row in range(2):
        for col in range(6):
            cell = fit_cell(
                grid_cell(source, 6, 2, col, row),
                tile_size,
                sprite_height,
                tile_size - 2,
                sprite_height - 3,
            )
            output.alpha_composite(cell, (col * tile_size, row * sprite_height))
    output.save(ASSET_DIR / output_name)


def compose_workers() -> None:
    source = Image.open(WORKER_SOURCE).convert("RGB")
    output = Image.new("RGBA", (3 * 28, 2 * 40), (0, 0, 0, 0))
    for row in range(2):
        for col in range(3):
            cell = fit_cell(grid_cell(source, 3, 2, col, row), 28, 40, 24, 35, 0)
            output.alpha_composite(cell, (col * 28, row * 40))
    output.save(ASSET_DIR / "specialized-workers-v1.png")


def compose_raiders() -> None:
    source = Image.open(RAIDER_SOURCE).convert("RGB")
    output = Image.new("RGBA", (6 * 56, 40), (0, 0, 0, 0))
    for col in range(6):
        cell = fit_cell(grid_cell(source, 6, 1, col, 0), 56, 40, 54, 38, 0)
        output.alpha_composite(cell, (col * 56, 0))
    output.save(ASSET_DIR / "faction-raiders-v1.png")


def compose_damage_and_fuel() -> None:
    source = Image.open(DAMAGE_FUEL_SOURCE).convert("RGB")
    damage = Image.new("RGBA", (2 * 56, 80), (0, 0, 0, 0))
    for col in range(2):
        # The source has narrow white gutters between panels; the larger inset excludes them.
        cell = fit_cell(grid_cell(source, 3, 1, col, 0, inset=12), 56, 80, 54, 61, 1)
        damage.alpha_composite(cell, (col * 56, 0))
    damage.save(ASSET_DIR / "building-damage-v1.png")

    fuel = fit_cell(grid_cell(source, 3, 1, 2, 0, inset=12), 64, 64, 58, 56, 4)
    resource_dir = ASSET_DIR / "resources"
    resource_dir.mkdir(parents=True, exist_ok=True)
    fuel.save(resource_dir / "fuel-group-v1.png")


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    compose_buildings(28, 40, "specialized-buildings-v1.png")
    compose_buildings(56, 80, "specialized-buildings-large-v1.png")
    compose_workers()
    compose_raiders()
    compose_damage_and_fuel()
    print("wrote specialized building, worker, raider, damage, and fuel assets")


if __name__ == "__main__":
    main()
