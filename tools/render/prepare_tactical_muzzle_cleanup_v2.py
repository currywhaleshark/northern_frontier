from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets" / "tactical"
OUTPUT = ROOT / "tmp" / "imagegen" / "tactical-muzzle-cleanup-v2"
MAGENTA = (255, 0, 255, 255)


def flatten_on_magenta(source_name: str, output_name: str) -> None:
    source = Image.open(ASSETS / source_name).convert("RGBA")
    target = Image.new("RGBA", source.size, MAGENTA)
    target.alpha_composite(source)
    target.convert("RGB").save(OUTPUT / output_name)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    flatten_on_magenta("defender-weapons-poses-v2.png", "defender-weapons-cleanup-target.png")
    flatten_on_magenta("court-army-poses-v2.png", "court-army-cleanup-target.png")
    print(OUTPUT)


if __name__ == "__main__":
    main()
