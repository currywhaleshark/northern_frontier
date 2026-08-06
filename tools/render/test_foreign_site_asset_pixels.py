from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SHEETS = [
    (ROOT / "public" / "assets" / "foreign-residents-v1.png", 28, 40, 4, 2),
    (ROOT / "public" / "assets" / "foreign-site-cores-v2.png", 112, 160, 5, 2),
    (ROOT / "public" / "assets" / "foreign-site-cores-hd-v2.png", 448, 640, 5, 2),
    (ROOT / "public" / "assets" / "foreign-site-props-v2.png", 56, 80, 7, 2),
    (ROOT / "public" / "assets" / "foreign-site-props-hd-v2.png", 224, 320, 7, 2),
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


for stem, columns in (("foreign-site-cores", 5), ("foreign-site-props", 7)):
    standard = Image.open(ROOT / "public" / "assets" / f"{stem}-v2.png").convert("RGBA")
    hd = Image.open(ROOT / "public" / "assets" / f"{stem}-hd-v2.png").convert("RGBA")
    assert hd.width == standard.width * 4 and hd.height == standard.height * 4, (
        stem,
        standard.size,
        hd.size,
    )
    cell_width = standard.width // columns
    cell_height = standard.height // 2
    for column in range(columns):
        normal = standard.crop((column * cell_width, 0, (column + 1) * cell_width, cell_height))
        winter = standard.crop((
            column * cell_width,
            cell_height,
            (column + 1) * cell_width,
            cell_height * 2,
        ))
        assert normal.tobytes() != winter.tobytes(), f"{stem} column {column} winter frame is unchanged"

print("foreign site asset pixel tests passed")
