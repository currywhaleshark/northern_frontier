from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
CURATION_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "curation"
    / "tutorial-advisor-yeoni-i2v-v1"
)
ACCEPTED = CURATION_ROOT / "accepted"
FINAL_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "generated"
    / "tutorial-advisor-yeoni-i2v-v1"
)
PUBLIC = ROOT / "public" / "assets"
SPRITE_GEN_SCRIPTS = Path.home() / ".codex" / "skills" / "sprite-gen" / "scripts"
RUNTIME_MANIFEST = ROOT / "src" / "render" / "tutorialAdvisorYeoniSpriteManifest.json"

STATES = ("idle", "walk", "jige_walk", "work")
FPS = 5
MAGENTA = (255, 0, 255, 255)
STANDARD_BODY_HEIGHT = 36
STANDARD_MIN_CELL = (28, 40)
STANDARD_MARGIN = 2


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_rows(run_dir: Path) -> dict[str, tuple[list[Image.Image], dict[str, Any]]]:
    manifest = read_json(run_dir / "manifest.json")
    rows: dict[str, tuple[list[Image.Image], dict[str, Any]]] = {}
    with Image.open(run_dir / manifest["game_input"]) as source_file:
        source = source_file.convert("RGBA")
        for state in STATES:
            animation = manifest["animation"]["rows"][state]
            rects = manifest["frame_layout"]["rows"][state]
            if len(rects) != 4 or int(animation["frames"]) != 4:
                raise ValueError(f"{run_dir}/{state}: expected four selected frames")
            frames = []
            for rect in rects:
                box = (
                    int(rect["x"]),
                    int(rect["y"]),
                    int(rect["x"] + rect["w"]),
                    int(rect["y"] + rect["h"]),
                )
                cell = Image.new("RGBA", (int(rect["w"]), int(rect["h"])), MAGENTA)
                cell.alpha_composite(source.crop(box))
                frames.append(cell)
            rows[state] = (frames, animation)
    return rows


def content_geometry(frame: Image.Image) -> tuple[int, int, int]:
    pixels = np.asarray(frame.convert("RGBA"), dtype=np.int16)
    rgb = pixels[:, :, :3]
    alpha = pixels[:, :, 3]
    key = np.array(MAGENTA[:3], dtype=np.int16)
    distance = np.max(np.abs(rgb - key), axis=2)
    mask = (alpha > 8) & (distance > 18)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise ValueError("selected frame contains no non-magenta subject")

    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    row_counts = mask[:, x0 : x1 + 1].sum(axis=1)
    threshold = max(3, int(math.ceil(float(row_counts.max()) * 0.12)))
    body_rows = np.flatnonzero(row_counts >= threshold)
    body_top = int(body_rows[0]) if len(body_rows) else y0
    body_height = max(1, y1 - body_top + 1)
    return x1 - x0 + 1, y1 - y0 + 1, body_height


def standard_cell(rows: dict[str, tuple[list[Image.Image], dict[str, Any]]]) -> tuple[int, int]:
    geometries = [
        content_geometry(frame)
        for state in STATES
        for frame in rows[state][0]
    ]
    content_width = max(
        math.ceil(full_width * STANDARD_BODY_HEIGHT / body_height)
        for full_width, _, body_height in geometries
    )
    content_height = max(
        math.ceil(full_height * STANDARD_BODY_HEIGHT / body_height)
        for _, full_height, body_height in geometries
    )
    width = max(STANDARD_MIN_CELL[0], content_width + STANDARD_MARGIN * 2)
    height = max(STANDARD_MIN_CELL[1], content_height + STANDARD_MARGIN * 2)
    return width + width % 2, height + height % 2


def write_raw_strip(path: Path, frames: list[Image.Image]) -> None:
    if not frames:
        raise ValueError(f"{path}: no frames")
    width, height = frames[0].size
    if any(frame.size != (width, height) for frame in frames):
        raise ValueError(f"{path}: mixed frame sizes")
    strip = Image.new("RGBA", (width * len(frames), height), MAGENTA)
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * width, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path)


def reset_run(run_dir: Path) -> None:
    resolved = run_dir.resolve()
    if FINAL_ROOT.resolve() not in resolved.parents:
        raise ValueError(f"refusing to reset path outside final root: {resolved}")
    if resolved.exists():
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True)


def run_sprite_gen(script_name: str, run_dir: Path, *, high_definition: bool) -> None:
    command = [
        sys.executable,
        str(SPRITE_GEN_SCRIPTS / script_name),
        "--run-dir",
        str(run_dir),
    ]
    if script_name == "extract_sprite_row_frames.py":
        command.extend(
            [
                "--min-used-pixels",
                "120",
                "--chroma-adjacent-pixel-threshold",
                "480" if high_definition else "120",
            ]
        )
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    completed = subprocess.run(command, cwd=ROOT, env=environment, check=False)
    if not completed.returncode:
        return
    if script_name == "extract_sprite_row_frames.py":
        staging = run_dir / ".frames.sg-staging"
        final = run_dir / "frames"
        if (staging / "frames-manifest.json").is_file() and not final.exists():
            for attempt in range(20):
                try:
                    shutil.move(str(staging), str(final))
                    return
                except PermissionError:
                    if attempt == 19:
                        raise
                    time.sleep(min(2.0, 0.25 * (attempt + 1)))
    raise RuntimeError(f"{script_name} failed with exit code {completed.returncode}")


