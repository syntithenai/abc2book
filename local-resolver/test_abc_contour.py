"""Tests for ABC contour / incipit helpers."""

import unittest

from abc_contour import (
    abc_to_contour,
    contour_similarity,
    extract_pitch_midi_sequence,
    pitches_to_interval_string,
    pitches_to_parsons_code,
)


SAMPLE_A = """X:1
T:Test A
M:4/4
L:1/8
K:G
|:G2A2 B2c2|d2c2 B2A2:|
"""

SAMPLE_B = """X:1
T:Test B close
M:4/4
L:1/8
K:G
|:G2A2 B2c2|d2c2 B2G2:|
"""

SAMPLE_UNRELATED = """X:1
T:Other
M:3/4
L:1/8
K:Am
|:A2c2 e2|a2e2 c2:|
"""


class AbcContourTests(unittest.TestCase):
    def test_extract_pitches(self):
        pitches = extract_pitch_midi_sequence(SAMPLE_A)
        self.assertGreaterEqual(len(pitches), 6)

    def test_interval_and_parsons(self):
        pitches = extract_pitch_midi_sequence(SAMPLE_A)
        intervals = pitches_to_interval_string(pitches)
        parsons = pitches_to_parsons_code(pitches)
        self.assertTrue(intervals)
        self.assertTrue(parsons.startswith("*"))
        self.assertIn("U", parsons)

    def test_similarity_high_for_close_tunes(self):
        a = abc_to_contour(SAMPLE_A)
        b = abc_to_contour(SAMPLE_B)
        score = contour_similarity(a, b)
        self.assertGreaterEqual(score, 70)

    def test_similarity_low_for_unrelated(self):
        a = abc_to_contour(SAMPLE_A)
        b = abc_to_contour(SAMPLE_UNRELATED)
        score = contour_similarity(a, b)
        self.assertLess(score, 70)


if __name__ == "__main__":
    unittest.main()
