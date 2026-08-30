"""Tests for post-OMR ABC repair helpers."""

from __future__ import annotations

import unittest

from sheet_image_abc_repair import (
    apply_title_key_hint,
    fix_decimal_durations,
    looks_weak_abc,
    meter_hint_from_title,
    parse_title_key,
    polish_omr_abc,
    repair_omr_abc,
    safe_autofix_abc,
)


class AbcRepairTests(unittest.TestCase):
    def test_fix_decimal_durations(self):
        abc = "M:4/4\nK:C\nG0.75 A0.5 |\n"
        out = fix_decimal_durations(abc)
        self.assertIn("G3/4", out)
        self.assertIn("A1/2", out)

    def test_parse_title_key(self):
        self.assertEqual(parse_title_key("Bourée de Concours (Gm)"), ("G", "minor"))

    def test_apply_title_key_hint(self):
        abc = "M:2/4\nK:Bb\n|A B|\n"
        out = apply_title_key_hint(abc, "Tune (Gm)")
        self.assertIn("K:Gm", out)

    def test_looks_weak_abc(self):
        self.assertTrue(looks_weak_abc("K:C\n|z z|\n"))
        self.assertFalse(looks_weak_abc("K:C\n|CDEF GABc|defg abcd|\n"))

    def test_polish_omr_abc(self):
        abc = "K:C\n\n|A B|c d\n"
        out, warnings = polish_omr_abc(abc, title="X (Am)")
        self.assertIn("K:Am", out)
        self.assertIn("L:1/4", out)
        self.assertTrue(out.strip().endswith("||") or out.strip().endswith("|"))

    def test_repair_omr_abc_sets_meter_from_title(self):
        abc = "K:C\nL:1/8\n|A B|c d|\n"
        out = repair_omr_abc(abc, "Bourée de Concours (Gm)")
        self.assertIn("L:1/4", out)
        self.assertIn("K:Gm", out)
        self.assertIn("M:2/4", out)

    def test_meter_hint_from_title(self):
        self.assertEqual(meter_hint_from_title("Motorway Mazurka"), "3/4")


if __name__ == "__main__":
    unittest.main()
