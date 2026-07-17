from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "public" / "assets"


def alpha_cell(image: Image.Image, columns: int, rows: int, column: int, row: int) -> Image.Image:
    width = image.width // columns
    height = image.height // rows
    return image.getchannel("A").crop((
        column * width,
        row * height,
        (column + 1) * width,
        (row + 1) * height,
    ))


def assert_occupied_with_margin(alpha: Image.Image, label: str) -> tuple[int, int, int, int]:
    bbox = alpha.getbbox()
    assert bbox is not None, f"{label} is empty"
    assert bbox[0] > 0 and bbox[1] > 0, f"{label} touches its top/left edge: {bbox}"
    assert bbox[2] < alpha.width and bbox[3] < alpha.height, f"{label} touches its bottom/right edge: {bbox}"
    return bbox


def test_resources() -> None:
    image = Image.open(ASSET_DIR / "resources" / "new-content-resource-atlas-v1.png").convert("RGBA")
    assert image.size == (1024, 1024)
    for index in range(13):
        alpha = alpha_cell(image, 4, 4, index % 4, index // 4)
        assert_occupied_with_margin(alpha, f"resource {index}")
    for index in range(13, 16):
        alpha = alpha_cell(image, 4, 4, index % 4, index // 4)
        assert alpha.getbbox() is None, f"unused resource cell {index} must be empty"


def test_buildings(filename: str, cell_width: int, cell_height: int) -> None:
    image = Image.open(ASSET_DIR / filename).convert("RGBA")
    assert image.size == (7 * cell_width, 2 * cell_height)
    for column in range(7):
        normal = alpha_cell(image, 7, 2, column, 0)
        winter = alpha_cell(image, 7, 2, column, 1)
        assert_occupied_with_margin(normal, f"{filename} normal {column}")
        assert_occupied_with_margin(winter, f"{filename} winter {column}")
        assert ImageChops.difference(normal, winter).getbbox() is not None, (
            f"{filename} normal/winter pair {column} must differ"
        )


def test_residents() -> None:
    image = Image.open(ASSET_DIR / "new-content-residents-v1.png").convert("RGBA")
    assert image.size == (56, 120)
    heights: list[list[int]] = []
    for row in range(3):
        row_heights = []
        for column in range(2):
            bbox = assert_occupied_with_margin(
                alpha_cell(image, 2, 3, column, row),
                f"resident row {row} column {column}",
            )
            row_heights.append(bbox[3] - bbox[1])
        heights.append(row_heights)
    assert sum(heights[0]) < sum(heights[1]) < sum(heights[2]), (
        f"resident height progression must be infant < child < adult, got {heights}"
    )


def main() -> None:
    test_resources()
    test_buildings("new-content-buildings-v1.png", 28, 40)
    test_buildings("new-content-buildings-large-v1.png", 56, 80)
    test_residents()
    print("new content asset pixel tests passed")


if __name__ == "__main__":
    main()
