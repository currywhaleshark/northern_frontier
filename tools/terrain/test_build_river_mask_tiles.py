import unittest

from . import build_river_mask_tiles as river


class RiverMaskTilesTest(unittest.TestCase):
    def test_defines_sixteen_connectors_and_four_seasons(self) -> None:
        self.assertEqual(16, len(river.CONNECTORS))
        self.assertEqual(("spring", "summer", "autumn", "winter"), river.SEASONS)
        self.assertEqual("vertical", river.CONNECTORS[0].key)
        self.assertEqual("horizontal", river.CONNECTORS[1].key)
        self.assertEqual("source", river.CONNECTORS[-1].key)


if __name__ == "__main__":
    unittest.main()
