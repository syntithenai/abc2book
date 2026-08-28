#!/usr/bin/env python3
"""Tests for OMR ABC quality heuristics and chord overlay."""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_chords_to_abc import (
    align_chords_to_abc,
    insert_chord_before_beat,
    rebuild_abc_with_bars,
    remap_staff_ordinals,
    split_melody_bars,
)
from omr_and_lookup import abc_quality_warnings, looks_weak_abc


class LooksWeakAbcTests(unittest.TestCase):
    def test_too_short(self):
        self.assertTrue(looks_weak_abc("X:1\nK:C\nA B"))

    def test_mangled_quote_chords(self):
        garbage = 'X:1\nT:x\nM:4/4\nL:1/4\nK:C\n""Am"C""""Dm"Em"Bm" A B c d e f g a'
        self.assertTrue(looks_weak_abc(garbage))
        self.assertIn("mangled_quote_chords", abc_quality_warnings(garbage))

    def test_adjacent_quote_chords_not_mangled(self):
        ok = (
            "X:1\nT:x\nM:2/4\nL:1/4\nK:Am\n"
            '|"Am"E/2 A B/2|"Dm"c2|"Em" "Bm"G2|A B c d|e f g a|b c d e|'
        )
        self.assertNotIn("mangled_quote_chords", abc_quality_warnings(ok))
        self.assertFalse(looks_weak_abc(ok))

    def test_decimal_durations(self):
        bad = "X:1\nT:x\nM:2/4\nL:1/4\nK:Am\nA0.125 B0.125 c d e f g a b c"
        self.assertTrue(looks_weak_abc(bad))
        self.assertIn("decimal_durations", abc_quality_warnings(bad))

    def test_meter_mismatch_warning(self):
        abc = "X:1\nT:x\nM:4/4\nL:1/4\nK:Am\n|: A B c d | e f g a | b c' d' e' | f' g' a' b' :|"
        self.assertFalse(looks_weak_abc(abc))
        warnings = abc_quality_warnings(abc, expected_meter="2/4")
        self.assertIn("meter_mismatch:4/4!=2/4", warnings)

    def test_healthy_omr(self):
        abc = "X:1\nT:Ukrainian Dance Nign\nM:2/4\nL:1/4\nK:Am\n|: E/2 A B/2 | c/2 B/2 A | A/2 c d/2 | e/2 d/2 c :|"
        self.assertFalse(looks_weak_abc(abc))
        self.assertEqual(abc_quality_warnings(abc, expected_meter="2/4"), [])

    def test_title_letters_do_not_rescue_empty_body(self):
        # Long title must not make a nearly-empty body look healthy.
        abc = "X:1\nT:Contradanze Maltessi with castanets\nM:2/4\nL:1/4\nK:C\nz |]"
        self.assertTrue(looks_weak_abc(abc))


