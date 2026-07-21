import unittest

from sheet_image_metadata import (
    _composer_hint_from_relative_path,
    _humanize_folder_name,
    _looks_like_title_line,
    _map_toc_to_pages,
    _parse_toc_lines,
    _segment_pages,
    _segments_from_page_titles,
)


class SheetImageMetadataTests(unittest.TestCase):
    def test_humanize_folder_name(self):
        self.assertEqual(_humanize_folder_name("JOPLIN"), "Joplin")

    def test_composer_hint_from_relative_path(self):
        self.assertEqual(
            _composer_hint_from_relative_path("ragtime PDF/JOPLIN/AJAA.PDF"),
            "Joplin",
        )

    def test_segment_pages_splits_distinct_titles(self):
        segments = _segment_pages([
            {"page": 1, "title": "Maple Leaf Rag", "artist": ""},
            {"page": 2, "title": "The Entertainer", "artist": ""},
        ])
        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[0]["title"], "Maple Leaf Rag")
        self.assertEqual(segments[1]["title"], "The Entertainer")

    def test_segment_pages_keeps_multipage_tune(self):
        segments = _segment_pages([
            {"page": 1, "title": "Maple Leaf Rag", "artist": ""},
            {"page": 2, "title": "", "artist": ""},
        ])
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["endPage"], 2)

    def test_looks_like_title_line(self):
        self.assertTrue(_looks_like_title_line("Maple Leaf Rag"))
        self.assertFalse(_looks_like_title_line("2"))

    def test_parse_toc_lines(self):
        entries = _parse_toc_lines([
            "1. Drowsy Maggie",
            "2. The Kesh",
            "notes",
        ])
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["title"], "Drowsy Maggie")

    def test_segments_from_page_titles_uses_toc(self):
        page_titles = [
            {
                "page": 1,
                "title": "",
                "artist": "",
                "lines": ["1. Drowsy Maggie", "2. The Kesh", "3. Silver Spear"],
            },
            {"page": 5, "title": "Drowsy Maggie", "artist": ""},
            {"page": 7, "title": "The Kesh", "artist": ""},
            {"page": 9, "title": "Silver Spear", "artist": ""},
        ]
        segments = _segments_from_page_titles(page_titles)
        self.assertGreaterEqual(len(segments), 3)
        self.assertEqual(segments[0]["title"], "Drowsy Maggie")
        self.assertEqual(segments[0]["page"], 5)

    def test_map_toc_to_pages_requires_three_entries(self):
        self.assertIsNone(_map_toc_to_pages(
            [{"num": 1, "title": "Only One"}],
            [],
        ))


if __name__ == "__main__":
    unittest.main()
