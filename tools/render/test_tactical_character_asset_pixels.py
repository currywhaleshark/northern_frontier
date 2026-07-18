import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSETS = ROOT / "public" / "assets" / "tactical"
PARSER = argparse.ArgumentParser()
PARSER.add_argument(
    "--assets-dir",
    type=Path,
    default=DEFAULT_ASSETS,
)
ASSETS = PARSER.parse_args().assets_dir


def asset_path(name: str) -> Path:
    candidate = ASSETS / name
    return candidate if candidate.exists() else DEFAULT_ASSETS / name


def assert_sheet(name: str, size: tuple[int, int], columns: int, rows: int) -> None:
    image = Image.open(asset_path(name)).convert("RGBA")
    assert image.size == size, (name, image.size, size)
    cell_width = image.width // columns
    cell_height = image.height // rows
    for row in range(rows):
        for column in range(columns):
            cell = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            assert cell.getchannel("A").getbbox() is not None, (name, row, column)


def attack_cell(name: str, columns: int, column: int) -> Image.Image:
    image = Image.open(asset_path(name)).convert("RGBA")
    cell_width = image.width // columns
    cell_height = image.height // 4
    return image.crop((column * cell_width, cell_height, (column + 1) * cell_width, 2 * cell_height))


def assert_no_baked_flash(name: str, columns: int, column: int, muzzle_x: int) -> None:
    cell = attack_cell(name, columns, column)
    pixels = cell.crop((0, 0, muzzle_x, cell.height)).get_flattened_data()
    fire_pixels = sum(1 for red, green, blue, alpha in pixels
                      if alpha > 16 and red > 238 and green > 115 and blue < 125)
    assert fire_pixels == 0, (name, column, "baked muzzle flash pixels", fire_pixels)


def assert_clear_attack_cell_top(name: str, columns: int, column: int, height: int = 18) -> None:
    cell = attack_cell(name, columns, column)
    assert cell.crop((0, 0, cell.width, height)).getchannel("A").getbbox() is None, (name, column, "row bleed")


def assert_muzzle_anchor_touches_sprite(name: str, columns: int, column: int, x: int, y: int) -> None:
    alpha = attack_cell(name, columns, column).getchannel("A")
    assert alpha.getpixel((x, y)) > 40, (name, column, "detached muzzle anchor", x, y)


def assert_no_lower_right_cell_clip(name: str, columns: int, column: int) -> None:
    cell = attack_cell(name, columns, column)
    alpha = cell.getchannel("A")
    assert alpha.crop((cell.width - 1, 82, cell.width, cell.height)).getbbox() is None, (
        name, column, "rear foot clipped by right cell edge",
    )
    restored_foot = alpha.crop((65, 82, cell.width - 1, cell.height)).get_flattened_data()
    assert sum(value > 40 for value in restored_foot) >= 35, (name, column, "rear foot missing")


def assert_clear_lower_left_cell(name: str, columns: int, column: int) -> None:
    cell = attack_cell(name, columns, column)
    assert cell.crop((0, 84, 12, cell.height)).getchannel("A").getbbox() is None, (
        name, column, "previous cell foot residue",
    )


def assert_pose_cell_padding(name: str, columns: int, rows: int = 4, padding: int = 1) -> None:
    image = Image.open(asset_path(name)).convert("RGBA")
    cell_width = image.width // columns
    cell_height = image.height // rows
    for row in range(rows):
        for column in range(columns):
            cell = image.crop((
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            ))
            alpha = cell.getchannel("A")
            inner = alpha.crop((padding, padding, cell_width - padding, cell_height - padding))
            outside_inner = alpha.copy()
            outside_inner.paste(0, (padding, padding, cell_width - padding, cell_height - padding))
            assert outside_inner.getbbox() is None, (name, row, column, "cell edge clipping or bleed")
            assert inner.getbbox() is not None, (name, row, column, "empty padded cell")


assert_sheet("folk-characters-tactical-v1.png", (1008, 240), 12, 2)
assert_sheet("militia-weapons-tactical-v1.png", (252, 240), 3, 2)
assert_sheet("faction-raiders-tactical-v1.png", (1008, 120), 6, 1)
assert_sheet("defender-roles-poses-v2.png", (672, 480), 8, 4)
assert_sheet("defender-healers-poses-v1.png", (168, 480), 2, 4)
assert_sheet("special-resident-combat-poses-v1.png", (336, 480), 4, 4)
assert_sheet("defender-weapons-poses-v2.png", (504, 480), 6, 4)
assert_sheet("faction-raiders-poses-v2.png", (1008, 480), 6, 4)
assert_sheet("court-army-poses-v2.png", (840, 480), 5, 4)
assert_no_baked_flash("defender-weapons-poses-v2.png", 6, 4, 17)
assert_no_baked_flash("defender-weapons-poses-v2.png", 6, 5, 19)
assert_no_baked_flash("court-army-poses-v2.png", 5, 0, 50)
assert_no_baked_flash("court-army-poses-v2.png", 5, 4, 58)
assert_muzzle_anchor_touches_sprite("defender-weapons-poses-v2.png", 6, 4, 17, 47)
assert_muzzle_anchor_touches_sprite("defender-weapons-poses-v2.png", 6, 5, 19, 47)
assert_muzzle_anchor_touches_sprite("special-resident-combat-poses-v1.png", 4, 3, 4, 60)
assert_muzzle_anchor_touches_sprite("court-army-poses-v2.png", 5, 0, 50, 57)
assert_muzzle_anchor_touches_sprite("court-army-poses-v2.png", 5, 4, 58, 72)
assert_clear_attack_cell_top("court-army-poses-v2.png", 5, 0)
assert_clear_attack_cell_top("court-army-poses-v2.png", 5, 4)
assert_no_lower_right_cell_clip("defender-weapons-poses-v2.png", 6, 0)
assert_no_lower_right_cell_clip("defender-weapons-poses-v2.png", 6, 1)
assert_clear_lower_left_cell("defender-weapons-poses-v2.png", 6, 2)
assert_pose_cell_padding("defender-roles-poses-v2.png", 8)
assert_pose_cell_padding("defender-healers-poses-v1.png", 2)
assert_pose_cell_padding("special-resident-combat-poses-v1.png", 4)
assert_pose_cell_padding("defender-weapons-poses-v2.png", 6)
assert_pose_cell_padding("faction-raiders-poses-v2.png", 6)
assert_pose_cell_padding("court-army-poses-v2.png", 5)

print("tactical character asset pixel tests passed")
