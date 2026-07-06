import unittest

from PIL import Image

from . import build_river_mask_tiles as river


class RiverMaskTilesTest(unittest.TestCase):
    def test_defines_seventeen_connectors_and_four_seasons(self) -> None:
        self.assertEqual(17, len(river.CONNECTORS))
        self.assertEqual(("spring", "summer", "autumn", "winter"), river.SEASONS)
        self.assertEqual("vertical", river.CONNECTORS[0].key)
        self.assertEqual("horizontal", river.CONNECTORS[1].key)
        self.assertEqual("source", river.CONNECTORS[-2].key)
        self.assertEqual("fill", river.CONNECTORS[-1].key)

    def test_vertical_mask_opens_only_north_and_south(self) -> None:
        vertical = river.CONNECTORS[0]
        mask = river.draw_connector_mask(vertical)
        self.assertTrue(all(value == 255 for value in river.edge_pixels(mask, "n")))
        self.assertTrue(all(value == 255 for value in river.edge_pixels(mask, "s")))
        self.assertTrue(all(value == 0 for value in river.edge_pixels(mask, "e")))
        self.assertTrue(all(value == 0 for value in river.edge_pixels(mask, "w")))

    def test_all_connector_masks_validate(self) -> None:
        self.assertEqual([], river.validate_masks())

    def test_composed_vertical_tile_normalizes_open_edge_pixels(self) -> None:
        source = Image.new("RGB", (28, 28), (40, 110, 180))
        tile = river.compose_tile(source, "spring", river.CONNECTORS[0])
        water = river.SEASON_TINTS["spring"]["water"]
        self.assertTrue(all(tile.getpixel((x, 0)) == water for x in river.EDGE_CORRIDOR))
        self.assertTrue(all(tile.getpixel((x, 27)) == water for x in river.EDGE_CORRIDOR))

    def test_build_sheet_dimensions_match_connectors_and_seasons(self) -> None:
        sheet = river.build_sheet()
        self.assertEqual((28 * 17, 28 * 4), sheet.size)

    def test_water_fill_tile_stays_near_water_palette(self) -> None:
        for season in river.SEASONS:
            tile = river.make_water_fill_tile(season)
            base = river.SEASON_TINTS[season]["water"]
            for x in (0, 13, 27):
                for y in (0, 13, 27):
                    pixel = tile.getpixel((x, y))
                    for channel, ref in zip(pixel, base):
                        self.assertLessEqual(abs(channel - ref), 24, f"{season} ({x},{y})")

    def test_seam_preview_dimensions_match_preview_grid(self) -> None:
        sheet = river.build_sheet()
        preview = river.build_seam_preview(sheet)
        self.assertEqual((504, 2070), preview.size)

    def test_built_sheet_edges_match_for_compatible_openings(self) -> None:
        sheet = river.build_sheet()
        self.assertEqual([], river.validate_sheet_edges(sheet))


if __name__ == "__main__":
    unittest.main()
