from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw


KEY = (255, 0, 255)
FISHING_NAMES = (
    "ne-fishing.png",
    "ne-sea-winter-fishing.png",
    "sw-fishing.png",
    "sw-sea-winter-fishing.png",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove gradient magenta from fishing boats and audit fine net mesh preservation."
    )
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--sprite-gen-root", type=Path, required=True)
    parser.add_argument("--mode", choices=("rgb", "ycbcr"), default="ycbcr")
    parser.add_argument("--threshold", type=float, default=96.0)
    parser.add_argument("--island-max", type=int, default=0)
    parser.add_argument("--post-tint", type=float, default=0.0)
    parser.add_argument("--post-distance", type=float, default=0.0)
    parser.add_argument("--names", help="Comma-separated subset of fishing PNG names")
    return parser.parse_args()


def rgb_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> float:
    return math.sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def net_roi(name: str, size: tuple[int, int]) -> tuple[int, int, int, int]:
    width, height = size
    if name.startswith("ne-"):
        fractions = (0.52, 0.55, 0.91, 0.995)
    else:
        fractions = (0.43, 0.50, 0.91, 0.995)
    return (
        round(width * fractions[0]),
        round(height * fractions[1]),
        round(width * fractions[2]),
        round(height * fractions[3]),
    )


def clear_hidden_rgb(image: Image.Image) -> None:
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0 and (red or green or blue):
                pixels[x, y] = (0, 0, 0, 0)


def remove_small_alpha_islands(image: Image.Image, max_pixels: int) -> tuple[int, int]:
    if max_pixels <= 0:
        return (0, 0)
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    removed_components = 0
    removed_pixels = 0
    for start_y in range(height):
        for start_x in range(width):
            start = start_y * width + start_x
            if visited[start] or pixels[start_x, start_y][3] <= 8:
                continue
            stack = [(start_x, start_y)]
            visited[start] = 1
            component: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for offset_y in (-1, 0, 1):
                    for offset_x in (-1, 0, 1):
                        if offset_x == 0 and offset_y == 0:
                            continue
                        neighbor_x = x + offset_x
                        neighbor_y = y + offset_y
                        if not (0 <= neighbor_x < width and 0 <= neighbor_y < height):
                            continue
                        neighbor = neighbor_y * width + neighbor_x
                        if visited[neighbor] or pixels[neighbor_x, neighbor_y][3] <= 8:
                            continue
                        visited[neighbor] = 1
                        stack.append((neighbor_x, neighbor_y))
            if len(component) <= max_pixels:
                removed_components += 1
                removed_pixels += len(component)
                for x, y in component:
                    pixels[x, y] = (0, 0, 0, 0)
    return removed_components, removed_pixels


def remove_remaining_key_tint(
    source: Image.Image,
    result: Image.Image,
    min_tint: float,
    max_distance: float,
) -> int:
    if min_tint <= 0 or max_distance <= 0:
        return 0
    source_pixels = source.convert("RGB").load()
    result_pixels = result.load()
    removed = 0
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = result_pixels[x, y]
            if alpha <= 8:
                continue
            source_red, source_green, source_blue = source_pixels[x, y]
            tint = (source_red + source_blue) / 2 - source_green
            if tint >= min_tint and rgb_distance((source_red, source_green, source_blue), KEY) <= max_distance:
                result_pixels[x, y] = (0, 0, 0, 0)
                removed += 1
    return removed


def composite(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    plate = Image.new("RGBA", image.size, color + (255,))
    plate.alpha_composite(image)
    return plate.convert("RGB")


def checkerboard(size: tuple[int, int], cell: int = 24) -> Image.Image:
    board = Image.new("RGBA", size, (226, 226, 226, 255))
    draw = ImageDraw.Draw(board)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(168, 168, 168, 255))
    return board


