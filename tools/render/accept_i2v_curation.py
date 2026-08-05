#!/usr/bin/env python3
"""Freeze one human-approved resident I2V curation run.

This is intentionally a selection-stage packager.  It preserves the full-size
curator atlas and provenance, but labels it as an intermediate artifact until
the selected frames pass the final component-row chroma/standard/HD pipeline.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from datetime import date
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


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, doc: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_script(script: Path, run_dir: Path) -> None:
    completed = subprocess.run(
        [sys.executable, str(script), "--run-dir", str(run_dir)],
        cwd=REPO_ROOT,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(f"{script.name} failed with exit code {completed.returncode}")


def row_by_state(frames_manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["state"]: row for row in frames_manifest.get("rows", [])}


def selected_state_record(
    state: str,
    state_curation: dict[str, Any],
    frame_row: dict[str, Any],
) -> dict[str, Any]:
    selected = list(state_curation.get("selected") or [])
    if not selected:
        raise ValueError(f"{state}: no explicit human-selected frames")
    clones = {
        str(key): int(value)
        for key, value in (state_curation.get("clones") or {}).items()
    }
    labels = frame_row.get("labels") or []
    source_labels: list[str] = []
    for frame_index in selected:
        source_index = clones.get(str(frame_index), int(frame_index))
        if source_index < 0 or source_index >= len(labels):
            raise ValueError(
                f"{state}: source index {source_index} is outside labels[0:{len(labels)}]"
            )
        label = labels[source_index]
        if str(frame_index) in clones:
            label = f"clone-of-{label}"
        source_labels.append(label)

    result: dict[str, Any] = {
        "selected_indices": selected,
        "source_labels": source_labels,
    }
    if clones:
        result["clones"] = clones
    return result


def copy_if_present(source: Path, destination: Path) -> None:
    if source.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Freeze one approved resident I2V curation run."
    )
    parser.add_argument("character")
    parser.add_argument(
        "--states",
        nargs="+",
        default=["idle", "walk"],
        help="States to freeze. Defaults to the original idle/walk contract.",
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--skill-root", type=Path, default=DEFAULT_SKILL_ROOT)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh an existing accepted package after a timing-only request update.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    requested_states = tuple(dict.fromkeys(args.states))
    if not requested_states:
        raise ValueError("at least one state is required")
    root = args.root.resolve()
    character_dir = (root / args.character).resolve()
    if character_dir.parent != root:
        raise ValueError(f"unsafe character path: {character_dir}")

    run_dir = character_dir / "run"
    accepted_dir = character_dir / "accepted"
    if not run_dir.is_dir():
        raise FileNotFoundError(f"run directory not found: {run_dir}")
    if accepted_dir.exists() and not args.refresh:
        raise FileExistsError(f"accepted directory already exists: {accepted_dir}")
    if args.refresh and not accepted_dir.is_dir():
        raise FileNotFoundError(f"accepted directory not found for refresh: {accepted_dir}")

    previous_approval = {}
    if accepted_dir.is_dir() and (accepted_dir / "approval.json").exists():
        previous_approval = read_json(accepted_dir / "approval.json")

    curation = read_json(run_dir / "curation.json")
    request = read_json(run_dir / "sprite-request.json")
    frames_manifest = read_json(run_dir / "frames" / "frames-manifest.json")
    if not frames_manifest.get("ok"):
        raise ValueError("frames manifest is not ok")

    frame_rows = row_by_state(frames_manifest)
    states: dict[str, Any] = {}
    for state in requested_states:
        if state not in curation.get("states", {}):
            raise ValueError(f"curation is missing state: {state}")
        if state not in frame_rows:
            raise ValueError(f"frames manifest is missing state: {state}")
        states[state] = selected_state_record(
            state,
            curation["states"][state],
            frame_rows[state],
        )

    scripts = args.skill_root.resolve() / "scripts"
    run_script(scripts / "compose_sprite_atlas.py", run_dir)
    run_script(scripts / "compose_sprite_gif.py", run_dir)

    manifest = read_json(run_dir / "manifest.json")
    report = read_json(run_dir / "sprite-sheet-alpha.report.json")
    if not report.get("ok"):
        raise ValueError("atlas composition report is not ok")
    for state in requested_states:
        actual = manifest["animation"]["rows"][state]["frames"]
        expected = len(states[state]["selected_indices"])
        if actual != expected:
            raise ValueError(
                f"{state}: composed {actual} frames, expected selected count {expected}"
            )

    accepted_dir.mkdir(parents=True, exist_ok=args.refresh)
    for filename in (
        "curation.json",
        "sprite-request.json",
        "sprite-sheet-alpha.png",
        "sprite-sheet-alpha.report.json",
        "manifest.json",
    ):
        shutil.copy2(run_dir / filename, accepted_dir / filename)
    for state in requested_states:
        copy_if_present(
            run_dir / "exports" / f"{state}.gif",
            accepted_dir / "exports" / f"{state}.gif",
        )

    package_path = accepted_dir / "run-atlas.zip"
    with zipfile.ZipFile(package_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(
            accepted_dir / "sprite-sheet-alpha.png",
            arcname="sprite-sheet-alpha.png",
        )
        archive.write(accepted_dir / "manifest.json", arcname="manifest.json")

    timing = {
        state: {
            "fps": request["states"][state]["fps"],
            "loop": request["states"][state]["loop"],
        }
        for state in requested_states
    }
    approval = {
        "version": 1,
        "kind": "resident-i2v-curation-approval",
        "character": args.character,
        "status": "frames-approved",
        "approved_on": previous_approval.get("approved_on", date.today().isoformat()),
        "atlas_sha256": sha256(accepted_dir / "sprite-sheet-alpha.png"),
        "package_sha256": sha256(package_path),
        "curation_run_revision": curation.get("run_revision"),
        "timing": timing,
        "states": states,
        "pipeline_note": (
            "This package records the approved full-resolution I2V frame selection. "
            "It is an intermediate curation artifact; final standard/HD delivery "
            "must pass component-row chroma removal and runtime composition."
        ),
    }
    write_json(accepted_dir / "approval.json", approval)

    qa_lines = [
        f"# {args.character} I2V curation QA",
        "",
        (
            f"- {date.today().isoformat()}: Human curator approved the current "
            f"{', '.join(f'`{state}`' for state in requested_states)} frame order "
            "in the live curation view."
        ),
    ]
    for state in requested_states:
        clone_count = len(states[state].get("clones", {}))
        clone_note = f"; {clone_count} clone instance(s)" if clone_count else ""
        qa_lines.append(
            f"- `{state}`: {len(states[state]['selected_indices'])} selected "
            f"instances at {timing[state]['fps']} fps, "
            f"{'looping' if timing[state]['loop'] else 'non-looping'}{clone_note}."
        )
    qa_lines.extend(
        [
            "- The current full-resolution atlas is a selection-stage artifact.",
            (
                "- Motion-continuity and transparent-alpha gates remain pending for "
                "the later component-row standard/HD composition."
            ),
            "",
        ]
    )
    (run_dir / "qa-notes.md").write_text("\n".join(qa_lines), encoding="utf-8")

    result = {
        "ok": True,
        "character": args.character,
        "accepted_dir": str(accepted_dir),
        "states": {
            state: len(states[state]["selected_indices"])
            for state in requested_states
        },
        "timing": timing,
        "atlas_sha256": approval["atlas_sha256"],
        "package_sha256": approval["package_sha256"],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
