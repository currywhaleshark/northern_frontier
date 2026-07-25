"""Build the 56px historical terrain sheet from the retained high-resolution source."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "assets" / "terrain" / "folk-warm-terrain-source-v3.png"
OUTPUT = ROOT / "public" / "assets" / "folk-warm-terrain-v3-56px-sheet.png"
PREVIEW = ROOT / "docs" / "assets" / "terrain" / "folk-warm-terrain-v3-56px-preview-2x.png"
ROWS = 4
COLS = 6
TILE = 56


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a[index] - b[index]) ** 2 for index in range(3)))


def projection_runs(values: list[int], threshold: int, expected: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, value in enumerate(values + [0]):
        active = value >= threshold
        if active and start is None:
            start = index
        elif not active and start is not None:
            if index - start >= 40:
                runs.append((start, index))
            start = None
    if len(runs) != expected:
        raise RuntimeError(f"Expected {expected} panel bands, found {len(runs)}: {runs}")
    return runs


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    background = source.getpixel((0, 0))
    active = [
        color_distance(pixel, background) > 38
        for pixel in source.getdata()
    ]
    x_projection = [
        sum(active[y * source.width + x] for y in range(source.height))
        for x in range(source.width)
    ]
    y_projection = [
        sum(active[y * source.width + x] for x in range(source.width))
        for y in range(source.height)
    ]
    x_runs = projection_runs(x_projection, source.height // 5, COLS)
    y_runs = projection_runs(y_projection, source.width // 5, ROWS)

    sheet = Image.new("RGB", (COLS * TILE, ROWS * TILE))
    for row, (top, bottom) in enumerate(y_runs):
        for col, (left, right) in enumerate(x_runs):
            panel = source.crop((left, top, right, bottom))
            tile = panel.resize((TILE, TILE), Image.Resampling.LANCZOS)
            sheet.paste(tile, (col * TILE, row * TILE))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.Resampling.NEAREST).save(PREVIEW, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
