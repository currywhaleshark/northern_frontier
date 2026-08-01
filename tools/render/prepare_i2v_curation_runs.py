from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_propagation


ROOT = Path(__file__).resolve().parents[2]
I2V_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "exports"
    / "i2v-character-references-2026-07-24"
    / "i2v_outputs"
)
CURATION_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "curation"
    / "resident-grok-i2v-frame-pick-v1"
)
SPRITE_GEN_ROOT = Path.home() / ".codex" / "skills" / "sprite-gen"

ACTIONS = ("idle", "walk")
DEFAULT_FPS = 8
DEFAULT_PLAYBACK_FPS = 5
INITIAL_SEQUENCE_FRAMES = 8


def rekey_near_magenta_background(image: Image.Image) -> Image.Image:
    """Vectorized equivalent of the Grok pipeline's border-connected rekey."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    distance = np.abs(r - 255) + np.abs(g) + np.abs(b - 255)
    chroma_like = (distance <= 72 * 3) | (
        (r >= 160)
        & (b >= 140)
        & (g <= 120)
        & ((r + b) > (g * 3 + 80))
    )
    seeds = np.zeros(chroma_like.shape, dtype=bool)
    seeds[0, :] = chroma_like[0, :]
    seeds[-1, :] = chroma_like[-1, :]
    seeds[:, 0] = chroma_like[:, 0]
    seeds[:, -1] = chroma_like[:, -1]
    background = binary_propagation(seeds, mask=chroma_like)
    output = rgb.astype(np.uint8)
    output[background] = (255, 0, 255)
    return Image.fromarray(output, mode="RGB")


def probe_duration(video_path: Path) -> float:
    output = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ],
        text=True,
        encoding="utf-8",
    ).strip()
    return float(output)


def action_attempts(character: str, action: str) -> list[tuple[int, Path]]:
    attempts_root = I2V_ROOT / character / action / "attempts"
    attempts: list[tuple[int, Path]] = []
    for attempt_dir in sorted(
        attempts_root.glob("attempt-*"),
        key=lambda path: int(path.name.removeprefix("attempt-")),
    ):
        videos = sorted((attempt_dir / "raw").glob("*.mp4"))
        if not videos:
            videos = sorted(attempt_dir.glob("*.mp4"))
        if not videos:
            # A provider-side failure may leave prompt/log provenance without a video.
            # Keep that evidence, but do not treat it as a curation candidate.
            continue
        if len(videos) != 1:
            raise RuntimeError(f"{attempt_dir}: expected exactly one MP4, found {len(videos)}")
        attempts.append((int(attempt_dir.name.removeprefix("attempt-")), videos[0]))
    if not attempts:
        raise RuntimeError(f"{character}/{action}: no attempt videos")
    return attempts


def source_reference(character: str, action: str) -> Path:
    path = I2V_ROOT / character / action / "source_ref.txt"
    if not path.exists():
        raise FileNotFoundError(path)
    ref = Path(path.read_text(encoding="utf-8").strip()).resolve()
    if not ref.exists():
        raise FileNotFoundError(ref)
    return ref


def extract_dense_frames(
    video_path: Path,
    destination: Path,
    *,
    attempt: int,
    fps: int,
    start_index: int,
) -> tuple[list[Path], float]:
    destination.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(video_path)
    written: list[Path] = []
    with tempfile.TemporaryDirectory(prefix="i2v-curation-") as temp_dir:
        temp_pattern = Path(temp_dir) / "frame-%04d.png"
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(video_path),
                "-vf",
                f"fps={fps}",
                "-start_number",
                "0",
                str(temp_pattern),
            ],
            check=True,
        )
        raw_frames = sorted(Path(temp_dir).glob("frame-*.png"))
        if not raw_frames:
            raise RuntimeError(f"{video_path}: ffmpeg extracted no frames")
        for local_index, raw_path in enumerate(raw_frames):
            time_ms = round(local_index * 1000 / fps)
            output = destination / (
                f"{start_index + local_index + 1:04d}-"
                f"A{attempt:02d}-{time_ms:04d}ms.png"
            )
            with Image.open(raw_path) as source:
                rekey_near_magenta_background(source).save(output)
            written.append(output)
    return written, duration


def write_import_tree(
    character: str,
    *,
    fps: int,
    latest_only_actions: set[str] | None = None,
) -> tuple[Path, dict]:
    character_root = CURATION_ROOT / character
    pngs_root = character_root / "pngs"
    idle_source = source_reference(character, "idle")
    latest_only_actions = latest_only_actions or set()
    base_dir = pngs_root / "_base"
    base_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(idle_source, base_dir / f"{character}.png")

    action_meta: dict[str, dict] = {}
    for action in ACTIONS:
        action_dir = pngs_root / action
        for stale_frame in action_dir.glob("*.png"):
            stale_frame.unlink()
        refs_dir = action_dir / "_refs"
        refs_dir.mkdir(parents=True, exist_ok=True)
        action_source = source_reference(character, action)
        shutil.copy2(action_source, refs_dir / f"anchor-{character}.png")

        global_index = 0
        attempts_meta: list[dict] = []
        initial_selected: list[int] = []
        attempts = action_attempts(character, action)
        if action in latest_only_actions:
            attempts = attempts[-1:]
        for attempt, video in attempts:
            written, duration = extract_dense_frames(
                video,
                action_dir,
                attempt=attempt,
                fps=fps,
                start_index=global_index,
            )
            if not initial_selected:
                midpoint_times = [
                    (index + 0.5) * duration / INITIAL_SEQUENCE_FRAMES
                    for index in range(INITIAL_SEQUENCE_FRAMES)
                ]
                local_indices = [
                    min(len(written) - 1, max(0, round(time_value * fps)))
                    for time_value in midpoint_times
                ]
                initial_selected = list(dict.fromkeys(global_index + index for index in local_indices))
            attempts_meta.append(
                {
                    "attempt": attempt,
                    "video": str(video.relative_to(ROOT)).replace("\\", "/"),
                    "duration_seconds": round(duration, 6),
                    "fps": fps,
                    "frame_count": len(written),
                    "start_index": global_index,
                }
            )
            global_index += len(written)
        action_meta[action] = {
            "attempts": attempts_meta,
            "frame_count": global_index,
            "initial_selected": initial_selected,
        }

    meta = {
        "version": 1,
        "kind": "resident-i2v-curation-source",
        "character": character,
        "source_reference": str(idle_source.relative_to(ROOT)).replace("\\", "/"),
        "action_source_references": {
            action: str(source_reference(character, action).relative_to(ROOT)).replace("\\", "/")
            for action in ACTIONS
        },
        "candidate_fps": fps,
        "actions": action_meta,
    }
    (character_root / "source-index.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return character_root, meta


def import_run(character_root: Path, meta: dict) -> Path:
    run_dir = character_root / "run"
    sys.path.insert(0, str(SPRITE_GEN_ROOT))
    from sprite_gen.curation import load_curation, stamp_curation
    from sprite_gen.unpack_atlas import import_png_groups

    pngs_root = character_root / "pngs"
    base_candidates = sorted((pngs_root / "_base").glob("*.png"))
    if len(base_candidates) != 1:
        raise RuntimeError(
            f"{pngs_root / '_base'}: expected one base image, found {len(base_candidates)}"
        )
    groups = []
    for action in ACTIONS:
        action_dir = pngs_root / action
        paths = sorted(action_dir.glob("*.png"))
        refs = sorted((action_dir / "_refs").glob("*.png"))
        if not paths:
            raise RuntimeError(f"{action_dir}: no candidate PNGs")
        groups.append(
            {
                "name": action,
                "paths": paths,
                "labels": [path.stem for path in paths],
                "refs": refs,
            }
        )
    run_dir.mkdir(parents=True, exist_ok=False)
    result = import_png_groups(
        run_dir,
        groups,
        None,
        base_src=base_candidates[0],
    )
    if result.get("frames") != sum(meta["actions"][action]["frame_count"] for action in ACTIONS):
        raise RuntimeError(f"{character_root.name}: imported frame count mismatch: {result}")

    request_path = run_dir / "sprite-request.json"
    request = json.loads(request_path.read_text(encoding="utf-8"))
    request["character"] = {
        "id": character_root.name,
        "description": f"Grok I2V full-frame curation for {character_root.name}",
    }
    for action in ACTIONS:
        request["states"][action].update(
            {
                "frames": meta["actions"][action]["frame_count"],
                "fps": DEFAULT_PLAYBACK_FPS,
                "loop": True,
                "action": f"human-selected {action} cycle from full I2V video frames",
            }
        )
    request_path.write_text(
        json.dumps(request, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    document = load_curation(run_dir) or {
        "version": 1,
        "kind": "sprite-gen-curation",
        "states": {},
    }
    states = document.setdefault("states", {})
    for action in ACTIONS:
        frame_count = meta["actions"][action]["frame_count"]
        selected = meta["actions"][action]["initial_selected"]
        remaining = [index for index in range(frame_count) if index not in set(selected)]
        states[action] = {
            "selected": selected,
            "order": selected + remaining,
        }
    document = stamp_curation(run_dir, document)
    (run_dir / "curation.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return run_dir


def available_characters() -> list[str]:
    characters = []
    for path in sorted(I2V_ROOT.iterdir()):
        if path.is_dir() and not path.name.startswith("_"):
            if all((path / action).is_dir() for action in ACTIONS):
                characters.append(path.name)
    return characters


def prepare_character(
    character: str,
    *,
    fps: int,
    force: bool,
    latest_only_actions: set[str],
) -> dict:
    character_root = CURATION_ROOT / character
    if character_root.exists():
        if not force:
            source_index = character_root / "source-index.json"
            run_dir = character_root / "run"
            if source_index.exists() and run_dir.exists():
                print(f"skip_existing={character}")
                meta = json.loads(source_index.read_text(encoding="utf-8"))
                return {"character": character, "run": run_dir, "meta": meta}
            raise RuntimeError(f"{character_root} exists but is incomplete; rerun with --force")
        resolved = character_root.resolve()
        expected_parent = CURATION_ROOT.resolve()
        if resolved.parent != expected_parent:
            raise RuntimeError(f"refusing to replace path outside curation root: {resolved}")
        shutil.rmtree(resolved)

    character_root.mkdir(parents=True, exist_ok=False)
    print(f"extracting={character}", flush=True)
    character_root, meta = write_import_tree(
        character,
        fps=fps,
        latest_only_actions=latest_only_actions,
    )
    print(f"importing={character}", flush=True)
    run_dir = import_run(character_root, meta)
    print(
        f"prepared={character} "
        f"idle={meta['actions']['idle']['frame_count']} "
        f"walk={meta['actions']['walk']['frame_count']}",
        flush=True,
    )
    return {"character": character, "run": run_dir, "meta": meta}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare dense full-frame Grok I2V videos as sprite-gen curation runs."
    )
    parser.add_argument(
        "--characters",
        nargs="*",
        help="Character folder names. Defaults to every available character.",
    )
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--latest-only-actions",
        nargs="*",
        choices=list(ACTIONS),
        default=[],
        help="For selected actions, import only the highest-numbered video attempt.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.fps <= 0:
        raise ValueError("--fps must be positive")
    if args.workers <= 0:
        raise ValueError("--workers must be positive")
    if not SPRITE_GEN_ROOT.exists():
        raise FileNotFoundError(SPRITE_GEN_ROOT)
    available = available_characters()
    characters = args.characters or available
    unknown = sorted(set(characters) - set(available))
    if unknown:
        raise ValueError(f"unknown characters: {unknown}")

    CURATION_ROOT.mkdir(parents=True, exist_ok=True)
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                prepare_character,
                character,
                fps=args.fps,
                force=args.force,
                latest_only_actions=set(args.latest_only_actions),
            ): character
            for character in characters
        }
        for future in as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda item: item["character"])
    queue = {
        "version": 1,
        "kind": "resident-i2v-curation-queue",
        "candidate_fps": args.fps,
        "characters": [
            {
                "id": item["character"],
                "run": str(item["run"].relative_to(ROOT)).replace("\\", "/"),
                "idle_frames": item["meta"]["actions"]["idle"]["frame_count"],
                "walk_frames": item["meta"]["actions"]["walk"]["frame_count"],
            }
            for item in results
        ],
    }
    (CURATION_ROOT / "queue.json").write_text(
        json.dumps(queue, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"queue={CURATION_ROOT / 'queue.json'}")


if __name__ == "__main__":
    main()
