from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "render" / "generated" / "livestock-overworld-v1" / "raw-sheet.png"
OUTPUT = ROOT / "tools" / "render" / "generated" / "livestock-overworld-v1" / "raw-sheet-regridded.png"

# Image generation kept all five silhouettes intact but did not honor the exact
# equal-cell centers. These cuts sit in the visible magenta gaps between animals.
CUT_RATIOS = (0.0, 0.165, 0.33, 0.52, 0.75, 1.0)
CELL_WIDTH = 512


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    sheet = Image.new("RGB", (CELL_WIDTH * 5, source.height), (255, 0, 255))
    for index in range(5):
        left = round(source.width * CUT_RATIOS[index])
        right = round(source.width * CUT_RATIOS[index + 1])
        crop = source.crop((left, 0, right, source.height))
        if crop.width > CELL_WIDTH:
            raise ValueError(f"livestock crop {index} is wider than the target cell")
        sheet.paste(crop, (index * CELL_WIDTH + (CELL_WIDTH - crop.width) // 2, 0))
    sheet.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
