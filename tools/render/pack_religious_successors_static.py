from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "generated" / "religious-successors-static-v1"
ASSET_DIR = ROOT / "public" / "assets"

FRAME_NAMES = [
    "religious-1.png",  # male shaman
    "religious-2.png",  # male monk
    "religious-3.png",  # male novice
    "religious-4.png",  # female shaman
    "religious-5.png",  # female monk
    "religious-6.png",  # female novice
]


def alpha_crop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = rgba.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("religious successor frame has no opaque pixels")
    return rgba.crop(bbox)


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            elif alpha < 245 and red > green + 65 and blue > green + 65:
                neutral = max(green, min(red, blue) - 48)
                pixels[x, y] = (neutral, green, neutral, alpha)
    return rgba


def pack(cell_width: int, cell_height: int, output_name: str) -> None:
    frames = [alpha_crop(Image.open(SOURCE_DIR / name)) for name in FRAME_NAMES]
    scale = min(
        (cell_width - 2) / max(frame.width for frame in frames),
        (cell_height - 3) / max(frame.height for frame in frames),
    )
    sheet = Image.new("RGBA", (cell_width * 3, cell_height * 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        resized = frame.resize(
            (
                max(1, round(frame.width * scale)),
                max(1, round(frame.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )
        resized = clear_transparent_rgb(resized)
        cell = Image.new("RGBA", (cell_width, cell_height), (0, 0, 0, 0))
        cell.alpha_composite(
            resized,
            ((cell_width - resized.width) // 2, cell_height - resized.height - 1),
        )
        column = index % 3
        row = index // 3
        sheet.alpha_composite(clear_transparent_rgb(cell), (column * cell_width, row * cell_height))
    clear_transparent_rgb(sheet).save(ASSET_DIR / output_name)


def main() -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    pack(28, 40, "religious-successors-static-v1.png")
    pack(56, 80, "religious-successors-static-hd-v1.png")
    print("wrote standard and HD religious successor static sheets")


if __name__ == "__main__":
    main()
