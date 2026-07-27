from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RUN_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "exports"
    / "i2v-character-references-2026-07-24"
    / "00_job-base-generation-v2"
)
ALPHA_ROOT = RUN_ROOT / "prepared-alpha"
OUTPUT_ROOT = RUN_ROOT / "prepared"
MAGENTA = (255, 0, 255, 255)
MAX_SUBJECT_HEIGHT_RATIO = 0.65

CHARACTERS = (
    "physician_male",
    "physician_female",
    "potter_male",
    "potter_female",
    "curer_male",
    "curer_female",
    "miller_male",
    "miller_female",
    "undertaker_male",
    "undertaker_female",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def alpha_bbox(image: Image.Image, threshold: int = 16) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value >= threshold else 0).getbbox()
    if bbox is None:
        raise ValueError("empty subject alpha")
    return bbox


def normalize(character: str) -> dict[str, object]:
    source = ALPHA_ROOT / f"{character}.png"
    if not source.exists():
        raise FileNotFoundError(source)

    image = Image.open(source).convert("RGBA")
    bbox = alpha_bbox(image)
    subject_width = bbox[2] - bbox[0]
    subject_height = bbox[3] - bbox[1]

    # Preserve every generated subject pixel. If a figure occupies too much of
    # the source canvas, add only solid-magenta vertical space until all jobs
    # share the same maximum relative height. Horizontal source padding is
    # already generous and is retained byte-for-byte through alpha compositing.
    target_height = max(
        image.height,
        math.ceil(subject_height / MAX_SUBJECT_HEIGHT_RATIO),
    )
    offset_y = (target_height - image.height) // 2
    canvas = Image.new("RGBA", (image.width, target_height), MAGENTA)
    canvas.alpha_composite(image, (0, offset_y))
    output = canvas.convert("RGB")

    destination = OUTPUT_ROOT / f"{character}.png"
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    output.save(destination, format="PNG", optimize=False)

    final_bbox = (
        bbox[0],
        bbox[1] + offset_y,
        bbox[2],
        bbox[3] + offset_y,
    )
    border_points = (
        (0, 0),
        (output.width - 1, 0),
        (0, output.height - 1),
        (output.width - 1, output.height - 1),
    )
    if any(output.getpixel(point) != MAGENTA[:3] for point in border_points):
        raise AssertionError(f"non-magenta border in {destination}")

    return {
        "character": character,
        "source": str(source.relative_to(ROOT)).replace("\\", "/"),
        "output": str(destination.relative_to(ROOT)).replace("\\", "/"),
        "source_sha256": sha256(source),
        "output_sha256": sha256(destination),
        "canvas": {"width": output.width, "height": output.height},
        "subject_bbox": list(final_bbox),
        "subject": {"width": subject_width, "height": subject_height},
        "margins": {
            "left": final_bbox[0],
            "right": output.width - final_bbox[2],
            "top": final_bbox[1],
            "bottom": output.height - final_bbox[3],
        },
        "subject_height_ratio": round(subject_height / output.height, 6),
        "resampled": False,
        "background_rgb": list(MAGENTA[:3]),
    }


def main() -> None:
    records = [normalize(character) for character in CHARACTERS]
    report = {
        "version": 1,
        "kind": "generated-i2v-job-base-normalization",
        "max_subject_height_ratio": MAX_SUBJECT_HEIGHT_RATIO,
        "resampling": "none",
        "background_rgb": list(MAGENTA[:3]),
        "characters": records,
    }
    report_path = RUN_ROOT / "prepare-report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"prepared={len(records)}")
    print(f"folder={OUTPUT_ROOT}")
    print(f"report={report_path}")


if __name__ == "__main__":
    main()
