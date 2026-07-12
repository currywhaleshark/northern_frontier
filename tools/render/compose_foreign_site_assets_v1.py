from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"
RESIDENT_SOURCE = SOURCE_DIR / "foreign-residents-clean-v1.png"
BUILDING_SOURCE = SOURCE_DIR / "foreign-buildings-clean-v2.png"
RESIDENT_OUTPUT = ROOT / "public" / "assets" / "foreign-residents-v1.png"
CORE_OUTPUT = ROOT / "public" / "assets" / "foreign-site-cores-v1.png"
PROP_OUTPUT = ROOT / "public" / "assets" / "foreign-site-props-v1.png"


def grid_box(image: Image.Image, columns: int, rows: int, column: int, row: int) -> tuple[int, int, int, int]:
    return (
        round(column * image.width / columns),
        round(row * image.height / rows),
        round((column + 1) * image.width / columns),
        round((row + 1) * image.height / rows),
    )


def fitted_cell(source: Image.Image, width: int, height: int, max_width: int, max_height: int) -> Image.Image:
    bbox = source.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source cell contains no visible pixels")
    crop = source.crop(bbox)
    scale = min(max_width / crop.width, max_height / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    cell = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = (width - resized.width) // 2
    y = height - resized.height
    cell.alpha_composite(resized, (x, y))
    return cell


def compose_residents() -> None:
    source = Image.open(RESIDENT_SOURCE).convert("RGBA")
    output = Image.new("RGBA", (4 * 28, 2 * 40), (0, 0, 0, 0))
    for row in range(2):
        for column in range(4):
            crop = source.crop(grid_box(source, 4, 2, column, row))
            output.alpha_composite(fitted_cell(crop, 28, 40, 24, 36), (column * 28, row * 40))
    RESIDENT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(RESIDENT_OUTPUT)


def compose_buildings() -> None:
    source = Image.open(BUILDING_SOURCE).convert("RGBA")
    cores = Image.new("RGBA", (5 * 56, 80), (0, 0, 0, 0))
    props = Image.new("RGBA", (5 * 28, 40), (0, 0, 0, 0))
    for column in range(5):
        core_crop = source.crop(grid_box(source, 5, 2, column, 0))
        prop_crop = source.crop(grid_box(source, 5, 2, column, 1))
        cores.alpha_composite(fitted_cell(core_crop, 56, 80, 54, 76), (column * 56, 0))
        props.alpha_composite(fitted_cell(prop_crop, 28, 40, 26, 36), (column * 28, 0))
    CORE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    cores.save(CORE_OUTPUT)
    props.save(PROP_OUTPUT)


def main() -> None:
    compose_residents()
    compose_buildings()
    print(f"wrote {RESIDENT_OUTPUT}")
    print(f"wrote {CORE_OUTPUT}")
    print(f"wrote {PROP_OUTPUT}")


if __name__ == "__main__":
    main()
