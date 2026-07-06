from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src" / "render" / "generatedCharacterAssets.ts"
RESIDENT_WIDTH = 28
MOUNTED_WIDTH = 56
SPRITE_HEIGHT = 40
RESIDENT_COLUMNS = 10
ROWS = 2


def sheet_path() -> Path:
    source = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"src:\s*'(/assets/[^']+)'", source)
    assert match, "generated character sheet src was not found"
    return ROOT / "public" / match.group(1).lstrip("/")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None, "cell is empty"
    return bbox


def test_sheet_dimensions() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    assert image.size == (RESIDENT_COLUMNS * RESIDENT_WIDTH + MOUNTED_WIDTH, ROWS * SPRITE_HEIGHT)


def test_resident_cells_are_not_empty() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    for row in range(ROWS):
        for col in range(RESIDENT_COLUMNS):
            cell = image.crop((
                col * RESIDENT_WIDTH,
                row * SPRITE_HEIGHT,
                (col + 1) * RESIDENT_WIDTH,
                (row + 1) * SPRITE_HEIGHT,
            ))
            left, top, right, bottom = alpha_bbox(cell)
            assert right - left >= 8
            assert bottom - top >= 16
            assert right - left <= RESIDENT_WIDTH
            assert bottom - top <= SPRITE_HEIGHT


def test_mounted_raider_cells_are_wide() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    x0 = RESIDENT_COLUMNS * RESIDENT_WIDTH
    for row in range(ROWS):
        cell = image.crop((x0, row * SPRITE_HEIGHT, x0 + MOUNTED_WIDTH, (row + 1) * SPRITE_HEIGHT))
        left, top, right, bottom = alpha_bbox(cell)
        assert right - left >= 30
        assert bottom - top >= 18


if __name__ == "__main__":
    test_sheet_dimensions()
    test_resident_cells_are_not_empty()
    test_mounted_raider_cells_are_wide()
    print("generated character asset pixel tests passed")
