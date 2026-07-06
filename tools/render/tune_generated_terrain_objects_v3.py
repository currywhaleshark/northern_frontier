from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public" / "assets" / "folk-terrain-objects-generated-v2.png"
DESTINATION = ROOT / "public" / "assets" / "folk-terrain-objects-generated-v3.png"
TILE_SIZE = 28
AUTUMN_TREE_COLUMN = 2


def clamp(value: int, low: int = 0, high: int = 255) -> int:
    return max(low, min(high, value))


def autumn_palette(r: int, g: int, b: int) -> tuple[int, int, int]:
    lum = int(0.299 * r + 0.587 * g + 0.114 * b)

    if lum < 44:
        target = (92, 49, 21)
    elif lum < 70:
        target = (148, 78, 25)
    elif lum < 96:
        target = (201, 117, 31)
    else:
        target = (232, 162, 54)

    strength = 0.9
    return (
        clamp(round(r * (1 - strength) + target[0] * strength)),
        clamp(round(g * (1 - strength) + target[1] * strength)),
        clamp(round(b * (1 - strength) + target[2] * strength)),
    )


def tune_autumn_cell(image: Image.Image) -> None:
    left = AUTUMN_TREE_COLUMN * TILE_SIZE
    for y in range(TILE_SIZE):
        for x in range(left, left + TILE_SIZE):
            r, g, b, a = image.getpixel((x, y))
            if a <= 32:
                continue
            nr, ng, nb = autumn_palette(r, g, b)
            image.putpixel((x, y), (nr, ng, nb, a))


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    tune_autumn_cell(image)
    image.save(DESTINATION)
    print(f"wrote {DESTINATION}")


if __name__ == "__main__":
    main()
