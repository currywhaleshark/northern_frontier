"""Pack generated terrain props into matching standard/HD runtime atlases.

The image-generation sheets are intentionally treated as loose layouts rather
than strict grids: several large trees and outcrops cross the nominal cell
boundaries.  This packer finds the empty magenta gutters first, extracts each
complete object, removes magenta spill, and only then composes the atlas.
"""

from __future__ import annotations

import json
import math
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
OUTPUT_DIR = ROOT / "public" / "assets" / "terrain"
QA_DIR = ROOT / "docs" / "assets" / "terrain"

HD_CELL = (196, 224)
STD_CELL = (98, 112)
ATLAS_COLS = 6
ATLAS_ROWS = 9
PADDING = 6


@dataclass(frozen=True)
class SourceLayout:
    name: str
    filename: str
    rows: int
    cols: int
    atlas_row: int


LAYOUTS = (
    SourceLayout("trees", "terrain-growth-trees-v1.png", 4, 6, 0),
    SourceLayout("minerals", "terrain-mineral-outcrops-v1.png", 3, 5, 4),
    SourceLayout("mountains", "terrain-mountain-ridges-v1.png", 2, 5, 7),
)


def magenta_distance(pixel: tuple[int, int, int, int]) -> float:
    red, green, blue, _alpha = pixel
    return math.sqrt((255 - red) ** 2 + green**2 + (255 - blue) ** 2)


def chroma_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = Image.new("L", rgba.size)
    values: list[int] = []
    for pixel in rgba.getdata():
        distance = magenta_distance(pixel)
        # A wider transition than the generic processor removes the bright
        # magenta antialias fringe while retaining pink blossom highlights.
        value = round(max(0.0, min(1.0, (distance - 30.0) / 82.0)) * 255)
        values.append(value)
    alpha.putdata(values)
    return alpha


def runs_from_projection(
    projection: list[int],
    expected: int,
    minimum_count: int,
    merge_gap: int,
) -> list[tuple[int, int]]:
    active = [value >= minimum_count for value in projection]
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, present in enumerate(active + [False]):
        if present and start is None:
            start = index
        elif not present and start is not None:
            runs.append((start, index))
            start = None

    merged: list[tuple[int, int]] = []
    for current in runs:
        if merged and current[0] - merged[-1][1] <= merge_gap:
            merged[-1] = (merged[-1][0], current[1])
        else:
            merged.append(current)
    merged = [run for run in merged if run[1] - run[0] >= 4]
    if len(merged) != expected:
        raise RuntimeError(f"Expected {expected} occupied bands, found {len(merged)}: {merged}")
    return merged


