#!/usr/bin/env python3
"""Build oblique foreign-site core/prop standard and HD atlases from approved raws."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "render" / "generated" / "foreign-sites-oblique-v2"
RUNS = SOURCE / "runs"
PUBLIC = ROOT / "public" / "assets"
RUNTIME_MANIFEST = ROOT / "src" / "render" / "foreignSiteManifest.json"
BASE = ROOT / "tools" / "render" / "generated" / "buildings-oblique-v1" / "2x2-a" / "normal-processed" / "building-1.png"

CODEX_ROOT = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
SPRITE_GEN = CODEX_ROOT / "skills" / "sprite-gen"
PREPARE = SPRITE_GEN / "scripts" / "prepare_sprite_run.py"
EXTRACT = SPRITE_GEN / "scripts" / "extract_sprite_row_frames.py"
COMPOSE = SPRITE_GEN / "scripts" / "compose_sprite_atlas.py"

GROUPS = {
    "core": {
        "source": "core",
        "frames": 5,
        "display": (56, 80),
        "standard": (112, 160),
        "highDefinition": (448, 640),
        "description": (
            "five distinct inclined-top-view historical northeast Asian foreign settlement cores: "
            "Odoori, Olyanghap, Golgan Udike fishing village, Nimacha seasonal camp, frontier bandit lair"
        ),
        "columns": ["odo" , "olyanghap", "golgan", "nimacha", "bandit"],
        "public": {
            "standard": "foreign-site-cores-v2.png",
            "highDefinition": "foreign-site-cores-hd-v2.png",
        },
    },
    "prop": {
        "source": "props",
        "frames": 7,
        "display": (28, 40),
        "standard": (56, 80),
        "highDefinition": (224, 320),
        "description": (
            "seven distinct inclined-top-view historical northeast Asian foreign site props: "
            "four faction huts, bandit outbuilding, fish drying rack, traditional river ferry"
        ),
        "columns": ["odo", "olyanghap", "golgan", "nimacha", "bandit", "dryingRack", "boat"],
        "public": {
            "standard": "foreign-site-props-v2.png",
            "highDefinition": "foreign-site-props-hd-v2.png",
        },
    },
}


def run(command: list[str]) -> None:
    environment = os.environ.copy()
    environment["PYTHONUTF8"] = "1"
    print(" ".join(command))
    subprocess.run(command, cwd=ROOT, env=environment, check=True)


def request_json(group: str) -> str:
    info = GROUPS[group]
    states = {
        "normal": {
            "frames": info["frames"],
            "fps": 1,
            "loop": True,
            "action": "approved normal-season still candidates in their exact semantic column order",
        },
        "winter": {
            "frames": info["frames"],
            "fps": 1,
            "loop": True,
            "action": "approved winter still candidates matching the normal semantic column order",
        },
    }
    return json.dumps({"states": states}, ensure_ascii=False)


def build_run(group: str, quality: str, resume: bool) -> dict:
    info = GROUPS[group]
    cell_width, cell_height = info[quality]
    run_dir = RUNS / f"{group}-{quality}"
    safe_margin = max(4, cell_width // 14)
    if resume and (run_dir / "manifest.json").exists() and (run_dir / "sprite-sheet-alpha.png").exists():
        manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
        for state in ("normal", "winter"):
            frames = manifest["frame_layout"]["rows"].get(state, [])
            if len(frames) != info["frames"]:
                raise ValueError(f"{group}/{quality}/{state}: expected {info['frames']} frames, got {len(frames)}")
        shutil.copy2(run_dir / "sprite-sheet-alpha.png", PUBLIC / info["public"][quality])
        return manifest
    run([
        sys.executable,
        str(PREPARE),
        "--out-dir", str(run_dir),
        "--character-id", f"foreign-site-{group}-v2-{quality}",
        "--base-image", str(BASE),
        "--description", info["description"],
        "--request-json", request_json(group),
        "--cell-width", str(cell_width),
        "--cell-height", str(cell_height),
        "--safe-margin", str(safe_margin),
        "--chroma-key", "#FF00FF",
        "--fit-resample", "kcentroid",
        "--fit-align-x", "alpha-centroid",
        "--fit-align-y", "bottom",
        "--no-fit-pixel-perfect",
        "--force",
    ])
    for state in ("normal", "winter"):
        raw = SOURCE / info["source"] / "raw" / f"{state}.png"
        if not raw.exists():
            raise FileNotFoundError(raw)
        shutil.copy2(raw, run_dir / "raw" / f"{state}.png")

    run([
        sys.executable,
        str(EXTRACT),
        "--run-dir", str(run_dir),
        "--min-used-pixels", "32",
    ])
    run([
        sys.executable,
        str(COMPOSE),
        "--run-dir", str(run_dir),
        "--min-used-pixels", "32",
    ])
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    for state in ("normal", "winter"):
        frames = manifest["frame_layout"]["rows"].get(state, [])
        if len(frames) != info["frames"]:
            raise ValueError(f"{group}/{quality}/{state}: expected {info['frames']} frames, got {len(frames)}")
    destination = PUBLIC / info["public"][quality]
    shutil.copy2(run_dir / "sprite-sheet-alpha.png", destination)
    return manifest


def sheet_contract(group: str, quality: str, manifest: dict) -> dict:
    info = GROUPS[group]
    layout = manifest["frame_layout"]
    return {
        "src": f"/assets/{info['public'][quality]}",
        "cellWidth": layout["cellWidth"],
        "cellHeight": layout["cellHeight"],
        "columns": info["frames"],
        "rows": 2,
        "sheetWidth": layout["sheetWidth"],
        "sheetHeight": layout["sheetHeight"],
        "frameLayout": {
            state: layout["rows"][state]
            for state in ("normal", "winter")
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="reuse complete validated run atlases")
    args = parser.parse_args()
    for dependency in (PREPARE, EXTRACT, COMPOSE, BASE):
        if not dependency.exists():
            raise FileNotFoundError(dependency)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    built: dict[str, dict[str, dict]] = {}
    for group in GROUPS:
        built[group] = {}
        for quality in ("standard", "highDefinition"):
            built[group][quality] = build_run(group, quality, args.resume)

    runtime = {
        "version": 1,
        "kind": "sprite-gen-runtime-foreign-site-manifest",
        "characterId": "foreign-sites-oblique-v2",
        "engine": "component-row",
        "degraded_static_fallback": False,
        "seasonRows": {"normal": 0, "winter": 1},
        "factionColumns": GROUPS["core"]["columns"],
        "propColumns": GROUPS["prop"]["columns"],
        "display": {
            "core": {"width": 56, "height": 80, "anchor": "footprint-bottom-left"},
            "prop": {"width": 28, "height": 40, "anchor": "tile-bottom-left"},
        },
        "sheets": {
            group: {
                quality: sheet_contract(group, quality, built[group][quality])
                for quality in ("standard", "highDefinition")
            }
            for group in GROUPS
        },
    }
    RUNTIME_MANIFEST.write_text(
        json.dumps(runtime, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {RUNTIME_MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
