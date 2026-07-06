from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build deterministic 28px river autotiles.")
    parser.add_argument("--validate-only", action="store_true", help="Run geometry validation without writing PNG outputs.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"river connectors: {len(CONNECTORS)}")
    print(f"seasons: {', '.join(SEASONS)}")
    print(f"validate only: {args.validate_only}")


if __name__ == "__main__":
    main()
