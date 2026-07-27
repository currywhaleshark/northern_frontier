from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tools" / "render" / "source_images"
OUTPUT_ROOT = ROOT / "tools" / "render" / "exports" / "i2v-character-references-2026-07-24"
MAGENTA = (255, 0, 255)


@dataclass(frozen=True)
class Subject:
    category: str
    filename: str
    display_name: str
    source: Path
    columns: int = 1
    rows: int = 1
    column: int = 0
    row: int = 0
    note: str = ""


def sheet(
    category: str,
    filename: str,
    display_name: str,
    source_name: str,
    columns: int,
    rows: int,
    column: int,
    row: int,
    note: str = "",
) -> Subject:
    return Subject(
        category=category,
        filename=filename,
        display_name=display_name,
        source=SOURCE_ROOT / source_name,
        columns=columns,
        rows=rows,
        column=column,
        row=row,
        note=note,
    )


def raw(
    category: str,
    filename: str,
    display_name: str,
    source_name: str,
    note: str = "",
) -> Subject:
    return Subject(
        category=category,
        filename=filename,
        display_name=display_name,
        source=SOURCE_ROOT / source_name,
        note=note,
    )


def gender_pair(
    category: str,
    key: str,
    korean: str,
    source_name: str,
    columns: int,
    rows: int,
    column: int,
    male_row: int = 0,
    female_row: int = 1,
    note: str = "",
) -> list[Subject]:
    return [
        sheet(
            category,
            f"{key}_male.png",
            f"{korean} 남성",
            source_name,
            columns,
            rows,
            column,
            male_row,
            note,
        ),
        sheet(
            category,
            f"{key}_female.png",
            f"{korean} 여성",
            source_name,
            columns,
            rows,
            column,
            female_row,
            note,
        ),
    ]


SUBJECTS: list[Subject] = []

