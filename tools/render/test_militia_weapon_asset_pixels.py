from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / "public" / "assets" / "militia-weapons-generated-v1.png"
TILE_SIZE = 28
SPRITE_HEIGHT = 40
COLUMNS = 3
ROWS = 2


def alpha_bbox(cell: Image.Image) -> tuple[int, int, int, int]:
    bbox = cell.getchannel("A").getbbox()
    assert bbox is not None, "cell is empty"
    return bbox


def cell(image: Image.Image, col: int, row: int) -> Image.Image:
    return image.crop((
        col * TILE_SIZE,
        row * SPRITE_HEIGHT,
        (col + 1) * TILE_SIZE,
        (row + 1) * SPRITE_HEIGHT,
    ))


def test_sheet_dimensions() -> None:
    image = Image.open(SHEET).convert("RGBA")
    assert image.size == (COLUMNS * TILE_SIZE, ROWS * SPRITE_HEIGHT)


def test_weapon_cells_are_readable_and_bottom_aligned() -> None:
    image = Image.open(SHEET).convert("RGBA")
    for row in range(ROWS):
        for col in range(COLUMNS):
            left, top, right, bottom = alpha_bbox(cell(image, col, row))
            assert right - left >= 8
            assert bottom - top >= 18
            assert bottom == SPRITE_HEIGHT


if __name__ == "__main__":
    test_sheet_dimensions()
    test_weapon_cells_are_readable_and_bottom_aligned()
    print("militia weapon asset pixel tests passed")
