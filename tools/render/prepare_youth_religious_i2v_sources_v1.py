from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tools" / "render" / "source_images"
OUTPUT_DIR = SOURCE_ROOT / "youth-religious-i2v-v1"
YOUTH_SHEET = SOURCE_ROOT / "teacher-youth-residents-v1.png"
RELIGIOUS_ROOT = ROOT / "tools" / "render" / "generated" / "religious-successors-static-v1"
MAGENTA = np.array([255, 0, 255], dtype=np.int16)
CANVAS_SIZE = (512, 512)

YOUTH_CELLS = {
    "youth_idle_male": 5,
    "youth_idle_female": 6,
    "youth_hauler_male": 7,
    "youth_hauler_female": 8,
    "youth_farmer_male": 9,
    "youth_farmer_female": 10,
    "youth_wood_splitter_male": 11,
    "youth_wood_splitter_female": 12,
    "youth_herder_male": 13,
    "youth_herder_female": 14,
}

RELIGIOUS_FILES = {
    "religious_shaman_male": "religious-1.png",
    "religious_monk_male": "religious-2.png",
    "religious_novice_male": "religious-3.png",
    "religious_shaman_female": "religious-4.png",
    "religious_monk_female": "religious-5.png",
    "religious_novice_female": "religious-6.png",
}


def border_connected_magenta_alpha(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    distance = np.linalg.norm(rgb - MAGENTA, axis=2)
    candidate = distance <= 92
    height, width = candidate.shape
    outside = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if candidate[0, x]:
            queue.append((x, 0))
        if candidate[height - 1, x]:
            queue.append((x, height - 1))
    for y in range(height):
        if candidate[y, 0]:
            queue.append((0, y))
        if candidate[y, width - 1]:
            queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if outside[y, x] or not candidate[y, x]:
            continue
        outside[y, x] = True
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    rgba[outside, 3] = 0
    rgba[outside, :3] = 0
    return Image.fromarray(rgba, mode="RGBA")


def on_magenta_canvas(subject: Image.Image, scale: int) -> Image.Image:
    subject = subject.convert("RGBA")
    bbox = subject.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source subject has no visible pixels")
    subject = subject.crop(bbox)
    subject = subject.resize(
        (subject.width * scale, subject.height * scale),
        Image.Resampling.NEAREST,
    )
    canvas = Image.new("RGB", CANVAS_SIZE, tuple(int(value) for value in MAGENTA))
    x = (canvas.width - subject.width) // 2
    y = canvas.height - subject.height - 24
    if x < 0 or y < 0:
        raise ValueError(f"subject {subject.size} does not fit {CANVAS_SIZE}")
    canvas.paste(subject.convert("RGB"), (x, y), subject.getchannel("A"))
    return canvas


def write_youth_sources() -> None:
    sheet = Image.open(YOUTH_SHEET).convert("RGBA")
    if sheet.width != sheet.height or sheet.width < 1024:
        raise ValueError(f"unexpected youth source size: {sheet.size}")
    for character, one_based_cell in YOUTH_CELLS.items():
        index = one_based_cell - 1
        column = index % 4
        row = index // 4
        x0 = round(column * sheet.width / 4)
        y0 = round(row * sheet.height / 4)
        x1 = round((column + 1) * sheet.width / 4)
        y1 = round((row + 1) * sheet.height / 4)
        cell = sheet.crop((x0, y0, x1, y1))
        subject = border_connected_magenta_alpha(cell)
        on_magenta_canvas(subject, 2).save(OUTPUT_DIR / f"{character}.png")


def write_religious_sources() -> None:
    for character, filename in RELIGIOUS_FILES.items():
        source = Image.open(RELIGIOUS_ROOT / filename).convert("RGBA")
        on_magenta_canvas(source, 4).save(OUTPUT_DIR / f"{character}.png")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_youth_sources()
    write_religious_sources()
    print(f"wrote {len(YOUTH_CELLS) + len(RELIGIOUS_FILES)} I2V base-lock sources to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
