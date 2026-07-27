from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tools" / "render" / "generated"
PUBLIC_ASSETS = ROOT / "public" / "assets"

CELL_WIDTH = 56
CELL_HEIGHT = 80
ROWS = (
    ("male", "resident-farmer-video-male-hd-v1"),
    ("female", "resident-farmer-video-female-hd-v1"),
)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    output = Image.new(
        "RGBA",
        (CELL_WIDTH * 3, CELL_HEIGHT * len(ROWS)),
        (0, 0, 0, 0),
    )
    frame_rows: dict[str, list[dict[str, int]]] = {}
    animation_rows: dict[str, dict] = {}
    source_runs: dict[str, str] = {}

    for target_row, (gender, run_name) in enumerate(ROWS):
        source_dir = GENERATED / run_name
        manifest = read_json(source_dir / "manifest.json")
        layout = manifest["frame_layout"]
        cell = (layout["cellWidth"], layout["cellHeight"])
        if cell != (CELL_WIDTH, CELL_HEIGHT):
            raise ValueError(f"{source_dir}: expected 56x80 cells, got {cell}")
        if manifest.get("game_input") != "sprite-sheet-alpha.png":
            raise ValueError(f"{source_dir}: canonical game input is not the alpha sheet")

        rects = layout["rows"]["walk"]
        if len(rects) != 4 or rects[0] != rects[2]:
            raise ValueError(f"{source_dir}/walk: expected baked 0-1-0-2 layout")

        with Image.open(source_dir / manifest["game_input"]) as source_file:
            source = source_file.convert("RGBA")
            for target_column, source_index in enumerate((0, 1, 3)):
                rect = rects[source_index]
                box = (
                    rect["x"],
                    rect["y"],
                    rect["x"] + rect["w"],
                    rect["y"] + rect["h"],
                )
                output.alpha_composite(
                    source.crop(box),
                    (target_column * CELL_WIDTH, target_row * CELL_HEIGHT),
                )

        y = target_row * CELL_HEIGHT
        unique_rects = [
            {"x": 0, "y": y, "w": CELL_WIDTH, "h": CELL_HEIGHT},
            {"x": CELL_WIDTH, "y": y, "w": CELL_WIDTH, "h": CELL_HEIGHT},
            {"x": CELL_WIDTH * 2, "y": y, "w": CELL_WIDTH, "h": CELL_HEIGHT},
        ]
        frame_rows[gender] = [
            unique_rects[0],
            unique_rects[1],
            unique_rects[0],
            unique_rects[2],
        ]
        animation_rows[gender] = {
            "frames": 4,
            "fps": 5,
            "durations_ms": [200, 200, 200, 200],
            "loop": True,
        }
        source_runs[gender] = str(source_dir.relative_to(ROOT)).replace("\\", "/")

    PUBLIC_ASSETS.mkdir(parents=True, exist_ok=True)
    sheet_path = PUBLIC_ASSETS / "resident-farmer-video-walk-hd-v1.png"
    manifest_path = GENERATED / "resident-farmer-video-walk-hd-v1.manifest.json"
    output.save(sheet_path)
    manifest_path.write_text(
        json.dumps(
            {
                "version": 1,
                "kind": "sprite-gen-runtime-variant-manifest",
                "characterId": "resident-farmer-video-walk-hd-v1",
                "engine": "component-row",
                "high_definition_game_input": "/assets/resident-farmer-video-walk-hd-v1.png",
                "degraded_static_fallback": False,
                "display": {"width": 28, "height": 40},
                "animation": {"rows": animation_rows},
                "high_definition_frame_layout": {
                    "sheetWidth": output.width,
                    "sheetHeight": output.height,
                    "cellWidth": CELL_WIDTH,
                    "cellHeight": CELL_HEIGHT,
                    "rows": frame_rows,
                },
                "source_runs": source_runs,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(sheet_path)
    print(manifest_path)


if __name__ == "__main__":
    main()
