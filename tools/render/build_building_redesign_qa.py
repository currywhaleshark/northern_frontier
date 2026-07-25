from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ATLAS = ROOT / "public" / "assets" / "oblique-buildings-2x2-v1-hd.png"
OUTPUT = ROOT / "tools" / "render" / "generated" / "building-redesign-v2" / "qa-contact-hd.png"

CELL = (112, 160)
COLUMNS = (16, 21, 22, 23)  # beacon, shrine, hermitage, cannonEmplacement
SCALE = 3
GAP = 12


def main() -> None:
    atlas = Image.open(ATLAS).convert("RGBA")
    output = Image.new(
        "RGBA",
        (
            len(COLUMNS) * CELL[0] * SCALE + (len(COLUMNS) + 1) * GAP,
            2 * CELL[1] * SCALE + 3 * GAP,
        ),
        (43, 38, 34, 255),
    )
    for row in range(2):
        for visual_column, atlas_column in enumerate(COLUMNS):
            left = atlas_column * CELL[0]
            top = row * CELL[1]
            frame = atlas.crop((left, top, left + CELL[0], top + CELL[1]))
            frame = frame.resize(
                (CELL[0] * SCALE, CELL[1] * SCALE),
                Image.Resampling.NEAREST,
            )
            x = GAP + visual_column * (CELL[0] * SCALE + GAP)
            y = GAP + row * (CELL[1] * SCALE + GAP)
            output.alpha_composite(frame, (x, y))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