class ChordOverlayTests(unittest.TestCase):
    def test_remap_staff_ordinals(self):
        boxes = [
            {"staffIndex": 0, "chord": "Am"},
            {"staffIndex": 7, "chord": "Dm"},
            {"staffIndex": 15, "chord": "E"},
        ]
        remapped = remap_staff_ordinals(boxes)
        self.assertEqual([c["staffIndex"] for c in remapped], [0, 1, 2])

    def test_safe_insert_ignores_chord_letters(self):
        bar = '"Am"E/2 A B/2'
        out = insert_chord_before_beat(bar, "Dm", 0.5)
        self.assertNotIn('""', out)
        self.assertIn('"Am"', out)
        self.assertIn('"Dm"', out)

    def test_rebuild_preserves_repeat_and_volta(self):
        abc = (
            "X:1\nT:x\nM:2/4\nL:1/4\nK:Am\n"
            "|: A B | c d :|\n"
            "| e f |1 g a :|2 b c |]\n"
        )
        from extract_chords_to_abc import split_melody_bars_structured

        contents, prefixes, endings = split_melody_bars_structured(abc)
        self.assertIn("|:", prefixes)
        self.assertIn(":|", endings)
        self.assertTrue(any(p in {"|1", "|2"} for p in prefixes))
        chorded = [f'"Am"{c}' if i == 0 else c for i, c in enumerate(contents)]
        out = rebuild_abc_with_bars(abc, chorded)
        self.assertIn("|:", out)
        self.assertIn(":|", out)
        self.assertIn("|1", out)
        self.assertIn("|2", out)
        self.assertIn('"Am"', out)

    def test_prefer_key_from_chords_major_to_minor(self):
        from extract_chords_to_abc import prefer_key_from_chords

        abc = (
            "X:1\nT:x\nM:2/4\nL:1/4\nK:G\n"
            '|"Am"E|"Dm"A|"Am"B|"E"c|"Am"d|"Dm"e|"Am"f|"Em"g|"Am"a|"Am"b|\n'
        )
        out = prefer_key_from_chords(abc)
        self.assertIn("K:Am", out)

    def test_lone_root_kept_with_unit_confidence(self):
        from extract_chords_to_abc import filter_chord_boxes

        boxes = [
            {"text": "Am", "x": 10, "y": 5, "width": 20, "height": 12, "confidence": 0.95},
            {"text": "E", "x": 80, "y": 5, "width": 12, "height": 12, "confidence": 0.90},
            {"text": "C", "x": 140, "y": 5, "width": 12, "height": 12, "confidence": 0.20},
        ]
        bands = [{"top": 40, "bottom": 80, "left": 0, "right": 400}]
        out = filter_chord_boxes(boxes, bands, 200.0)
        toks = [c["chord"] for c in out]
        self.assertIn("Am", toks)
        self.assertIn("E", toks)  # high-conf lone root kept (MXL has many C/E/G)
        self.assertNotIn("C", toks)  # low-conf lone root dropped

    def test_normalize_em_bb_rejects_c23(self):
        from extract_chords_to_abc import normalize_chord_token

        self.assertEqual(normalize_chord_token("EM"), "Em")
        self.assertEqual(normalize_chord_token("AM"), "Am")
        self.assertEqual(normalize_chord_token("BB"), "B")
        self.assertIsNone(normalize_chord_token("C23"))

    def test_align_uses_uneven_system_bar_counts(self):
        abc = (
            "X:1\nT:x\nM:2/4\nL:1/4\nK:Am\n"
            + " | ".join(["A"] * 8)
            + " |\n"
            + " | ".join(["B"] * 10)
            + " |\n"
            + " | ".join(["c"] * 8)
            + " |]"
        )
        boxes = [
            {"staffIndex": 0, "cx": 10, "chord": "Am"},
            {"staffIndex": 1, "cx": 10, "chord": "C"},
            {"staffIndex": 1, "cx": 350, "chord": "G"},
            {"staffIndex": 2, "cx": 10, "chord": "Dm"},
        ]
        out, status = align_chords_to_abc(
            abc,
            boxes,
            staff_left=0,
            staff_right=400,
            min_placed=1,
            min_mapped=0.25,
            min_chord_boxes=1,
            system_count_hint=3,
            system_bar_counts=[8, 10, 8],
        )
        self.assertEqual(status.get("barsPerSystem"), [8, 10, 8])
        self.assertIsNotNone(out)
        self.assertIn('"C"', out or "")

    def test_align_sparse_staff_indices_no_mangle(self):
        abc = (
            "X:1\nT:Ukrainian Dance Nign\nM:2/4\nL:1/4\nK:Am\n"
            "E/2 A B/2 | c/2 B/2 A | A/2 c d/2 | e/2 d/2 c |\n"
            "d/2 ^c d/2 A/2 B/2 | c2 | d/2 d/2 c/2 B/2 | A2 |\n"
            "A/2 d e/2 | f/2 f/4 f/4 e/2 d/2 | d/2 A/2 d/2 A/2 | d2 |\n"
            "G/2 c/2 c/2 d/2 | e/2 e/4 e/4 d/2 c/2 | g f/4 g/4 a/2 | g2 |]"
        )
        # Over-segmented staff indices like real UDN detect (0,2,7,8).
        boxes = [
            {"staffIndex": 0, "cx": 50, "chord": "Am"},
            {"staffIndex": 0, "cx": 200, "chord": "Dm"},
            {"staffIndex": 2, "cx": 50, "chord": "Am"},
            {"staffIndex": 7, "cx": 80, "chord": "C"},
            {"staffIndex": 8, "cx": 120, "chord": "G"},
        ]
        out, status = align_chords_to_abc(
            abc,
            boxes,
            staff_left=0,
            staff_right=400,
            min_placed=1,
            min_mapped=0.25,
            min_chord_boxes=1,
            system_count_hint=4,
        )
        self.assertIsNotNone(out)
        self.assertEqual(status.get("reason"), "ok")
        self.assertNotIn("mangled_quote_chords", abc_quality_warnings(out or ""))
        self.assertFalse(looks_weak_abc(out or ""))
        self.assertGreaterEqual(status.get("placed") or 0, 3)
        # Multi-line body preserved.
        body_lines = [ln for ln in (out or "").splitlines() if "|" in ln and not ln.startswith(("X:", "T:", "M:", "L:", "K:"))]
        self.assertGreaterEqual(len(body_lines), 2)


if __name__ == "__main__":
    unittest.main()
