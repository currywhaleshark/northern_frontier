from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets"
OUTPUT_ASSET = ASSETS / "resident-common-locomotion-v1.png"
OUTPUT_MANIFEST = ROOT / "src" / "render" / "residentCommonLocomotionManifest.json"
RUN_ROOT = ROOT / "tools" / "render" / "generated" / "resident-common-locomotion-v1"
QA_OVERVIEW = RUN_ROOT / "qa-overview.png"
SPRITE_GEN = Path.home() / ".codex" / "skills" / "sprite-gen"
SCRIPTS = SPRITE_GEN / "scripts"
FRAME_SIZE = 64
ANCHOR_SIZE = 40
PLAYBACK_SEQUENCE = [0, 1, 0, 2]
GENDERS = ("male", "female")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


@dataclass(frozen=True)
class Identity:
    key: str
    sheet: str
    column: int
    fixed_row: int | None = None
    gender_columns: bool = False

    def source_rect(self, gender: str) -> tuple[int, int, int, int]:
        gender_index = 0 if gender == "male" else 1
        column = gender_index if self.gender_columns else self.column
        row = self.fixed_row if self.fixed_row is not None else gender_index
        x = column * 28
        y = row * 40
        return x, y, x + 28, y + 40


IDENTITIES = (
    Identity("idle", "folk-characters-generated-v1.png", 0),
    Identity("farmer", "folk-characters-generated-v1.png", 3),
    Identity("wood-splitter", "specialized-workers-v1.png", 0),
    Identity("miller-curer", "folk-characters-generated-v1.png", 5),
    Identity("physician", "folk-characters-generated-v1.png", 6),
    Identity("potter-smith", "folk-characters-generated-v1.png", 7),
    Identity("fisher", "promotion-characters-generated-v1.png", 1),
    Identity("charcoal-burner", "promotion-characters-generated-v1.png", 2),
    Identity("herder", "promotion-characters-generated-v1.png", 3),
    Identity("tanner", "specialized-workers-v1.png", 1),
    Identity("weaver", "specialized-workers-v1.png", 2),
    Identity("powder-maker", "promotion-characters-generated-v1.png", 4),
    Identity("clerk", "promotion-characters-generated-v1.png", 5),
    Identity("undertaker", "new-content-residents-v2.png", 0, fixed_row=2, gender_columns=True),
    Identity("teacher", "new-content-residents-v2.png", 0, fixed_row=3, gender_columns=True),
    Identity("watchman", "folk-characters-generated-v1.png", 8),
    Identity("militia-unarmed", "folk-characters-generated-v1.png", 9),
    Identity("militia-spears", "militia-weapons-generated-v1.png", 0),
    Identity("militia-horn-bows", "militia-weapons-generated-v1.png", 1),
    Identity("militia-muskets", "militia-weapons-generated-v1.png", 2),
)

JOB_IDENTITIES = {
    "idle": "idle",
    "farmer": "farmer",
    "woodSplitter": "wood-splitter",
    "miller": "miller-curer",
    "physician": "physician",
    "curer": "miller-curer",
    "potter": "potter-smith",
    "smith": "potter-smith",
    "fisher": "fisher",
    "charcoalBurner": "charcoal-burner",
    "herder": "herder",
    "tanner": "tanner",
    "weaver": "weaver",
    "powderMaker": "powder-maker",
    "clerk": "clerk",
    "undertaker": "undertaker",
    "teacher": "teacher",
    "watchman": "watchman",
}

MILITIA_IDENTITIES = {
    "unarmed": "militia-unarmed",
    "spears": "militia-spears",
    "hornBows": "militia-horn-bows",
    "muskets": "militia-muskets",
}


def run_command(command: list[str], cwd: Path = ROOT) -> None:
    result = subprocess.run(
        command,
        cwd=cwd,
        check=False,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(command)}\n{result.stdout}")


def crop_identity(identity: Identity, gender: str) -> Image.Image:
    source = Image.open(ASSETS / identity.sheet).convert("RGBA")
    crop = source.crop(identity.source_rect(gender))
    alpha = crop.getchannel("A")
    if alpha.getbbox() is None:
        raise RuntimeError(f"empty source crop: {identity.key}-{gender}")
    return crop


