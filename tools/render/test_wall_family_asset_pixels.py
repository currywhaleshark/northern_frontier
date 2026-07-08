from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw

from compose_wall_family_assets_v1 import (
    SOURCE_FILENAMES,
    SPRITE_HEIGHT,
    TILE_SIZE,
    compose_wall_family_assets,
    is_key_pixel,
    remove_key,
)


SOURCE_SIZE = 512
SOURCE_COLUMNS = 4
SOURCE_ROWS = 4
SOURCE_CELL = SOURCE_SIZE // SOURCE_COLUMNS
EXPECTED_SOURCE_FILENAMES = [
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
EXACT_MAGENTA = (255, 0, 255, 255)
NEAR_MAGENTA = (198, 16, 197, 255)
EXACT_GREEN = (0, 255, 0, 255)
NEAR_GREEN = (18, 198, 16, 255)
PURPLE_WALL = (205, 78, 171, 255)


def source_color(row_index: int, cell_index: int) -> tuple[int, int, int, int]:
    if row_index == 2 and cell_index == 15:
        return PURPLE_WALL
    return (
        32 + (cell_index * 29 + row_index * 7) % 176,
        42 + (row_index * 31 + cell_index * 3) % 145,
        48 + (cell_index * 17 + row_index * 11) % 142,
        255,
    )


def cell_origin(index: int) -> tuple[int, int]:
    return (index % SOURCE_COLUMNS) * SOURCE_CELL, (index // SOURCE_COLUMNS) * SOURCE_CELL


def source_rect(index: int) -> tuple[int, int, int, int]:
    left, top = cell_origin(index)
    if index == 0:
        return left + 18, top + 44, left + 110, top + 110
    if index == 15:
        return left + 55, top + 92, left + 73, top + 110
    if index % 5 == 0:
        return left + 30, top + 66, left + 96, top + 110
    if index % 3 == 0:
        return left + 24, top + 58, left + 90, top + 108
    return left + 34, top + 62, left + 94, top + 110


def make_source(path: Path, row_index: int) -> None:
    image = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), EXACT_MAGENTA)
    draw = ImageDraw.Draw(image)

    for index in range(SOURCE_COLUMNS * SOURCE_ROWS):
        left, top = cell_origin(index)
        draw.rectangle((left, top, left + 42, top + 34), fill=NEAR_MAGENTA)
        draw.rectangle((left + 82, top, left + 127, top + 36), fill=NEAR_GREEN)
        draw.rectangle((left, top + 104, left + 22, top + 127), fill=EXACT_GREEN)
        draw.rectangle(source_rect(index), fill=source_color(row_index, index))

    transparent_left, transparent_top, transparent_right, transparent_bottom = source_rect(0)
    draw.rectangle(
        (
            transparent_left + 38,
            transparent_top + 14,
            transparent_left + 58,
            transparent_bottom - 10,
        ),
        fill=(0, 0, 0, 0),
    )
    image.save(path)


def cell_crop(image: Image.Image, col: int, row: int) -> Image.Image:
    return image.crop((
        col * TILE_SIZE,
        row * SPRITE_HEIGHT,
        (col + 1) * TILE_SIZE,
        (row + 1) * SPRITE_HEIGHT,
    ))


def alpha_bbox(image: Image.Image, col: int, row: int) -> tuple[int, int, int, int]:
    crop = cell_crop(image, col, row)
    bbox = crop.getchannel("A").getbbox()
    assert bbox is not None, f"cell {col},{row} is empty"
    return bbox


def solid_alpha_bbox(cell: Image.Image) -> tuple[int, int, int, int]:
    alpha = cell.getchannel("A")
    xs: list[int] = []
    ys: list[int] = []
    for y in range(cell.height):
        for x in range(cell.width):
            if alpha.getpixel((x, y)) >= 64:
                xs.append(x)
                ys.append(y)
    assert xs and ys, "cell contains no solid alpha pixels"
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def assert_cell_contains_color(
    image: Image.Image,
    row: int,
    col: int,
    expected: tuple[int, int, int, int],
) -> None:
    cell = cell_crop(image, col, row)
    expected_rgb = expected[:3]
    pixels = cell.load()
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b, a = pixels[x, y]
            if a >= 220 and all(abs(actual - want) <= 3 for actual, want in zip((r, g, b), expected_rgb)):
                return
    raise AssertionError(f"output cell {col},{row} does not contain {expected_rgb}")


def assert_no_opaque_key_pixels(image: Image.Image) -> None:
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a > 0 and is_key_pixel(r, g, b):
                raise AssertionError(f"key pixel remained opaque at {x},{y}: {(r, g, b, a)}")


def test_remove_key_handles_near_keys_and_preserves_wall_purple() -> None:
    image = Image.new("RGBA", (5, 1), (0, 0, 0, 0))
    pixels = image.load()
    samples = [EXACT_MAGENTA, NEAR_MAGENTA, EXACT_GREEN, NEAR_GREEN, PURPLE_WALL]
    for index, color in enumerate(samples):
        pixels[index, 0] = color

    keyed = remove_key(image)
    assert [keyed.getpixel((index, 0))[3] for index in range(4)] == [0, 0, 0, 0]
    assert keyed.getpixel((4, 0)) == PURPLE_WALL


def test_compose_wall_family_assets() -> None:
    assert SOURCE_FILENAMES == EXPECTED_SOURCE_FILENAMES

    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        for row_index, name in enumerate(EXPECTED_SOURCE_FILENAMES):
            make_source(root / name, row_index)

        output = root / "wall-family-generated-v1.png"
        preview = root / "wall-family-generated-v1-preview-4x.png"
        compose_wall_family_assets(root, output, preview)

        image = Image.open(output).convert("RGBA")
        assert image.size == (16 * TILE_SIZE, 12 * SPRITE_HEIGHT)
        assert Image.open(preview).size == (16 * TILE_SIZE * 4, 12 * SPRITE_HEIGHT * 4)

        for row in range(12):
            for col in range(16):
                _, _, _, bottom = alpha_bbox(image, col, row)
                assert bottom >= SPRITE_HEIGHT - 2
                assert image.getpixel((col * TILE_SIZE, row * SPRITE_HEIGHT))[3] == 0

        for row in range(len(EXPECTED_SOURCE_FILENAMES)):
            for col in range(SOURCE_COLUMNS * SOURCE_ROWS):
                assert_cell_contains_color(image, row, col, source_color(row, col))

        assert_cell_contains_color(image, 2, 15, PURPLE_WALL)
        assert_no_opaque_key_pixels(image)

        skinny = solid_alpha_bbox(cell_crop(image, 15, 0))
        wide = solid_alpha_bbox(cell_crop(image, 0, 0))
        assert skinny[2] - skinny[0] <= 8
        assert wide[2] - wide[0] >= 24

        assert cell_crop(image, 0, 0).getpixel((14, 31))[3] == 0


if __name__ == "__main__":
    test_remove_key_handles_near_keys_and_preserves_wall_purple()
    test_compose_wall_family_assets()
    print("wall family asset pixel tests passed")
