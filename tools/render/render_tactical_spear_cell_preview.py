import argparse
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "public" / "assets" / "tactical" / "defender-weapons-poses-v2.png"
OUTPUT = ROOT / "tmp" / "tactical-spear-cell-preview.png"
CELL_WIDTH = 84
CELL_HEIGHT = 120
SCALE = 5


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=ASSET)
    parser.add_argument("--out", type=Path, default=OUTPUT)
    args = parser.parse_args()
    atlas = Image.open(args.source).convert("RGBA")
    attack = atlas.crop((0, CELL_HEIGHT, CELL_WIDTH * 3, CELL_HEIGHT * 2))
    attack = attack.resize((attack.width * SCALE, attack.height * SCALE), Image.Resampling.NEAREST)
    preview = Image.new("RGBA", attack.size, (34, 38, 42, 255))
    preview.alpha_composite(attack)
    draw = ImageDraw.Draw(preview)
    labels = ("male spear", "female spear", "male horn bow")
    for column, label in enumerate(labels):
        x = column * CELL_WIDTH * SCALE
        draw.rectangle((x, 0, x + CELL_WIDTH * SCALE - 1, CELL_HEIGHT * SCALE - 1), outline=(255, 72, 72, 255), width=2)
        draw.text((x + 8, 8), label, fill=(245, 236, 214, 255))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    preview.save(args.out)
    print(args.out)


if __name__ == "__main__":
    main()
