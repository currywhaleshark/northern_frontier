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
LARGE_SOURCE_SIZE = 1024
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


def cell_origin(index: int, source_cell: int = SOURCE_CELL) -> tuple[int, int]:
    return (index % SOURCE_COLUMNS) * source_cell, (index // SOURCE_COLUMNS) * source_cell


def scale_offset(value: int, source_cell: int) -> int:
    return round(value * source_cell / SOURCE_CELL)


def source_rect(index: int, source_cell: int = SOURCE_CELL) -> tuple[int, int, int, int]:
    left, top = cell_origin(index, source_cell)
    if index == 0:
        offsets = (18, 44, 110, 110)
    elif index == 15:
        offsets = (55, 92, 73, 110)
    elif index % 5 == 0:
        offsets = (30, 66, 96, 110)
    elif index % 3 == 0:
        offsets = (24, 58, 90, 108)
    else:
        offsets = (34, 62, 94, 110)
    return tuple(
        origin + scale_offset(offset, source_cell)
        for origin, offset in zip((left, top, left, top), offsets)
    )


def make_source(path: Path, row_index: int, source_size: int = SOURCE_SIZE) -> None:
    image = Image.new("RGBA", (source_size, source_size), EXACT_MAGENTA)
    draw = ImageDraw.Draw(image)
    source_cell = source_size // SOURCE_COLUMNS

    for index in range(SOURCE_COLUMNS * SOURCE_ROWS):
        left, top = cell_origin(index, source_cell)
        draw.rectangle(
            (
                left,
                top,
                left + scale_offset(42, source_cell),
                top + scale_offset(34, source_cell),
            ),
            fill=NEAR_MAGENTA,
        )
        draw.rectangle(
            (
                left + scale_offset(82, source_cell),
                top,
                left + scale_offset(127, source_cell),
                top + scale_offset(36, source_cell),
            ),
            fill=NEAR_GREEN,
        )
        draw.rectangle(
            (
                left,
                top + scale_offset(104, source_cell),
                left + scale_offset(22, source_cell),
                top + source_cell - 1,
            ),
            fill=EXACT_GREEN,
        )
        draw.rectangle(source_rect(index, source_cell), fill=source_color(row_index, index))

    transparent_left, transparent_top, transparent_right, transparent_bottom = source_rect(0, source_cell)
    draw.rectangle(
        (
            transparent_left + scale_offset(38, source_cell),
            transparent_top + scale_offset(14, source_cell),
            transparent_left + scale_offset(58, source_cell),
            transparent_bottom - scale_offset(10, source_cell),
        ),
        fill=(0, 0, 0, 0),
    )
    image.save(path)


def make_all_sources(root: Path, source_size: int = SOURCE_SIZE) -> None:
    for row_index, name in enumerate(EXPECTED_SOURCE_FILENAMES):
        make_source(root / name, row_index, source_size)


def make_tiny_footprint_source(path: Path, row_index: int) -> None:
    image = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), EXACT_MAGENTA)
    draw = ImageDraw.Draw(image)
    for index in range(SOURCE_COLUMNS * SOURCE_ROWS):
        left, top = cell_origin(index)
        draw.rectangle(
            (left + 61, top + 61, left + 66, top + 66),
            fill=source_color(row_index, index),
        )
    image.save(path)