# Current assignable/special jobs. The completed idle and woodcutter identities are
# deliberately omitted. Jobs that currently share a visual identity still receive
# separate files so the i2v work queue can address them independently.
SUBJECTS += gender_pair("01_jobs", "wood_splitter", "장작꾼", "specialized-workers-v1.png", 3, 2, 0)
SUBJECTS += gender_pair("01_jobs", "hunter", "사냥꾼", "generated-characters-v1.png", 11, 2, 2)
SUBJECTS += gender_pair("01_jobs", "farmer", "농부", "generated-characters-v1.png", 11, 2, 3)
SUBJECTS += gender_pair(
    "01_jobs",
    "miller",
    "방아꾼",
    "generated-characters-v1.png",
    11,
    2,
    5,
    note="현재 운반꾼 고화질 외형을 공유",
)
SUBJECTS += gender_pair("01_jobs", "builder", "건축가", "generated-characters-v1.png", 11, 2, 4)
SUBJECTS += gender_pair("01_jobs", "hauler", "운반꾼", "generated-characters-v1.png", 11, 2, 5)
SUBJECTS += gender_pair("01_jobs", "herbalist", "약초꾼", "generated-characters-v1.png", 11, 2, 6)
SUBJECTS += gender_pair(
    "01_jobs",
    "physician",
    "의원",
    "generated-characters-v1.png",
    11,
    2,
    6,
    note="현재 약초꾼 고화질 외형을 공유",
)
SUBJECTS += gender_pair(
    "01_jobs",
    "curer",
    "갈무리꾼",
    "generated-characters-v1.png",
    11,
    2,
    5,
    note="현재 운반꾼 고화질 외형을 공유",
)
SUBJECTS += gender_pair(
    "01_jobs",
    "potter",
    "옹기장이",
    "generated-characters-v1.png",
    11,
    2,
    7,
    note="현재 대장장이 고화질 외형을 공유",
)
SUBJECTS += gender_pair("01_jobs", "smith", "대장장이", "generated-characters-v1.png", 11, 2, 7)
SUBJECTS += gender_pair("01_jobs", "miner", "채광꾼", "promotion-characters-draft-v1.png", 6, 2, 0)
SUBJECTS += gender_pair("01_jobs", "fisher", "어부", "promotion-characters-draft-v1.png", 6, 2, 1)
SUBJECTS += gender_pair(
    "01_jobs",
    "charcoal_burner",
    "숯쟁이",
    "promotion-characters-draft-v1.png",
    6,
    2,
    2,
)
SUBJECTS += gender_pair("01_jobs", "herder", "목동", "promotion-characters-draft-v1.png", 6, 2, 3)
SUBJECTS += gender_pair("01_jobs", "tanner", "무두장이", "specialized-workers-v1.png", 3, 2, 1)
SUBJECTS += gender_pair("01_jobs", "weaver", "직조공", "specialized-workers-v1.png", 3, 2, 2)
SUBJECTS += gender_pair(
    "01_jobs",
    "powder_maker",
    "염초장이",
    "promotion-characters-draft-v1.png",
    6,
    2,
    4,
)
SUBJECTS += gender_pair("01_jobs", "clerk", "아전", "promotion-characters-draft-v1.png", 6, 2, 5)
SUBJECTS += [
    sheet("01_jobs", "undertaker_male.png", "장의사 남성", "new-content-residents-v1.png", 2, 3, 0, 2),
    sheet("01_jobs", "undertaker_female.png", "장의사 여성", "new-content-residents-v1.png", 2, 3, 1, 2),
    sheet("01_jobs", "teacher_male.png", "훈장 남성", "teacher-youth-residents-v1.png", 4, 4, 0, 0),
    sheet("01_jobs", "teacher_female.png", "훈장 여성", "teacher-youth-residents-v1.png", 4, 4, 1, 0),
]
SUBJECTS += gender_pair("01_jobs", "watchman", "파수꾼", "generated-characters-v1.png", 11, 2, 8)
SUBJECTS += gender_pair(
    "01_jobs",
    "militia_unarmed",
    "수비병 비무장",
    "generated-characters-v1.png",
    11,
    2,
    9,
)
SUBJECTS += gender_pair("01_jobs", "militia_spear", "수비병 창", "militia-weapons-v1.png", 3, 2, 0)
SUBJECTS += gender_pair(
    "01_jobs",
    "militia_horn_bow",
    "수비병 각궁",
    "militia-weapons-v1.png",
    3,
    2,
    1,
)
SUBJECTS += gender_pair(
    "01_jobs",
    "militia_musket",
    "수비병 조총",
    "militia-weapons-v1.png",
    3,
    2,
    2,
)
SUBJECTS += [
    raw(
        "01_jobs",
        "shaman_named_wolhyang.png",
        "무당 월향",
        "special-residents-v1/mudang-wolhyang-raw.png",
        note="네임드 전용 직업 원본",
    ),
    raw(
        "01_jobs",
        "monk_named_haeun.png",
        "승려 해은",
        "special-residents-v1/monk-haeun-raw.png",
        note="네임드 전용 직업 원본",
    ),
]

