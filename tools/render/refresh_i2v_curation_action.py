from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

from prepare_i2v_curation_runs import (
    ACTIONS,
    CURATION_ROOT,
    DEFAULT_FPS,
    DEFAULT_PLAYBACK_FPS,
    INITIAL_SEQUENCE_FRAMES,
    ROOT,
    SPRITE_GEN_ROOT,
    import_run,
    write_import_tree,
)


def latest_attempt_selection(action_meta: dict, fps: int) -> list[int]:
    attempts = action_meta.get("attempts") or []
    if not attempts:
        raise RuntimeError("refreshed action has no attempts")
    latest = attempts[-1]
    start = int(latest["start_index"])
    count = int(latest["frame_count"])
    duration = float(latest["duration_seconds"])
    midpoint_times = [
        (index + 0.5) * duration / INITIAL_SEQUENCE_FRAMES
        for index in range(INITIAL_SEQUENCE_FRAMES)
    ]
    local_indices = [
        min(count - 1, max(0, round(time_value * fps)))
        for time_value in midpoint_times
    ]
    return list(dict.fromkeys(start + index for index in local_indices))


def update_queue(character: str, meta: dict) -> None:
    queue_path = CURATION_ROOT / "queue.json"
    if not queue_path.exists():
        return
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    for entry in queue.get("characters", []):
        if entry.get("id") != character:
            continue
        entry["idle_frames"] = meta["actions"]["idle"]["frame_count"]
        entry["walk_frames"] = meta["actions"]["walk"]["frame_count"]
        break
    queue_path.write_text(
        json.dumps(queue, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def replace_directory_contents(source: Path, target: Path) -> None:
    resolved_target = target.resolve()
    resolved_target.relative_to(CURATION_ROOT.resolve())
    target.mkdir(parents=True, exist_ok=True)
    for child in target.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    for child in source.iterdir():
        destination = target / child.name
        if child.is_dir():
            shutil.copytree(child, destination)
        else:
            shutil.copy2(child, destination)


def refresh(character: str, action: str, fps: int) -> dict:
    if action not in ACTIONS:
        raise ValueError(f"unknown action: {action}")
    character_root = CURATION_ROOT / character
    run_dir = character_root / "run"
    if not run_dir.exists():
        raise FileNotFoundError(run_dir)

    sys.path.insert(0, str(SPRITE_GEN_ROOT))
    from sprite_gen.curation import load_curation, stamp_curation

    previous = load_curation(run_dir) or {
        "version": 1,
        "kind": "sprite-gen-curation",
        "states": {},
    }
    previous_states = previous.get("states") or {}
    source_index_path = character_root / "source-index.json"
    previous_meta = (
        json.loads(source_index_path.read_text(encoding="utf-8"))
        if source_index_path.exists()
        else None
    )

    _, meta = write_import_tree(
        character,
        fps=fps,
        latest_only_actions={action},
    )
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = character_root / f"run-before-{action}-refresh-{stamp}"
    build_root = character_root
    copy_publish = False
    try:
        run_dir.rename(backup_dir)
    except PermissionError:
        # Windows can keep the run directory handle open briefly even after the
        # curation server exits. Preserve the same rollback contract without
        # requiring the directory entry itself to be renamed.
        shutil.copytree(run_dir, backup_dir)
        build_root = character_root / f".run-refresh-build-{stamp}"
        build_root.mkdir(parents=True, exist_ok=False)
        shutil.copytree(character_root / "pngs", build_root / "pngs")
        copy_publish = True

    try:
        new_run = import_run(build_root, meta)
        document = load_curation(new_run) or {
            "version": 1,
            "kind": "sprite-gen-curation",
            "states": {},
        }
        states = document.setdefault("states", {})

        preserved = []
        for state in ACTIONS:
            if state == action or state not in previous_states:
                continue
            states[state] = previous_states[state]
            preserved.append(state)

        selected = []
        previous_action = (
            (previous_meta.get("actions") or {}).get(action)
            if previous_meta
            else None
        )
        previous_selection = (previous_states.get(action) or {}).get("selected") or []
        if previous_action and previous_action.get("attempts"):
            latest_previous_attempt = previous_action["attempts"][-1]
            latest_start = int(latest_previous_attempt["start_index"])
            latest_count = int(latest_previous_attempt["frame_count"])
            selected = [
                int(index) - latest_start
                for index in previous_selection
                if latest_start <= int(index) < latest_start + latest_count
            ]
        if not selected:
            selected = latest_attempt_selection(meta["actions"][action], fps)
        frame_count = int(meta["actions"][action]["frame_count"])
        selected_set = set(selected)
        states[action] = {
            "selected": selected,
            "order": selected
            + [index for index in range(frame_count) if index not in selected_set],
        }
        document = stamp_curation(new_run, document)
        (new_run / "curation.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        request_path = new_run / "sprite-request.json"
        request = json.loads(request_path.read_text(encoding="utf-8"))
        request["character"] = {
            "id": character,
            "description": f"Grok I2V full-frame curation for {character}",
        }
        request["states"][action]["fps"] = DEFAULT_PLAYBACK_FPS
        request_path.write_text(
            json.dumps(request, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if copy_publish:
            replace_directory_contents(new_run, run_dir)
        update_queue(character, meta)
    except Exception:
        failed_run = character_root / f"run-failed-{action}-refresh-{stamp}"
        if copy_publish:
            if run_dir.exists():
                shutil.copytree(run_dir, failed_run)
            replace_directory_contents(backup_dir, run_dir)
        elif run_dir.exists():
            run_dir.rename(failed_run)
        if not copy_publish:
            backup_dir.rename(run_dir)
        raise
    finally:
        if copy_publish and build_root.exists():
            shutil.rmtree(build_root, ignore_errors=True)

    result = {
        "character": character,
        "action": action,
        "run": str(run_dir.relative_to(ROOT)).replace("\\", "/"),
        "backup": str(backup_dir.relative_to(ROOT)).replace("\\", "/"),
        "preserved_states": preserved,
        "selected": selected,
        "frame_count": frame_count,
        "latest_attempt": meta["actions"][action]["attempts"][-1]["attempt"],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def refresh_all(character: str, fps: int) -> dict:
    character_root = CURATION_ROOT / character
    run_dir = character_root / "run"
    if not run_dir.exists():
        raise FileNotFoundError(run_dir)

    _, meta = write_import_tree(
        character,
        fps=fps,
        latest_only_actions=set(ACTIONS),
    )
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = character_root / f"run-before-all-refresh-{stamp}"
    build_root = character_root
    copy_publish = False
    try:
        run_dir.rename(backup_dir)
    except PermissionError:
        shutil.copytree(run_dir, backup_dir)
        build_root = character_root / f".run-refresh-build-{stamp}"
        build_root.mkdir(parents=True, exist_ok=False)
        shutil.copytree(character_root / "pngs", build_root / "pngs")
        copy_publish = True

    try:
        new_run = import_run(build_root, meta)
        if copy_publish:
            replace_directory_contents(new_run, run_dir)
        update_queue(character, meta)
    except Exception:
        failed_run = character_root / f"run-failed-all-refresh-{stamp}"
        if copy_publish:
            if run_dir.exists():
                shutil.copytree(run_dir, failed_run)
            replace_directory_contents(backup_dir, run_dir)
        elif run_dir.exists():
            run_dir.rename(failed_run)
        if not copy_publish:
            backup_dir.rename(run_dir)
        raise
    finally:
        if copy_publish and build_root.exists():
            shutil.rmtree(build_root, ignore_errors=True)

    result = {
        "character": character,
        "action": "all",
        "run": str(run_dir.relative_to(ROOT)).replace("\\", "/"),
        "backup": str(backup_dir.relative_to(ROOT)).replace("\\", "/"),
        "selected": {
            action: meta["actions"][action]["initial_selected"]
            for action in ACTIONS
        },
        "frame_count": {
            action: meta["actions"][action]["frame_count"]
            for action in ACTIONS
        },
        "latest_attempt": {
            action: meta["actions"][action]["attempts"][-1]["attempt"]
            for action in ACTIONS
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Refresh one I2V curation action while preserving other states, "
            "or refresh all actions from their latest attempts."
        )
    )
    parser.add_argument("--character", required=True)
    parser.add_argument("--action", required=True, choices=(*ACTIONS, "all"))
    parser.add_argument("--fps", type=int, default=DEFAULT_FPS)
    args = parser.parse_args()
    if args.fps <= 0:
        raise ValueError("--fps must be positive")
    if args.action == "all":
        refresh_all(args.character, args.fps)
    else:
        refresh(args.character, args.action, args.fps)


if __name__ == "__main__":
    main()