def occupied_bounds(alpha: Image.Image, rows: int, cols: int) -> list[list[tuple[int, int, int, int]]]:
    width, height = alpha.size
    pixels = alpha.load()
    y_projection = [
        sum(1 for x in range(width) if pixels[x, y] >= 24)
        for y in range(height)
    ]
    row_runs = runs_from_projection(
        y_projection,
        expected=rows,
        minimum_count=max(3, width // 700),
        merge_gap=1,
    )

    result: list[list[tuple[int, int, int, int]]] = []
    for top, bottom in row_runs:
        x_projection = [
            sum(1 for y in range(top, bottom) if pixels[x, y] >= 24)
            for x in range(width)
        ]
        col_runs = runs_from_projection(
            x_projection,
            expected=cols,
            minimum_count=2,
            merge_gap=max(3, width // 300),
        )
        row_bounds: list[tuple[int, int, int, int]] = []
        for left, right in col_runs:
            ys = [
                y
                for y in range(top, bottom)
                if any(pixels[x, y] >= 24 for x in range(left, right))
            ]
            if not ys:
                raise RuntimeError(f"Empty sprite band at row {top}:{bottom}, col {left}:{right}")
            row_bounds.append((left, min(ys), right, max(ys) + 1))
        result.append(row_bounds)
    return result


def despill_sprite(source: Image.Image, alpha: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = bounds
    margin = 4
    crop_box = (
        max(0, left - margin),
        max(0, top - margin),
        min(source.width, right + margin),
        min(source.height, bottom + margin),
    )
    sprite = source.crop(crop_box).convert("RGBA")
    sprite_alpha = alpha.crop(crop_box)
    rgba = list(sprite.getdata())
    av = list(sprite_alpha.getdata())
    width, height = sprite.size

    def magenta_dominant(pixel: tuple[int, int, int, int]) -> bool:
        red, green, blue, _alpha = pixel
        return min(red, blue) - green > 25 and (red + blue) / 2 > 65

    # Multi-source nearest-colour propagation gives translucent or magenta-
    # contaminated edge pixels the nearest clean interior colour.
    nearest: list[int | None] = [None] * (width * height)
    queue: deque[int] = deque()
    for index, value in enumerate(av):
        if value >= 220 and not magenta_dominant(rgba[index]):
            nearest[index] = index
            queue.append(index)
    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or nx >= width or ny < 0 or ny >= height:
                continue
            neighbor = ny * width + nx
            if nearest[neighbor] is not None:
                continue
            nearest[neighbor] = nearest[index]
            queue.append(neighbor)

    edge_depth: list[int | None] = [None] * (width * height)
    edge_queue: deque[int] = deque()
    for index, value in enumerate(av):
        x = index % width
        y = index // width
        if value <= 2 or x == 0 or y == 0 or x == width - 1 or y == height - 1:
            edge_depth[index] = 0
            edge_queue.append(index)
    while edge_queue:
        index = edge_queue.popleft()
        x = index % width
        y = index // width
        depth = edge_depth[index] or 0
        if depth >= 5:
            continue
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or nx >= width or ny < 0 or ny >= height:
                continue
            neighbor = ny * width + nx
            if edge_depth[neighbor] is not None:
                continue
            edge_depth[neighbor] = depth + 1
            edge_queue.append(neighbor)

    cleaned: list[tuple[int, int, int, int]] = []
    for index, value in enumerate(av):
        if value <= 2:
            cleaned.append((0, 0, 0, 0))
            continue
        red, green, blue, _old_alpha = rgba[index]
        depth = edge_depth[index]
        contaminated_edge = magenta_dominant(rgba[index]) and depth is not None and depth <= 4
        if (value < 220 or contaminated_edge) and nearest[index] is not None:
            inner = rgba[nearest[index]]
            blend = 1.0 if contaminated_edge else (220 - value) / 220
            red = round(red * (1 - blend) + inner[0] * blend)
            green = round(green * (1 - blend) + inner[1] * blend)
            blue = round(blue * (1 - blend) + inner[2] * blend)
        cleaned.append((red, green, blue, value))
    sprite.putdata(cleaned)
    return sprite


def checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    image = Image.new("RGBA", size, (52, 55, 61, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if (x // square + y // square) % 2:
                draw.rectangle((x, y, x + square - 1, y + square - 1), fill=(76, 80, 88, 255))
    return image


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    QA_DIR.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (HD_CELL[0] * ATLAS_COLS, HD_CELL[1] * ATLAS_ROWS), (0, 0, 0, 0))
    manifest: dict[str, object] = {
        "cellHd": list(HD_CELL),
        "cellStandard": list(STD_CELL),
        "cols": ATLAS_COLS,
        "rows": ATLAS_ROWS,
        "groups": {},
    }

    for layout in LAYOUTS:
        source_path = SOURCE_DIR / layout.filename
        source = Image.open(source_path).convert("RGBA")
        alpha = chroma_alpha(source)
        bounds = occupied_bounds(alpha, layout.rows, layout.cols)
        sprites = [
            [despill_sprite(source, alpha, bounds[row][col]) for col in range(layout.cols)]
            for row in range(layout.rows)
        ]
        max_width = max(sprite.width for row in sprites for sprite in row)
        max_height = max(sprite.height for row in sprites for sprite in row)
        scale = min(
            (HD_CELL[0] - PADDING * 2) / max_width,
            (HD_CELL[1] - PADDING * 2) / max_height,
        )
        group_frames: list[dict[str, object]] = []
        for row in range(layout.rows):
            for col in range(layout.cols):
                sprite = sprites[row][col]
                target = (
                    max(1, round(sprite.width * scale)),
                    max(1, round(sprite.height * scale)),
                )
                resized = sprite.resize(target, Image.Resampling.LANCZOS)
                atlas_col = col
                atlas_row = layout.atlas_row + row
                x = atlas_col * HD_CELL[0] + (HD_CELL[0] - target[0]) // 2
                y = (atlas_row + 1) * HD_CELL[1] - PADDING - target[1]
                atlas.alpha_composite(resized, (x, y))
                left, top, right, bottom = bounds[row][col]
                group_frames.append({
                    "row": row,
                    "col": col,
                    "sourceBounds": [left, top, right, bottom],
                    "sourceTouchesImageEdge": left == 0 or top == 0 or right == source.width or bottom == source.height,
                    "packedSizeHd": list(target),
                })
        manifest["groups"][layout.name] = {
            "source": layout.filename,
            "sourceSize": list(source.size),
            "atlasRow": layout.atlas_row,
            "rows": layout.rows,
            "cols": layout.cols,
            "sharedScale": scale,
            "frames": group_frames,
        }

    standard = atlas.resize(
        (STD_CELL[0] * ATLAS_COLS, STD_CELL[1] * ATLAS_ROWS),
        Image.Resampling.LANCZOS,
    )
    hd_path = OUTPUT_DIR / "folk-warm-terrain-growth-v1-hd.png"
    std_path = OUTPUT_DIR / "folk-warm-terrain-growth-v1.png"
    atlas.save(hd_path, optimize=True)
    standard.save(std_path, optimize=True)

    preview = checkerboard(atlas.size)
    preview.alpha_composite(atlas)
    preview.save(QA_DIR / "folk-warm-terrain-growth-v1-hd-preview.png", optimize=True)
    (QA_DIR / "folk-warm-terrain-growth-v1-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(hd_path)
    print(std_path)


if __name__ == "__main__":
    main()
