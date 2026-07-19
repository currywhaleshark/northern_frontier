from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets" / "tactical"
OUTPUT = ROOT / "tmp" / "imagegen" / "tactical-poses-v2"
RESIDENT_WIDTH = 84
MOUNTED_WIDTH = 168
SPRITE_HEIGHT = 120


def cell(image: Image.Image, column: int, row: int, width: int) -> Image.Image:
    return image.crop((column * width, row * SPRITE_HEIGHT, (column + 1) * width, (row + 1) * SPRITE_HEIGHT))


def compose_roles() -> None:
    source = Image.open(ASSETS / "folk-characters-tactical-v1.png").convert("RGBA")
    output = Image.new("RGBA", (8 * RESIDENT_WIDTH, SPRITE_HEIGHT), (0, 0, 0, 0))
    role_columns = [0, 9, 8, 2]  # civilian, militia, watchman, hunter
    for role_index, source_column in enumerate(role_columns):
        for gender_row in range(2):
            output.alpha_composite(
                cell(source, source_column, gender_row, RESIDENT_WIDTH),
                ((role_index * 2 + gender_row) * RESIDENT_WIDTH, 0),
            )
    output.save(OUTPUT / "defender-roles-idle-reference.png")


def compose_weapons() -> None:
    source = Image.open(ASSETS / "militia-weapons-tactical-v1.png").convert("RGBA")
    output = Image.new("RGBA", (6 * RESIDENT_WIDTH, SPRITE_HEIGHT), (0, 0, 0, 0))
    for weapon_column in range(3):
        for gender_row in range(2):
            output.alpha_composite(
                cell(source, weapon_column, gender_row, RESIDENT_WIDTH),
                ((weapon_column * 2 + gender_row) * RESIDENT_WIDTH, 0),
            )
    output.save(OUTPUT / "defender-weapons-idle-reference.png")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    compose_roles()
    compose_weapons()
    for source_name, output_name in (
        ("faction-raiders-tactical-v1.png", "faction-raiders-idle-reference.png"),
        ("court-army-tactical-v1.png", "court-army-idle-reference.png"),
    ):
        Image.open(ASSETS / source_name).convert("RGBA").save(OUTPUT / output_name)
    print(OUTPUT)


if __name__ == "__main__":
    main()
