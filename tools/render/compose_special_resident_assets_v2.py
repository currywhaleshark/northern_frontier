from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BASE_ATLAS = ROOT / "public" / "assets" / "special-residents-v1.png"
SOURCE_DIR = ROOT / "tools" / "render" / "source_images" / "special-residents-v2"
OUTPUT = ROOT / "public" / "assets" / "special-residents-v2.png"

CELL_WIDTH = 28
CELL_HEIGHT = 40
BASE_COLUMNS = 4

# specialResidentAssets.ts의 4~9열 순서와 같아야 한다.
NEW_SOURCES = [
    ("tiger-hunter-bakdolgae-clean.png", 26, 38),
    ("geomancer-heosaeng-clean.png", 25, 37),
    ("uinyeo-dansim-clean.png", 25, 37),
    ("runaway-smith-maksoe-clean.png", 26, 38),
    ("interpreter-baesugyeom-clean.png", 25, 37),
    ("hangwae-sayaka-clean.png", 26, 38),
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
    total_columns = BASE_COLUMNS + len(NEW_SOURCES)
    atlas = Image.new("RGBA", (CELL_WIDTH * total_columns, CELL_HEIGHT), (0, 0, 0, 0))
    base = Image.open(BASE_ATLAS).convert("RGBA")
    if base.size != (CELL_WIDTH * BASE_COLUMNS, CELL_HEIGHT):
        raise ValueError(f"unexpected base atlas size: {base.size}")
    atlas.alpha_composite(base, (0, 0))

    for offset, (filename, max_width, max_height) in enumerate(NEW_SOURCES):
        source = Image.open(SOURCE_DIR / filename).convert("RGBA")
        cell = fit_to_cell(source, max_width, max_height)
        # 신규 6인은 기존 주민/특수주민 원본과 반대 방향으로 생성되었으므로
        # 아틀라스의 기준 방향을 맞춘 뒤 공통 facing 반전 로직을 그대로 사용한다.
        cell = cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        atlas.alpha_composite(cell, ((BASE_COLUMNS + offset) * CELL_WIDTH, 0))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    clear_transparent_rgb(atlas).save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
