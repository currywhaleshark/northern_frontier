from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CURATION_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "curation"
    / "resident-grok-i2v-frame-pick-v1"
)
SERVE_SCRIPT = (
    Path.home()
    / ".codex"
    / "skills"
    / "sprite-gen"
    / "scripts"
    / "serve_curation.py"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Open one prepared Grok resident I2V sprite-gen curation run."
    )
    parser.add_argument("character", nargs="?")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--port", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    queue_path = CURATION_ROOT / "queue.json"
    if not queue_path.exists():
        raise FileNotFoundError(
            f"{queue_path} is missing; run prepare_i2v_curation_runs.py first"
        )
    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    entries = {entry["id"]: entry for entry in queue["characters"]}
    if args.list:
        for character in entries:
            print(character)
        return
    if not args.character:
        raise ValueError("pass a character id, or use --list")
    if args.character not in entries:
        raise ValueError(f"unknown character: {args.character}")

    run_dir = ROOT / entries[args.character]["run"]
    command = [
        sys.executable,
        "-u",
        str(SERVE_SCRIPT),
        "--run-dir",
        str(run_dir),
        "--lang",
        "ko",
        "--port",
        str(args.port),
    ]
    if args.no_open:
        command.append("--no-open")
    raise SystemExit(subprocess.call(command))


if __name__ == "__main__":
    main()
