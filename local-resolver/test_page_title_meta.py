"""Tests for conservative page title matching."""

import unittest

from page_title_meta import conservative_page_title, page_title_matches_query


class PageTitleMetaTests(unittest.TestCase):
    def test_match_contains_query(self):
        self.assertTrue(page_title_matches_query("Amazing Grace - Traditional", "Amazing Grace"))

    def test_reject_unrelated(self):
        self.assertFalse(page_title_matches_query("Best Guitar Tabs 2024", "Amazing Grace"))

    def test_conservative_extract(self):
        html = "<html><head><title>Amazing Grace Chords | Site</title></head></html>"
        self.assertEqual(
            conservative_page_title(html, "Amazing Grace", fallback="fallback"),
            "Amazing Grace Chords",
        )
        self.assertEqual(
            conservative_page_title(html, "Totally Different Song", fallback="fallback"),
            "fallback",
        )


if __name__ == "__main__":
    unittest.main()
