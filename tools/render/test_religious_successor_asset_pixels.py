from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "public" / "assets"


def cell(image: Image.Image, column: int, row: int) -> Image.Image:
    width = image.width // 3
    height = image.height // 2
    return image.crop((
        column * width,
        row * height,
        (column + 1) * width,
        (row + 1) * height,
    ))


def assert_sheet(filename: str, cell_width: int, cell_height: int) -> None:
    image = Image.open(ASSET_DIR / filename).convert("RGBA")
    assert image.size == (cell_width * 3, cell_height * 2)
    heights: dict[tuple[int, int], int] = {}
    for row in range(2):
        for column in range(3):
            sprite = cell(image, column, row)
            bbox = sprite.getchannel("A").getbbox()
            assert bbox is not None, f"{filename} cell {column},{row} is empty"
            assert bbox[0] > 0 and bbox[1] > 0, f"{filename} cell {column},{row} touches top/left"
            assert bbox[2] < cell_width and bbox[3] < cell_height, (
                f"{filename} cell {column},{row} touches bottom/right"
            )
            heights[(column, row)] = bbox[3] - bbox[1]
            for red, green, blue, alpha in sprite.get_flattened_data():
                if alpha == 0:
                    assert (red, green, blue) == (0, 0, 0)
                assert not (
                    alpha > 0 and red > 190 and blue > 190 and green < 90
                ), f"{filename} cell {column},{row} retains magenta pixels"
    assert heights[(2, 0)] < heights[(1, 0)]
    assert heights[(2, 1)] < heights[(1, 1)]


def main() -> None:
    assert_sheet("religious-successors-static-v1.png", 28, 40)
    assert_sheet("religious-successors-static-hd-v1.png", 56, 80)
    print("religious successor asset pixel tests passed")


if __name__ == "__main__":
    main()
