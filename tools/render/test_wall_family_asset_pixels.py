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


ROOT = Path(__file__).resolve().parents[2]
SOURCE_SIZE = 384
SOURCE_COLUMNS = 3
SOURCE_ROWS = 1
SOURCE_CELL = SOURCE_SIZE // SOURCE_COLUMNS
EXPECTED_SOURCE_FILENAMES = [
    "wall-family-palisade-normal-source-v1.png",
    "wall-family-earthfort-normal-source-v1.png",
    "wall-family-stonewall-normal-source-v1.png",
    "wall-family-palisade-winter-source-v1.png",
    "wall-family-earthfort-winter-source-v1.png",
    "wall-family-stonewall-winter-source-v1.png",
]
EXACT_MAGENTA = (255, 0, 255, 255)
NEAR_MAGENTA = (198, 16, 197, 255)
EXACT_GREEN = (0, 255, 0, 255)
NEAR_GREEN = (18, 198, 16, 255)
PURPLE_WALL = (205, 78, 171, 255)


def source_color(row_index: int, cell_index: int) -> tuple[int, int, int, int]:
    if row_index == 2 and cell_index == 1:
        return PURPLE_WALL
    return (
        32 + (cell_index * 41 + row_index * 7) % 176,
        42 + (row_index * 31 + cell_index * 3) % 145,
        48 + (cell_index * 23 + row_index * 11) % 142,
        255,
    )


def cell_origin(index: int) -> tuple[int, int]:
    return index * SOURCE_CELL, 0


def source_rect(index: int) -> tuple[int, int, int, int]:
    left, top = cell_origin(index)
    if index == 0:
        offsets = (39, 76, 89, 112)
    elif index == 1:
        offsets = (16, 83, 112, 108)
    else:
        offsets = (48, 20, 80, 118)
    return (
        left + offsets[0],
        top + offsets[1],
        left + offsets[2],
        top + offsets[3],
    )


def make_source(path: Path, row_index: int) -> None:
    image = Image.new("RGBA", (SOURCE_SIZE, SOURCE_CELL), EXACT_MAGENTA)
    draw = ImageDraw.Draw(image)
    for index in range(SOURCE_COLUMNS * SOURCE_ROWS):
        left, top = cell_origin(index)
        draw.rectangle((left, top, left + 24, top + 22), fill=NEAR_MAGENTA)
        draw.rectangle((left + SOURCE_CELL - 28, top, left + SOURCE_CELL - 1, top + 22), fill=NEAR_GREEN)
        draw.rectangle((left, top + SOURCE_CELL - 20, left + 18, top + SOURCE_CELL - 1), fill=EXACT_GREEN)
        draw.rectangle(source_rect(index), fill=source_color(row_index, index))
    image.save(path)


def make_all_sources(root: Path) -> None:
    for row_index, name in enumerate(EXPECTED_SOURCE_FILENAMES):
        make_source(root / name, row_index)


def inject_off_key_edge_strip(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    left, top = cell_origin(index)
    draw.rectangle((left + 3, top, left + 3, top + SOURCE_CELL - 1), fill=(84, 82, 80, 255))
    image.save(path)


def clear_source_cell(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    left, top = cell_origin(index)
    draw.rectangle((left, top, left + SOURCE_CELL - 1, top + SOURCE_CELL - 1), fill=EXACT_MAGENTA)
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
        make_all_sources(root)

        output = root / "wall-family-modular-v1.png"
        preview = root / "wall-family-modular-v1-preview-4x.png"
        compose_wall_family_assets(root, output, preview)

        image = Image.open(output).convert("RGBA")
        assert image.size == (3 * TILE_SIZE, 6 * SPRITE_HEIGHT)
        assert Image.open(preview).size == (3 * TILE_SIZE * 4, 6 * SPRITE_HEIGHT * 4)

        for row in range(6):
            for col in range(3):
                _, _, _, bottom = alpha_bbox(image, col, row)
                assert bottom >= SPRITE_HEIGHT - 2
                assert image.getpixel((col * TILE_SIZE, row * SPRITE_HEIGHT))[3] == 0
                assert_cell_contains_color(image, row, col, source_color(row, col))

        assert_cell_contains_color(image, 2, 1, PURPLE_WALL)
        assert_no_opaque_key_pixels(image)


def test_compose_rejects_off_key_source_gutter_strips() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[3]
        piece_index = 2
        inject_off_key_edge_strip(root / filename, piece_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-modular-v1.png",
                root / "wall-family-modular-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"piece index {piece_index}" in message
            assert "suspicious off-key artifact" in message
        else:
            raise AssertionError("expected off-key source gutter strip to raise ValueError")


def test_compose_reports_empty_cells_with_source_context() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[5]
        piece_index = 1
        clear_source_cell(root / filename, piece_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-modular-v1.png",
                root / "wall-family-modular-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"piece index {piece_index}" in message
            assert "contains no non-key pixels" in message
        else:
            raise AssertionError("expected empty source cell to raise ValueError")


def test_wall_gate_asset_pixels() -> None:
    output = ROOT / "public" / "assets" / "wall-gate-v1.png"
    preview = ROOT / "docs" / "assets" / "walls" / "wall-gate-v1-preview-8x.png"

    image = Image.open(output).convert("RGBA")
    assert image.size == (2 * TILE_SIZE, 2 * SPRITE_HEIGHT)
    assert Image.open(preview).size == (2 * TILE_SIZE * 8, 2 * SPRITE_HEIGHT * 8)

    for row in range(2):
        for col in range(2):
            left, top, right, bottom = alpha_bbox(image, col, row)
            assert bottom >= SPRITE_HEIGHT - 1
            assert right - left >= 18
            assert bottom - top >= 30
            assert image.getpixel((col * TILE_SIZE, row * SPRITE_HEIGHT))[3] == 0

    horizontal_width = alpha_bbox(image, 0, 0)[2] - alpha_bbox(image, 0, 0)[0]
    vertical_width = alpha_bbox(image, 1, 0)[2] - alpha_bbox(image, 1, 0)[0]
    assert horizontal_width >= 24
    assert vertical_width >= 20
    assert_no_opaque_key_pixels(image)


if __name__ == "__main__":
    test_remove_key_handles_near_keys_and_preserves_wall_purple()
    test_compose_wall_family_assets()
    test_compose_rejects_off_key_source_gutter_strips()
    test_compose_reports_empty_cells_with_source_context()
    test_wall_gate_asset_pixels()
    print("wall family asset pixel tests passed")
