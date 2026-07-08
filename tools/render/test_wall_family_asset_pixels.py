from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw

from compose_wall_family_assets_v1 import (
    SOURCE_FILENAMES,
    TILE_SIZE,
    SPRITE_HEIGHT,
    compose_wall_family_assets,
)


def make_source(path: Path, row_index: int) -> None:
    image = Image.new("RGB", (512, 512), (255, 0, 255))
    draw = ImageDraw.Draw(image)
    cell = image.width // 4
    for index in range(16):
        col = index % 4
        row = index // 4
        left = col * cell + 18
        top = row * cell + 44
        right = (col + 1) * cell - 18
        bottom = (row + 1) * cell - 18
        color = (
            40 + (index * 11) % 180,
            40 + (row_index * 19) % 180,
            40 + (index * 7 + row_index * 13) % 180,
        )
        draw.rectangle((left, top, right, bottom), fill=color)
    image.save(path)


def alpha_bbox(image: Image.Image, col: int, row: int):
    crop = image.crop((
        col * TILE_SIZE,
        row * SPRITE_HEIGHT,
        (col + 1) * TILE_SIZE,
        (row + 1) * SPRITE_HEIGHT,
    ))
    bbox = crop.getchannel("A").getbbox()
    assert bbox is not None, f"cell {col},{row} is empty"
    return bbox


def test_compose_wall_family_assets() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        for row_index, name in enumerate(SOURCE_FILENAMES):
            make_source(root / name, row_index)

        output = root / "wall-family-generated-v1.png"
        preview = root / "wall-family-generated-v1-preview-4x.png"
        compose_wall_family_assets(root, output, preview)

        image = Image.open(output).convert("RGBA")
        assert image.size == (16 * TILE_SIZE, 12 * SPRITE_HEIGHT)
        assert Image.open(preview).size == (16 * TILE_SIZE * 4, 12 * SPRITE_HEIGHT * 4)

        for row in range(12):
            for col in range(16):
                left, top, right, bottom = alpha_bbox(image, col, row)
                assert right - left >= 12
                assert bottom - top >= 12
                assert bottom >= SPRITE_HEIGHT - 2
                assert image.getpixel((col * TILE_SIZE, row * SPRITE_HEIGHT))[3] == 0


if __name__ == "__main__":
    test_compose_wall_family_assets()
    print("wall family asset pixel tests passed")
