from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "public" / "assets" / "tactical" / "defender-weapons-poses-v2.png"
CELL_WIDTH = 84
CELL_HEIGHT = 120


def replace_patch(target: Image.Image, source: Image.Image, box: tuple[int, int, int, int]) -> None:
    target.paste((0, 0, 0, 0), box)
    target.alpha_composite(source.crop(box), (box[0], box[1]))


def reflow_subject(source: Image.Image, left: int, right: int) -> Image.Image:
    subject_band = source.crop((left, 0, right, source.height))
    bbox = subject_band.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"empty generated subject band {left}:{right}")
    subject = subject_band.crop(bbox)
    target_height = max(1, round(subject.height * CELL_HEIGHT / source.height))
    subject = subject.resize((80, target_height), Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    top = round(bbox[1] * CELL_HEIGHT / source.height)
    cell.alpha_composite(subject, (2, top))
    return cell


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--replace-whole-cells", action="store_true")
    parser.add_argument("--reflow-subjects", action="store_true")
    args = parser.parse_args()

    atlas = Image.open(ASSET).convert("RGBA")
    generated_source = Image.open(args.source).convert("RGBA")
    generated = generated_source.resize(
        (CELL_WIDTH * 3, CELL_HEIGHT),
        Image.Resampling.LANCZOS,
    )
    attack = atlas.crop((0, CELL_HEIGHT, CELL_WIDTH * 3, CELL_HEIGHT * 2))

    if args.reflow_subjects:
        attack.paste((0, 0, 0, 0), (0, 0, CELL_WIDTH * 2, CELL_HEIGHT))
        attack.alpha_composite(reflow_subject(generated_source, 5, 641), (0, 0))
        attack.alpha_composite(reflow_subject(generated_source, 674, 1272), (CELL_WIDTH, 0))
    elif args.replace_whole_cells:
        replace_patch(attack, generated, (0, 0, CELL_WIDTH, CELL_HEIGHT))
        replace_patch(attack, generated, (CELL_WIDTH, 0, CELL_WIDTH * 2, CELL_HEIGHT))
    else:
        # Preserve the original faces, torsos, hands and weapons. Only the clipped
        # rear leg/foot areas come from the repaired edit.
        replace_patch(attack, generated, (52, 68, 84, 120))
        replace_patch(attack, generated, (CELL_WIDTH + 58, 78, CELL_WIDTH * 2, 120))

    # The fragment in this corner belongs to the preceding female spearman.
    attack.paste((0, 0, 0, 0), (CELL_WIDTH * 2, 84, CELL_WIDTH * 2 + 12, 120))

    atlas.paste((0, 0, 0, 0), (0, CELL_HEIGHT, CELL_WIDTH * 3, CELL_HEIGHT * 2))
    atlas.alpha_composite(attack, (0, CELL_HEIGHT))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.out)
    print(args.out)


if __name__ == "__main__":
    main()
