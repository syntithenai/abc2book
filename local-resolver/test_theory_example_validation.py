"""Tests for theory lesson illustration validation."""

import unittest

from theory_example_validation import (
    assemble_full_abc,
    lesson_uses_image,
    lesson_uses_notation,
    plan_keyword_overlap,
    validate_abc_body,
    validate_bar_structure,
    validate_no_ledger_lines,
    validate_plan,
)


class TheoryExampleValidationTests(unittest.TestCase):
    def test_lesson_uses_image_for_styles_and_history(self):
        self.assertTrue(lesson_uses_image({"track": "history", "id": "history-bach-01"}))
        self.assertTrue(lesson_uses_image({"track": "styles", "id": "styles-jazz-01"}))
        self.assertFalse(lesson_uses_image({"track": "chords", "id": "chords-triads-01"}))
        self.assertTrue(lesson_uses_notation({"track": "chords", "id": "chords-triads-01"}))

    def test_validate_plan_requires_length_and_overlap(self):
        lesson = {
            "title": "Major Scales",
            "tags": ["scales", "major"],
            "body": "A major scale uses whole and half steps across seven pitch names.",
        }
        good = "Show a C major scale ascending on the treble staff with whole-step spacing."
        self.assertEqual(validate_plan(good, lesson), [])
        self.assertTrue(plan_keyword_overlap(good, lesson))

        short = "Show scale."
        self.assertTrue(validate_plan(short, lesson))

    def test_validate_no_ledger_lines(self):
        self.assertEqual(validate_no_ledger_lines("CDEF GABc |"), [])
        self.assertTrue(validate_no_ledger_lines("c'4 d'4 |"))

    def test_validate_bar_structure(self):
        self.assertEqual(validate_bar_structure("CDEF | GABc |", {"meter": "4/4"}), [])
        self.assertTrue(validate_bar_structure("CDEF GABc", {"meter": "4/4"}))

    def test_validate_abc_body_rejects_headers_and_requires_chord_stacks(self):
        lesson = {"track": "chords", "id": "chords-triads-01"}
        good = 'V:1 clef=treble\n"I(C)" [CEG] |'
        self.assertEqual(validate_abc_body(good, lesson, {"meter": "4/4"}), [])

        bad = 'X:1\nK:C\n"Am" |'
        errors = validate_abc_body(bad, lesson)
        self.assertTrue(any("header" in e for e in errors))

        no_stack = "V:1 clef=treble\nC2 E2 G2 |"
        stack_errors = validate_abc_body(no_stack, lesson)
        self.assertTrue(any("stacked chord" in e for e in stack_errors))

    def test_assemble_full_abc_adds_metadata(self):
        abc = assemble_full_abc("V:1\nCDEF |", {"key": "G", "meter": "6/8"})
        self.assertIn("K:G", abc)
        self.assertIn("M:6/8", abc)
        self.assertIn("CDEF", abc)


if __name__ == "__main__":
    unittest.main()