# Added age groups and youth worker variants.
SUBJECTS += [
    sheet("02_added_residents", "toddler_boy.png", "유아 남아", "new-content-residents-v1.png", 2, 3, 0, 0),
    sheet("02_added_residents", "toddler_girl.png", "유아 여아", "new-content-residents-v1.png", 2, 3, 1, 0),
    sheet("02_added_residents", "child_boy.png", "아동 남아", "new-content-residents-v1.png", 2, 3, 0, 1),
    sheet("02_added_residents", "child_girl.png", "아동 여아", "new-content-residents-v1.png", 2, 3, 1, 1),
    sheet("02_added_residents", "youth_idle_boy.png", "청소년 남아 무직", "teacher-youth-residents-v1.png", 4, 4, 0, 1),
    sheet("02_added_residents", "youth_idle_girl.png", "청소년 여아 무직", "teacher-youth-residents-v1.png", 4, 4, 1, 1),
    sheet("02_added_residents", "youth_hauler_boy.png", "청소년 남아 운반꾼", "teacher-youth-residents-v1.png", 4, 4, 2, 1),
    sheet("02_added_residents", "youth_hauler_girl.png", "청소년 여아 운반꾼", "teacher-youth-residents-v1.png", 4, 4, 3, 1),
    sheet("02_added_residents", "youth_farmer_boy.png", "청소년 남아 농부", "teacher-youth-residents-v1.png", 4, 4, 0, 2),
    sheet("02_added_residents", "youth_farmer_girl.png", "청소년 여아 농부", "teacher-youth-residents-v1.png", 4, 4, 1, 2),
    sheet(
        "02_added_residents",
        "youth_wood_splitter_boy.png",
        "청소년 남아 장작꾼",
        "teacher-youth-residents-v1.png",
        4,
        4,
        2,
        2,
    ),
    sheet(
        "02_added_residents",
        "youth_wood_splitter_girl.png",
        "청소년 여아 장작꾼",
        "teacher-youth-residents-v1.png",
        4,
        4,
        3,
        2,
    ),
    sheet("02_added_residents", "youth_herder_boy.png", "청소년 남아 목동", "teacher-youth-residents-v1.png", 4, 4, 0, 3),
    sheet("02_added_residents", "youth_herder_girl.png", "청소년 여아 목동", "teacher-youth-residents-v1.png", 4, 4, 1, 3),
    sheet(
        "02_added_residents",
        "mounted_raider_male.png",
        "기마 약탈자 남성",
        "generated-characters-v1.png",
        11,
        2,
        10,
        0,
    ),
    sheet(
        "02_added_residents",
        "mounted_raider_female.png",
        "기마 약탈자 여성",
        "generated-characters-v1.png",
        11,
        2,
        10,
        1,
    ),
]

# Foreign faction resident pairs.
FOREIGN_FACTIONS = (
    ("odori", "오도리 씨족", 0),
    ("oryanghap", "올량합 부락", 1),
    ("golgan_udige", "골간 우디캐", 2),
    ("nimacha_udige", "니마차 우디캐", 3),
)
for key, korean, column in FOREIGN_FACTIONS:
    SUBJECTS += gender_pair(
        "03_foreign_residents",
        key,
        korean,
        "foreign-residents-source-v1.png",
        4,
        2,
        column,
    )

# Named special residents. Shaman and monk also appear under jobs because those
# two jobs are named-only, but this complete named roster is kept together here.
SPECIAL_RESIDENTS = (
    ("exiled_scholar_yun", "유배 선비 윤", "special-residents-v1/exiled-scholar-yun-raw.png"),
    ("jurchen_warrior_aragae", "여진 전사 아라개", "special-residents-v1/jurchen-warrior-aragae-raw.png"),
    ("monk_haeun", "승려 해은", "special-residents-v1/monk-haeun-raw.png"),
    ("mudang_wolhyang", "무당 월향", "special-residents-v1/mudang-wolhyang-raw.png"),
    ("geomancer_heosaeng", "풍수사 허생", "special-residents-v2/geomancer-heosaeng-raw.png"),
    ("hangwae_sayaka", "항왜 사야카", "special-residents-v2/hangwae-sayaka-raw.png"),
    ("interpreter_baesugyeom", "역관 배수겸", "special-residents-v2/interpreter-baesugyeom-raw.png"),
    ("runaway_smith_maksoe", "도망 대장장이 막쇠", "special-residents-v2/runaway-smith-maksoe-raw.png"),
    ("tiger_hunter_bakdolgae", "착호갑사 박돌개", "special-residents-v2/tiger-hunter-bakdolgae-raw.png"),
    ("uinyeo_dansim", "의녀 단심", "special-residents-v2/uinyeo-dansim-raw.png"),
)
for key, korean, source_name in SPECIAL_RESIDENTS:
    SUBJECTS.append(raw("04_special_residents", f"{key}.png", korean, source_name))