def prepare_identity(identity: Identity, gender: str, force: bool) -> Path:
    run_dir = RUN_ROOT / f"{identity.key}-{gender}"
    if run_dir.exists() and (run_dir / "sprite-request.json").exists() and not force:
        return run_dir
    run_dir.mkdir(parents=True, exist_ok=True)

    crop = crop_identity(identity, gender)
    base_path = run_dir / "locked-base.png"
    crop.resize((280, 400), Image.Resampling.NEAREST).save(base_path)

    request = {
        "states": {
            "side_idle": {
                "frames": 1,
                "fps": 1,
                "loop": True,
                "action": "accepted canonical side-facing idle; one complete full-body neutral pose",
            },
            "side_walk": {
                "frames": 3,
                "fps": 5,
                "loop": True,
                "action": (
                    "three walking keys facing screen-right: frame 1 neutral with both feet together; "
                    "frame 2 true left-leg-forward contact with opposite arm counter-swing; "
                    "frame 3 true right-leg-forward contact with opposite arm counter-swing; "
                    "change the lower-body silhouette, not merely the waist; preserve every carried "
                    "tool, weapon, garment, hat, hairstyle, palette, and body proportion exactly"
                ),
            },
        },
        "directions": {
            "set": ["side"],
            "mirror": {"left": "side"},
            "anchor_suffix": "idle",
        },
        "fit": {
            "pixel_perfect": True,
            "logical_height": 64,
            "palette_size": 48,
            "align_x": "foot-centroid",
            "align_y": "bottom",
            "outline": False,
        },
        "style": (
            "Follow the accepted locked base exactly: true low-resolution Korean historical RPG "
            "pixel art, same pixel density, outline weight, proportions, clothing, and palette."
        ),
    }
    command = [
        sys.executable,
        str(SCRIPTS / "prepare_sprite_run.py"),
        "--out-dir",
        str(run_dir),
        "--character-id",
        f"{identity.key}-{gender}",
        "--base-image",
        str(base_path),
        "--description",
        f"accepted Northern Frontier {identity.key} {gender} resident",
        "--cell-size",
        str(FRAME_SIZE),
        "--safe-margin",
        "1",
        "--chroma-key",
        "auto",
        "--request-json",
        json.dumps(request, ensure_ascii=False),
        "--force",
    ]
    run_command(command)

    prepared = json.loads((run_dir / "sprite-request.json").read_text(encoding="utf-8"))
    key_rgb = tuple(prepared["chroma_key"]["rgb"])
    idle_raw = Image.new("RGB", (480, 480), key_rgb)
    idle_raw.paste(crop.resize((280, 400), Image.Resampling.NEAREST), (100, 40), crop.resize((280, 400), Image.Resampling.NEAREST))
    idle_raw_path = run_dir / "raw" / "side" / "idle.png"
    idle_raw_path.parent.mkdir(parents=True, exist_ok=True)
    idle_raw.save(idle_raw_path)

    accepted_anchor = Image.new("RGBA", (ANCHOR_SIZE, ANCHOR_SIZE), (0, 0, 0, 0))
    accepted_anchor.alpha_composite(crop, (6, 0))
    accepted_anchor.save(run_dir / "accepted-side-idle-anchor.png")

    prompt_path = run_dir / "prompts" / "side" / "walk.txt"
    prompt = prompt_path.read_text(encoding="utf-8").rstrip()
    prompt += (
        "\n\nThe third attached reference is an accepted gait contact sheet. Use it only for the "
        "neutral / left-contact / right-contact leg phases and body rhythm. Identity, clothing, "
        "palette, props, and scale come only from the accepted single-pose anchor. The final runtime "
        "plays frames in the order 1-2-1-3, so frames 2 and 3 must be genuinely opposite contacts.\n"
    )
    prompt_path.write_text(prompt, encoding="utf-8")
    return run_dir


