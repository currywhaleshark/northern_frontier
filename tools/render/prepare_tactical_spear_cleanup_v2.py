from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "public" / "assets" / "tactical" / "defender-weapons-poses-v2.png"
OUTPUT = ROOT / "tmp" / "imagegen" / "tactical-spear-cleanup-v2"
CELL_WIDTH = 84
CELL_HEIGHT = 120
MAGENTA = (255, 0, 255, 255)


def main() -> None:
    atlas = Image.open(ASSET).convert("RGBA")
    attack = atlas.crop((0, CELL_HEIGHT, CELL_WIDTH * 3, CELL_HEIGHT * 2))
    target = Image.new("RGBA", attack.size, MAGENTA)
    target.alpha_composite(attack)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target.convert("RGB").save(OUTPUT / "spear-attack-cleanup-target.png")
    print(OUTPUT / "spear-attack-cleanup-target.png")


if __name__ == "__main__":
    main()
