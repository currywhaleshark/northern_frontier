#!/usr/bin/env python3
"""Build the three large seamless coastal textures from approved raw samples."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PROCESSOR = ROOT / "tools/render/generate_seamless_terrain_texture.py"
SOURCE_DIR = ROOT / "tools/render/source_images/coastal-seamless-v1"
REFERENCE_SHEET = ROOT / "public/assets/coastal-ground-tiles-v1.png"
OUTPUT_DIR = ROOT / "public/assets"
QA_DIR = ROOT / "tools/render/generated/coastal-seamless-v1/qa"

MATERIALS = (
    ("mudflat", 0, 73021),
    ("sand", 1, 73031),
    ("shingle", 2, 73041),
    ("rocky", 3, 73051),
)


def main() -> None:
    for material, reference_column, seed in MATERIALS:
        command = [
            sys.executable,
            str(PROCESSOR),
            "--input", str(SOURCE_DIR / f"raw-{material}-v1.png"),
            "--reference-sheet", str(REFERENCE_SHEET),
            "--season-row", "0",
            "--reference-column", str(reference_column),
            "--output-hd", str(OUTPUT_DIR / f"coastal-{material}-seamless-v1-hd-896px.png"),
            "--output-standard", str(OUTPUT_DIR / f"coastal-{material}-seamless-v1-standard-448px.png"),
            "--qa", str(QA_DIR / f"{material}-3x3-hd.png"),
            "--size", "896",
            "--overlap", "128",
            "--candidates", "64",
            "--seed", str(seed),
            "--frequency", "4",
        ]
        if material == "mudflat":
            command.extend(("--selection", "seam"))
        print(f"[{material}]", flush=True)
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
