from __future__ import annotations

import colorsys
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "generated" / "livestock-overworld-v1" / "processed"
PUBLIC_DIR = ROOT / "public" / "assets"
DOCS_DIR = ROOT / "docs" / "assets" / "livestock"
SPECIES = ("chicken", "goat", "sheep", "cattle", "horse", "pig")
HD_CELL = 56
STANDARD_CELL = 28


def remove_magenta_spill(image: Image.Image) -> Image.Image:
    cleaned = image.copy().convert("RGBA")
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


def main() -> None:
    hd_sheet = Image.new("RGBA", (HD_CELL * len(SPECIES), HD_CELL), (0, 0, 0, 0))
    frames = []
    for column, species in enumerate(SPECIES):
        source_path = (
            SOURCE_DIR.parent / "pig" / "processed" / "idle-1.png"
            if species == "pig"
            else SOURCE_DIR / f"idle-{column + 1}.png"
        )
        source = remove_magenta_spill(Image.open(source_path))
        frame = source.resize((HD_CELL, HD_CELL), Image.Resampling.LANCZOS)
        hd_sheet.alpha_composite(frame, (column * HD_CELL, 0))
        bbox = frame.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"{species} frame is empty")
        touches_edge = bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= HD_CELL or bbox[3] >= HD_CELL
        if touches_edge:
            raise ValueError(f"{species} frame touches the packed cell edge")
        frames.append({
            "species": species,
            "column": column,
            "source": str(source_path.relative_to(ROOT)).replace("\\", "/"),
            "packedBBoxHd": list(bbox),
            "touchesCellEdge": False,
        })

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    hd_path = PUBLIC_DIR / "livestock-overworld-v1-hd.png"
    standard_path = PUBLIC_DIR / "livestock-overworld-v1.png"
    hd_sheet.save(hd_path)
    hd_sheet.resize(
        (STANDARD_CELL * len(SPECIES), STANDARD_CELL),
        Image.Resampling.NEAREST,
    ).save(standard_path)
    manifest = {
        "version": 2,
        "speciesOrder": list(SPECIES),
        "cellHd": [HD_CELL, HD_CELL],
        "cellStandard": [STANDARD_CELL, STANDARD_CELL],
        "sheetHd": list(hd_sheet.size),
        "sheetStandard": [STANDARD_CELL * len(SPECIES), STANDARD_CELL],
        "frames": frames,
    }
    manifest_path = DOCS_DIR / "livestock-overworld-v1-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(hd_path)
    print(standard_path)
    print(manifest_path)


if __name__ == "__main__":
    main()