def build_run(
    run_dir: Path,
    rows: dict[str, tuple[list[Image.Image], dict[str, Any]]],
    cell: tuple[int, int],
    *,
    high_definition: bool,
    upstream: dict[str, Any],
    raw_source_run: Path | None = None,
) -> None:
    reset_run(run_dir)
    shutil.copy2(CURATION_ROOT / "run" / "base-source.png", run_dir / "base-source.png")
    for state in STATES:
        raw_path = run_dir / "raw" / f"{state}.png"
        if raw_source_run is None:
            write_raw_strip(raw_path, rows[state][0])
        else:
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(raw_source_run / "raw" / f"{state}.png", raw_path)

    width, height = cell
    margin = STANDARD_MARGIN * (2 if high_definition else 1)
    request = {
        "version": 1,
        "kind": "sprite-gen-request",
        "engine": "component-row",
        "character": {
            "id": f"tutorial-advisor-yeoni-{'hd' if high_definition else 'standard'}",
            "description": (
                "human-approved tutorial advisor Yeon-i idle, walk, loaded jige walk, "
                f"and woodcutting cycles; {'HD master' if high_definition else 'standard derived from HD master'}"
            ),
            "base_image": "base-source.png",
        },
        "cell": {
            "shape": "rect",
            "width": width,
            "height": height,
            "safe_margin_x": margin,
            "safe_margin_y": margin,
        },
        "chroma_key": {
            "name": "magenta",
            "hex": "#FF00FF",
            "rgb": [255, 0, 255],
            "selection": "manual",
        },
        "states": {
            state: {
                "frames": 4,
                "fps": FPS,
                "loop": True,
                "action": f"human-approved four-frame {state} cycle",
            }
            for state in STATES
        },
        "style": (
            "Preserve Yeon-i's Joseon chima-jeogori, red daenggi braid, face, palette, "
            "body direction, gaze direction, props, and approved motion phases exactly."
        ),
        "motion_phase_guides": False,
        "fit": {
            "align_x": "foot-centroid",
            "align_y": "bottom",
            "pixel_perfect": True,
            "logical_height": height,
            "palette_size": 192 if high_definition else 128,
        },
        "chroma": {
            "mode": "ycbcr",
            "unmix_reach": 4,
            "spill_max_fraction": 0.005,
        },
        "source_approval": upstream,
    }
    write_json(run_dir / "sprite-request.json", request)

    run_sprite_gen("extract_sprite_row_frames.py", run_dir, high_definition=high_definition)
    run_sprite_gen("compose_sprite_atlas.py", run_dir, high_definition=high_definition)
    run_sprite_gen("preview_animation.py", run_dir, high_definition=high_definition)

    frame_report = read_json(run_dir / "frames" / "frames-manifest.json")
    atlas_report = read_json(run_dir / "sprite-sheet-alpha.report.json")
    if not frame_report.get("ok") or not atlas_report.get("ok"):
        raise ValueError(f"{run_dir}: sprite-gen QA failed")
    if any(not row.get("ok") for row in frame_report.get("rows", [])):
        raise ValueError(f"{run_dir}: a state failed extraction QA")