def inject_off_key_speck(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    left, top = cell_origin(index)
    pixels[left + 3, top + 3] = (84, 82, 80, 255)
    image.save(path)


def inject_off_key_edge_strip(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    left, top = cell_origin(index)
    draw.rectangle(
        (left + 3, top, left + 3, top + SOURCE_CELL - 1),
        fill=(84, 82, 80, 255),
    )
    image.save(path)


def inject_interior_off_key_speck(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    left, top = cell_origin(index)
    pixels[left + 12, top + 50] = (84, 82, 80, 255)
    image.save(path)


def inject_interior_off_key_cluster(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    left, top = cell_origin(index)
    draw.rectangle((left + 12, top + 50, left + 15, top + 53), fill=(84, 82, 80, 255))
    image.save(path)


def clear_source_cell(path: Path, index: int) -> None:
    image = Image.open(path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    left, top = cell_origin(index)
    draw.rectangle(
        (left, top, left + SOURCE_CELL - 1, top + SOURCE_CELL - 1),
        fill=EXACT_MAGENTA,
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
        make_all_sources(root)

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
        assert skinny == (11, 34, 17, SPRITE_HEIGHT)
        assert skinny[2] - skinny[0] <= 8
        assert wide[2] - wide[0] >= 24

        assert cell_crop(image, 0, 0).getpixel((14, 31))[3] == 0


def test_compose_accepts_1024_source_sheets() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root, LARGE_SOURCE_SIZE)

        output = root / "wall-family-generated-v1.png"
        preview = root / "wall-family-generated-v1-preview-4x.png"
        compose_wall_family_assets(root, output, preview)

        image = Image.open(output).convert("RGBA")
        assert image.size == (16 * TILE_SIZE, 12 * SPRITE_HEIGHT)
        assert Image.open(preview).size == (16 * TILE_SIZE * 4, 12 * SPRITE_HEIGHT * 4)
        assert_cell_contains_color(image, 0, 0, source_color(0, 0))
        assert_cell_contains_color(image, 11, 15, source_color(11, 15))


def test_compose_rejects_off_key_source_specks() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[4]
        mask_index = 6
        inject_off_key_speck(root / filename, mask_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-generated-v1.png",
                root / "wall-family-generated-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"mask index {mask_index}" in message
            assert "suspicious off-key artifact" in message
        else:
            raise AssertionError("expected off-key source speck to raise ValueError")


def test_compose_rejects_interior_detached_source_specks() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[8]
        mask_index = 7
        inject_interior_off_key_speck(root / filename, mask_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-generated-v1.png",
                root / "wall-family-generated-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"mask index {mask_index}" in message
            assert "tiny detached off-key artifact" in message
            assert "area 1" in message
            assert "bbox" in message
        else:
            raise AssertionError("expected interior off-key source speck to raise ValueError")


def test_compose_rejects_interior_detached_source_clusters() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[9]
        mask_index = 5
        inject_interior_off_key_cluster(root / filename, mask_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-generated-v1.png",
                root / "wall-family-generated-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"mask index {mask_index}" in message
            assert "tiny detached off-key artifact" in message
            assert "area 16" in message
            assert "bbox" in message
        else:
            raise AssertionError("expected interior off-key source cluster to raise ValueError")


def test_compose_rejects_off_key_source_gutter_strips() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[3]
        mask_index = 10
        inject_off_key_edge_strip(root / filename, mask_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-generated-v1.png",
                root / "wall-family-generated-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"mask index {mask_index}" in message
            assert "suspicious off-key artifact" in message
        else:
            raise AssertionError("expected off-key source gutter strip to raise ValueError")


def test_compose_reports_too_small_sheet_footprint_with_context() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[1]
        make_tiny_footprint_source(root / filename, 1)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-generated-v1.png",
                root / "wall-family-generated-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert "normalized footprint" in message
            assert "source cell size" in message
            assert "Check non-key artifacts, oversized footprint, or insufficient padding" in message
        else:
            raise AssertionError("expected tiny source footprint to raise ValueError")


def test_compose_reports_empty_cells_with_source_context() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        make_all_sources(root)
        filename = EXPECTED_SOURCE_FILENAMES[7]
        mask_index = 9
        clear_source_cell(root / filename, mask_index)

        try:
            compose_wall_family_assets(
                root,
                root / "wall-family-generated-v1.png",
                root / "wall-family-generated-v1-preview-4x.png",
            )
        except ValueError as error:
            message = str(error)
            assert filename in message
            assert f"mask index {mask_index}" in message
            assert "contains no non-key pixels" in message
        else:
            raise AssertionError("expected empty source cell to raise ValueError")


if __name__ == "__main__":
    test_remove_key_handles_near_keys_and_preserves_wall_purple()
    test_compose_wall_family_assets()
    test_compose_accepts_1024_source_sheets()
    test_compose_rejects_off_key_source_specks()
    test_compose_rejects_interior_detached_source_specks()
    test_compose_rejects_interior_detached_source_clusters()
    test_compose_rejects_off_key_source_gutter_strips()
    test_compose_reports_too_small_sheet_footprint_with_context()
    test_compose_reports_empty_cells_with_source_context()
    print("wall family asset pixel tests passed")