def generate_identity(identity: Identity, gender: str, provider: str, model: str, force: bool) -> str:
    run_dir = prepare_identity(identity, gender, force=False)
    raw_path = run_dir / "raw" / "side" / "walk.png"
    if raw_path.exists() and not force:
        return f"reuse {identity.key}-{gender}"
    prompt_path = run_dir / "prompts" / "side" / "walk.txt"
    if force:
        correction_path = run_dir / "prompts" / "side" / "walk.correction.txt"
        hints_path = run_dir / "correction-loop" / "attempt-1" / "correction-hints.txt"
        hints = hints_path.read_text(encoding="utf-8").strip() if hints_path.exists() else ""
        correction = (
            prompt_path.read_text(encoding="utf-8").rstrip()
            + "\n\nQA CORRECTION PASS:\n"
            + "Render all three poses on one uniform, clearly visible true low-resolution pixel grid. "
            + "Use exactly the same pixel-block pitch, character height, body scale, and frame occupancy "
            + "in every slot. Keep every full body between 78% and 88% of the slot height, centered on "
            + "one shared foot baseline, with visible safe padding on every edge. Do not make one frame "
            + "larger, smaller, finer-grained, or more detailed than the others. Keep both opposite leg "
            + "contacts bold and readable without extending into the slot border."
        )
        if hints:
            correction += "\nMeasured defects from the previous candidate:\n" + hints
        correction_path.write_text(correction.rstrip() + "\n", encoding="utf-8")
        prompt_path = correction_path
        palette_lock = run_dir / "palette.lock.json"
        if palette_lock.exists():
            palette_lock.unlink()
    command = [
        sys.executable,
        str(SCRIPTS / "generate_sprite_image.py"),
        "--provider",
        provider,
        "--model",
        model,
        "--prompt-file",
        str(prompt_path),
        "--out",
        str(raw_path),
        "--ref",
        str(run_dir / "accepted-side-idle-anchor.png"),
        "--ref",
        str(run_dir / "references" / "layout-guides" / "side" / "walk.png"),
        "--ref",
        str(ASSETS / "resident-builder-locomotion-v1.png"),
        "--report",
        str(run_dir / "raw" / "side" / "walk.report.json"),
    ]
    run_command(command)
    return f"generated {identity.key}-{gender}"


def validate_identity(identity: Identity, gender: str) -> str:
    run_dir = RUN_ROOT / f"{identity.key}-{gender}"
    for script, extra in (
        ("extract_sprite_row_frames.py", ["--min-used-pixels", "200"]),
        ("compose_sprite_atlas.py", []),
        ("preview_animation.py", []),
        ("run_correction_loop.py", ["--states", "side_walk", "--dry-run"]),
    ):
        run_command([sys.executable, str(SCRIPTS / script), "--run-dir", str(run_dir), *extra])

    frames_manifest = json.loads(
        (run_dir / "frames" / "frames-manifest.json").read_text(encoding="utf-8")
    )
    atlas_report = json.loads(
        (run_dir / "sprite-sheet-alpha.report.json").read_text(encoding="utf-8")
    )
    if not frames_manifest.get("ok"):
        raise RuntimeError(f"frame extraction QA failed: {identity.key}-{gender}")
    if not atlas_report.get("ok"):
        raise RuntimeError(f"atlas QA failed: {identity.key}-{gender}")
    walk_files = sorted(
        path
        for path in (run_dir / "frames" / "side" / "walk").glob("frame-*.png")
        if re.fullmatch(r"frame-\d+\.png", path.name)
    )
    if len(walk_files) != 3:
        raise RuntimeError(f"expected 3 walk frames, found {len(walk_files)}: {identity.key}-{gender}")
    return f"validated {identity.key}-{gender}"


def tasks() -> list[tuple[Identity, str]]:
    return [(identity, gender) for identity in IDENTITIES for gender in GENDERS]


def parallel_map(label: str, fn, items: Iterable[tuple[Identity, str]], workers: int) -> None:
    failures: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(fn, identity, gender): (identity, gender) for identity, gender in items}
        completed = 0
        for future in concurrent.futures.as_completed(futures):
            identity, gender = futures[future]
            completed += 1
            try:
                result = future.result()
                print(f"[{label} {completed}/{len(futures)}] {result}", flush=True)
            except Exception as error:
                message = f"{identity.key}-{gender}: {error}"
                failures.append(message)
                print(f"[{label} {completed}/{len(futures)}] FAILED {message}", flush=True)
    if failures:
        raise RuntimeError("\n\n".join(failures))


def row_name(identity_key: str, gender: str) -> str:
    return f"{identity_key}-{gender}"


