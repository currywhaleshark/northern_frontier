from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CURRENT = ROOT / "public" / "assets" / "tactical"
CELL_HEIGHT = 120
ROWS = 4
PADDING = 2


@dataclass
class Run:
    y: int
    left: int
    right: int
    parent: int


def alpha_components(image: Image.Image) -> list[list[Run]]:
    opaque = np.asarray(image.getchannel("A")) > 32
    runs: list[Run] = []
    previous: list[int] = []

    def find(index: int) -> int:
        while runs[index].parent != index:
            runs[index].parent = runs[runs[index].parent].parent
            index = runs[index].parent
        return index

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            runs[second_root].parent = first_root

    for y, row in enumerate(opaque):
        xs = np.flatnonzero(row)
        current: list[int] = []
        if xs.size:
            starts = np.r_[0, np.flatnonzero(np.diff(xs) > 1) + 1]
            ends = np.r_[starts[1:] - 1, xs.size - 1]
            for start_index, end_index in zip(starts, ends):
                index = len(runs)
                run = Run(y, int(xs[start_index]), int(xs[end_index]), index)
                runs.append(run)
                current.append(index)
                for previous_index in previous:
                    previous_run = runs[previous_index]
                    if previous_run.right + 1 < run.left:
                        continue
                    if run.right + 1 < previous_run.left:
                        break
                    union(index, previous_index)
        previous = current

    grouped: dict[int, list[Run]] = defaultdict(list)
    for index, run in enumerate(runs):
        grouped[find(index)].append(run)
    return list(grouped.values())


def component_stats(component: list[Run]) -> tuple[int, int, int, int, int, float, float]:
    area = sum(run.right - run.left + 1 for run in component)
    left = min(run.left for run in component)
    right = max(run.right for run in component) + 1
    top = min(run.y for run in component)
    bottom = max(run.y for run in component) + 1
    x_sum = sum((run.left + run.right) * (run.right - run.left + 1) / 2 for run in component)
    y_sum = sum(run.y * (run.right - run.left + 1) for run in component)
    return area, left, top, right, bottom, x_sum / area, y_sum / area


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def render_cell(
    source: Image.Image,
    components: list[list[Run]],
    columns: int,
    column: int,
    row: int,
    cell_width: int,
) -> Image.Image:
    source_column_width = source.width / columns
    source_row_height = source.height / ROWS
    assigned: list[list[Run]] = []
    for component in components:
        area, _left, _top, _right, _bottom, center_x, center_y = component_stats(component)
        if area < 10:
            continue
        assigned_column = clamp(int(center_x / source_column_width), 0, columns - 1)
        assigned_row = clamp(int(center_y / source_row_height), 0, ROWS - 1)
        if assigned_column == column and assigned_row == row:
            assigned.append(component)
    if not assigned:
        raise ValueError(f"no subject for row={row} column={column}")

    stats = [component_stats(component) for component in assigned]
    left = min(item[1] for item in stats)
    top = min(item[2] for item in stats)
    right = max(item[3] for item in stats)
    bottom = max(item[4] for item in stats)
    crop = source.crop((left, top, right, bottom))
    mask = np.zeros((bottom - top, right - left), dtype=np.uint8)
    for component in assigned:
        for run in component:
            mask[run.y - top, run.left - left:run.right - left + 1] = 255
    alpha = np.asarray(crop.getchannel("A"), dtype=np.uint16)
    crop.putalpha(Image.fromarray(((alpha * mask) // 255).astype(np.uint8), "L"))

    base_scale = min(cell_width / source_column_width, CELL_HEIGHT / source_row_height)
    fit_scale = min(
        base_scale,
        (cell_width - PADDING * 2) / crop.width,
        (CELL_HEIGHT - PADDING * 2) / crop.height,
    )
    target_width = max(1, round(crop.width * fit_scale))
    target_height = max(1, round(crop.height * fit_scale))
    crop = crop.resize((target_width, target_height), Image.Resampling.LANCZOS)

    desired_left = round((left - column * source_column_width) * base_scale)
    desired_top = round((top - row * source_row_height) * base_scale)
    paste_left = clamp(desired_left, PADDING, cell_width - PADDING - target_width)
    paste_top = clamp(desired_top, PADDING, CELL_HEIGHT - PADDING - target_height)
    cell = Image.new("RGBA", (cell_width, CELL_HEIGHT), (0, 0, 0, 0))
    cell.alpha_composite(crop, (paste_left, paste_top))
    return cell


def fit_existing_cell(cell: Image.Image) -> Image.Image:
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("cannot preserve an empty cell")
    if bbox[0] >= PADDING and bbox[1] >= PADDING and bbox[2] <= cell.width - PADDING and bbox[3] <= cell.height - PADDING:
        return cell
    subject = cell.crop(bbox)
    scale = min(1, (cell.width - PADDING * 2) / subject.width, (cell.height - PADDING * 2) / subject.height)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
    left = clamp(bbox[0], PADDING, cell.width - PADDING - subject.width)
    top = clamp(bbox[1], PADDING, cell.height - PADDING - subject.height)
    result = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    result.alpha_composite(subject, (left, top))
    return result


def rebuild(
    source_path: Path,
    current_name: str,
    output_path: Path,
    columns: int,
    cell_width: int,
    preserved_cells: set[tuple[int, int]],
) -> None:
    source = Image.open(source_path).convert("RGBA")
    current = Image.open(CURRENT / current_name).convert("RGBA")
    components = alpha_components(source)
    output = Image.new("RGBA", (columns * cell_width, ROWS * CELL_HEIGHT), (0, 0, 0, 0))
    for row in range(ROWS):
        for column in range(columns):
            if (row, column) in preserved_cells:
                box = (column * cell_width, row * CELL_HEIGHT, (column + 1) * cell_width, (row + 1) * CELL_HEIGHT)
                cell = fit_existing_cell(current.crop(box))
            else:
                cell = render_cell(source, components, columns, column, row, cell_width)
            output.alpha_composite(cell, (column * cell_width, row * CELL_HEIGHT))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path)
    print(output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roles", type=Path, required=True)
    parser.add_argument("--weapons", type=Path, required=True)
    parser.add_argument("--raiders", type=Path, required=True)
    parser.add_argument("--court", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    rebuild(args.roles, "defender-roles-poses-v2.png", args.out_dir / "defender-roles-poses-v2.png", 8, 84, set())
    rebuild(
        args.weapons,
        "defender-weapons-poses-v2.png",
        args.out_dir / "defender-weapons-poses-v2.png",
        6,
        84,
        {(1, 0), (1, 1), (1, 4), (1, 5)},
    )
    rebuild(args.raiders, "faction-raiders-poses-v2.png", args.out_dir / "faction-raiders-poses-v2.png", 6, 168, set())
    rebuild(
        args.court,
        "court-army-poses-v2.png",
        args.out_dir / "court-army-poses-v2.png",
        5,
        168,
        {(1, 0), (1, 4)},
    )


if __name__ == "__main__":
    main()