def runtime_preview(image: Image.Image, size: int = 112, zoom: int = 4) -> Image.Image:
    alpha_box = image.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError("cannot preview an empty image")
    cropped = image.crop(alpha_box)
    max_content = size - 8
    scale = min(max_content / cropped.width, max_content / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    plate = Image.new("RGBA", (size, size), (55, 128, 153, 255))
    plate.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return plate.convert("RGB").resize((size * zoom, size * zoom), Image.Resampling.NEAREST)


def is_key_family(red: int, green: int, blue: int) -> bool:
    return red >= 110 and blue >= 110 and green <= 110 and red - green >= 45 and blue - green >= 45


def audit(
    source: Image.Image,
    result: Image.Image,
    roi: tuple[int, int, int, int],
    core_distance: float,
) -> dict[str, float | int]:
    source_pixels = source.convert("RGB").load()
    result_pixels = result.load()
    exact_key = 0
    exact_key_cleared = 0
    source_key_family = 0
    source_key_family_cleared = 0
    core = 0
    core_kept = 0
    core_opaque = 0
    residual_key_family = 0
    visible = 0

    for y in range(roi[1], roi[3]):
        for x in range(roi[0], roi[2]):
            source_rgb = source_pixels[x, y]
            red, green, blue, alpha = result_pixels[x, y]
            if source_rgb == KEY:
                exact_key += 1
                if alpha == 0:
                    exact_key_cleared += 1
            if is_key_family(*source_rgb):
                source_key_family += 1
                if alpha <= 8:
                    source_key_family_cleared += 1
            distance = rgb_distance(source_rgb, KEY)
            if distance >= core_distance:
                core += 1
                if alpha > 0:
                    core_kept += 1
                if alpha >= 240:
                    core_opaque += 1
            if alpha > 8:
                visible += 1
                if is_key_family(red, green, blue):
                    residual_key_family += 1

    roi_area = (roi[2] - roi[0]) * (roi[3] - roi[1])
    return {
        "roi_area": roi_area,
        "exact_key_pixels": exact_key,
        "exact_key_cleared_pct": round(exact_key_cleared * 100 / exact_key, 5) if exact_key else 100.0,
        "source_key_family_pixels": source_key_family,
        "source_key_family_cleared_pct": (
            round(source_key_family_cleared * 100 / source_key_family, 5) if source_key_family else 100.0
        ),
        "core_net_pixels": core,
        "core_net_kept_pct": round(core_kept * 100 / core, 5) if core else 100.0,
        "core_net_opaque_pct": round(core_opaque * 100 / core, 5) if core else 100.0,
        "visible_pixels": visible,
        "residual_key_family_pixels": residual_key_family,
        "residual_key_family_pct": round(residual_key_family * 100 / roi_area, 5) if roi_area else 0.0,
    }


def main() -> int:
    args = parse_args()
    sys.path.insert(0, str(args.sprite_gen_root))
    from sprite_gen.extract import remove_chroma_background, remove_chroma_background_ycbcr

    args.out_dir.mkdir(parents=True, exist_ok=False)
    qa_dir = args.out_dir / "qa"
    qa_dir.mkdir()
    report: dict[str, object] = {
        "kind": "fishing-boat-chroma-qa",
        "mode": args.mode,
        "key": list(KEY),
        "threshold": args.threshold if args.mode == "rgb" else None,
        "island_max": args.island_max,
        "post_tint": args.post_tint,
        "post_distance": args.post_distance,
        "files": {},
        "ok": True,
    }

    names = tuple(part.strip() for part in args.names.split(",")) if args.names else FISHING_NAMES
    for name in names:
        source_path = args.source_dir / name
        with Image.open(source_path) as opened:
            source = opened.convert("RGBA")
        warnings: list[str] = []
        if args.mode == "ycbcr":
            result = remove_chroma_background_ycbcr(source, KEY, warnings)
        else:
            result = remove_chroma_background(
                source,
                KEY,
                args.threshold,
                max(220.0, args.threshold + 40.0),
                18.0,
                unmix_reach=6,
                spill_max_fraction=0.01,
            )
        removed_tinted_pixels = remove_remaining_key_tint(
            source, result, args.post_tint, args.post_distance
        )
        removed_components, removed_pixels = remove_small_alpha_islands(result, args.island_max)
        clear_hidden_rgb(result)
        out_path = args.out_dir / name
        result.save(out_path)

        roi = net_roi(name, result.size)
        core_distance = max(230.0, args.threshold + 40.0) if args.mode == "rgb" else 230.0
        metrics = audit(source, result, roi, core_distance)
        metrics["core_distance"] = core_distance
        metrics["removed_island_components"] = removed_components
        metrics["removed_island_pixels"] = removed_pixels
        metrics["removed_tinted_pixels"] = removed_tinted_pixels
        metrics["warnings"] = warnings
        metrics["roi"] = list(roi)
        metrics["ok"] = (
            metrics["source_key_family_cleared_pct"] >= 99.9
            and metrics["core_net_kept_pct"] >= 99.99
            and metrics["residual_key_family_pct"] <= 0.01
        )
        report["files"][name] = metrics
        report["ok"] = bool(report["ok"] and metrics["ok"])

        for label, color in (("cyan", (0, 255, 255)), ("yellow", (255, 255, 0)), ("white", (255, 255, 255))):
            check = composite(result, color).crop(roi)
            check.resize((check.width * 2, check.height * 2), Image.Resampling.NEAREST).save(
                qa_dir / f"{Path(name).stem}-net-{label}-2x.png"
            )
        board = checkerboard(result.size)
        board.alpha_composite(result)
        check = board.convert("RGB").crop(roi)
        check.resize((check.width * 2, check.height * 2), Image.Resampling.NEAREST).save(
            qa_dir / f"{Path(name).stem}-net-checker-2x.png"
        )
        runtime_preview(result).save(qa_dir / f"{Path(name).stem}-runtime-water-4x.png")

    report_path = args.out_dir / "chroma-qa.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
