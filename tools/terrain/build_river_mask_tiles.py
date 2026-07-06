from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

TILE_SIZE = 28
WATER_WIDTH = 8
ROOT = Path(__file__).resolve().parents[2]
RIVER_DIR = ROOT / "docs" / "assets" / "terrain" / "river"
SOURCE_SHEET = RIVER_DIR / "folk-warm-river-connectors-v2-core6-28px-sheet.png"
OUTPUT_DIR = RIVER_DIR / "generated"

SEASONS = ("spring", "summer", "autumn", "winter")

SEASON_TINTS = {
    "spring": {"land": (126, 142, 82), "bank": (82, 84, 56), "water": (74, 139, 169)},
    "summer": {"land": (99, 129, 56), "bank": (63, 73, 42), "water": (45, 122, 167)},
    "autumn": {"land": (155, 119, 48), "bank": (95, 74, 42), "water": (97, 156, 178)},
    "winter": {"land": (222, 228, 231), "bank": (142, 145, 143), "water": (180, 213, 225)},
}


@dataclass(frozen=True)
class Connector:
    key: str
    label: str
    n: bool = False
    e: bool = False
    s: bool = False
    w: bool = False
    source_pool: bool = False


CONNECTORS: tuple[Connector, ...] = (
    Connector("vertical", "vertical", n=True, s=True),
    Connector("horizontal", "horizontal", e=True, w=True),
    Connector("right_down", "right + down", e=True, s=True),
    Connector("left_down", "left + down", w=True, s=True),
    Connector("left_up", "left + up", w=True, n=True),
    Connector("right_up", "right + up", e=True, n=True),
    Connector("end_n", "north end", n=True),
    Connector("end_e", "east end", e=True),
    Connector("end_s", "south end", s=True),
    Connector("end_w", "west end", w=True),
    Connector("tee_nes", "T north/east/south", n=True, e=True, s=True),
    Connector("tee_esw", "T east/south/west", e=True, s=True, w=True),
    Connector("tee_swn", "T south/west/north", s=True, w=True, n=True),
    Connector("tee_wne", "T west/north/east", w=True, n=True, e=True),
    Connector("cross", "cross", n=True, e=True, s=True, w=True),
    Connector("source", "source pool", source_pool=True),
)

CENTER = TILE_SIZE // 2
HALF_WATER = WATER_WIDTH // 2
WATER_BOX = (CENTER - HALF_WATER, CENTER - HALF_WATER, CENTER + HALF_WATER, CENTER + HALF_WATER)
EDGE_CORRIDOR = range(CENTER - HALF_WATER, CENTER + HALF_WATER)


def blank_mask() -> Image.Image:
    return Image.new("L", (TILE_SIZE, TILE_SIZE), 0)


def draw_connector_mask(connector: Connector) -> Image.Image:
    mask = blank_mask()
    draw = ImageDraw.Draw(mask)

    if connector.source_pool:
        draw.ellipse((7, 7, 21, 21), fill=255)
        return mask

    draw.rectangle(WATER_BOX, fill=255)
    if connector.n:
        draw.rectangle((CENTER - HALF_WATER, 0, CENTER + HALF_WATER - 1, CENTER), fill=255)
    if connector.e:
        draw.rectangle((CENTER, CENTER - HALF_WATER, TILE_SIZE - 1, CENTER + HALF_WATER - 1), fill=255)
    if connector.s:
        draw.rectangle((CENTER - HALF_WATER, CENTER, CENTER + HALF_WATER - 1, TILE_SIZE - 1), fill=255)
    if connector.w:
        draw.rectangle((0, CENTER - HALF_WATER, CENTER, CENTER + HALF_WATER - 1), fill=255)
    return mask


def edge_pixels(mask: Image.Image, side: str) -> list[int]:
    px = mask.load()
    if side == "n":
        return [px[x, 0] for x in EDGE_CORRIDOR]
    if side == "e":
        return [px[TILE_SIZE - 1, y] for y in EDGE_CORRIDOR]
    if side == "s":
        return [px[x, TILE_SIZE - 1] for x in EDGE_CORRIDOR]
    if side == "w":
        return [px[0, y] for y in EDGE_CORRIDOR]
    raise ValueError(f"unknown side: {side}")


