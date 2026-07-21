import unittest

from sheet_image_metadata import (
    _composer_hint_from_relative_path,
    _humanize_folder_name,
    _looks_like_title_line,
    _segment_pages,
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


if __name__ == "__main__":
    unittest.main()
