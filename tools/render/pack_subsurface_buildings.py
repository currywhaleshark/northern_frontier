from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images" / "subsurface-buildings-v1"
PUBLIC_DIR = ROOT / "public" / "assets"
DOCS_ASSET_DIR = ROOT / "docs" / "assets" / "buildings"
SEASONS = ("normal", "winter")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("subsurface building sprite is empty")
    return bbox


def pack_frame(
    source: Image.Image,
    cell_size: tuple[int, int],
    max_size: tuple[int, int],
) -> tuple[Image.Image, dict[str, object]]:
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


def load_new_cell(
    asset_id: str,
    season: str,
    cell_size: tuple[int, int],
    max_size: tuple[int, int],
) -> tuple[Image.Image, dict[str, object]]:
    source_path = SOURCE_DIR / f"{asset_id}-{season}-alpha.png"
    source = Image.open(source_path).convert("RGBA")
    packed, metadata = pack_frame(source, cell_size, max_size)
    visible_pixels = [pixel for pixel in packed.get_flattened_data() if pixel[3] > 0]
    partial_alpha_pixels = sum(1 for pixel in visible_pixels if pixel[3] < 255)
    key_green_pixels = sum(
        1
        for r, g, b, _ in visible_pixels
        if g >= 180 and r <= 100 and b <= 100
    )
    return packed, {
        "id": asset_id,
        "season": season,
        "source": str(source_path.relative_to(ROOT)).replace("\\", "/"),
        "visiblePixelCountHd": len(visible_pixels),
        "partialAlphaPixelCountHd": partial_alpha_pixels,
        "keyGreenPixelCountHd": key_green_pixels,
        **metadata,
    }


def build_one_tile() -> tuple[dict[str, object], list[Image.Image]]:
    cell = (56, 80)
    standard_cell = (28, 40)
    old_columns = 9
    new_columns = 10
    mine_column = 3
    well_column = 9
    old = Image.open(PUBLIC_DIR / "oblique-buildings-1x1-v1-hd.png").convert("RGBA")
    expected = (cell[0] * old_columns, cell[1] * len(SEASONS))
    if old.size != expected:
        raise ValueError(f"unexpected 1x1 v1 sheet size: {old.size}, expected {expected}")
    sheet = Image.new("RGBA", (cell[0] * new_columns, cell[1] * len(SEASONS)))
    sheet.alpha_composite(old, (0, 0))
    manifest_frames: list[dict[str, object]] = []
    contact_cells: list[Image.Image] = []

    for row, season in enumerate(SEASONS):
        for asset_id, column in (("mine", mine_column), ("well", well_column)):
            packed, metadata = load_new_cell(asset_id, season, cell, (54, 76))
            sheet.paste((0, 0, 0, 0), (column * cell[0], row * cell[1], (column + 1) * cell[0], (row + 1) * cell[1]))
            sheet.alpha_composite(packed, (column * cell[0], row * cell[1]))
            manifest_frames.append({**metadata, "column": column, "row": row})
            contact_cells.append(packed)

    hd_path = PUBLIC_DIR / "oblique-buildings-1x1-v2-hd.png"
    standard_path = PUBLIC_DIR / "oblique-buildings-1x1-v2.png"
    sheet.save(hd_path)
    sheet.resize(
        (standard_cell[0] * new_columns, standard_cell[1] * len(SEASONS)),
        Image.Resampling.NEAREST,
    ).save(standard_path)
    return {
        "frameOrder": [
            "lumberCamp",
            "huntLodge",
            "herbHut",
            "mine",
            "ferry",
            "dryingRack",
            "onggiKiln",
            "dock",
            "watchtower",
            "well",
        ],
        "cellHd": list(cell),
        "cellStandard": list(standard_cell),
        "sheetHd": list(sheet.size),
        "sheetStandard": [standard_cell[0] * new_columns, standard_cell[1] * len(SEASONS)],
        "outputHd": str(hd_path.relative_to(ROOT)).replace("\\", "/"),
        "outputStandard": str(standard_path.relative_to(ROOT)).replace("\\", "/"),
        "frames": manifest_frames,
    }, contact_cells


