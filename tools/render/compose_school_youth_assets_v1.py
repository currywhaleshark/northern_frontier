from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "public" / "assets"
GENERATED_DIR = ROOT / "tools" / "render" / "generated"
SCHOOL_DIR = GENERATED_DIR / "school-building-v1"
RESIDENT_DIR = GENERATED_DIR / "teacher-youth-residents-skirts-v1"


def load_rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def load_frame(directory: Path, number: int) -> Image.Image:
    image = load_rgba(directory / f"sheet-{number}.png")
    if image.getchannel("A").getbbox() is None:
        raise ValueError(f"empty sprite frame: {directory.name}/sheet-{number}.png")
    return image


def alpha_crop(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("sprite frame has no opaque pixels")
    return image.crop(bbox)


def common_scale(images: list[Image.Image], max_width: int, max_height: int) -> float:
    crops = [alpha_crop(image) for image in images]
    return min(
        max_width / max(crop.width for crop in crops),
        max_height / max(crop.height for crop in crops),
    )


def fit_with_scale(
    image: Image.Image,
    width: int,
    height: int,
    scale: float,
    bottom_padding: int = 1,
) -> Image.Image:
    crop = alpha_crop(image)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    output.alpha_composite(
        resized,
        ((width - resized.width) // 2, height - resized.height - bottom_padding),
    )
    return output


def compose_buildings(cell_width: int, cell_height: int, old_name: str, new_name: str) -> None:
    old = load_rgba(ASSET_DIR / old_name)
    if old.size != (7 * cell_width, 2 * cell_height):
        raise ValueError(f"unexpected legacy atlas size: {old_name} {old.size}")

    output = Image.new("RGBA", (8 * cell_width, 2 * cell_height), (0, 0, 0, 0))
    output.alpha_composite(old, (0, 0))
    school_pair = [load_frame(SCHOOL_DIR, 1), load_frame(SCHOOL_DIR, 2)]
    scale = common_scale(school_pair, cell_width - 2, cell_height - 3)
    for row, frame in enumerate(school_pair):
        cell = fit_with_scale(frame, cell_width, cell_height, scale)
        output.alpha_composite(cell, (7 * cell_width, row * cell_height))
    output.save(ASSET_DIR / new_name)


def compose_residents() -> None:
    old = load_rgba(ASSET_DIR / "new-content-residents-v1.png")
    if old.size != (56, 120):
        raise ValueError(f"unexpected legacy resident atlas size: {old.size}")

    # Generated sheet order: teachers M/F, then youth idle, hauler, farmer,
    # wood splitter, and herder M/F. Blank layout cells are intentionally skipped.
    frame_numbers = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    frames = [load_frame(RESIDENT_DIR, number) for number in frame_numbers]
    scale = common_scale(frames, max_width=24, max_height=36)
    output = Image.new("RGBA", (56, 360), (0, 0, 0, 0))
    output.alpha_composite(old, (0, 0))
    for index, frame in enumerate(frames):
        row = 3 + index // 2
        column = index % 2
        cell = fit_with_scale(frame, 28, 40, scale)
        output.alpha_composite(cell, (column * 28, row * 40))
    output.save(ASSET_DIR / "new-content-residents-v2.png")


def main() -> None:
    compose_buildings(
        28,
        40,
        "new-content-buildings-v1.png",
        "new-content-buildings-v2.png",
    )
    compose_buildings(
        56,
        80,
        "new-content-buildings-large-v1.png",
        "new-content-buildings-large-v2.png",
    )
    compose_residents()
    print("wrote school building and teacher/youth resident v2 atlases")


if __name__ == "__main__":
    main()