# Faction-specific mounted raiders.
RAIDER_FACTIONS = (
    ("odori", "오도리 씨족", 0),
    ("oryanghap", "올량합 부락", 1),
    ("golgan_udige", "골간 우디캐", 2),
    ("nimacha_udige", "니마차 우디캐", 3),
    ("holaon", "홀라온 야인", 4),
    ("frontier_bandit", "변경 마적", 5),
)
for key, korean, column in RAIDER_FACTIONS:
    SUBJECTS.append(
        sheet(
            "05_faction_raiders",
            f"{key}_mounted_raider.png",
            f"{korean} 기마 약탈자",
            "faction-raiders-v1.png",
            6,
            1,
            column,
            0,
        )
    )


def is_key_pixel(pixel: tuple[int, int, int]) -> bool:
    r, g, b = pixel
    return r > 190 and g < 110 and b > 160


def contiguous_runs(values: list[int], gap: int = 2) -> list[tuple[int, int]]:
    if not values:
        return []
    runs: list[tuple[int, int]] = []
    start = previous = values[0]
    for value in values[1:]:
        if value <= previous + gap:
            previous = value
        else:
            runs.append((start, previous))
            start = previous = value
    runs.append((start, previous))
    return runs


def generated_character_boxes(image: Image.Image) -> list[list[tuple[int, int, int, int]]]:
    rgb = image.convert("RGB")
    row_pixels = [
        y
        for y in range(rgb.height)
        if any(not is_key_pixel(rgb.getpixel((x, y))) for x in range(rgb.width))
    ]
    row_runs = [run for run in contiguous_runs(row_pixels) if run[1] - run[0] > 16]
    if len(row_runs) != 2:
        raise ValueError(f"expected 2 generated-character rows, found {row_runs}")

    boxes: list[list[tuple[int, int, int, int]]] = []
    for top, bottom in row_runs:
        column_pixels = [
            x
            for x in range(rgb.width)
            if any(not is_key_pixel(rgb.getpixel((x, y))) for y in range(top, bottom + 1))
        ]
        column_runs = [run for run in contiguous_runs(column_pixels) if run[1] - run[0] > 10]
        if len(column_runs) != 11:
            raise ValueError(f"expected 11 generated-character columns, found {column_runs}")
        boxes.append([(left, top, right + 1, bottom + 1) for left, right in column_runs])
    return boxes


def grid_box(subject: Subject, image: Image.Image) -> tuple[int, int, int, int]:
    if subject.source.name == "generated-characters-v1.png":
        return generated_character_boxes(image)[subject.row][subject.column]
    left = round(subject.column * image.width / subject.columns)
    top = round(subject.row * image.height / subject.rows)
    right = round((subject.column + 1) * image.width / subject.columns)
    bottom = round((subject.row + 1) * image.height / subject.rows)
    return left, top, right, bottom


def non_key_mask(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    mask = Image.new("1", rgb.size, 0)
    mask_pixels = mask.load()
    rgb_pixels = rgb.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            if not is_key_pixel(rgb_pixels[x, y]):
                mask_pixels[x, y] = 1
    return mask


def connected_components(mask: Image.Image) -> list[tuple[int, tuple[int, int, int, int], list[tuple[int, int]]]]:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    components: list[tuple[int, tuple[int, int, int, int], list[tuple[int, int]]]] = []
    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if visited[offset] or pixels[x, y] == 0:
                continue
            stack = [(x, y)]
            visited[offset] = 1
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                current_x, current_y = stack.pop()
                points.append((current_x, current_y))
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)
                for next_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for next_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        next_offset = next_y * width + next_x
                        if visited[next_offset] or pixels[next_x, next_y] == 0:
                            continue
                        visited[next_offset] = 1
                        stack.append((next_x, next_y))
            components.append((len(points), (min_x, min_y, max_x + 1, max_y + 1), points))
    return components


