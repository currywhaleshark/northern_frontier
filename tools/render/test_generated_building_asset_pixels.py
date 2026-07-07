from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src" / "render" / "generatedBuildingAssets.ts"
TILE_SIZE = 28
SPRITE_HEIGHT = 40


def sheet_path() -> Path:
    source = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"src:\s*'(/assets/[^']+)'", source)
    assert match, "generated building sheet src was not found"
    return ROOT / "public" / match.group(1).lstrip("/")


def alpha_bbox(image: Image.Image, col: int, row: int) -> tuple[int, int, int, int]:
    crop = image.crop(
        (
            col * TILE_SIZE,
            row * SPRITE_HEIGHT,
            (col + 1) * TILE_SIZE,
            (row + 1) * SPRITE_HEIGHT,
        ),
    )
    bbox = crop.getchannel("A").getbbox()
    assert bbox is not None, f"cell {col},{row} is empty"
    return bbox


def test_sheet_dimensions() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    assert image.size == (15 * TILE_SIZE, 3 * SPRITE_HEIGHT)


def test_fields_are_top_down_square_tiles() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    for col in range(4):
        left, top, right, bottom = alpha_bbox(image, col, 2)
        width = right - left
        height = bottom - top
        assert width >= 23
        assert height >= 23
        assert abs(width - height) <= 4


def test_building_cells_are_not_empty_and_bottom_aligned() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    for row in range(2):
        for col in range(15):
            left, top, right, bottom = alpha_bbox(image, col, row)
            width = right - left
            height = bottom - top
            assert width >= 12, f"cell {col},{row} is too narrow"
            assert height >= 14, f"cell {col},{row} is too short"
            assert right <= TILE_SIZE, f"cell {col},{row} exceeds cell width"
            assert bottom >= SPRITE_HEIGHT - 2, f"cell {col},{row} is not bottom aligned"


if __name__ == "__main__":
    test_sheet_dimensions()
    test_fields_are_top_down_square_tiles()
    test_building_cells_are_not_empty_and_bottom_aligned()
    print("generated building asset pixel tests passed")
