from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BUILDING_SHEET = ROOT / "public" / "assets" / "promotion-buildings-generated-v1.png"
LARGE_BUILDING_SHEET = ROOT / "public" / "assets" / "promotion-buildings-generated-large-v1.png"
CHARACTER_SHEET = ROOT / "public" / "assets" / "promotion-characters-generated-v1.png"
TILE_SIZE = 28
SPRITE_HEIGHT = 40
LARGE_TILE_SIZE = 56
LARGE_SPRITE_HEIGHT = 80
BUILDING_COLUMNS = 12
CHARACTER_COLUMNS = 6
ROWS = 2


def alpha_bbox(cell: Image.Image) -> tuple[int, int, int, int]:
    bbox = cell.getchannel("A").getbbox()
    assert bbox is not None, "cell is empty"
    return bbox


def cell(image: Image.Image, col: int, row: int) -> Image.Image:
    return image.crop(
        (
            col * TILE_SIZE,
            row * SPRITE_HEIGHT,
            (col + 1) * TILE_SIZE,
            (row + 1) * SPRITE_HEIGHT,
        )
    )


def test_building_sheet_dimensions() -> None:
    image = Image.open(BUILDING_SHEET).convert("RGBA")
    assert image.size == (BUILDING_COLUMNS * TILE_SIZE, ROWS * SPRITE_HEIGHT)


def test_building_cells_are_not_empty() -> None:
    image = Image.open(BUILDING_SHEET).convert("RGBA")
    for row in range(ROWS):
      for col in range(BUILDING_COLUMNS):
        left, top, right, bottom = alpha_bbox(cell(image, col, row))
        assert right - left >= 12
        assert bottom - top >= 14


def test_large_building_sheet_dimensions() -> None:
    image = Image.open(LARGE_BUILDING_SHEET).convert("RGBA")
    assert image.size == (BUILDING_COLUMNS * LARGE_TILE_SIZE, ROWS * LARGE_SPRITE_HEIGHT)


def test_large_building_cells_are_not_empty() -> None:
    image = Image.open(LARGE_BUILDING_SHEET).convert("RGBA")
    for row in range(ROWS):
      for col in range(BUILDING_COLUMNS):
        crop = image.crop(
            (
                col * LARGE_TILE_SIZE,
                row * LARGE_SPRITE_HEIGHT,
                (col + 1) * LARGE_TILE_SIZE,
                (row + 1) * LARGE_SPRITE_HEIGHT,
            )
        )
        left, top, right, bottom = alpha_bbox(crop)
        assert right - left >= 24
        assert bottom - top >= 28


def test_character_sheet_dimensions() -> None:
    image = Image.open(CHARACTER_SHEET).convert("RGBA")
    assert image.size == (CHARACTER_COLUMNS * TILE_SIZE, ROWS * SPRITE_HEIGHT)


def test_character_cells_are_bottom_aligned() -> None:
    image = Image.open(CHARACTER_SHEET).convert("RGBA")
    for row in range(ROWS):
      for col in range(CHARACTER_COLUMNS):
        left, top, right, bottom = alpha_bbox(cell(image, col, row))
        assert right - left >= 8
        assert bottom - top >= 18
        assert bottom == SPRITE_HEIGHT


if __name__ == "__main__":
    test_building_sheet_dimensions()
    test_building_cells_are_not_empty()
    test_large_building_sheet_dimensions()
    test_large_building_cells_are_not_empty()
    test_character_sheet_dimensions()
    test_character_cells_are_bottom_aligned()
    print("promotion asset pixel tests passed")