def checkerboard(size: tuple[int, int], block: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (236, 236, 236, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], block):
        for x in range(0, size[0], block):
            if (x // block + y // block) % 2:
                draw.rectangle(
                    (x, y, x + block - 1, y + block - 1),
                    fill=(205, 205, 205, 255),
                )
    return image


def comparison(standard: Image.Image, hd: Image.Image) -> Image.Image:
    standard_preview = standard.resize(
        (standard.width * 4, standard.height * 4), Image.Resampling.NEAREST
    )
    hd_preview = hd.resize((hd.width * 2, hd.height * 2), Image.Resampling.NEAREST)
    margin = 16
    label_height = 24
    output = checkerboard(
        (
            standard_preview.width + hd_preview.width + margin * 3,
            max(standard_preview.height, hd_preview.height) + label_height + margin * 2,
        )
    )
    draw = ImageDraw.Draw(output)
    draw.text((margin, margin), "standard derived from HD (4x)", fill=(24, 24, 24, 255))
    second_x = margin * 2 + standard_preview.width
    draw.text((second_x, margin), "HD master (2x)", fill=(24, 24, 24, 255))
    y = margin + label_height
    output.alpha_composite(standard_preview, (margin, y))
    output.alpha_composite(hd_preview, (second_x, y))
    return output


def validate_and_publish(standard_run: Path, hd_run: Path) -> None:
    standard_manifest = read_json(standard_run / "manifest.json")
    hd_manifest = read_json(hd_run / "manifest.json")
    standard_cell = standard_manifest["cell"]
    hd_cell = hd_manifest["cell"]
    if int(hd_cell["width"]) != int(standard_cell["width"]) * 2:
        raise ValueError("HD cell width is not exact 2x")
    if int(hd_cell["height"]) != int(standard_cell["height"]) * 2:
        raise ValueError("HD cell height is not exact 2x")
    for state in STATES:
        if sha256(standard_run / "raw" / f"{state}.png") != sha256(
            hd_run / "raw" / f"{state}.png"
        ):
            raise ValueError(f"{state}: standard did not inherit the HD master raw strip")
        standard_animation = standard_manifest["animation"]["rows"][state]
        hd_animation = hd_manifest["animation"]["rows"][state]
        if standard_animation != hd_animation:
            raise ValueError(f"{state}: standard/HD animation contracts differ")
        if int(standard_animation["frames"]) != 4 or int(standard_animation["fps"]) != FPS:
            raise ValueError(f"{state}: expected 4 frames at {FPS} fps")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    standard_asset = PUBLIC / "tutorial-advisor-yeoni-i2v-v1.png"
    hd_asset = PUBLIC / "tutorial-advisor-yeoni-i2v-hd-v1.png"
    shutil.copy2(standard_run / standard_manifest["game_input"], standard_asset)
    shutil.copy2(hd_run / hd_manifest["game_input"], hd_asset)

    runtime = {
        "version": 1,
        "kind": "sprite-gen-runtime-variant-manifest",
        "characterId": "tutorial_advisor_yeoni",
        "engine": "component-row",
        "game_input": "/assets/tutorial-advisor-yeoni-i2v-v1.png",
        "high_definition_game_input": "/assets/tutorial-advisor-yeoni-i2v-hd-v1.png",
        "degraded_static_fallback": False,
        "display": {
            "bodyHeight": STANDARD_BODY_HEIGHT,
            "anchor": "feet-bottom-center",
        },
        "states": list(STATES),
        "animation": standard_manifest["animation"],
        "frame_layout": standard_manifest["frame_layout"],
        "high_definition_frame_layout": hd_manifest["frame_layout"],
        "source_runs": {
            "hd": str(hd_run.relative_to(ROOT)).replace("\\", "/"),
            "standard": str(standard_run.relative_to(ROOT)).replace("\\", "/"),
        },
        "derivation": {
            "order": [
                "approved_full_resolution",
                "hd_master",
                "standard_from_hd_master_raw",
            ],
            "hd_atlas_sha256": sha256(hd_run / hd_manifest["game_input"]),
        },
        "published": {
            "standard": {"path": str(standard_asset.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(standard_asset)},
            "hd": {"path": str(hd_asset.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(hd_asset)},
        },
    }
    write_json(RUNTIME_MANIFEST, runtime)

    with Image.open(standard_asset) as standard_file, Image.open(hd_asset) as hd_file:
        comparison(standard_file.convert("RGBA"), hd_file.convert("RGBA")).save(
            FINAL_ROOT / "standard-hd-comparison.png"
        )


def main() -> None:
    approval = read_json(ACCEPTED / "approval.json")
    if approval.get("status") != "frames-approved":
        raise ValueError("Yeon-i curation selection is not approved")

    approved_rows = source_rows(ACCEPTED)
    standard_size = standard_cell(approved_rows)
    hd_size = (standard_size[0] * 2, standard_size[1] * 2)
    hd_run = FINAL_ROOT / "hd"
    standard_run = FINAL_ROOT / "standard"
    print(f"standard_cell={standard_size[0]}x{standard_size[1]}", flush=True)
    print(f"hd_cell={hd_size[0]}x{hd_size[1]}", flush=True)

    build_run(
        hd_run,
        approved_rows,
        hd_size,
        high_definition=True,
        upstream={
            "kind": "human-approved-full-resolution-curation",
            "path": str((ACCEPTED / "approval.json").relative_to(ROOT)).replace("\\", "/"),
            "atlas_sha256": approval["atlas_sha256"],
        },
    )

    # The standard variant inherits the completed HD run's canonical raw strips.
    # Re-extracting the already block-quantized HD atlas makes grid detection lock
    # onto the large magenta gaps, so the approved full-resolution strips remain
    # the shared source of truth, exactly as in the existing mudflat-work pipeline.
    hd_manifest = read_json(hd_run / "manifest.json")
    build_run(
        standard_run,
        approved_rows,
        standard_size,
        high_definition=False,
        upstream={
            "kind": "derived-from-hd-master-raw",
            "path": str((hd_run / "manifest.json").relative_to(ROOT)).replace("\\", "/"),
            "atlas_sha256": sha256(hd_run / hd_manifest["game_input"]),
        },
        raw_source_run=hd_run,
    )
    validate_and_publish(standard_run, hd_run)
    print(FINAL_ROOT)
    print(PUBLIC / "tutorial-advisor-yeoni-i2v-v1.png")
    print(PUBLIC / "tutorial-advisor-yeoni-i2v-hd-v1.png")
    print(RUNTIME_MANIFEST)


if __name__ == "__main__":
    main()
