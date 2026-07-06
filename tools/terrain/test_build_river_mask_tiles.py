import unittest

from . import build_river_mask_tiles as river


class RiverMaskTilesTest(unittest.TestCase):
    def test_defines_sixteen_connectors_and_four_seasons(self) -> None:
        self.assertEqual(16, len(river.CONNECTORS))
        self.assertEqual(("spring", "summer", "autumn", "winter"), river.SEASONS)
        self.assertEqual("vertical", river.CONNECTORS[0].key)
        self.assertEqual("horizontal", river.CONNECTORS[1].key)
        self.assertEqual("source", river.CONNECTORS[-1].key)

    def test_vertical_mask_opens_only_north_and_south(self) -> None:
        vertical = river.CONNECTORS[0]
        mask = river.draw_connector_mask(vertical)
        self.assertTrue(all(value == 255 for value in river.edge_pixels(mask, "n")))
        self.assertTrue(all(value == 255 for value in river.edge_pixels(mask, "s")))
        self.assertTrue(all(value == 0 for value in river.edge_pixels(mask, "e")))
        self.assertTrue(all(value == 0 for value in river.edge_pixels(mask, "w")))

    def test_all_connector_masks_validate(self) -> None:
        self.assertEqual([], river.validate_masks())


if __name__ == "__main__":
    unittest.main()
