#!/usr/bin/env python3
"""Set resident I2V curator playback defaults without changing candidate density."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = (
    REPO_ROOT
    / "tools"
    / "render"
    / "curation"
    / "resident-grok-i2v-frame-pick-v1"
)
DEFAULT_SKILL_ROOT = Path.home() / ".codex" / "skills" / "sprite-gen"
ACTIONS = ("idle", "walk")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write_json(path: Path, doc: dict[str, Any]) -> None:
    payload = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    handle, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        text=True,
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Set idle/walk playback fps while preserving dense candidate frames."
    )
    parser.add_argument("--fps", type=int, default=5)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--skill-root", type=Path, default=DEFAULT_SKILL_ROOT)
    parser.add_argument("--characters", nargs="*")
    parser.add_argument(
        "--refresh-accepted",
        action="store_true",
        help="Recompose existing accepted packages with the new timing manifest.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.fps <= 0:
        raise ValueError("--fps must be positive")

    root = args.root.resolve()
    skill_root = args.skill_root.resolve()
    if not root.is_dir():
        raise FileNotFoundError(root)
    if not skill_root.is_dir():
        raise FileNotFoundError(skill_root)

    sys.path.insert(0, str(skill_root))
    from sprite_gen.curation import load_curation, stamp_curation

    available = sorted(
        path.name for path in root.iterdir() if (path / "run").is_dir()
    )
    characters = args.characters or available
    unknown = sorted(set(characters) - set(available))
    if unknown:
        raise ValueError(f"unknown characters: {unknown}")

    updated: list[str] = []
    refreshed: list[str] = []
    for character in characters:
        character_dir = (root / character).resolve()
        if character_dir.parent != root:
            raise ValueError(f"unsafe character path: {character_dir}")
        run_dir = character_dir / "run"
        request_path = run_dir / "sprite-request.json"

        # Read the current sidecar before the request mutation, then restamp the
        # identical selection against the new request generation.
        curation = load_curation(run_dir)
        request = read_json(request_path)
        changed = False
        for action in ACTIONS:
            state = request.get("states", {}).get(action)
            if not state:
                continue
            if state.get("fps") != args.fps:
                state["fps"] = args.fps
                changed = True
            if state.get("loop") is not True:
                state["loop"] = True
                changed = True
        if changed:
            atomic_write_json(request_path, request)
            atomic_write_json(
                run_dir / "curation.json",
                stamp_curation(run_dir, curation),
            )
            updated.append(character)

        accepted_dir = character_dir / "accepted"
        if args.refresh_accepted and accepted_dir.is_dir():
            completed = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "tools" / "render" / "accept_i2v_curation.py"),
                    character,
                    "--root",
                    str(root),
                    "--skill-root",
                    str(skill_root),
                    "--refresh",
                ],
                cwd=REPO_ROOT,
                check=False,
            )
            if completed.returncode:
                raise RuntimeError(
                    f"failed to refresh accepted package for {character}: "
                    f"exit {completed.returncode}"
                )
            refreshed.append(character)

    result = {
        "ok": True,
        "fps": args.fps,
        "characters": len(characters),
        "updated": updated,
        "accepted_refreshed": refreshed,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
