from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SHEETS = [
    (ROOT / "public" / "assets" / "foreign-residents-v1.png", 28, 40, 4, 2),
    (ROOT / "public" / "assets" / "foreign-site-cores-v1.png", 56, 80, 5, 1),
    (ROOT / "public" / "assets" / "foreign-site-props-v1.png", 28, 40, 5, 1),
]


for path, cell_width, cell_height, columns, rows in SHEETS:
    image = Image.open(path).convert("RGBA")
    assert image.size == (cell_width * columns, cell_height * rows), (path.name, image.size)
    assert image.getpixel((0, 0))[3] == 0, f"{path.name} corner must be transparent"
    for row in range(rows):
        for column in range(columns):
            cell = image.crop((
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            ))
            bbox = cell.getchannel("A").getbbox()
            assert bbox is not None, f"{path.name} cell {column},{row} is empty"
            assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < cell_width and bbox[3] <= cell_height, (
                path.name,
                column,
                row,
                bbox,
            )
            visible = [pixel for pixel in cell.get_flattened_data() if pixel[3] > 32]
            assert len(visible) >= 30, f"{path.name} cell {column},{row} is too sparse"
            assert not any(r > 190 and b > 170 and g < 110 for r, g, b, _alpha in visible), (
                path.name,
                column,
                row,
                "visible magenta fringe",
            )

print("foreign site asset pixel tests passed")
