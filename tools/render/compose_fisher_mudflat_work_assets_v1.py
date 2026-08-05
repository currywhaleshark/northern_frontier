from __future__ import annotations

import copy
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
CURATION = ROOT / "tools" / "render" / "curation" / "resident-grok-i2v-frame-pick-v1"
PUBLIC = ROOT / "public" / "assets"
SPRITE_GEN = Path.home() / ".codex" / "skills" / "sprite-gen"
STATE = "mudflat_shellfish"
GENDERS = ("male", "female")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


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


def hd_run(gender: str) -> Path:
    return COASTAL / f"fisher-{gender}-mudflat-work-hd-v1"


def standard_run(gender: str) -> Path:
    return COASTAL / f"fisher-{gender}-mudflat-work-v1"


def anchor(gender: str) -> Path:
    label = "0004-A01-0375ms.png" if gender == "male" else "0001-A01-0000ms.png"
    return CURATION / f"fisher_{gender}" / "pngs" / "idle" / label


def freeze_hd(gender: str) -> None:
    run = hd_run(gender)
    run_cli("compose-atlas", "--run-dir", str(run))
    run_cli("compose-gif", "--run-dir", str(run))
    run_cli("preview", "--run-dir", str(run))


def build_standard(gender: str) -> Path:
    run = standard_run(gender)
    description = (
        f"adult {gender} Joseon fisher, human-approved deep-squat mudflat shellfish "
        "gathering cycle with short hand rake and shallow woven basket"
    )
    run_cli(
        "prepare",
        "--out-dir",
        str(run),
        "--character-id",
        run.name,
        "--base-image",
        str(anchor(gender)),
        "--description",
        description,
        "--request",
        str(SOURCE / "fisher-mudflat-work-request-v1.json"),
        "--cell-size",
        "64",
        "--safe-margin",
        "6",
        "--chroma-key",
        "#00FF00",
        "--fit-resample",
        "kcentroid",
        "--fit-align-x",
        "foot-centroid",
        "--fit-align-y",
        "bottom",
        "--fit-pixel-perfect",
        "--fit-logical-height",
        "48",
        "--fit-palette-size",
        "64",
        "--force",
    )
    shutil.copy2(hd_run(gender) / "raw" / f"{STATE}.png", run / "raw" / f"{STATE}.png")
    run_cli("extract", "--run-dir", str(run))

    sys.path.insert(0, str(SPRITE_GEN))
    from sprite_gen.curation import load_curation, stamp_curation

    curation = load_curation(hd_run(gender))
    if curation is None:
        raise ValueError(f"{gender}: approved HD curation is unavailable")
    payload = copy.deepcopy(curation)
    payload.pop("run_revision", None)
    entry = payload["states"][STATE]
    entry.pop("revision", None)
    for transform in entry.get("transforms", {}).values():
        transform["dx"] = float(transform.get("dx", 0)) * 0.5
        transform["dy"] = float(transform.get("dy", 0)) * 0.5
    write_json(run / "curation.json", stamp_curation(run, payload))

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
    return run


def compose_sheet(high_definition: bool) -> Image.Image:
    size = 128 if high_definition else 64
    output = Image.new("RGBA", (size * 4, size * 2), (0, 0, 0, 0))
    for row, gender in enumerate(GENDERS):
        run = hd_run(gender) if high_definition else standard_run(gender)
        manifest = read_json(run / "manifest.json")
        rects = manifest["frame_layout"]["rows"][STATE]
        if len(rects) != 4 or manifest["cell"]["width"] != size:
            raise ValueError(f"{run}: unexpected frame contract")
        with Image.open(run / manifest["game_input"]) as source_file:
            source = source_file.convert("RGBA")
            for column, rect in enumerate(rects):
                frame = source.crop(
                    (
                        int(rect["x"]),
                        int(rect["y"]),
                        int(rect["x"] + rect["w"]),
                        int(rect["y"] + rect["h"]),
                    )
                )
                output.alpha_composite(frame, (column * size, row * size))
    return output


def validate() -> None:
    for gender in GENDERS:
        hd = hd_run(gender)
        standard = standard_run(gender)
        if sha256(hd / "raw" / f"{STATE}.png") != sha256(standard / "raw" / f"{STATE}.png"):
            raise ValueError(f"{gender}: HD and standard raw differ")
        for run, size in ((hd, 128), (standard, 64)):
            manifest = read_json(run / "manifest.json")
            report = read_json(run / "sprite-sheet-alpha.report.json")
            animation = manifest["animation"]["rows"][STATE]
            if not report.get("ok") or not manifest.get("curation_applied"):
                raise ValueError(f"{run}: QA or curation failed")
            if manifest["cell"]["width"] != size or animation["frames"] != 4 or animation["fps"] != 5:
                raise ValueError(f"{run}: size or timing contract failed")


def main() -> None:
    for gender in GENDERS:
        freeze_hd(gender)
    for gender in GENDERS:
        build_standard(gender)
    validate()

    PUBLIC.mkdir(parents=True, exist_ok=True)
    standard = compose_sheet(False)
    hd = compose_sheet(True)
    outputs = {
        "standard_source": SOURCE / "fisher-mudflat-work-v1.png",
        "hd_source": SOURCE / "fisher-mudflat-work-hd-v1.png",
        "standard_public": PUBLIC / "resident-fisher-mudflat-work-v1.png",
        "hd_public": PUBLIC / "resident-fisher-mudflat-work-hd-v1.png",
    }
    for name, path in outputs.items():
        (hd if name.startswith("hd_") else standard).save(path)
    write_json(
        SOURCE / "fisher-mudflat-work-v1.manifest.json",
        {
            "version": 1,
            "kind": "fisher-mudflat-work-assets",
            "engine": "component-row",
            "state": STATE,
            "frames": 4,
            "fps": 5,
            "standard_cell": 64,
            "hd_cell": 128,
            "source_runs": {
                gender: {
                    "hd": str(hd_run(gender).relative_to(ROOT)).replace("\\", "/"),
                    "standard": str(standard_run(gender).relative_to(ROOT)).replace("\\", "/"),
                }
                for gender in GENDERS
            },
            "published": {
                name: {
                    "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                    "sha256": sha256(path),
                }
                for name, path in outputs.items()
            },
        },
    )
    print(SOURCE / "fisher-mudflat-work-v1.manifest.json")


if __name__ == "__main__":
    main()
