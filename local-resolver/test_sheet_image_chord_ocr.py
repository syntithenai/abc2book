"""Tests for chord OCR overlay."""

from __future__ import annotations

import unittest

from sheet_image_chord_ocr import (
    align_chords_to_abc,
    normalize_chord_token,
    strip_quote_chords,
)


class ChordOcrTests(unittest.TestCase):
    def test_normalize_chord_token(self):
        self.assertEqual(normalize_chord_token("EM"), "Em")
        self.assertEqual(normalize_chord_token("Am"), "Am")
        self.assertIsNone(normalize_chord_token("C23"))

    def test_align_chords_to_abc_places_chords(self):
        abc = "M:4/4\nL:1/4\nK:Am\n|CDEF|GABc|defg|abcd|\n"
        boxes = [
            {"chord": "Am", "cx": 120.0, "staffIndex": 0, "confidence": 0.9},
            {"chord": "G", "cx": 420.0, "staffIndex": 0, "confidence": 0.85},
            {"chord": "F", "cx": 720.0, "staffIndex": 0, "confidence": 0.88},
        ]
        out, status = align_chords_to_abc(abc, boxes, 50.0, 950.0)
        self.assertEqual(status.get("reason"), "ok")
        self.assertIsNotNone(out)
        self.assertIn('"Am"', out or "")
        self.assertNotIn('"Am"', strip_quote_chords(abc))


if __name__ == "__main__":
    unittest.main()