def validate_masks() -> list[str]:
    errors: list[str] = []
    for connector in CONNECTORS:
        mask = draw_connector_mask(connector)
        openings = {"n": connector.n, "e": connector.e, "s": connector.s, "w": connector.w}
        for side, is_open in openings.items():
            values = edge_pixels(mask, side)
            if is_open and any(value != 255 for value in values):
                errors.append(f"{connector.key}: {side} opening is not fully connected")
            if not is_open and not connector.source_pool and any(value != 0 for value in values):
                errors.append(f"{connector.key}: {side} edge leaks water")
    return errors


def load_source_sheet() -> Image.Image:
    if not SOURCE_SHEET.exists():
        raise FileNotFoundError(f"missing source sheet: {SOURCE_SHEET}")
    return Image.open(SOURCE_SHEET).convert("RGB")


def crop_source_tile(source: Image.Image, season_index: int, connector_index: int) -> Image.Image:
    x0 = connector_index * TILE_SIZE
    y0 = season_index * TILE_SIZE
    return source.crop((x0, y0, x0 + TILE_SIZE, y0 + TILE_SIZE))


def tint_pixel(pixel: tuple[int, int, int], tint: tuple[int, int, int], strength: float) -> tuple[int, int, int]:
    return tuple(round(pixel[i] * (1 - strength) + tint[i] * strength) for i in range(3))


def make_texture_tile(source_tile: Image.Image, season: str) -> Image.Image:
    palette = SEASON_TINTS[season]
    out = Image.new("RGB", (TILE_SIZE, TILE_SIZE), palette["land"])
    src = source_tile.load()
    dst = out.load()
    for y in range(TILE_SIZE):
        for x in range(TILE_SIZE):
            r, g, b = src[x, y]
            blue_bias = b - max(r, g)
            brightness = (r + g + b) // 3
            if blue_bias > 10:
                dst[x, y] = tint_pixel((r, g, b), palette["water"], 0.55)
            elif brightness < 95:
                dst[x, y] = tint_pixel((r, g, b), palette["bank"], 0.45)
            else:
                dst[x, y] = tint_pixel((r, g, b), palette["land"], 0.65)
    return out


def compose_tile(source_tile: Image.Image, season: str, connector: Connector) -> Image.Image:
    texture = make_texture_tile(source_tile, season)
    palette = SEASON_TINTS[season]
    land = Image.new("RGB", (TILE_SIZE, TILE_SIZE), palette["land"])
    bank_mask = draw_connector_mask(connector).filter(ImageFilter.MaxFilter(5))
    water_mask = draw_connector_mask(connector)

    bank = Image.new("RGB", (TILE_SIZE, TILE_SIZE), palette["bank"])
    tile = Image.composite(bank, land, bank_mask)
    tile = Image.composite(texture, tile, water_mask)
    normalize_open_edges(tile, connector, season)
    return tile


def normalize_open_edges(tile: Image.Image, connector: Connector, season: str) -> None:
    px = tile.load()
    color = SEASON_TINTS[season]["water"]
    if connector.n:
        for x in EDGE_CORRIDOR:
            px[x, 0] = color
    if connector.e:
        for y in EDGE_CORRIDOR:
            px[TILE_SIZE - 1, y] = color
    if connector.s:
        for x in EDGE_CORRIDOR:
            px[x, TILE_SIZE - 1] = color
    if connector.w:
        for y in EDGE_CORRIDOR:
            px[0, y] = color


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build deterministic 28px river autotiles.")
    parser.add_argument("--validate-only", action="store_true", help="Run geometry validation without writing PNG outputs.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    errors = validate_masks()
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)

    print(f"validated masks: {len(CONNECTORS)} connectors")
    if args.validate_only:
        return


if __name__ == "__main__":
    main()
