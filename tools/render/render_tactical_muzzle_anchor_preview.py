from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "public" / "assets" / "tactical"
OUTPUT = ROOT / "tmp" / "tactical-muzzle-anchor-preview-v2.png"
SCALE = 4


def attack_cell(name: str, columns: int, column: int) -> Image.Image:
    image = Image.open(ASSETS / name).convert("RGBA")
    width = image.width // columns
    return image.crop((column * width, 120, (column + 1) * width, 240))


def marked(cell: Image.Image, anchor: tuple[int, int], flash_length: int) -> Image.Image:
    enlarged = cell.resize((cell.width * SCALE, cell.height * SCALE), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", enlarged.size, (36, 40, 44, 255))
    canvas.alpha_composite(enlarged)
    draw = ImageDraw.Draw(canvas)
    x, y = anchor[0] * SCALE, anchor[1] * SCALE
    draw.line((x - flash_length * SCALE, y, x, y), fill=(255, 181, 42, 230), width=3 * SCALE)
    draw.ellipse((x - 4 * SCALE, y - 4 * SCALE, x + 4 * SCALE, y + 4 * SCALE), outline=(63, 235, 255, 255), width=2 * SCALE)
    draw.line((x - 7 * SCALE, y, x + 7 * SCALE, y), fill=(63, 235, 255, 255), width=SCALE)
    draw.line((x, y - 7 * SCALE, x, y + 7 * SCALE), fill=(63, 235, 255, 255), width=SCALE)
    return canvas


def opaque_runs(cell: Image.Image, y: int) -> list[tuple[int, int]]:
    alpha = cell.getchannel("A")
    opaque = [x for x in range(cell.width) if alpha.getpixel((x, y)) > 40]
    runs: list[tuple[int, int]] = []
    for x in opaque:
        if not runs or x > runs[-1][1] + 1:
            runs.append((x, x))
        else:
            runs[-1] = (runs[-1][0], x)
    return runs


def main() -> None:
    entries = [
        (attack_cell("defender-weapons-poses-v2.png", 6, 4), (17, 47), 20),
        (attack_cell("defender-weapons-poses-v2.png", 6, 5), (19, 47), 20),
        (attack_cell("court-army-poses-v2.png", 5, 0), (50, 57), 24),
        (attack_cell("court-army-poses-v2.png", 5, 4), (58, 72), 38),
        (attack_cell("special-resident-combat-poses-v1.png", 4, 3), (4, 60), 20),
    ]
    gap = 16
    width = sum(item[0].width * SCALE for item in entries) + gap * (len(entries) - 1)
    height = max(item[0].height * SCALE for item in entries)
    preview = Image.new("RGBA", (width, height), (25, 28, 31, 255))
    x = 0
    for cell, anchor, flash_length in entries:
        print(anchor, opaque_runs(cell, anchor[1]))
        item = marked(cell, anchor, flash_length)
        preview.alpha_composite(item, (x, 0))
        x += item.width + gap
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    preview.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
