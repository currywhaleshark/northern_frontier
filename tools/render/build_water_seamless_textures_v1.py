#!/usr/bin/env python3
"""Build large static seamless liquid and frozen-water textures."""

from __future__ import annotations

import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PROCESSOR = ROOT / "tools/render/generate_seamless_terrain_texture.py"
SOURCE_DIR = ROOT / "tools/render/source_images/water-seamless-v1"
REFERENCE_SHEET = SOURCE_DIR / "reference-water-sheet-v1.png"
OUTPUT_DIR = ROOT / "public/assets"
QA_DIR = ROOT / "tools/render/generated/water-seamless-v1/qa"

SURFACES = (
    ("river", 0, 74021),
    ("lake", 1, 74031),
    ("sea", 2, 74041),
    ("river-ice", 3, 74051),
    ("lake-ice", 4, 74061),
)


def build(surface: tuple[str, int, int]) -> str:
    name, reference_column, seed = surface
    command = [
        sys.executable,
        str(PROCESSOR),
        "--input", str(SOURCE_DIR / f"raw-{name}-v1.png"),
        "--reference-sheet", str(REFERENCE_SHEET),
        "--season-row", "0",
        "--reference-column", str(reference_column),
        "--output-hd", str(OUTPUT_DIR / f"water-{name}-seamless-v1-hd-896px.png"),
        "--output-standard", str(OUTPUT_DIR / f"water-{name}-seamless-v1-standard-448px.png"),
        "--qa", str(QA_DIR / f"{name}-3x3-hd.png"),
        "--size", "896",
        "--overlap", "128",
        "--candidates", "48",
        "--seed", str(seed),
        "--selection", "seam",
        "--frequency", "4",
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return f"[{name}] {result.stdout.strip()}"


def main() -> None:
    with ThreadPoolExecutor(max_workers=3) as executor:
        for result in executor.map(build, SURFACES):
            print(result, flush=True)


if __name__ == "__main__":
    main()
