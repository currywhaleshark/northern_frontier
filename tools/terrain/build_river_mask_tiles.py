from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

TILE_SIZE = 28
WATER_WIDTH = 8
ROOT = Path(__file__).resolve().parents[2]
RIVER_DIR = ROOT / "docs" / "assets" / "terrain" / "river"
SOURCE_SHEET = RIVER_DIR / "folk-warm-river-connectors-v2-core6-28px-sheet.png"
OUTPUT_DIR = RIVER_DIR / "generated"

SEASONS = ("spring", "summer", "autumn", "winter")


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
