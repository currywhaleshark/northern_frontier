from __future__ import annotations

from pathlib import Path
from shutil import copyfile

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
GENERATED_DIR = ROOT / "tools" / "render" / "generated"
ASSET_DIR = ROOT / "public" / "assets"

BUILDING_DIR = GENERATED_DIR / "new-content-buildings-v1"
RESIDENT_DIR = GENERATED_DIR / "new-content-residents-v1"
RESOURCE_DIR = GENERATED_DIR / "new-content-resources-v1"


def load_frame(directory: Path, number: int) -> Image.Image:
    image = Image.open(directory / f"sheet-{number}.png").convert("RGBA")
    if image.getchannel("A").getbbox() is None:
        raise ValueError(f"empty sprite frame: {directory.name}/sheet-{number}.png")
    return image


def alpha_crop(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("sprite frame has no opaque pixels")
    return image.crop(bbox)


def common_scale(images: list[Image.Image], max_width: int, max_height: int) -> float:
    crops = [alpha_crop(image) for image in images]
    return min(
        max_width / max(crop.width for crop in crops),
        max_height / max(crop.height for crop in crops),
    )


def fit_with_scale(
    image: Image.Image,
    width: int,
    height: int,
    scale: float,
    bottom_padding: int,
) -> Image.Image:
    crop = alpha_crop(image)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = (width - resized.width) // 2
    y = height - resized.height - bottom_padding
    output.alpha_composite(resized, (x, y))
    return output


def compose_buildings(tile_size: int, sprite_height: int, output_name: str) -> None:
    normal_numbers = [1, 2, 3, 4, 5, 6, 7]
    winter_numbers = [9, 10, 11, 12, 13, 14, 15]
    output = Image.new("RGBA", (len(normal_numbers) * tile_size, 2 * sprite_height), (0, 0, 0, 0))
    max_width = tile_size - 2
    max_height = sprite_height - 3

    for column, (normal_number, winter_number) in enumerate(zip(normal_numbers, winter_numbers)):
        pair = [load_frame(BUILDING_DIR, normal_number), load_frame(BUILDING_DIR, winter_number)]
        scale = common_scale(pair, max_width, max_height)
        for row, image in enumerate(pair):
            cell = fit_with_scale(image, tile_size, sprite_height, scale, bottom_padding=1)
            output.alpha_composite(cell, (column * tile_size, row * sprite_height))

    output.save(ASSET_DIR / output_name)


def compose_residents() -> None:
    frames = [load_frame(RESIDENT_DIR, number) for number in range(1, 7)]
    width, height = 28, 40
    scale = common_scale(frames, max_width=24, max_height=36)
    output = Image.new("RGBA", (2 * width, 3 * height), (0, 0, 0, 0))
    for index, image in enumerate(frames):
        cell = fit_with_scale(image, width, height, scale, bottom_padding=1)
        column = index % 2
        row = index // 2
        output.alpha_composite(cell, (column * width, row * height))
    output.save(ASSET_DIR / "new-content-residents-v1.png")


def copy_resource_atlas() -> None:
    resource_asset_dir = ASSET_DIR / "resources"
    resource_asset_dir.mkdir(parents=True, exist_ok=True)
    copyfile(
        RESOURCE_DIR / "sheet-transparent.png",
        resource_asset_dir / "new-content-resource-atlas-v1.png",
    )


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    compose_buildings(28, 40, "new-content-buildings-v1.png")
    compose_buildings(56, 80, "new-content-buildings-large-v1.png")
    compose_residents()
    copy_resource_atlas()
    print("wrote new content building, resident, and resource sprite atlases")


if __name__ == "__main__":
    main()
