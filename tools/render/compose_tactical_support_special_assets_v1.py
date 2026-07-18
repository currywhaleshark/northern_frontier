from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
GENERATED = ROOT / "tools" / "render" / "generated" / "tactical-support-special-v1"
ASSETS = ROOT / "public" / "assets" / "tactical"

CELL_WIDTH = 84
CELL_HEIGHT = 120
ROWS = 4
SAFE_PADDING = 4
PREVIEW_SCALE = 3

# 생성 원본의 2×2 배치: 좌상 대기, 우상 행동, 좌하 피격, 우하 부상.
SOURCE_CELLS = ((0, 0), (1, 0), (0, 1), (1, 1))

HEALERS = (
    "healer-male",
    "healer-female",
)

SPECIAL_RESIDENTS = (
    "jurchen-warrior-aragae",
    "tiger-hunter-bakdolgae",
    "uinyeo-dansim",
    "hangwae-sayaka",
)

# 생성 결과에서 행동 칸만 반대 방향으로 나온 세 인물은 1행만 뒤집는다.
MIRRORED_ROWS = {
    "tiger-hunter-bakdolgae": {1, 2},
    "uinyeo-dansim": {0, 1, 2, 3},
    "hangwae-sayaka": {0, 1, 2, 3},
}


def source_sheet(slug: str) -> Image.Image:
    path = GENERATED / slug / "sheet-transparent.png"
    image = Image.open(path).convert("RGBA")
    if image.width % 2 or image.height % 2:
        raise ValueError(f"2x2 source sheet has odd dimensions: {slug} {image.size}")
    return image


def fit_frame(frame: Image.Image, mirror: bool) -> tuple[Image.Image, dict[str, object]]:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("tactical pose source cell is empty")
    crop = frame.crop(bbox)
    if mirror:
        crop = crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    usable_width = CELL_WIDTH - SAFE_PADDING * 2
    usable_height = CELL_HEIGHT - SAFE_PADDING * 2
    scale = min(usable_width / crop.width, usable_height / crop.height)
    target_size = (
        max(1, round(crop.width * scale)),
        max(1, round(crop.height * scale)),
    )
    crop = crop.resize(target_size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    x = (CELL_WIDTH - target_size[0]) // 2
    y = CELL_HEIGHT - SAFE_PADDING - target_size[1]
    cell.alpha_composite(crop, (x, y))
    final_bbox = cell.getchannel("A").getbbox()
    if final_bbox is None:
        raise ValueError("tactical pose became empty")
    if (
        final_bbox[0] < SAFE_PADDING
        or final_bbox[1] < SAFE_PADDING
        or final_bbox[2] > CELL_WIDTH - SAFE_PADDING
        or final_bbox[3] > CELL_HEIGHT - SAFE_PADDING
    ):
        raise ValueError(f"tactical pose violates safe padding: {final_bbox}")
    return cell, {
        "source_bbox": list(bbox),
        "target_size": list(target_size),
        "final_bbox": list(final_bbox),
        "mirrored": mirror,
    }


def compose(specs: tuple[str, ...]) -> tuple[Image.Image, dict[str, object]]:
    sheet = Image.new("RGBA", (len(specs) * CELL_WIDTH, ROWS * CELL_HEIGHT), (0, 0, 0, 0))
    report: dict[str, object] = {}
    for column, slug in enumerate(specs):
        source = source_sheet(slug)
        source_cell_width = source.width // 2
        source_cell_height = source.height // 2
        poses: list[dict[str, object]] = []
        for row, (source_column, source_row) in enumerate(SOURCE_CELLS):
            bounds = (
                source_column * source_cell_width,
                source_row * source_cell_height,
                (source_column + 1) * source_cell_width,
                (source_row + 1) * source_cell_height,
            )
            frame, frame_report = fit_frame(source.crop(bounds), row in MIRRORED_ROWS.get(slug, set()))
            sheet.alpha_composite(frame, (column * CELL_WIDTH, row * CELL_HEIGHT))
            poses.append({"row": row, **frame_report})
        report[slug] = poses
    return sheet, report


def preview(sheet: Image.Image) -> Image.Image:
    size = (sheet.width * PREVIEW_SCALE, sheet.height * PREVIEW_SCALE)
    result = Image.new("RGBA", size, (37, 42, 47, 255))
    draw = ImageDraw.Draw(result)
    tile = 18
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2 == 0:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(50, 56, 62, 255))
    result.alpha_composite(sheet.resize(size, Image.Resampling.NEAREST))
    return result


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    outputs = (
        ("defender-healers-poses-v1.png", HEALERS),
        ("special-resident-combat-poses-v1.png", SPECIAL_RESIDENTS),
    )
    all_reports: dict[str, object] = {}
    for output_name, specs in outputs:
        sheet, report = compose(specs)
        output = ASSETS / output_name
        sheet.save(output)
        preview(sheet).save(GENERATED / output_name.replace(".png", "-preview.png"))
        all_reports[output_name] = report
        print(output)
    (GENERATED / "qc-report.json").write_text(
        json.dumps(all_reports, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
