from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
I2V_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "exports"
    / "i2v-character-references-2026-07-24"
    / "i2v_outputs"
    / "tutorial_advisor_yeoni"
)
CURATION_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "curation"
    / "tutorial-advisor-yeoni-i2v-v1"
)
SPRITE_GEN_ROOT = Path.home() / ".codex" / "skills" / "sprite-gen"

FPS = 5
STATE_ATTEMPTS = {
    "idle": (2,),
    "walk": (1,),
    "jige_walk": (2,),
    "work": (1, 2, 3),
}
DEFAULT_SELECTED = {
    "idle": (0, 2, 4, 6),
    "walk": (0, 2, 4, 6),
    "jige_walk": (0, 2, 4, 6),
    # Attempt 3 occupies indices 16..23. This is only the opening preview;
    # human curation remains authoritative.
    "work": (16, 18, 20, 22),
}


def read_source_reference(state: str) -> Path:
    source_ref = I2V_ROOT / state / "source_ref.txt"
    path = Path(source_ref.read_text(encoding="utf-8").strip()).resolve()
    if not path.exists():
        raise FileNotFoundError(path)
    return path


def reset_output() -> None:
    if CURATION_ROOT.exists():
        resolved = CURATION_ROOT.resolve()
        expected_parent = CURATION_ROOT.parent.resolve()
        if resolved.parent != expected_parent:
            raise RuntimeError(f"refusing to replace unexpected path: {resolved}")
        shutil.rmtree(resolved)
    (CURATION_ROOT / "pngs" / "_base").mkdir(parents=True)


def copy_candidates() -> dict[str, dict]:
    pngs_root = CURATION_ROOT / "pngs"
    base_source = read_source_reference("idle")
    shutil.copy2(base_source, pngs_root / "_base" / "yeoni.png")

    state_meta: dict[str, dict] = {}
    for state, attempts in STATE_ATTEMPTS.items():
        state_dir = pngs_root / state
        refs_dir = state_dir / "_refs"
        refs_dir.mkdir(parents=True)
        source = read_source_reference(state)
        shutil.copy2(source, refs_dir / f"anchor-yeoni-{state}.png")

        labels: list[str] = []
        index = 0
        for attempt in attempts:
            frame_dir = I2V_ROOT / state / "attempts" / f"attempt-{attempt}" / "frames"
            frames = sorted(frame_dir.glob("frame_*.png"))
            if len(frames) != 8:
                raise RuntimeError(
                    f"{frame_dir}: expected 8 evenly sampled frames, found {len(frames)}"
                )
            for frame_index, frame in enumerate(frames):
                label = f"A{attempt:02d}-F{frame_index:02d}"
                destination = state_dir / f"{index + 1:04d}-{label}.png"
                shutil.copy2(frame, destination)
                labels.append(label)
                index += 1
        state_meta[state] = {
            "attempts": list(attempts),
            "frame_count": index,
            "labels": labels,
            "selected": list(DEFAULT_SELECTED[state]),
            "source_reference": str(source.relative_to(ROOT)).replace("\\", "/"),
        }
    return state_meta


def import_run(state_meta: dict[str, dict]) -> Path:
    sys.path.insert(0, str(SPRITE_GEN_ROOT))
    from sprite_gen.curation import load_curation, stamp_curation
    from sprite_gen.unpack_atlas import import_png_groups

    pngs_root = CURATION_ROOT / "pngs"
    run_dir = CURATION_ROOT / "run"
    groups = []
    for state in STATE_ATTEMPTS:
        state_dir = pngs_root / state
        paths = sorted(state_dir.glob("*.png"))
        groups.append(
            {
                "name": state,
                "paths": paths,
                "labels": [path.stem.split("-", 1)[1] for path in paths],
                "refs": sorted((state_dir / "_refs").glob("*.png")),
            }
        )

    run_dir.mkdir(parents=True)
    result = import_png_groups(
        run_dir,
        groups,
        None,
        base_src=pngs_root / "_base" / "yeoni.png",
    )
    expected_frames = sum(meta["frame_count"] for meta in state_meta.values())
    if result.get("frames") != expected_frames:
        raise RuntimeError(f"imported frame count mismatch: {result}")

    request_path = run_dir / "sprite-request.json"
    request = json.loads(request_path.read_text(encoding="utf-8"))
    request["character"] = {
        "id": "tutorial_advisor_yeoni",
        "description": "연이 I2V 4프레임 애니메이션 후보 큐레이션",
    }
    for state, meta in state_meta.items():
        request["states"][state].update(
            {
                "frames": meta["frame_count"],
                "fps": FPS,
                "loop": True,
                "action": f"human-selected four-frame {state} cycle",
            }
        )
    request_path.write_text(
        json.dumps(request, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    curation = load_curation(run_dir) or {
        "version": 1,
        "kind": "sprite-gen-curation",
        "states": {},
    }
    for state, meta in state_meta.items():
        selected = meta["selected"]
        remaining = [
            index for index in range(meta["frame_count"]) if index not in set(selected)
        ]
        curation["states"][state] = {
            "selected": selected,
            "order": selected + remaining,
        }
    curation = stamp_curation(run_dir, curation)
    (run_dir / "curation.json").write_text(
        json.dumps(curation, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return run_dir


def main() -> None:
    if not SPRITE_GEN_ROOT.exists():
        raise FileNotFoundError(SPRITE_GEN_ROOT)
    reset_output()
    state_meta = copy_candidates()
    run_dir = import_run(state_meta)
    index = {
        "version": 1,
        "kind": "tutorial-advisor-yeoni-i2v-curation-source",
        "fps": FPS,
        "states": state_meta,
        "run": str(run_dir.relative_to(ROOT)).replace("\\", "/"),
    }
    (CURATION_ROOT / "source-index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"run={run_dir}")
    for state, meta in state_meta.items():
        print(
            f"state={state} candidates={meta['frame_count']} "
            f"selected={','.join(str(index) for index in meta['selected'])} fps={FPS}"
        )


if __name__ == "__main__":
    main()
