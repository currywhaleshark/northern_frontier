from __future__ import annotations

import json
import colorsys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tools" / "render" / "generated" / "buildings-oblique-v1"
REDESIGN_ROOT = ROOT / "tools" / "render" / "generated" / "building-redesign-v2"
PUBLIC_DIR = ROOT / "public" / "assets"
DOCS_DIR = ROOT / "docs" / "assets" / "buildings"

SEASONS = ("normal", "winter")

GROUPS: dict[str, dict[str, object]] = {
    "twoTile": {
        "cellHd": (112, 160),
        "cellStandard": (56, 80),
        "maxHd": (108, 154),
        "output": "oblique-buildings-2x2-v1",
        "frames": [
            ("hut", "2x2-a", 1),
            ("ondol", "2x2-a", 2),
            ("tileHouse", "2x2-a", 3),
            ("storehouse", "2x2-a", 4),
            ("cellar", "2x2-a", 5),
            ("smokehouse", "2x2-a", 6),
            ("jangdokdae", "2x2-a", 7),
            ("woodShed", "2x2-a", 8),
            ("clinic", "2x2-b", 1),
            ("watermill", "2x2-b", 2),
            ("smithy", "2x2-b", 3),
            ("charcoalKiln", "2x2-b", 4),
            ("stable", "2x2-b", 5),
            ("nitreYard", "2x2-b", 6),
            ("tannery", "2x2-b", 7),
            ("weavingHouse", "2x2-b", 8),
            ("beacon", "2x2-c", 1),
            ("garrison", "2x2-c", 2),
            ("office", "2x2-c", 3),
            ("market", "2x2-c", 4),
            ("school", "2x2-c", 5),
            ("shrine", "2x2-c", 6),
            ("hermitage", "2x2-c", 7),
            ("cannonEmplacement", "2x2-c", 8),
        ],
    },
    "oneTile": {
        "cellHd": (56, 80),
        "cellStandard": (28, 40),
        "maxHd": (54, 76),
        "output": "oblique-buildings-1x1-v1",
        "frames": [
            ("lumberCamp", "1x1-a", 2),
            ("huntLodge", "1x1-a", 3),
            ("herbHut", "1x1-a", 4),
            ("mine", "1x1-a", 5),
            ("ferry", "1x1-a", 6),
            ("dryingRack", "1x1-a", 7),
            ("onggiKiln", "1x1-a", 8),
            ("dock", "1x1-b", 1),
            ("watchtower", "1x1-b", 2),
        ],
    },
    "center": {
        "cellHd": (168, 160),
        "cellStandard": (84, 80),
        "maxHd": (164, 154),
        "output": "oblique-centers-v1",
        "frames": [
            ("settlement", "center", 1),
            ("bo", "center", 2),
            ("jin", "center", 3),
            ("bu", "center", 4),
        ],
    },
}


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("processed building frame is empty")
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


def pack_frame(
    source: Image.Image,
    cell_size: tuple[int, int],
    max_size: tuple[int, int],
) -> tuple[Image.Image, dict[str, object]]:
    source = remove_magenta_spill(source)
    source_bbox = alpha_bbox(source)
    cropped = source.crop(source_bbox)
    scale = min(max_size[0] / cropped.width, max_size[1] / cropped.height)
    packed_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(packed_size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", cell_size, (0, 0, 0, 0))
    paste = ((cell_size[0] - packed_size[0]) // 2, cell_size[1] - packed_size[1] - 2)
    cell.alpha_composite(resized, paste)
    packed_bbox = alpha_bbox(cell)
    touches_edge = (
        packed_bbox[0] <= 0
        or packed_bbox[1] <= 0
        or packed_bbox[2] >= cell_size[0]
        or packed_bbox[3] >= cell_size[1]
    )
    return cell, {
        "sourceBBox": list(source_bbox),
        "packedSizeHd": list(packed_size),
        "pasteHd": list(paste),
        "packedBBoxHd": list(packed_bbox),
        "touchesCellEdge": touches_edge,
    }


def pack_group(name: str, config: dict[str, object]) -> dict[str, object]:
    cell_hd = tuple(config["cellHd"])
    cell_standard = tuple(config["cellStandard"])
    max_hd = tuple(config["maxHd"])
    frames = list(config["frames"])
    output = str(config["output"])
    columns = len(frames)
    hd_sheet = Image.new(
        "RGBA",
        (cell_hd[0] * columns, cell_hd[1] * len(SEASONS)),
        (0, 0, 0, 0),
    )
    manifest_frames: list[dict[str, object]] = []

    for row, season in enumerate(SEASONS):
        for column, (asset_id, batch, frame_index) in enumerate(frames):
            redesign_path = REDESIGN_ROOT / asset_id / f"{season}-processed.png"
            frame_path = redesign_path if redesign_path.exists() else (
                SOURCE_ROOT / batch / f"{season}-processed" / f"building-{frame_index}.png"
            )
            source = Image.open(frame_path).convert("RGBA")
            packed, metadata = pack_frame(source, cell_hd, max_hd)
            hd_sheet.alpha_composite(packed, (column * cell_hd[0], row * cell_hd[1]))
            manifest_frames.append(
                {
                    "id": asset_id,
                    "season": season,
                    "column": column,
                    "row": row,
                    "source": str(frame_path.relative_to(ROOT)).replace("\\", "/"),
                    **metadata,
                }
            )

    if any(frame["touchesCellEdge"] for frame in manifest_frames):
        raise ValueError(f"{name} contains a packed frame touching a cell edge")

    hd_path = PUBLIC_DIR / f"{output}-hd.png"
    standard_path = PUBLIC_DIR / f"{output}.png"
    hd_sheet.save(hd_path)
    hd_sheet.resize(
        (cell_standard[0] * columns, cell_standard[1] * len(SEASONS)),
        Image.Resampling.NEAREST,
    ).save(standard_path)

    return {
        "group": name,
        "frameOrder": [asset_id for asset_id, _, _ in frames],
        "seasons": list(SEASONS),
        "cellHd": list(cell_hd),
        "cellStandard": list(cell_standard),
        "sheetHd": list(hd_sheet.size),
        "sheetStandard": [
            cell_standard[0] * columns,
            cell_standard[1] * len(SEASONS),
        ],
        "outputHd": str(hd_path.relative_to(ROOT)).replace("\\", "/"),
        "outputStandard": str(standard_path.relative_to(ROOT)).replace("\\", "/"),
        "frames": manifest_frames,
    }


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    manifests = {
        name: pack_group(name, config)
        for name, config in GROUPS.items()
    }
    manifest = {
        "version": 2,
        "projection": "inclined orthographic top-down",
        "anchor": "bottom-center",
        "groups": manifests,
    }
    manifest_path = DOCS_DIR / "oblique-buildings-v1-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(manifest_path)
    for group in manifests.values():
        print(ROOT / group["outputHd"])
        print(ROOT / group["outputStandard"])


if __name__ == "__main__":
    main()