def box_distance(left: tuple[int, int, int, int], right: tuple[int, int, int, int]) -> int:
    horizontal = max(0, left[0] - right[2], right[0] - left[2])
    vertical = max(0, left[1] - right[3], right[1] - left[3])
    return max(horizontal, vertical)


def isolated_subject(image: Image.Image, filter_components: bool) -> tuple[Image.Image, tuple[int, int, int, int]]:
    rgb = image.convert("RGB")
    mask = non_key_mask(rgb)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError("cell contains no non-magenta subject pixels")

    if filter_components:
        components = connected_components(mask)
        if not components:
            raise ValueError("cell contains no connected subject components")
        main = max(components, key=lambda component: component[0])
        main_area, main_box, _ = main
        proximity = max(8, round((main_box[3] - main_box[1]) * 0.03))
        selected = [
            component
            for component in components
            if component is main
            or (
                component[0] >= max(4, round(main_area * 0.001))
                and box_distance(component[1], main_box) <= proximity
            )
        ]
        selected_mask = Image.new("1", rgb.size, 0)
        selected_pixels = selected_mask.load()
        for _, _, points in selected:
            for x, y in points:
                selected_pixels[x, y] = 1
        mask = selected_mask
        bbox = mask.getbbox()
        if bbox is None:
            raise ValueError("component filtering removed the subject")

    crop = Image.new("RGB", (bbox[2] - bbox[0], bbox[3] - bbox[1]), MAGENTA)
    source_pixels = rgb.load()
    mask_pixels = mask.load()
    crop_pixels = crop.load()
    for y in range(bbox[1], bbox[3]):
        for x in range(bbox[0], bbox[2]):
            if mask_pixels[x, y]:
                crop_pixels[x - bbox[0], y - bbox[1]] = source_pixels[x, y]
    return crop, bbox


