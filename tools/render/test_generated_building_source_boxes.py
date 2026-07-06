from pathlib import Path
import importlib.util

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "render" / "compose_generated_building_assets_v1.py"
SOURCE_DIR = ROOT / "tools" / "render" / "source_images"

spec = importlib.util.spec_from_file_location("compose_generated_building_assets_v1", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def test_detects_actual_building_boxes_instead_of_equal_grid() -> None:
    image = Image.open(SOURCE_DIR / "generated-buildings-normal-v1.png").convert("RGB")
    boxes = module.detect_contact_sheet_boxes(image, expected_columns=5, expected_rows=3)
    assert len(boxes) == 15

    fixed_cell_width = image.width // 5
    first_left, _first_top, first_right, _first_bottom = boxes[0]
    assert first_left < 30
    assert first_right > fixed_cell_width


def test_detects_top_down_field_boxes() -> None:
    image = Image.open(SOURCE_DIR / "generated-fields-topdown-v1.png").convert("RGB")
    boxes = module.detect_contact_sheet_boxes(image, expected_columns=4, expected_rows=1)
    assert len(boxes) == 4
    for left, top, right, bottom in boxes:
        assert right - left > 350
        assert bottom - top > 350


if __name__ == "__main__":
    test_detects_actual_building_boxes_instead_of_equal_grid()
    test_detects_top_down_field_boxes()
    print("generated building source box tests passed")
