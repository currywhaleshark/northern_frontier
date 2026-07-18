from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images" / "special-residents-v1"
OUTPUT = ROOT / "public" / "assets" / "special-residents-v1.png"

CELL_WIDTH = 28
CELL_HEIGHT = 40

# specialResidentAssets.ts의 열 순서와 같아야 한다.
SOURCES = [
    ("mudang-wolhyang-clean.png", 24, 36),
    ("monk-haeun-clean.png", 24, 36),
    ("exiled-scholar-yun-clean.png", 26, 36),
    ("jurchen-warrior-aragae-clean.png", 26, 38),
]


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("special resident sprite contains no opaque pixels")
    return bbox


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif a < 245 and r > g + 70 and b > g + 70:
                # 크로마키 가장자리의 얇은 자홍색만 억제한다.
                neutral = max(g, min(r, b) - 50)
                pixels[x, y] = (neutral, g, neutral, a)
    return rgba


def fit_to_cell(source: Image.Image, max_width: int, max_height: int) -> Image.Image:
    clean = clear_transparent_rgb(source)
    cropped = clean.crop(alpha_bbox(clean))
    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized = cropped.resize(
        (
            max(1, round(cropped.width * scale)),
            max(1, round(cropped.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    resized = clear_transparent_rgb(resized)
    cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    x = (CELL_WIDTH - resized.width) // 2
    y = CELL_HEIGHT - resized.height
    cell.alpha_composite(resized, (x, y))
    return clear_transparent_rgb(cell)


def main() -> None:
    atlas = Image.new("RGBA", (CELL_WIDTH * len(SOURCES), CELL_HEIGHT), (0, 0, 0, 0))
    for column, (filename, max_width, max_height) in enumerate(SOURCES):
        source = Image.open(SOURCE_DIR / filename).convert("RGBA")
        cell = fit_to_cell(source, max_width, max_height)
        atlas.alpha_composite(cell, (column * CELL_WIDTH, 0))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    clear_transparent_rgb(atlas).save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
