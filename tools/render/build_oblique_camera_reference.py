from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tools" / "render" / "generated" / "buildings-oblique-v1"
OUTPUT = ROOT / "tools" / "render" / "generated" / "building-redesign-v2" / "camera-reference.png"

SOURCES = (
    SOURCE_ROOT / "2x2-a" / "normal-processed" / "building-1.png",
    SOURCE_ROOT / "2x2-b" / "normal-processed" / "building-5.png",
    SOURCE_ROOT / "2x2-c" / "normal-processed" / "building-2.png",
    SOURCE_ROOT / "2x2-c" / "normal-processed" / "building-3.png",
)


def main() -> None:
    canvas = Image.new("RGBA", (1024, 1024), (255, 0, 255, 255))
    for index, source_path in enumerate(SOURCES):
        source = Image.open(source_path).convert("RGBA")
        cell = Image.new("RGBA", (512, 512), (255, 0, 255, 255))
        cell.alpha_composite(source)
        canvas.alpha_composite(cell, ((index % 2) * 512, (index // 2) * 512))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