def build_two_tile() -> tuple[dict[str, object], list[Image.Image]]:
    cell = (112, 160)
    standard_cell = (56, 80)
    old_columns = 24
    new_columns = 25
    deep_mine_column = 24
    old = Image.open(PUBLIC_DIR / "oblique-buildings-2x2-v1-hd.png").convert("RGBA")
    expected = (cell[0] * old_columns, cell[1] * len(SEASONS))
    if old.size != expected:
        raise ValueError(f"unexpected 2x2 v1 sheet size: {old.size}, expected {expected}")
    sheet = Image.new("RGBA", (cell[0] * new_columns, cell[1] * len(SEASONS)))
    sheet.alpha_composite(old, (0, 0))
    manifest_frames: list[dict[str, object]] = []
    contact_cells: list[Image.Image] = []

    for row, season in enumerate(SEASONS):
        packed, metadata = load_new_cell("deepMine", season, cell, (108, 154))
        sheet.alpha_composite(packed, (deep_mine_column * cell[0], row * cell[1]))
        manifest_frames.append({**metadata, "column": deep_mine_column, "row": row})
        contact_cells.append(packed)

    hd_path = PUBLIC_DIR / "oblique-buildings-2x2-v2-hd.png"
    standard_path = PUBLIC_DIR / "oblique-buildings-2x2-v2.png"
    sheet.save(hd_path)
    sheet.resize(
        (standard_cell[0] * new_columns, standard_cell[1] * len(SEASONS)),
        Image.Resampling.NEAREST,
    ).save(standard_path)
    return {
        "frameOrderAppend": ["deepMine"],
        "cellHd": list(cell),
        "cellStandard": list(standard_cell),
        "sheetHd": list(sheet.size),
        "sheetStandard": [standard_cell[0] * new_columns, standard_cell[1] * len(SEASONS)],
        "outputHd": str(hd_path.relative_to(ROOT)).replace("\\", "/"),
        "outputStandard": str(standard_path.relative_to(ROOT)).replace("\\", "/"),
        "frames": manifest_frames,
    }, contact_cells


def checkerboard(size: tuple[int, int], square: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (48, 50, 54, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle((x, y, x + square - 1, y + square - 1), fill=(64, 67, 72, 255))
    return image


def write_contact_sheet(
    one_tile_cells: list[Image.Image],
    two_tile_cells: list[Image.Image],
) -> Path:
    # Input order is mine normal, well normal, mine winter, well winter / deepMine normal, winter.
    ordered = [
        one_tile_cells[0],
        one_tile_cells[1],
        two_tile_cells[0],
        one_tile_cells[2],
        one_tile_cells[3],
        two_tile_cells[1],
    ]
    scale = 4
    slots = [(224, 320), (224, 320), (448, 640)]
    gap = 20
    row_height = 640
    width = sum(slot[0] for slot in slots) + gap * 4
    height = row_height * 2 + gap * 3
    contact = checkerboard((width, height), 16)
    for index, cell in enumerate(ordered):
        row = index // 3
        column = index % 3
        x = gap + sum(slots[i][0] + gap for i in range(column))
        y = gap + row * (row_height + gap)
        enlarged = cell.resize((cell.width * scale, cell.height * scale), Image.Resampling.NEAREST)
        x += (slots[column][0] - enlarged.width) // 2
        y += row_height - enlarged.height
        contact.alpha_composite(enlarged, (x, y))
    output = DOCS_ASSET_DIR / "subsurface-buildings-v1-contact.png"
    contact.save(output)
    return output


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    one_tile, one_tile_cells = build_one_tile()
    two_tile, two_tile_cells = build_two_tile()
    frames = one_tile["frames"] + two_tile["frames"]
    if any(frame["touchesCellEdge"] for frame in frames):
        raise ValueError("a subsurface building frame touches its atlas cell edge")
    contact_path = write_contact_sheet(one_tile_cells, two_tile_cells)
    manifest = {
        "version": 1,
        "projection": "inclined orthographic top-down",
        "anchor": "bottom-center",
        "sourceAtlas": "oblique-buildings-v1",
        "groups": {"oneTile": one_tile, "twoTile": two_tile},
        "contactSheet": str(contact_path.relative_to(ROOT)).replace("\\", "/"),
    }
    manifest_path = DOCS_ASSET_DIR / "subsurface-buildings-v1-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(manifest_path)
    print(contact_path)
    print(ROOT / one_tile["outputHd"])
    print(ROOT / one_tile["outputStandard"])
    print(ROOT / two_tile["outputHd"])
    print(ROOT / two_tile["outputStandard"])


if __name__ == "__main__":
    main()