def export_subject(subject: Subject, cache: dict[tuple[Path, int, int, int, int], tuple[Image.Image, tuple[int, int, int, int]]]) -> dict[str, str | int]:
    cache_key = (subject.source, subject.columns, subject.rows, subject.column, subject.row)
    if cache_key not in cache:
        source_image = Image.open(subject.source).convert("RGB")
        source_cell_box = grid_box(subject, source_image)
        source_cell = source_image.crop(source_cell_box)
        filter_components = subject.columns > 1 and subject.source.name != "generated-characters-v1.png"
        crop, local_bbox = isolated_subject(source_cell, filter_components)
        absolute_bbox = (
            source_cell_box[0] + local_bbox[0],
            source_cell_box[1] + local_bbox[1],
            source_cell_box[0] + local_bbox[2],
            source_cell_box[1] + local_bbox[3],
        )
        cache[cache_key] = (crop, absolute_bbox)
    crop, absolute_bbox = cache[cache_key]

    # First crop the exact source-resolution subject. Only then add a new,
    # generously sized solid-magenta canvas around it.
    side_padding = max(192, math.ceil(crop.width * 0.60))
    vertical_padding = max(64, math.ceil(crop.height * 0.12))
    output = Image.new(
        "RGB",
        (crop.width + side_padding * 2, crop.height + vertical_padding * 2),
        MAGENTA,
    )
    output.paste(crop, (side_padding, vertical_padding))

    destination = OUTPUT_ROOT / subject.category / subject.filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, format="PNG", optimize=False)

    pasted = output.crop(
        (
            side_padding,
            vertical_padding,
            side_padding + crop.width,
            vertical_padding + crop.height,
        )
    )
    if pasted.tobytes() != crop.tobytes():
        raise AssertionError(f"isolated source pixels changed while exporting {destination}")
    border_points = (
        (0, 0),
        (output.width - 1, 0),
        (0, output.height - 1),
        (output.width - 1, output.height - 1),
        (side_padding - 1, output.height // 2),
        (output.width - side_padding, output.height // 2),
    )
    if any(output.getpixel(point) != MAGENTA for point in border_points):
        raise AssertionError(f"non-magenta output border in {destination}")

    return {
        "category": subject.category,
        "file": str(destination.relative_to(OUTPUT_ROOT)).replace("\\", "/"),
        "display_name": subject.display_name,
        "source": str(subject.source.relative_to(ROOT)).replace("\\", "/"),
        "source_column": subject.column,
        "source_row": subject.row,
        "source_columns": subject.columns,
        "source_rows": subject.rows,
        "source_bbox": ",".join(str(value) for value in absolute_bbox),
        "subject_width": crop.width,
        "subject_height": crop.height,
        "left_padding": side_padding,
        "right_padding": side_padding,
        "top_padding": vertical_padding,
        "bottom_padding": vertical_padding,
        "output_width": output.width,
        "output_height": output.height,
        "note": subject.note,
    }


def make_category_overview(category: str, records: list[dict[str, str | int]]) -> None:
    images = [Image.open(OUTPUT_ROOT / str(record["file"])).convert("RGB") for record in records]
    thumb_width = 240
    thumb_height = 300
    label_height = 42
    columns = min(6, len(images))
    rows = math.ceil(len(images) / columns)
    overview = Image.new("RGB", (columns * thumb_width, rows * (thumb_height + label_height)), (45, 35, 45))
    draw = ImageDraw.Draw(overview)
    for index, (record, image) in enumerate(zip(records, images, strict=True)):
        scale = min((thumb_width - 20) / image.width, (thumb_height - 20) / image.height)
        preview = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.NEAREST,
        )
        column = index % columns
        row = index // columns
        x = column * thumb_width + (thumb_width - preview.width) // 2
        y = row * (thumb_height + label_height) + (thumb_height - preview.height) // 2
        overview.paste(preview, (x, y))
        draw.text(
            (column * thumb_width + 8, row * (thumb_height + label_height) + thumb_height + 8),
            str(record["file"]).split("/")[-1],
            fill=(240, 235, 240),
        )
    overview.save(OUTPUT_ROOT / f"_qa_{category}.png")


def write_manifest(records: list[dict[str, str | int]]) -> None:
    manifest_path = OUTPUT_ROOT / "manifest.csv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)

    readme = OUTPUT_ROOT / "README.txt"
    readme.write_text(
        "\n".join(
            [
                "Northern i2v character references — 2026-07-24",
                "",
                "처리 규칙:",
                "- 원본 시트의 해당 인물/도구 전체를 원본 픽셀 크기 그대로 먼저 크롭",
                "- 크롭 후 좌우 각각 max(192px, 인물 폭의 60%) 순마젠타(#FF00FF) 여백 추가",
                "- 상하도 안전 여백 max(64px, 인물 높이의 12%) 추가",
                "- 리사이즈, 보간, 투명화 없음",
                "",
                "제외:",
                "- 무직(idle) 성인 남녀: 이미 완성",
                "- 벌목꾼(woodcutter) 성인 남녀: 이미 완성",
                "",
                "참고:",
                "- 장작꾼(woodSplitter)은 벌목꾼과 다른 직업이므로 포함",
                "- 현재 같은 기본 외형을 공유하는 직업도 i2v 작업 단위를 위해 별도 파일로 복제",
                "- _qa_*.png는 로컬 검수용 모음 이미지이며 Drive 업로드 대상에서 제외",
                f"- 개별 PNG 수: {len(records)}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> None:
    missing = sorted({subject.source for subject in SUBJECTS if not subject.source.exists()})
    if missing:
        raise FileNotFoundError(f"missing source images: {missing}")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    cache: dict[tuple[Path, int, int, int, int], tuple[Image.Image, tuple[int, int, int, int]]] = {}
    records = [export_subject(subject, cache) for subject in SUBJECTS]
    write_manifest(records)
    for category in sorted({subject.category for subject in SUBJECTS}):
        make_category_overview(category, [record for record in records if record["category"] == category])
    print(f"exported {len(records)} individual PNG files to {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
