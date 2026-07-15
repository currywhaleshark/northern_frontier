from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "public" / "assets" / "tactical" / "defender-default-weapons-poses-v1.png"
CELL_WIDTH = 84
CELL_HEIGHT = 120
ROWS = 4
COLUMNS = 6
SAFE_PADDING = 3


sheet = Image.open(ASSET).convert("RGBA")
assert sheet.size == (CELL_WIDTH * COLUMNS, CELL_HEIGHT * ROWS), sheet.size

for row in range(ROWS):
    for column in range(COLUMNS):
        cell = sheet.crop((
            column * CELL_WIDTH,
            row * CELL_HEIGHT,
            (column + 1) * CELL_WIDTH,
            (row + 1) * CELL_HEIGHT,
        ))
        alpha = cell.getchannel("A")
        bbox = alpha.getbbox()
        assert bbox is not None, (row, column, "empty pose")
        assert bbox[0] >= SAFE_PADDING, (row, column, "left edge clipping", bbox)
        assert bbox[1] >= SAFE_PADDING, (row, column, "top edge clipping", bbox)
        assert bbox[2] <= CELL_WIDTH - SAFE_PADDING, (row, column, "right edge clipping", bbox)
        assert bbox[3] <= CELL_HEIGHT - SAFE_PADDING, (row, column, "bottom edge clipping", bbox)
        assert sum(value > 32 for value in alpha.get_flattened_data()) >= 180, (
            row, column, "pose lost too much source detail",
        )

# Long attack weapons must remain visible end-to-end instead of being sliced at the old equal-grid boundary.
for column in (0, 1, 2, 3):
    attack = sheet.crop((
        column * CELL_WIDTH,
        CELL_HEIGHT,
        (column + 1) * CELL_WIDTH,
        CELL_HEIGHT * 2,
    ))
    bbox = attack.getchannel("A").getbbox()
    assert bbox is not None and bbox[2] - bbox[0] >= 68, (column, "attack weapon was truncated", bbox)

print("tactical default weapon asset pixel tests passed")
