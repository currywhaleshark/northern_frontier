from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public" / "assets" / "wall-gate-v1.png"
PREVIEW = ROOT / "docs" / "assets" / "walls" / "wall-gate-v1-preview-8x.png"

TILE_SIZE = 28
SPRITE_HEIGHT = 40
SCALE = 8

OUTLINE = (28, 19, 14, 255)
SHADOW = (12, 9, 7, 150)
DARK = (63, 36, 20, 255)
MID = (121, 67, 31, 255)
MID_2 = (143, 79, 34, 255)
LIGHT = (190, 119, 55, 255)
HIGHLIGHT = (226, 157, 79, 255)
ROPE_DARK = (77, 52, 31, 255)
ROPE = (174, 116, 56, 255)
ROPE_LIGHT = (225, 166, 87, 255)
SNOW = (241, 238, 218, 255)
SNOW_SHADE = (186, 194, 192, 255)


def rect(draw: ImageDraw.ImageDraw, ox: int, oy: int, box: tuple[int, int, int, int], fill) -> None:
    x0, y0, x1, y1 = box
    draw.rectangle((ox + x0, oy + y0, ox + x1, oy + y1), fill=fill)


def line(
    draw: ImageDraw.ImageDraw,
    ox: int,
    oy: int,
    points: tuple[int, int, int, int],
    fill,
    width: int = 1,
) -> None:
    x0, y0, x1, y1 = points
    draw.line((ox + x0, oy + y0, ox + x1, oy + y1), fill=fill, width=width)


def ellipse(draw: ImageDraw.ImageDraw, ox: int, oy: int, box: tuple[int, int, int, int], fill) -> None:
    x0, y0, x1, y1 = box
    draw.ellipse((ox + x0, oy + y0, ox + x1, oy + y1), fill=fill)


def draw_log_cap(
    draw: ImageDraw.ImageDraw,
    ox: int,
    oy: int,
    cx: int,
    cy: int,
    rx: int,
    ry: int,
) -> None:
    ellipse(draw, ox, oy, (cx - rx, cy - ry, cx + rx, cy + ry), OUTLINE)
    ellipse(draw, ox, oy, (cx - rx + 1, cy - ry + 1, cx + rx - 1, cy + ry - 1), LIGHT)
    ellipse(draw, ox, oy, (cx - rx + 3, cy - ry + 2, cx + rx - 3, cy + ry - 2), (139, 84, 40, 255))
    line(draw, ox, oy, (cx - rx + 2, cy, cx + rx - 2, cy), HIGHLIGHT)
    line(draw, ox, oy, (cx, cy - ry + 2, cx, cy + ry - 2), (91, 55, 29, 255))


def draw_vertical_grain(
    draw: ImageDraw.ImageDraw,
    ox: int,
    oy: int,
    x_values: tuple[int, ...],
    top: int,
    bottom: int,
) -> None:
    for index, x in enumerate(x_values):
        color = (92, 50, 25, 255) if index % 2 == 0 else (170, 93, 41, 255)
        line(draw, ox, oy, (x, top, x + (index % 3) - 1, bottom), color)


def draw_rope_band(
    draw: ImageDraw.ImageDraw,
    ox: int,
    oy: int,
    left: int,
    right: int,
    y: int,
) -> None:
    rect(draw, ox, oy, (left, y, right, y + 4), ROPE_DARK)
    rect(draw, ox, oy, (left + 1, y + 1, right - 1, y + 2), ROPE)
    for x in range(left + 1, right - 2, 6):
        line(draw, ox, oy, (x, y + 4, x + 5, y), ROPE_LIGHT)
        line(draw, ox, oy, (x, y, x + 5, y + 4), ROPE_DARK)


