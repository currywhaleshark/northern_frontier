from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ACCEPTED_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "curation"
    / "resident-grok-i2v-frame-pick-v1"
)
GENERATED_ROOT = ROOT / "tools" / "render" / "generated"
FINAL_RUN_ROOT = GENERATED_ROOT / "resident-approved-i2v-locomotion-v1"
PUBLIC_ASSETS = ROOT / "public" / "assets"
SPRITE_GEN_SCRIPTS = Path.home() / ".codex" / "skills" / "sprite-gen" / "scripts"

# Keep the original pilot block first so its published row coordinates remain
# stable while later approved professions and named residents are appended.
CHARACTERS = (
    "farmer_male",
    "farmer_female",
    "fisher_male",
    "fisher_female",
    "hauler_male",
    "hauler_female",
    "herbalist_male",
    "herbalist_female",
    "herder_male",
    "herder_female",
    "hunter_male",
    "hunter_female",
    "militia_unarmed_male",
    "militia_unarmed_female",
    "militia_spear_male",
    "militia_spear_female",
    "militia_horn_bow_male",
    "militia_horn_bow_female",
    "militia_musket_male",
    "militia_musket_female",
    "wood_splitter_male",
    "wood_splitter_female",
    "miller_male",
    "miller_female",
    "builder_male",
    "builder_female",
    "physician_male",
    "physician_female",
    "curer_male",
    "curer_female",
    "potter_male",
    "potter_female",
    "smith_male",
    "smith_female",
    "miner_male",
    "miner_female",
    "charcoal_burner_male",
    "charcoal_burner_female",
    "tanner_male",
    "tanner_female",
    "weaver_male",
    "weaver_female",
    "powder_maker_male",
    "powder_maker_female",
    "clerk_male",
    "clerk_female",
    "watchman_male",
    "watchman_female",
    "undertaker_male",
    "undertaker_female",
    "teacher_male",
    "teacher_female",
    "shaman_named_wolhyang",
    "monk_named_haeun",
    "exiled_scholar_yun",
    "jurchen_warrior_aragae",
    "tiger_hunter_bakdolgae",
    "geomancer_heosaeng",
    "uinyeo_dansim",
    "runaway_smith_maksoe",
    "interpreter_baesugyeom",
    "hangwae_sayaka",
    "youth_idle_male",
    "youth_idle_female",
    "youth_hauler_male",
    "youth_hauler_female",
    "youth_farmer_male",
    "youth_farmer_female",
    "youth_wood_splitter_male",
    "youth_wood_splitter_female",
    "youth_herder_male",
    "youth_herder_female",
    "religious_shaman_male",
    "religious_shaman_female",
    "religious_monk_male",
    "religious_monk_female",
    "religious_novice_male",
    "religious_novice_female",
)
STATES = ("idle", "walk")
MAGENTA = (255, 0, 255, 255)
STANDARD_BODY_HEIGHT = 36
STANDARD_MIN_CELL = (28, 40)
STANDARD_MARGIN = 2
RUNTIME_CONTRACT = ROOT / "tools" / "render" / "special_resident_i2v_runtime_contract_v1.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, document: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def flip_x_characters() -> set[str]:
    contract = read_json(RUNTIME_CONTRACT)
    aliases = {
        "mudang_wolhyang": "shaman_named_wolhyang",
        "monk_haeun": "monk_named_haeun",
    }
    return {
        aliases.get(character, character)
        for character, settings in contract["characters"].items()
        if settings.get("flip_x_at_runtime")
    }


FLIP_X_CHARACTERS = flip_x_characters()


def row_name(character: str, state: str) -> str:
    return f"{character}_{state}"


def accepted_dir(character: str) -> Path:
    path = (ACCEPTED_ROOT / character / "accepted").resolve()
    if path.parent.parent != ACCEPTED_ROOT.resolve():
        raise ValueError(f"unsafe accepted character path: {path}")
    if not path.is_dir():
        raise FileNotFoundError(f"accepted package missing: {path}")
    approval = read_json(path / "approval.json")
    if approval.get("status") != "frames-approved":
        raise ValueError(f"{character}: selection is not approved")
    return path


