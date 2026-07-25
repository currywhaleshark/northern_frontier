from __future__ import annotations

import colorsys
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tools" / "render" / "generated" / "cemetery-progression-hd-v1"
PUBLIC_DIR = ROOT / "public" / "assets"
DOCS_DIR = ROOT / "docs" / "assets" / "buildings"

FRAME_COUNT = 5
HD_CELL = (56, 80)
STANDARD_CELL = (28, 40)
HD_MAX_SIZE = (54, 58)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("cemetery frame is empty")
    return bbox


def remove_magenta_spill(image: Image.Image) -> Image.Image:
    cleaned = image.copy()
    pixels = cleaned.load()
    for y in range(cleaned.height):
        for x in range(cleaned.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            hue, saturation, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.75 <= hue <= 0.93 and saturation >= 0.38:
                pixels[x, y] = (0, 0, 0, 0)
    return cleaned


def pack_hd_frame(image: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    image = remove_magenta_spill(image)
    source_bbox = alpha_bbox(image)
    cropped = image.crop(source_bbox)
    scale = min(HD_MAX_SIZE[0] / cropped.width, HD_MAX_SIZE[1] / cropped.height)
    size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", HD_CELL, (0, 0, 0, 0))
    paste = ((HD_CELL[0] - size[0]) // 2, HD_CELL[1] - size[1] - 2)
    cell.alpha_composite(resized, paste)
    packed_bbox = alpha_bbox(cell)
    touches_edge = (
        packed_bbox[0] <= 0
        or packed_bbox[1] <= 0
        or packed_bbox[2] >= HD_CELL[0]
        or packed_bbox[3] >= HD_CELL[1]
    )
    return cell, {
        "sourceBBox": list(source_bbox),
        "packedSizeHd": list(size),
        "pasteHd": list(paste),
        "packedBBoxHd": list(packed_bbox),
        "touchesCellEdge": touches_edge,
    }


def main() -> None:
    seasons = (
        ("normal", SOURCE_ROOT / "processed", "single"),
        ("winter", SOURCE_ROOT / "winter-processed", "prop"),
    )
    hd_sheet = Image.new(
        "RGBA",
        (HD_CELL[0] * FRAME_COUNT, HD_CELL[1] * len(seasons)),
        (0, 0, 0, 0),
    )
    frames: list[dict[str, object]] = []
    for row, (season, source_dir, prefix) in enumerate(seasons):
        for index in range(FRAME_COUNT):
            source = Image.open(source_dir / f"{prefix}-{index + 1}.png").convert("RGBA")
            packed, metadata = pack_hd_frame(source)
            hd_sheet.alpha_composite(packed, (index * HD_CELL[0], row * HD_CELL[1]))
            frames.append({"season": season, "graveCount": index, **metadata})

    if any(frame["touchesCellEdge"] for frame in frames):
        raise ValueError("packed cemetery frame touches a cell edge")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    hd_path = PUBLIC_DIR / "cemetery-progression-v1-hd.png"
    standard_path = PUBLIC_DIR / "cemetery-progression-v1.png"
    hd_sheet.save(hd_path)
    hd_sheet.resize(
        (STANDARD_CELL[0] * FRAME_COUNT, STANDARD_CELL[1] * len(seasons)),
        Image.Resampling.NEAREST,
    ).save(standard_path)

    manifest = {
        "version": 1,
        "source": str(SOURCE_ROOT.relative_to(ROOT)).replace("\\", "/"),
        "seasons": [season for season, _, _ in seasons],
        "frameOrder": "0, 1, 2, 3, 4 graves",
        "cellHd": list(HD_CELL),
        "cellStandard": list(STANDARD_CELL),
        "sheetHd": [HD_CELL[0] * FRAME_COUNT, HD_CELL[1] * len(seasons)],
        "sheetStandard": [STANDARD_CELL[0] * FRAME_COUNT, STANDARD_CELL[1] * len(seasons)],
        "frames": frames,
    }
    (DOCS_DIR / "cemetery-progression-v1-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(hd_path)
    print(standard_path)


if __name__ == "__main__":
    main()
