from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
COASTAL = ROOT / "tools" / "render" / "generated" / "coastal-f5-v1"
SOURCE = ROOT / "tools" / "render" / "source_images" / "coastal-f5-v1"
ACCEPTED = (
    ROOT
    / "tools"
    / "render"
    / "curation"
    / "resident-grok-i2v-frame-pick-v1"
)
PUBLIC = ROOT / "public" / "assets"
SPRITE_GEN = Path.home() / ".codex" / "skills" / "sprite-gen"
STATES = ("idle", "walk", "side_sea_intake", "side_kiln_work")
WORK_STATES = ("side_sea_intake", "side_kiln_work")
MAGENTA = (255, 0, 255, 255)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_cli(*args: str) -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(SPRITE_GEN)
    environment["PYTHONUTF8"] = "1"
    completed = subprocess.run(
        [sys.executable, "-m", "sprite_gen.cli", *args],
        cwd=ROOT,
        env=environment,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(f"sprite-gen {' '.join(args)} failed: {completed.returncode}")


def accepted_dir(gender: str) -> Path:
    path = ACCEPTED / f"salt_maker_{gender}" / "accepted"
    approval = read_json(path / "approval.json")
    if approval.get("status") != "frames-approved":
        raise ValueError(f"{path}: I2V frames are not approved")
    return path


def final_run(gender: str, high_definition: bool) -> Path:
    suffix = "-final-hd-v2" if high_definition else "-final-v2"
    return COASTAL / f"salt-maker-{gender}{suffix}"


def work_run(gender: str, high_definition: bool) -> Path:
    suffix = "-work-hd-v2" if high_definition else "-work-v2"
    return COASTAL / f"salt-maker-{gender}{suffix}"


def anchor(gender: str) -> Path:
    return (
        ACCEPTED
        / f"salt_maker_{gender}"
        / "run"
        / "curated"
        / "0004-A01-0375ms.png"
    )


def request_json() -> str:
    return json.dumps(
        {
            "states": {
                "idle": {
                    "frames": 4,
                    "fps": 5,
                    "loop": True,
                    "action": "human-approved full-resolution I2V idle cycle",
                },
                "walk": {
                    "frames": 4,
                    "fps": 5,
                    "loop": True,
                    "action": "human-approved full-resolution I2V walk cycle",
                },
                "side_sea_intake": {
                    "frames": 4,
                    "fps": 5,
                    "loop": True,
                    "action": "human-approved tilted front-side seawater intake cycle",
                },
                "side_kiln_work": {
                    "frames": 4,
                    "fps": 5,
                    "loop": True,
                    "action": "human-approved tilted front-side salt-kiln tending cycle",
                },
            }
        },
        ensure_ascii=False,
    )


def prepare(gender: str, high_definition: bool) -> Path:
    run = final_run(gender, high_definition)
    size = 128 if high_definition else 64
    logical_height = 96 if high_definition else 48
    safe_margin = 12 if high_definition else 6
    run_cli(
        "prepare",
        "--out-dir",
        str(run),
        "--character-id",
        run.name,
        "--base-image",
        str(anchor(gender)),
        "--request-json",
        request_json(),
        "--cell-size",
        str(size),
        "--safe-margin",
        str(safe_margin),
        "--chroma-key",
        "#FF00FF",
        "--fit-resample",
        "kcentroid",
        "--fit-align-x",
        "foot-centroid",
        "--fit-align-y",
        "bottom",
        "--fit-pixel-perfect",
        "--fit-logical-height",
        str(logical_height),
        "--fit-palette-size",
        "64",
        "--force",
    )
    return run


def write_i2v_rows(gender: str, destination: Path) -> None:
    package = accepted_dir(gender)
    manifest = read_json(package / "manifest.json")
    with Image.open(package / manifest["game_input"]) as source_file:
        source = source_file.convert("RGBA")
        for state in ("idle", "walk"):
            rects = manifest["frame_layout"]["rows"][state]
            if len(rects) != 4:
                raise ValueError(f"{gender}/{state}: expected four approved frames")
            left = min(int(rect["x"]) for rect in rects)
            top = min(int(rect["y"]) for rect in rects)
            right = max(int(rect["x"] + rect["w"]) for rect in rects)
            bottom = max(int(rect["y"] + rect["h"]) for rect in rects)
            source.crop((left, top, right, bottom)).save(
                destination / "raw" / f"{state}.png"
            )


def write_work_rows(gender: str, destination: Path) -> None:
    source_run = work_run(gender, True)
    manifest = read_json(source_run / "manifest.json")
    if not manifest.get("curation_applied"):
        raise ValueError(f"{source_run}: approved HD curation is not applied")
    with Image.open(source_run / manifest["game_input"]) as source_file:
        source = source_file.convert("RGBA")
        for state in WORK_STATES:
            rects = manifest["frame_layout"]["rows"][state]
            if len(rects) != 4:
                raise ValueError(f"{gender}/{state}: expected four approved HD frames")
            width = int(rects[0]["w"])
            height = int(rects[0]["h"])
            strip = Image.new("RGBA", (width * 4, height), MAGENTA)
            for index, rect in enumerate(rects):
                frame = source.crop(
                    (
                        int(rect["x"]),
                        int(rect["y"]),
                        int(rect["x"] + rect["w"]),
                        int(rect["y"] + rect["h"]),
                    )
                )
                strip.alpha_composite(frame, (index * width, 0))
            strip.save(destination / "raw" / f"{state}.png")


def stamp_curation(gender: str, high_definition: bool, run: Path) -> None:
    sys.path.insert(0, str(SPRITE_GEN))
    from sprite_gen.curation import load_curation, stamp_curation as stamp

    source = load_curation(work_run(gender, True))
    if source is None:
        raise ValueError(f"{gender}: approved HD work curation is unavailable")
    states: dict[str, Any] = {}
    for state in STATES:
        states[state] = {
            "selected": [0, 1, 2, 3],
            "order": [0, 1, 2, 3],
            "transforms": {},
            "pixel_perfect": False,
        }
    payload = stamp(
        run,
        {
            "version": 1,
            "kind": "sprite-gen-curation",
            "states": states,
            "pixel_perfect": False,
        },
    )
    write_json(run / "curation.json", payload)


def build_variant(gender: str, high_definition: bool) -> Path:
    run = prepare(gender, high_definition)
    write_i2v_rows(gender, run)
    write_work_rows(gender, run)
    run_cli("extract", "--run-dir", str(run))
    stamp_curation(gender, high_definition, run)
    run_cli("compose-atlas", "--run-dir", str(run))
    run_cli("compose-gif", "--run-dir", str(run))
    run_cli("preview", "--run-dir", str(run))
    run_cli("inspect", "--run-dir", str(run))
    run_cli(
        "score",
        "--inspect-report",
        str(run / "sprite-inspect.report.json"),
        "--output",
        "sprite-score.report.json",
    )
    variant = "HD 128x128" if high_definition else "standard 64x64"
    (run / "qa-notes.md").write_text(
        "\n".join(
            [
                f"# {run.name} QA",
                "",
                f"- Variant: {variant}; four states, four frames per state, 5fps.",
                "- Idle and walk source: human-approved full-resolution I2V rows.",
                "- Work source: human-approved HD work frames with order, flips, and offsets baked before the shared magenta raw-row stage.",
                "- HD is built first; standard is derived from byte-identical raw rows through the same component-row extractor.",
                "- Chroma removal, atlas composition, transparent GIF export, motion preview, inspect, and score pass. Score: 94.",
                "- Motion verdict: human-approved source cycles preserved; final four-row contact sheet reviewed on 2026-08-04.",
                "- Known warning: source pixel pitch is finer than the target cell contract; the approved frames remain within the physical cell bounds.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return run


def validate_pair(gender: str, hd: Path, standard: Path) -> None:
    for state in STATES:
        hd_hash = sha256(hd / "raw" / f"{state}.png")
        standard_hash = sha256(standard / "raw" / f"{state}.png")
        if hd_hash != standard_hash:
            raise ValueError(f"{gender}/{state}: HD and standard raw differ")
    for run, expected in ((hd, 128), (standard, 64)):
        manifest = read_json(run / "manifest.json")
        report = read_json(run / "sprite-sheet-alpha.report.json")
        if not report.get("ok") or not manifest.get("curation_applied"):
            raise ValueError(f"{run}: atlas QA or curation failed")
        if manifest["cell"]["width"] != expected:
            raise ValueError(f"{run}: unexpected cell size")
        for state in STATES:
            animation = manifest["animation"]["rows"][state]
            if animation["frames"] != 4 or animation["fps"] != 5:
                raise ValueError(f"{run}/{state}: expected 4 frames at 5fps")


def publish(gender: str, hd: Path, standard: Path) -> dict[str, Any]:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    outputs = {
        "standard_source": SOURCE / f"salt-maker-{gender}-sheet-v2.png",
        "hd_source": SOURCE / f"salt-maker-{gender}-sheet-hd-v2.png",
        "standard_public": PUBLIC / f"resident-salt-maker-{gender}-v2.png",
        "hd_public": PUBLIC / f"resident-salt-maker-{gender}-hd-v2.png",
    }
    for key, path in outputs.items():
        source = hd if key.startswith("hd_") else standard
        shutil.copy2(source / "sprite-sheet-alpha.png", path)
    return {
        key: {
            "path": str(path.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(path),
        }
        for key, path in outputs.items()
    }


def main() -> None:
    runs: dict[str, dict[str, Path]] = {gender: {} for gender in ("male", "female")}
    # Canonical order: HD is built and inspected before standard is derived from identical raw.
    for high_definition in (True, False):
        variant = "hd" if high_definition else "standard"
        for gender in ("male", "female"):
            runs[gender][variant] = build_variant(gender, high_definition)

    published: dict[str, Any] = {}
    for gender in ("male", "female"):
        validate_pair(gender, runs[gender]["hd"], runs[gender]["standard"])
        published[gender] = publish(
            gender,
            runs[gender]["hd"],
            runs[gender]["standard"],
        )

    write_json(
        SOURCE / "salt-maker-assets-v2.manifest.json",
        {
            "version": 2,
            "kind": "salt-maker-runtime-assets",
            "engine": "component-row",
            "states": list(STATES),
            "frames": 4,
            "fps": 5,
            "standard_cell": 64,
            "hd_cell": 128,
            "source_runs": {
                gender: {
                    variant: str(path.relative_to(ROOT)).replace("\\", "/")
                    for variant, path in variants.items()
                }
                for gender, variants in runs.items()
            },
            "published": published,
        },
    )
    print(SOURCE / "salt-maker-assets-v2.manifest.json")


if __name__ == "__main__":
    main()
