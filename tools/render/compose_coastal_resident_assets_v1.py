from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "tools" / "render" / "source_images" / "coastal-f5-v1"
OUTPUT_ROOT = ROOT / "public" / "assets"


def export_salt_maker(gender: str) -> None:
    source = SOURCE_ROOT / f"salt-maker-{gender}-sheet-v1.png"
    image = Image.open(source).convert("RGBA")
    if image.size != (256, 256):
        raise ValueError(f"unexpected salt-maker sheet size: {source} = {image.size}")

    standard = OUTPUT_ROOT / f"resident-salt-maker-{gender}-v1.png"
    high_definition = OUTPUT_ROOT / f"resident-salt-maker-{gender}-hd-v1.png"
    image.save(standard)
    image.resize((512, 512), Image.Resampling.NEAREST).save(high_definition)
    print(standard.relative_to(ROOT))
    print(high_definition.relative_to(ROOT))


if __name__ == "__main__":
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    export_salt_maker("male")
    export_salt_maker("female")
