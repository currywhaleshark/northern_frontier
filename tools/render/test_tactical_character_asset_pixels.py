from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets" / "tactical"


def assert_sheet(name: str, size: tuple[int, int], columns: int, rows: int) -> None:
    image = Image.open(ASSETS / name).convert("RGBA")
    assert image.size == size, (name, image.size, size)
    cell_width = image.width // columns
    cell_height = image.height // rows
    for row in range(rows):
        for column in range(columns):
            cell = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            assert cell.getchannel("A").getbbox() is not None, (name, row, column)


assert_sheet("folk-characters-tactical-v1.png", (1008, 240), 12, 2)
assert_sheet("militia-weapons-tactical-v1.png", (252, 240), 3, 2)
assert_sheet("faction-raiders-tactical-v1.png", (1008, 120), 6, 1)

print("tactical character asset pixel tests passed")
