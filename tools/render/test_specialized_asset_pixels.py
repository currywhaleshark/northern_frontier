from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets"


def assert_cells(path: Path, columns: int, rows: int, width: int, height: int) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    assert image.size == (columns * width, rows * height)
    for row in range(rows):
        for col in range(columns):
            cell = image.crop((col * width, row * height, (col + 1) * width, (row + 1) * height))
            assert cell.getchannel("A").getbbox() is not None, f"empty cell {path.name} {col},{row}"
    return image


def assert_no_magenta_key(image: Image.Image) -> None:
    for r, g, b, a in image.get_flattened_data():
        assert not (a > 0 and r > 135 and b > 120 and g < 150 and min(r, b) - g > 58 and abs(r - b) < 105)


def test_sheets() -> None:
    small = assert_cells(ASSETS / "specialized-buildings-v1.png", 6, 2, 28, 40)
    large = assert_cells(ASSETS / "specialized-buildings-large-v1.png", 6, 2, 56, 80)
    workers = assert_cells(ASSETS / "specialized-workers-v1.png", 3, 2, 28, 40)
    raiders = assert_cells(ASSETS / "faction-raiders-v1.png", 6, 1, 56, 40)
    damage = assert_cells(ASSETS / "building-damage-v1.png", 2, 1, 56, 80)
    for image in (small, large, workers, raiders, damage):
        assert_no_magenta_key(image)

    normal_damage = damage.crop((0, 0, 56, 80))
    snow_damage = damage.crop((56, 0, 112, 80))
    assert ImageChops.difference(normal_damage, snow_damage).getbbox() is not None


def test_fuel_and_events() -> None:
    fuel = Image.open(ASSETS / "resources" / "fuel-group-v1.png").convert("RGBA")
    assert fuel.size == (64, 64)
    assert fuel.getchannel("A").getbbox() is not None
    assert_no_magenta_key(fuel)
    for name in (
        "court-tribute-v1.png",
        "court-petition-v1.png",
        "royal-inspection-v1.png",
        "royal-crackdown-v1.png",
    ):
        image = Image.open(ASSETS / "events" / name)
        assert image.width >= 1000 and image.height >= 600


if __name__ == "__main__":
    test_sheets()
    test_fuel_and_events()
    print("specialized asset pixel tests passed")