def compose_bundle() -> None:
    rows = tasks()
    sheet = Image.new("RGBA", (3 * FRAME_SIZE, len(rows) * FRAME_SIZE), (0, 0, 0, 0))
    frame_rows: dict[str, list[dict[str, int]]] = {}
    animation_rows: dict[str, dict[str, object]] = {}
    source_runs: dict[str, str] = {}

    for row_index, (identity, gender) in enumerate(rows):
        name = row_name(identity.key, gender)
        frame_dir = RUN_ROOT / name / "frames" / "side" / "walk"
        unique_rects: list[dict[str, int]] = []
        for frame_index in range(3):
            frame_path = frame_dir / f"frame-{frame_index}.png"
            if not frame_path.exists():
                raise RuntimeError(f"missing validated frame: {frame_path}")
            frame = Image.open(frame_path).convert("RGBA")
            if frame.size != (FRAME_SIZE, FRAME_SIZE):
                raise RuntimeError(f"unexpected frame size {frame.size}: {frame_path}")
            frame = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            x = frame_index * FRAME_SIZE
            y = row_index * FRAME_SIZE
            sheet.alpha_composite(frame, (x, y))
            unique_rects.append({"x": x, "y": y, "w": FRAME_SIZE, "h": FRAME_SIZE})
        frame_rows[name] = [unique_rects[index] for index in PLAYBACK_SEQUENCE]
        animation_rows[name] = {
            "frames": len(PLAYBACK_SEQUENCE),
            "fps": 5,
            "loop": True,
            "durations_ms": [200] * len(PLAYBACK_SEQUENCE),
        }
        source_runs[name] = str((RUN_ROOT / name).relative_to(ROOT)).replace("\\", "/")

    OUTPUT_ASSET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_ASSET)
    panel_width = 3 * FRAME_SIZE
    panel_height = FRAME_SIZE + 16
    overview_columns = 4
    overview_rows = (len(rows) + overview_columns - 1) // overview_columns
    overview = Image.new(
        "RGBA",
        (overview_columns * panel_width, overview_rows * panel_height),
        (30, 34, 38, 255),
    )
    draw = ImageDraw.Draw(overview)
    for row_index, (identity, gender) in enumerate(rows):
        column = row_index % overview_columns
        overview_row = row_index // overview_columns
        x = column * panel_width
        y = overview_row * panel_height
        draw.text((x + 3, y + 2), row_name(identity.key, gender), fill=(235, 238, 240, 255))
        strip = sheet.crop((0, row_index * FRAME_SIZE, panel_width, (row_index + 1) * FRAME_SIZE))
        overview.alpha_composite(strip, (x, y + 16))
    QA_OVERVIEW.parent.mkdir(parents=True, exist_ok=True)
    overview.save(QA_OVERVIEW)
    manifest = {
        "version": 1,
        "kind": "resident-common-locomotion-manifest",
        "game_input": "/assets/resident-common-locomotion-v1.png",
        "degraded_static_fallback": False,
        "cell": {"width": FRAME_SIZE, "height": FRAME_SIZE},
        "sheet": {"width": sheet.width, "height": sheet.height},
        "runtime_mirror": {"left": "side"},
        "source_facing": "left",
        "generation_facing": "right",
        "baked_flip_x": True,
        "animation": {"rows": animation_rows},
        "frame_layout": {"rows": frame_rows},
        "job_identities": JOB_IDENTITIES,
        "militia_identities": MILITIA_IDENTITIES,
        "source_runs": source_runs,
    }
    OUTPUT_MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"bundle={OUTPUT_ASSET}", flush=True)
    print(f"manifest={OUTPUT_MANIFEST}", flush=True)
    print(f"qa_overview={QA_OVERVIEW}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--compose", action="store_true")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--provider", choices=("codex", "grok"), default="codex")
    parser.add_argument("--model", default="gpt-5.6-sol")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--only",
        help="comma-separated row names such as physician-male,teacher-male",
    )
    args = parser.parse_args()

    selected = args.prepare or args.generate or args.validate or args.compose or args.all
    if not selected:
        parser.error("choose --prepare, --generate, --validate, --compose, or --all")
    if not 1 <= args.workers <= 4:
        parser.error("--workers must be between 1 and 4")

    work_items = tasks()
    if args.only:
        requested = {entry.strip() for entry in args.only.split(",") if entry.strip()}
        work_items = [
            item for item in work_items if row_name(item[0].key, item[1]) in requested
        ]
        found = {row_name(identity.key, gender) for identity, gender in work_items}
        missing = sorted(requested - found)
        if missing:
            parser.error(f"unknown --only row(s): {', '.join(missing)}")

    if args.prepare or args.all:
        for index, (identity, gender) in enumerate(work_items, start=1):
            prepare_identity(identity, gender, args.force)
            print(f"[prepare {index}/{len(work_items)}] {identity.key}-{gender}", flush=True)
    if args.generate or args.all:
        parallel_map(
            "generate",
            lambda identity, gender: generate_identity(
                identity, gender, args.provider, args.model, args.force
            ),
            work_items,
            args.workers,
        )
    if args.validate or args.all:
        parallel_map("validate", validate_identity, work_items, args.workers)
    if args.compose or args.all:
        compose_bundle()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