def draw_horizontal_gate(draw: ImageDraw.ImageDraw, ox: int, oy: int, winter: bool) -> None:
    rect(draw, ox, oy, (3, 12, 25, 39), SHADOW)

    rect(draw, ox, oy, (2, 10, 8, 38), OUTLINE)
    rect(draw, ox, oy, (20, 10, 26, 38), OUTLINE)
    rect(draw, ox, oy, (3, 11, 7, 37), MID)
    rect(draw, ox, oy, (21, 11, 25, 37), MID)
    draw_vertical_grain(draw, ox, oy, (4, 6, 22, 24), 14, 36)
    draw_log_cap(draw, ox, oy, 5, 9, 5, 4)
    draw_log_cap(draw, ox, oy, 23, 9, 5, 4)

    rect(draw, ox, oy, (6, 14, 21, 38), OUTLINE)
    rect(draw, ox, oy, (7, 15, 13, 37), MID_2)
    rect(draw, ox, oy, (14, 15, 20, 37), MID)
    line(draw, ox, oy, (14, 15, 14, 38), DARK, 2)
    draw_vertical_grain(draw, ox, oy, (9, 12, 17, 19), 17, 36)

    rect(draw, ox, oy, (4, 12, 23, 17), OUTLINE)
    rect(draw, ox, oy, (5, 13, 22, 16), LIGHT)
    line(draw, ox, oy, (7, 14, 20, 14), HIGHLIGHT)
    draw_rope_band(draw, ox, oy, 4, 23, 23)
    draw_rope_band(draw, ox, oy, 5, 22, 31)

    rect(draw, ox, oy, (8, 36, 20, 39), DARK)
    line(draw, ox, oy, (3, 37, 24, 37), (216, 129, 57, 255))

    if winter:
        rect(draw, ox, oy, (2, 6, 9, 8), SNOW)
        rect(draw, ox, oy, (20, 6, 26, 8), SNOW)
        rect(draw, ox, oy, (5, 12, 22, 13), SNOW)
        line(draw, ox, oy, (6, 14, 21, 14), SNOW_SHADE)


def draw_vertical_gate(draw: ImageDraw.ImageDraw, ox: int, oy: int, winter: bool) -> None:
    rect(draw, ox, oy, (5, 8, 23, 39), SHADOW)

    rect(draw, ox, oy, (5, 15, 9, 33), OUTLINE)
    rect(draw, ox, oy, (19, 15, 23, 33), OUTLINE)
    rect(draw, ox, oy, (6, 16, 8, 32), (157, 99, 48, 255))
    rect(draw, ox, oy, (20, 16, 22, 32), (157, 99, 48, 255))

    rect(draw, ox, oy, (8, 7, 20, 39), OUTLINE)
    rect(draw, ox, oy, (9, 10, 19, 38), DARK)
    rect(draw, ox, oy, (10, 12, 13, 38), MID_2)
    rect(draw, ox, oy, (15, 12, 18, 38), MID)
    line(draw, ox, oy, (14, 11, 14, 39), OUTLINE)
    draw_vertical_grain(draw, ox, oy, (11, 13, 16, 18), 15, 36)

    draw_log_cap(draw, ox, oy, 14, 7, 7, 5)
    draw_log_cap(draw, ox, oy, 14, 14, 6, 4)
    draw_log_cap(draw, ox, oy, 14, 21, 6, 4)

    draw_rope_band(draw, ox, oy, 5, 23, 24)
    draw_rope_band(draw, ox, oy, 7, 21, 31)
    rect(draw, ox, oy, (10, 35, 18, 39), DARK)
    line(draw, ox, oy, (10, 37, 18, 37), (213, 126, 55, 255))

    if winter:
        rect(draw, ox, oy, (8, 4, 20, 6), SNOW)
        rect(draw, ox, oy, (9, 12, 19, 13), SNOW)
        line(draw, ox, oy, (9, 7, 19, 7), SNOW_SHADE)


def create_wall_gate_asset(output: Path = OUTPUT, preview: Path = PREVIEW) -> None:
    image = Image.new("RGBA", (TILE_SIZE * 2, SPRITE_HEIGHT * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw_horizontal_gate(draw, 0, 0, winter=False)
    draw_vertical_gate(draw, TILE_SIZE, 0, winter=False)
    draw_horizontal_gate(draw, 0, SPRITE_HEIGHT, winter=True)
    draw_vertical_gate(draw, TILE_SIZE, SPRITE_HEIGHT, winter=True)

    output.parent.mkdir(parents=True, exist_ok=True)
    preview.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    image.resize((image.width * SCALE, image.height * SCALE), Image.Resampling.NEAREST).save(preview)


if __name__ == "__main__":
    create_wall_gate_asset()
    print(f"wrote {OUTPUT}")
    print(f"wrote {PREVIEW}")
