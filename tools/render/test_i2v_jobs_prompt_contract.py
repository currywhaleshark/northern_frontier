from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, relative_path: str):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


locomotion = load_module(
    "generate_i2v_jobs_locomotion_v1",
    "tools/render/generate_i2v_jobs_locomotion_v1.py",
)
api = load_module(
    "run_i2v_jobs_api_v1",
    "tools/render/run_i2v_jobs_api_v1.py",
)


def require(text: str, fragment: str) -> None:
    assert fragment in text, f"missing prompt contract: {fragment!r}"


def main() -> None:
    idle = locomotion.build_prompt("physician_male", "idle")
    require(idle, "STATIONARY STANDING IDLE")
    require(idle, "THIS IS NOT A WALK CYCLE")
    require(idle, "exact original screen positions")
    require(idle, "Do not take even one step")
    require(idle, "lower body from hips through feet is visually almost frozen")
    require(idle, "If either foot changes its ground contact or screen coordinate")
    require(idle, "tall structured black horsehair tanggeon")
    assert "walk on a treadmill" not in idle

    walk = locomotion.build_prompt("miller_female", "walk")
    require(walk, "ordinary unhurried working-villager pace")
    require(walk, "several small, consistent gait repetitions at natural speed")
    require(walk, "do NOT stretch one giant slow-motion step")
    require(walk, "about one foot length")
    require(walk, "toes do not rise above the opposite ankle")
    require(walk, "less than roughly 3% body-height vertical bob")
    require(walk, "low nape-level jjokmeori")
    assert "exactly one full gait period" not in walk

    youth = locomotion.build_prompt("youth_farmer_female", "walk")
    require(youth, "Age and scale lock")
    require(youth, "adolescent helper")
    require(youth, "Do not age up")
    require(youth, "one long-handled Korean hoe held low")

    novice = locomotion.build_prompt("religious_novice_male", "walk")
    require(novice, "Age and vocation lock")
    require(novice, "completely shaved head")
    require(novice, "Do not add adult height")

    shaman = locomotion.build_prompt("religious_shaman_female", "idle")
    require(shaman, "Vocation lock")
    require(shaman, "ordinary daily movement")
    require(shaman, "no dancing")

    assert api.should_retry_after_ingest("retry", 1, 3)
    assert api.should_retry_after_ingest("retry", 2, 3)
    assert not api.should_retry_after_ingest("retry", 3, 3)
    assert not api.should_retry_after_ingest("passed", 1, 3)

    print("PASS i2v idle/walk prompt and retry contracts")


if __name__ == "__main__":
    main()
