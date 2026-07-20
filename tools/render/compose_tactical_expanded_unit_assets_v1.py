"""Pack generated tactical unit frames into runtime 168x120 sprite sheets.

The image generator produces 192px processing cells. This deterministic pass
trims transparency, applies one scale per character/loadout across all poses,
bottom-aligns the figures, and guarantees two transparent pixels of padding.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.optimize import linear_sum_assignment


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tmp" / "imagegen" / "tactical-expanded"
OUTPUT_ROOT = ROOT / "public" / "assets" / "tactical"
RAW_ROOT = ROOT / "tools" / "render" / "source_images" / "tactical-expanded"

SOURCE_CELL = 192
TARGET_WIDTH = 168
TARGET_HEIGHT = 120
PADDING = 2


def alpha_bbox(frame: Image.Image) -> tuple[int, int, int, int]:
    bbox = frame.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty sprite frame")
    return bbox


def source_frames(directory: str, columns: int, rows: int = 4) -> list[list[Image.Image]]:
    sheet = Image.open(SOURCE_ROOT / directory / "sheet-transparent.png").convert("RGBA")
    expected = (columns * SOURCE_CELL, rows * SOURCE_CELL)
    if sheet.size != expected:
        raise ValueError(f"{directory}: expected {expected}, got {sheet.size}")
    return [
        [
            sheet.crop((
                column * SOURCE_CELL,
                row * SOURCE_CELL,
                (column + 1) * SOURCE_CELL,
                (row + 1) * SOURCE_CELL,
            ))
            for column in range(columns)
        ]
        for row in range(rows)
    ]


def raw_grid_frames(filename: str, columns: int, rows: int = 4) -> list[list[Image.Image]]:
    """Recover complete figures globally, even when a weapon crosses a nominal grid edge."""
    image = Image.open(RAW_ROOT / filename).convert("RGBA")
    pixels = np.asarray(image).copy()
    red = pixels[:, :, 0]
    green = pixels[:, :, 1]
    blue = pixels[:, :, 2]
    magenta = (
        (red > 180) & (blue > 165) & (green < 105) &
        ((red.astype(np.int16) - green) > 95) &
        ((blue.astype(np.int16) - green) > 85)
    )
    foreground = ~magenta
    labels, count = ndimage.label(foreground, structure=np.ones((3, 3), dtype=np.uint8))
    areas = np.bincount(labels.ravel())
    areas[0] = 0
    cell_count = columns * rows
    candidates = np.flatnonzero(areas >= 400)
    if len(candidates) < cell_count:
        raise ValueError(f"{filename}: found only {len(candidates)} main components for {cell_count} cells")
    main_labels = candidates[np.argsort(areas[candidates])[-cell_count:]]
    centers = np.asarray(ndimage.center_of_mass(foreground, labels, main_labels))
    cell_width = image.width / columns
    cell_height = image.height / rows
    expected = np.asarray([
        ((row + 0.5) * cell_height, (column + 0.5) * cell_width)
        for row in range(rows)
        for column in range(columns)
    ])
    cost = (
        ((centers[:, None, 0] - expected[None, :, 0]) / cell_height) ** 2 +
        ((centers[:, None, 1] - expected[None, :, 1]) / cell_width) ** 2
    )
    component_indexes, cell_indexes = linear_sum_assignment(cost)
    cell_labels: list[set[int]] = [set() for _ in range(cell_count)]
    cell_main_centers = np.zeros((cell_count, 2), dtype=float)
    for component_index, cell_index in zip(component_indexes, cell_indexes, strict=True):
        label_id = int(main_labels[component_index])
        cell_labels[cell_index].add(label_id)
        cell_main_centers[cell_index] = centers[component_index]

    # Retain detached arrowheads, reins, and weapon fragments by attaching each
    # small component to the nearest already-assigned full figure.
    remaining = np.flatnonzero((areas >= 6) & ~np.isin(np.arange(len(areas)), main_labels))
    if len(remaining):
        remaining_centers = np.asarray(ndimage.center_of_mass(foreground, labels, remaining))
        distances = (
            ((remaining_centers[:, None, 0] - cell_main_centers[None, :, 0]) / cell_height) ** 2 +
            ((remaining_centers[:, None, 1] - cell_main_centers[None, :, 1]) / cell_width) ** 2
        )
        nearest = distances.argmin(axis=1)
        for label_id, cell_index, distance in zip(remaining, nearest, distances.min(axis=1), strict=True):
            if distance <= 0.34:
                cell_labels[int(cell_index)].add(int(label_id))

    frames: list[list[Image.Image]] = []
    for row in range(rows):
        row_frames = []
        for column in range(columns):
            index = row * columns + column
            selected = np.isin(labels, list(cell_labels[index]))
            ys, xs = np.nonzero(selected)
            if not len(xs):
                raise ValueError(f"{filename}: empty recovered cell ({row}, {column})")
            left, right = int(xs.min()), int(xs.max()) + 1
            top, bottom = int(ys.min()), int(ys.max()) + 1
            if left == 0 or top == 0 or right == image.width or bottom == image.height:
                raise ValueError(f"{filename}: recovered figure touches image edge at ({row}, {column})")
            crop = pixels[top:bottom, left:right].copy()
            crop[:, :, 3] = np.where(selected[top:bottom, left:right], 255, 0).astype(np.uint8)
            row_frames.append(Image.fromarray(crop, "RGBA"))
        frames.append(row_frames)
    print(f"{filename}: recovered {cell_count} complete figures from {count} components")
    return frames


def pack_columns(columns: list[list[Image.Image]], output_name: str) -> None:
    rows = len(columns[0])
    output = Image.new("RGBA", (len(columns) * TARGET_WIDTH, rows * TARGET_HEIGHT), (0, 0, 0, 0))

    for column, poses in enumerate(columns):
        bboxes = [alpha_bbox(frame) for frame in poses]
        max_width = max(right - left for left, _top, right, _bottom in bboxes)
        max_height = max(bottom - top for _left, top, _right, bottom in bboxes)
        scale = min(
            (TARGET_WIDTH - PADDING * 2) / max_width,
            (TARGET_HEIGHT - PADDING * 2) / max_height,
            1.0,
        )

        for row, (frame, bbox) in enumerate(zip(poses, bboxes, strict=True)):
            trimmed = frame.crop(bbox)
            width = max(1, round(trimmed.width * scale))
            height = max(1, round(trimmed.height * scale))
            resized = trimmed.resize((width, height), Image.Resampling.NEAREST)
            x = column * TARGET_WIDTH + (TARGET_WIDTH - width) // 2
            y = row * TARGET_HEIGHT + TARGET_HEIGHT - PADDING - height
            output.alpha_composite(resized, (x, y))

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_ROOT / output_name
    output.save(destination, optimize=True)
    print(destination.relative_to(ROOT))


def row_major_to_columns(frames: list[list[Image.Image]]) -> list[list[Image.Image]]:
    return [[frames[row][column] for row in range(len(frames))] for column in range(len(frames[0]))]


def main() -> None:
    for source_name, columns, output_name in (
        ("nimacha-unit-poses-v1.png", 5, "nimacha-unit-poses-v1.png"),
        ("holaon-unit-poses-v1.png", 3, "holaon-unit-poses-v1.png"),
        ("bandit-unit-poses-v1.png", 6, "bandit-unit-poses-v1.png"),
    ):
        pack_columns(row_major_to_columns(raw_grid_frames(source_name, columns)), output_name)

    pack_columns(row_major_to_columns(source_frames("court", 3)), "court-expanded-poses-v1.png")

    male = row_major_to_columns(source_frames("mounted-male", 6))
    female = row_major_to_columns(source_frames("mounted-female", 6))
    regular_mounted = [column for pair in zip(male, female, strict=True) for column in pair]
    special_mounted = row_major_to_columns(raw_grid_frames("special-resident-mounted-poses-v1.png", 4))
    mounted = [*regular_mounted, *special_mounted]
    pack_columns(mounted, "defender-mounted-poses-v1.png")


if __name__ == "__main__":
    main()