def source_row(character: str, state: str) -> tuple[list[Image.Image], dict[str, Any]]:
    source_dir = accepted_dir(character)
    manifest = read_json(source_dir / "manifest.json")
    animation = manifest["animation"]["rows"][state]
    rects = manifest["frame_layout"]["rows"][state]
    if len(rects) != animation["frames"]:
        raise ValueError(
            f"{character}/{state}: {len(rects)} layout frames != "
            f"{animation['frames']} animation frames"
        )

    frames: list[Image.Image] = []
    with Image.open(source_dir / manifest["game_input"]) as source_file:
        source = source_file.convert("RGBA")
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
    return frames, animation


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


def standard_cell_for(character: str) -> tuple[int, int]:
    geometries: list[tuple[int, int, int]] = []
    for state in STATES:
        frames, _ = source_row(character, state)
        geometries.extend(content_geometry(frame) for frame in frames)

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
    # Even dimensions make the HD pair an exact 2x contract and keep centers integral.
    return width + width % 2, height + height % 2


def write_raw_strip(path: Path, frames: list[Image.Image]) -> None:
    if not frames:
        raise ValueError(f"{path}: no frames")
    cell_size = frames[0].size
    if any(frame.size != cell_size for frame in frames):
        raise ValueError(f"{path}: mixed source frame sizes")
    strip = Image.new(
        "RGBA",
        (cell_size[0] * len(frames), cell_size[1]),
        MAGENTA,
    )
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * cell_size[0], 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path)


def character_run(character: str, high_definition: bool) -> Path:
    return FINAL_RUN_ROOT / character / ("hd" if high_definition else "standard")


def reset_generated_run(run_dir: Path) -> None:
    resolved = run_dir.resolve()
    if FINAL_RUN_ROOT.resolve() not in resolved.parents:
        raise ValueError(f"refusing to reset path outside final run root: {resolved}")
    for name in (
        "raw",
        "frames",
        ".frames.sg-staging",
        "qa",
        "exports",
        "correction-loop",
        "references",
        "prompts",
    ):
        target = resolved / name
        if target.is_dir():
            shutil.rmtree(target)
    for name in (
        "sprite-request.json",
        "curation.json",
        "manifest.json",
        "palette.lock.json",
        "sprite-sheet-alpha.png",
        "sprite-sheet-alpha.report.json",
    ):
        target = resolved / name
        if target.exists():
            target.unlink()
    resolved.mkdir(parents=True, exist_ok=True)


def run_sprite_gen(
    script_name: str,
    run_dir: Path,
    high_definition: bool = False,
) -> None:
    command = [
        sys.executable,
        str(SPRITE_GEN_SCRIPTS / script_name),
        "--run-dir",
        str(run_dir),
    ]
    if script_name == "extract_sprite_row_frames.py":
        # Chroma-adjacent QA counts physical texture pixels. Exact-2x HD cells
        # contain four physical samples for each standard pixel, so scale this
        # area-based limit by four instead of weakening the logical standard.
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
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        check=False,
    )
    if not completed.returncode:
        return
    if script_name == "extract_sprite_row_frames.py":
        # On Windows the extractor can finish every staged frame and still lose
        # the final directory rename while its child process owns a transient
        # handle. Once the child exits, publishing the complete staging tree is
        # safe and preserves the extractor's deterministic output byte-for-byte.
        staging = run_dir / ".frames.sg-staging"
        final = run_dir / "frames"
        manifest = staging / "frames-manifest.json"
        if staging.is_dir() and manifest.is_file() and not final.exists():
            for attempt in range(20):
                try:
                    shutil.move(str(staging), str(final))
                    return
                except PermissionError:
                    if attempt == 19:
                        raise
                    time.sleep(min(2.0, 0.25 * (attempt + 1)))
    raise RuntimeError(f"{script_name} failed with exit code {completed.returncode}")


