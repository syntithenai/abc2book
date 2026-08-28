"""Tests for sheet page split helpers (EuroSession-style fallbacks)."""

from __future__ import annotations

import unittest

from sheet_image_split import (
    merge_harmony_segments,
    merge_title_candidates,
    merge_weak_segments,
    build_segments_from_boxes,
)


class SheetImageSplitTests(unittest.TestCase):
    def test_merge_title_candidates_dedupes_nearby(self):
        a = [{"text": "Tune A (Gm)", "top": 100, "score": 0.5}]
        b = [{"text": "Tune A (Gm)", "top": 120, "score": 0.9}]
        out = merge_title_candidates(a, b, image_height=2000)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["text"], "Tune A (Gm)")
        self.assertGreaterEqual(out[0]["score"], 0.9)

    def test_merge_harmony_into_previous(self):
        segs = [
            {"title": "Dance Nign", "top": 0, "bottom": 200, "index": 0},
            {"title": "Dance Nign Harmony", "top": 200, "bottom": 400, "index": 1},
        ]
        merged = merge_harmony_segments(segs)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["bottom"], 400)

    def test_merge_weak_person_name(self):
        segs = [
            {"title": "Main Tune (Am)", "top": 0, "bottom": 300, "titleTop": 10, "index": 0},
            {"title": "John Smith", "top": 300, "bottom": 500, "titleTop": 50, "index": 1},
        ]
        merged = merge_weak_segments(segs, image_height=2000)
        # Close person-name title should merge into previous
        self.assertEqual(len(merged), 1)

    def test_build_segments_single_when_no_titles(self):
        segments, meta = build_segments_from_boxes([], 800, 1200, bands=[])
        self.assertEqual(meta["splitMethod"], "single")
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["top"], 0)
        self.assertEqual(segments[0]["bottom"], 1200)

    def test_build_segments_multi_title_scanned_page(self):
        """Synthetic multi-tune page: two strong centered titles with key hints."""
        width, height = 1000, 2000
        boxes = [
            {"text": "Ukrainian Dance Nign (Am)", "x": 280, "y": 80, "width": 440, "height": 28, "confidence": 0.95},
            {"text": "Freilach (Dm)", "x": 320, "y": 980, "width": 360, "height": 28, "confidence": 0.94},
        ]
        bands = [
            {"top": 140, "bottom": 220},
            {"top": 260, "bottom": 340},
            {"top": 380, "bottom": 460},
            {"top": 1040, "bottom": 1120},
            {"top": 1160, "bottom": 1240},
            {"top": 1280, "bottom": 1360},
        ]
        segments, meta = build_segments_from_boxes(boxes, width, height, bands)
        self.assertIn(meta["splitMethod"], {"title_first", "fallback"})
        self.assertGreaterEqual(len(segments), 2)
        titles = [str(s.get("title") or "") for s in segments]
        self.assertTrue(any("Dance" in t or "Nign" in t for t in titles))
        self.assertTrue(any("Freilach" in t for t in titles))


if __name__ == "__main__":
    unittest.main()
