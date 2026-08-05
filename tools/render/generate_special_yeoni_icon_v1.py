#!/usr/bin/env python3
"""Draw the dedicated 64 px special-resident badge for tutorial advisor Yeoni."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "ui" / "special-yeoni-icon-v1.png"
SCALE = 4


def scaled(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    return [(x * SCALE, y * SCALE) for x, y in points]


def main() -> None:
    image = Image.new("RGBA", (64 * SCALE, 64 * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    outline = "#2a1713"
    hair_outline = "#9a6844"
    hair_dark = "#291d1a"
    hair_mid = "#493129"
    hair_light = "#76503a"
    ribbon_dark = "#741d24"
    ribbon_mid = "#b52d35"
    ribbon_light = "#ef5b4c"
    gold = "#d7a84d"

    # 댕기 위로 이어지는 굵은 땋은 머리. 세 마디가 번갈아 겹쳐 작은 크기에서도
    # 검은 끈이 아니라 머리채로 읽히게 한다.
    braid_segments = [
        [(27, 7), (37, 7), (39, 15), (33, 21), (25, 16)],
        [(25, 16), (33, 12), (40, 20), (36, 28), (27, 27), (23, 21)],
        [(27, 26), (36, 23), (40, 31), (35, 39), (27, 38), (23, 32)],
        [(27, 36), (35, 34), (38, 41), (33, 47), (27, 44), (24, 40)],
    ]
    for index, segment in enumerate(braid_segments):
        draw.polygon(scaled(segment), fill=hair_outline)
        inset = [(x + (1 if x < 32 else -1), y + 1) for x, y in segment]
        draw.polygon(scaled(inset), fill=hair_mid if index % 2 == 0 else hair_dark)
        draw.line(scaled([(29, segment[0][1] + 2), (34, segment[2][1] - 1)]), fill=hair_light, width=SCALE)

    # 붉은 댕기 매듭과 좌우 고리.
    draw.polygon(scaled([(29, 38), (21, 34), (13, 38), (16, 47), (25, 45), (31, 41)]), fill=outline)
    draw.polygon(scaled([(35, 38), (43, 34), (51, 38), (48, 47), (39, 45), (33, 41)]), fill=outline)
    draw.polygon(scaled([(29, 39), (22, 36), (16, 39), (18, 44), (25, 43), (31, 40)]), fill=ribbon_mid)
    draw.polygon(scaled([(35, 39), (42, 36), (48, 39), (46, 44), (39, 43), (33, 40)]), fill=ribbon_mid)
    draw.line(scaled([(18, 39), (25, 41)]), fill=ribbon_light, width=SCALE)
    draw.line(scaled([(46, 39), (39, 41)]), fill=ribbon_light, width=SCALE)

    # 길게 늘어진 두 꼬리. 비대칭으로 벌려 실루엣을 살린다.
    draw.polygon(scaled([(28, 42), (34, 43), (30, 60), (25, 56)]), fill=outline)
    draw.polygon(scaled([(34, 42), (39, 40), (47, 56), (40, 60)]), fill=outline)
    draw.polygon(scaled([(29, 44), (32, 44), (29, 57), (27, 55)]), fill=ribbon_dark)
    draw.polygon(scaled([(35, 43), (38, 42), (44, 55), (41, 57)]), fill=ribbon_mid)
    draw.line(scaled([(36, 44), (42, 54)]), fill=ribbon_light, width=SCALE)
    draw.line(scaled([(27, 56), (30, 58)]), fill=gold, width=SCALE)
    draw.line(scaled([(41, 58), (45, 55)]), fill=gold, width=SCALE)

    # 가운데 매듭과 한 점의 빛.
    draw.ellipse((27 * SCALE, 37 * SCALE, 37 * SCALE, 47 * SCALE), fill=outline)
    draw.ellipse((29 * SCALE, 39 * SCALE, 35 * SCALE, 45 * SCALE), fill=ribbon_mid)
    draw.rectangle((30 * SCALE, 40 * SCALE, 33 * SCALE, 42 * SCALE), fill=ribbon_light)
    draw.point((31 * SCALE, 9 * SCALE), fill="#b88b5d")

    image = image.resize((64, 64), Image.Resampling.LANCZOS)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
