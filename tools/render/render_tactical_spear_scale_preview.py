from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "public" / "assets" / "tactical" / "defender-weapons-poses-v2.png"
OUTPUT = ROOT / "tmp" / "tactical-spear-scale-preview-v2.png"
CELL_WIDTH = 84
CELL_HEIGHT = 120
SLOT_WIDTH = 126
SLOT_HEIGHT = 154
BASELINE = 142


def cell(column: int, row: int) -> Image.Image:
    atlas = Image.open(ASSET).convert("RGBA")
    return atlas.crop((column * CELL_WIDTH, row * CELL_HEIGHT, (column + 1) * CELL_WIDTH, (row + 1) * CELL_HEIGHT))


def draw_sprite(canvas: Image.Image, sprite: Image.Image, slot: int, scale: float, label: str) -> None:
    scaled = sprite.resize(
        (round(sprite.width * scale), round(sprite.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = slot * SLOT_WIDTH + (SLOT_WIDTH - scaled.width) // 2
    top = BASELINE - scaled.height
    canvas.alpha_composite(scaled, (left, top))
    draw = ImageDraw.Draw(canvas)
    draw.text((slot * SLOT_WIDTH + 6, 6), label, fill=(236, 229, 207, 255))
    draw.line(
        (slot * SLOT_WIDTH + 4, BASELINE, (slot + 1) * SLOT_WIDTH - 4, BASELINE),
        fill=(81, 196, 225, 180),
        width=1,
    )


def main() -> None:
    rows = [
        (0, "male idle"),
        (1, "male attack"),
        (0, "female idle"),
        (1, "female attack"),
    ]
    preview = Image.new("RGBA", (SLOT_WIDTH * 4, SLOT_HEIGHT * len(rows)), (34, 38, 42, 255))
    for row_index, (pose_row, label) in enumerate(rows):
        row_canvas = Image.new("RGBA", (preview.width, SLOT_HEIGHT), (34, 38, 42, 255))
        gender_offset = 1 if "female" in label else 0
        draw_sprite(row_canvas, cell(gender_offset, pose_row), 0, 1, "spear 1.00")
        draw_sprite(row_canvas, cell(gender_offset, pose_row), 1, 1.08, "spear 1.08")
        draw_sprite(row_canvas, cell(2 + gender_offset, pose_row), 2, 1, "horn bow")
        draw_sprite(row_canvas, cell(4 + gender_offset, pose_row), 3, 1, "musket")
        ImageDraw.Draw(row_canvas).text((4, 20), label, fill=(255, 192, 92, 255))
        preview.alpha_composite(row_canvas, (0, row_index * SLOT_HEIGHT))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    preview.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