def build_character_variant(
    character: str,
    standard_cell: tuple[int, int],
    high_definition: bool,
) -> Path:
    multiplier = 2 if high_definition else 1
    width = standard_cell[0] * multiplier
    height = standard_cell[1] * multiplier
    margin = STANDARD_MARGIN * multiplier
    run_dir = character_run(character, high_definition)
    request_path = run_dir / "sprite-request.json"
    frame_report_path = run_dir / "frames" / "frames-manifest.json"
    atlas_report_path = run_dir / "sprite-sheet-alpha.report.json"
    manifest_path = run_dir / "manifest.json"
    if all(path.is_file() for path in (
        request_path,
        frame_report_path,
        atlas_report_path,
        manifest_path,
        run_dir / "sprite-sheet-alpha.png",
    )):
        existing_request = read_json(request_path)
        existing_cell = existing_request.get("cell", {})
        frame_report = read_json(frame_report_path)
        atlas_report = read_json(atlas_report_path)
        if (
            existing_cell.get("width") == width
            and existing_cell.get("height") == height
            and frame_report.get("ok")
            and atlas_report.get("ok")
        ):
            print(
                f"{character}/{('hd' if high_definition else 'standard')}: reuse",
                flush=True,
            )
            return run_dir
    reset_generated_run(run_dir)

    shutil.copy2(
        ACCEPTED_ROOT / character / "run" / "base-source.png",
        run_dir / "base-source.png",
    )

    request_states: dict[str, dict[str, Any]] = {}
    approval = read_json(accepted_dir(character) / "approval.json")
    for state in STATES:
        frames, animation = source_row(character, state)
        write_raw_strip(run_dir / "raw" / f"{state}.png", frames)
        request_states[state] = {
            "frames": len(frames),
            "fps": int(animation["fps"]),
            "loop": bool(animation["loop"]),
            "action": f"human-approved full-resolution I2V {state} cycle",
        }

    request = {
        "version": 1,
        "kind": "sprite-gen-request",
        "engine": "component-row",
        "character": {
            "id": f"{character}-{'hd' if high_definition else 'standard'}",
            "description": (
                f"human-approved {character} idle/walk I2V cycles; "
                f"{'high-definition' if high_definition else 'standard'} runtime variant"
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
        "states": request_states,
        "style": (
            "Preserve the accepted Korean historical pixel-art identity, palette, "
            "props, silhouette, and motion phases exactly."
        ),
        "motion_phase_guides": False,
        "fit": {
            # Feet own the resident anchor. Long spears, bows, guns, and tools may
            # expand the cell without pulling the body away from the world position.
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
        "source_approval": {
            "path": str(
                (accepted_dir(character) / "approval.json").relative_to(ROOT)
            ).replace("\\", "/"),
            "atlas_sha256": approval["atlas_sha256"],
            "standard_cell": {
                "width": standard_cell[0],
                "height": standard_cell[1],
            },
        },
    }
    write_json(run_dir / "sprite-request.json", request)

    run_sprite_gen("extract_sprite_row_frames.py", run_dir, high_definition)
    run_sprite_gen("compose_sprite_atlas.py", run_dir, high_definition)
    run_sprite_gen("preview_animation.py", run_dir, high_definition)

    frame_report = read_json(run_dir / "frames" / "frames-manifest.json")
    atlas_report = read_json(run_dir / "sprite-sheet-alpha.report.json")
    if not frame_report.get("ok"):
        raise ValueError(f"{run_dir}: frame extraction QA failed")
    if not atlas_report.get("ok"):
        raise ValueError(f"{run_dir}: atlas composition QA failed")
    if any(not row.get("ok") for row in frame_report.get("rows", [])):
        raise ValueError(f"{run_dir}: one or more rows failed extraction QA")
    return run_dir


def build_all_runs() -> dict[str, dict[str, Path]]:
    runs: dict[str, dict[str, Path]] = {
        character: {} for character in CHARACTERS
    }
    geometry_report: dict[str, dict[str, int]] = {}
    standard_cells: dict[str, tuple[int, int]] = {}
    for character in CHARACTERS:
        standard_cell = standard_cell_for(character)
        standard_cells[character] = standard_cell
        print(
            f"{character}: body-normalized cell {standard_cell[0]}x{standard_cell[1]}",
            flush=True,
        )
        geometry_report[character] = {
            "standard_width": standard_cell[0],
            "standard_height": standard_cell[1],
            "hd_width": standard_cell[0] * 2,
            "hd_height": standard_cell[1] * 2,
            "target_body_height": STANDARD_BODY_HEIGHT,
        }

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(
                build_character_variant,
                character,
                standard_cells[character],
                high_definition,
            ): (character, "hd" if high_definition else "standard")
            for character in CHARACTERS
            for high_definition in (False, True)
        }
        errors: list[str] = []
        for future in as_completed(futures):
            character, variant = futures[future]
            try:
                runs[character][variant] = future.result()
                print(f"{character}/{variant}: complete", flush=True)
            except Exception as exc:
                errors.append(f"{character}/{variant}: {exc}")
                print(f"{character}/{variant}: FAILED - {exc}", flush=True)
        if errors:
            raise RuntimeError("variant build failures:\n" + "\n".join(errors))

    FINAL_RUN_ROOT.mkdir(parents=True, exist_ok=True)
    write_json(FINAL_RUN_ROOT / "body-normalization.json", geometry_report)
    return runs


def compose_combined(
    runs: dict[str, dict[str, Path]],
    high_definition: bool,
) -> tuple[Image.Image, dict[str, Any], dict[str, Any]]:
    variant = "hd" if high_definition else "standard"
    row_specs: list[
        tuple[str, str, Path, dict[str, Any], dict[str, Any], list[dict[str, int]]]
    ] = []
    sheet_width = 0
    sheet_height = 0
    max_cell_width = 0
    max_cell_height = 0

    for character in CHARACTERS:
        run_dir = runs[character][variant]
        manifest = read_json(run_dir / "manifest.json")
        for state in STATES:
            name = row_name(character, state)
            rects = manifest["frame_layout"]["rows"][state]
            row_specs.append(
                (
                    character,
                    name,
                    run_dir,
                    manifest,
                    manifest["animation"]["rows"][state],
                    rects,
                )
            )
            sheet_width = max(sheet_width, sum(int(rect["w"]) for rect in rects))
            row_height = max(int(rect["h"]) for rect in rects)
            sheet_height += row_height
            max_cell_width = max(max_cell_width, max(int(rect["w"]) for rect in rects))
            max_cell_height = max(max_cell_height, row_height)

    output = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
    animation_rows: dict[str, Any] = {}
    frame_rows: dict[str, list[dict[str, int]]] = {}
    row_cells: dict[str, dict[str, int]] = {}
    cursor_y = 0

    for character, name, run_dir, manifest, animation, rects in row_specs:
        row_height = max(int(rect["h"]) for rect in rects)
        cursor_x = 0
        target_rects: list[dict[str, int]] = []
        with Image.open(run_dir / manifest["game_input"]) as source_file:
            source = source_file.convert("RGBA")
            for rect in rects:
                width = int(rect["w"])
                height = int(rect["h"])
                box = (
                    int(rect["x"]),
                    int(rect["y"]),
                    int(rect["x"] + width),
                    int(rect["y"] + height),
                )
                frame = source.crop(box)
                if character in FLIP_X_CHARACTERS:
                    frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                output.alpha_composite(frame, (cursor_x, cursor_y))
                target_rects.append(
                    {
                        "x": cursor_x,
                        "y": cursor_y,
                        "w": width,
                        "h": height,
                    }
                )
                cursor_x += width
        animation_rows[name] = animation
        frame_rows[name] = target_rects
        row_cells[name] = {
            "width": target_rects[0]["w"],
            "height": target_rects[0]["h"],
        }
        cursor_y += row_height

    frame_layout = {
        "sheetWidth": output.width,
        "sheetHeight": output.height,
        # The combined atlas is deliberately heterogeneous. Runtime consumes each
        # absolute row rect; these maxima are metadata, not a grid assumption.
        "cellWidth": max_cell_width,
        "cellHeight": max_cell_height,
        "row_cells": row_cells,
        "rows": frame_rows,
    }
    return output, {"rows": animation_rows}, frame_layout


def checkerboard(size: tuple[int, int], block: int = 16) -> Image.Image:
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


def comparison(standard: Image.Image, high_definition: Image.Image) -> Image.Image:
    standard_preview = standard.resize(
        (standard.width * 4, standard.height * 4),
        Image.Resampling.NEAREST,
    )
    high_definition_preview = high_definition.resize(
        (high_definition.width * 2, high_definition.height * 2),
        Image.Resampling.NEAREST,
    )
    margin = 16
    label_height = 28
    width = standard_preview.width + high_definition_preview.width + margin * 3
    height = max(standard_preview.height, high_definition_preview.height) + label_height + margin * 2
    output = checkerboard((width, height))
    draw = ImageDraw.Draw(output)
    draw.text((margin, margin), "standard variable cells (4x)", fill=(24, 24, 24, 255))
    second_x = margin * 2 + standard_preview.width
    draw.text((second_x, margin), "HD exact 2x cells (2x)", fill=(24, 24, 24, 255))
    y = margin + label_height
    output.alpha_composite(standard_preview, (margin, y))
    output.alpha_composite(high_definition_preview, (second_x, y))
    return output


def publish(runs: dict[str, dict[str, Path]]) -> None:
    standard, animation, standard_layout = compose_combined(runs, False)
    high_definition, hd_animation, high_definition_layout = compose_combined(runs, True)
    if animation != hd_animation:
        raise ValueError("standard and HD animation timing differ")
    for name, cell in standard_layout["row_cells"].items():
        hd_cell = high_definition_layout["row_cells"][name]
        if hd_cell["width"] != cell["width"] * 2 or hd_cell["height"] != cell["height"] * 2:
            raise ValueError(f"{name}: HD cell is not exact 2x")

    PUBLIC_ASSETS.mkdir(parents=True, exist_ok=True)
    standard_asset = PUBLIC_ASSETS / "resident-approved-i2v-locomotion-v1.png"
    high_definition_asset = PUBLIC_ASSETS / "resident-approved-i2v-locomotion-hd-v1.png"
    standard.save(standard_asset)
    high_definition.save(high_definition_asset)

    runtime_manifest = {
        "version": 1,
        "kind": "sprite-gen-runtime-variant-manifest",
        "characterId": "resident-approved-i2v-locomotion-v1",
        "engine": "component-row",
        "game_input": "/assets/resident-approved-i2v-locomotion-v1.png",
        "high_definition_game_input": "/assets/resident-approved-i2v-locomotion-hd-v1.png",
        "degraded_static_fallback": False,
        "display": {
            "bodyHeight": STANDARD_BODY_HEIGHT,
            "anchor": "feet-bottom-center",
            "variableCells": True,
        },
        "animation": animation,
        "frame_layout": standard_layout,
        "high_definition_frame_layout": high_definition_layout,
        "characters": list(CHARACTERS),
        "source_runs": {
            character: {
                variant: str(path.relative_to(ROOT)).replace("\\", "/")
                for variant, path in variants.items()
            }
            for character, variants in runs.items()
        },
    }
    write_json(
        ROOT / "src" / "render" / "residentApprovedI2VLocomotionManifest.json",
        runtime_manifest,
    )
    comparison(standard, high_definition).save(
        FINAL_RUN_ROOT / "standard-hd-comparison.png"
    )


def main() -> None:
    runs = build_all_runs()
    publish(runs)
    print(FINAL_RUN_ROOT)
    print(PUBLIC_ASSETS / "resident-approved-i2v-locomotion-v1.png")
    print(PUBLIC_ASSETS / "resident-approved-i2v-locomotion-hd-v1.png")
    print(ROOT / "src" / "render" / "residentApprovedI2VLocomotionManifest.json")


if __name__ == "__main__":
    main()
