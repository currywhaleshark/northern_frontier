from pathlib import Path
import re

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "src" / "render" / "generatedTerrainObjects.ts"
TILE_SIZE = 28


def sheet_path() -> Path:
    source = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"src:\s*'(/assets/[^']+)'", source)
    assert match, "generated terrain object sheet src was not found"
    return ROOT / "public" / match.group(1).lstrip("/")


def opaque_pixels(image: Image.Image, column: int):
    pixels = []
    left = column * TILE_SIZE
    for y in range(TILE_SIZE):
        for x in range(left, left + TILE_SIZE):
            r, g, b, a = image.getpixel((x, y))
            if a > 32:
                pixels.append((r, g, b, a))
    assert pixels, f"cell {column} has no opaque pixels"
    return pixels


def avg_channel(pixels, channel: int) -> float:
    return sum(pixel[channel] for pixel in pixels) / len(pixels)


def ratio(pixels, predicate) -> float:
    return sum(1 for pixel in pixels if predicate(pixel)) / len(pixels)


def test_autumn_broadleaf_reads_as_autumn() -> None:
    image = Image.open(sheet_path()).convert("RGBA")
    broadleaf = opaque_pixels(image, 0)
    autumn = opaque_pixels(image, 2)

    broadleaf_red = avg_channel(broadleaf, 0)
    autumn_red = avg_channel(autumn, 0)
    autumn_green = avg_channel(autumn, 1)
    warm_ratio = ratio(autumn, lambda p: p[0] > p[1] + 20 and p[1] > p[2] + 15)
    green_ratio = ratio(autumn, lambda p: p[1] >= p[0] and p[1] > p[2] + 10)

    assert autumn_red > broadleaf_red + 20
    assert autumn_red > autumn_green + 12
    assert warm_ratio >= 0.35
    assert green_ratio <= 0.45


if __name__ == "__main__":
    test_autumn_broadleaf_reads_as_autumn()
    print("generated terrain object pixel tests passed")
