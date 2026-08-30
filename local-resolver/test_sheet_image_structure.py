"""Tests for CV structure detection and ABC annotation."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from sheet_image_structure import (
    KIND_END_REPEAT,
    KIND_START_REPEAT,
    KIND_VOLTA_START,
    StructureEvent,
    annotate_abc_with_structure,
    apply_form_heuristics,
    apply_section_repeat_to_abc,
    collapse_uniform_eight_bar_repeats,
    count_abc_bars,
    detect_structure_cv,
    detect_structure_on_staff_crop,
    draw_synthetic_staff_with_repeats,
    infer_section_bars,
    infer_voltas_for_long_systems,
    merge_structure_events,
)

REPO = Path(__file__).resolve().parents[1]
UDN_STAFF = REPO / "scrape" / "ukrainian-dance-nign" / "staff-1.png"


class CountBarsTests(unittest.TestCase):
    def test_count_simple(self):
        abc = "M:2/4\nK:Am\n|A B|c d|e f|g a|\n"
        self.assertEqual(count_abc_bars(abc), 4)

    def test_count_with_repeats(self):
        abc = "|:A B|c d:|e f|\n"
        self.assertEqual(count_abc_bars(abc), 3)


class AnnotateAbcTests(unittest.TestCase):
    def test_start_end_repeat(self):
        abc = "M:2/4\nK:C\n|A B|c d|e f|g a|\n"
        events = [
            StructureEvent(0, KIND_START_REPEAT, confidence=0.9),
            StructureEvent(3, KIND_END_REPEAT, confidence=0.9),
        ]
        out = annotate_abc_with_structure(abc, events)
        self.assertIn("|:", out)
        self.assertIn(":|", out)
        self.assertNotIn("|]", out)

    def test_volta(self):
        abc = "|A B|c d|e f|g a|\n"
        events = [
            StructureEvent(2, KIND_VOLTA_START, number=1, confidence=0.8),
            StructureEvent(3, KIND_VOLTA_START, number=2, confidence=0.8),
        ]
        out = annotate_abc_with_structure(abc, events)
        self.assertIn("|1", out)
        self.assertIn("|2", out)


class HeuristicTests(unittest.TestCase):
    def test_wrap_eight_bar_systems(self):
        counts = [8, 8, 8]
        existing = [[], [], []]
        out = apply_form_heuristics(counts, existing)
        self.assertEqual(len(out), 3)
        for sys_e in out:
            kinds = {e.kind for e in sys_e}
            self.assertIn(KIND_START_REPEAT, kinds)
            self.assertIn(KIND_END_REPEAT, kinds)
            self.assertTrue(all(e.source == "heuristic" for e in sys_e))

    def test_wrap_two_eight_bar_systems(self):
        """16-bar bourrée page: 2×8 → start@0/end@7 per system."""
        counts = [8, 8]
        out = apply_form_heuristics(counts, [[], []])
        self.assertEqual(len(out), 2)
        for sys_e in out:
            kinds = {(e.kind, e.measure_index) for e in sys_e}
            self.assertIn((KIND_START_REPEAT, 0), kinds)
            self.assertIn((KIND_END_REPEAT, 7), kinds)

    def test_wrap_two_nine_bar_systems(self):
        """18-bar 3/8 bourrée: 2×9 → start@0/end@8 per system."""
        counts = [9, 9]
        out = apply_form_heuristics(counts, [[], []])
        self.assertEqual(len(out), 2)
        for sys_e in out:
            kinds = {(e.kind, e.measure_index) for e in sys_e}
            self.assertIn((KIND_START_REPEAT, 0), kinds)
            self.assertIn((KIND_END_REPEAT, 8), kinds)

    def test_fills_empty_systems_when_sibling_has_cv(self):
        counts = [8, 8, 8]
        existing = [
            [StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv")],
            [],
            [],
        ]
        out = apply_form_heuristics(counts, existing)
        self.assertEqual(out[0][0].source, "cv")
        for sys_e in out[1:]:
            kinds = {e.kind for e in sys_e}
            self.assertIn(KIND_START_REPEAT, kinds)
            self.assertIn(KIND_END_REPEAT, kinds)

    def test_infer_voltas_on_ten_bar_systems(self):
        from sheet_image_structure import infer_voltas_for_long_systems

        counts = [8, 10, 8]
        existing = [
            [
                StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv"),
                StructureEvent(7, KIND_END_REPEAT, confidence=0.9, source="cv"),
            ],
            [
                StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv"),
                StructureEvent(9, KIND_END_REPEAT, confidence=0.9, source="cv"),
            ],
            [
                StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv"),
                StructureEvent(7, KIND_END_REPEAT, confidence=0.9, source="cv"),
            ],
        ]
        out = infer_voltas_for_long_systems(counts, existing)
        kinds1 = {(e.kind, e.number, e.measure_index) for e in out[1]}
        self.assertIn((KIND_VOLTA_START, 1, 8), kinds1)
        self.assertIn((KIND_VOLTA_START, 2, 9), kinds1)
        self.assertIn((KIND_END_REPEAT, None, 8), kinds1)
        # Short systems unchanged (no voltas).
        self.assertFalse(any(e.kind == KIND_VOLTA_START for e in out[0]))


class SectionRepeatTests(unittest.TestCase):
    def test_twelve_bar_four_section(self):
        abc = "M:4/4\nK:C\n" + "|".join(["A2"] * 12) + "|\n"
        out = apply_section_repeat_to_abc(abc)
        self.assertIn("|:", out)
        self.assertIn(":|", out)

    def test_infer_section_bars(self):
        self.assertEqual(infer_section_bars(12, "4/4"), 4)
        self.assertEqual(infer_section_bars(21, "3/4"), 8)
        self.assertEqual(infer_section_bars(16, "2/4"), 8)

    def test_single_system_requires_cv_hint(self):
        counts = [16]
        existing: list[list[StructureEvent]] = [[]]
        out = apply_form_heuristics(counts, existing, require_cv_hint=True)
        self.assertEqual(out[0], [])
        existing_cv = [[StructureEvent(0, KIND_START_REPEAT, confidence=0.5, source="cv")]]
        out2 = apply_form_heuristics(counts, existing_cv, require_cv_hint=True)
        self.assertTrue(any(e.kind == KIND_START_REPEAT for e in out2[0]))

    def test_collapse_overdetected_eight_bar(self):
        counts = [8, 8]
        noisy = [
            [
                StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv"),
                StructureEvent(3, KIND_END_REPEAT, confidence=0.5, source="cv"),
                StructureEvent(7, KIND_END_REPEAT, confidence=0.5, source="cv"),
            ],
            [],
        ]
        out = collapse_uniform_eight_bar_repeats(counts, noisy)
        starts = [e for e in out[0] if e.kind == KIND_START_REPEAT]
        ends = [e for e in out[0] if e.kind == KIND_END_REPEAT]
        self.assertEqual(len(starts), 1)
        self.assertEqual(len(ends), 1)
        self.assertEqual(starts[0].measure_index, 0)
        self.assertEqual(ends[0].measure_index, 7)


class MergeAltTests(unittest.TestCase):
    def test_cv_wins(self):
        cv = [StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv")]
        alt = [StructureEvent(0, KIND_START_REPEAT, confidence=0.5, source="alt", x=1)]
        merged = merge_structure_events(cv, alt)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].source, "cv")

    def test_alt_fills_gap(self):
        cv = [StructureEvent(0, KIND_START_REPEAT, confidence=0.9, source="cv")]
        alt = [StructureEvent(7, KIND_END_REPEAT, confidence=0.5, source="alt")]
        merged = merge_structure_events(cv, alt)
        kinds = {e.kind for e in merged}
        self.assertEqual(kinds, {KIND_START_REPEAT, KIND_END_REPEAT})


@unittest.skipUnless(
    __import__("importlib.util").util.find_spec("cv2") is not None,
    "opencv required",
)
class CvDetectorTests(unittest.TestCase):
    def test_synthetic_start_end_repeat(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "synth.png")
            draw_synthetic_staff_with_repeats(path)
            events = detect_structure_cv(path, bar_count=4)
            kinds = {e.kind for e in events}
            self.assertIn(KIND_START_REPEAT, kinds)
            self.assertIn(KIND_END_REPEAT, kinds)

    @unittest.skipUnless(UDN_STAFF.is_file(), "UDN staff-1.png missing")
    def test_udn_staff1_has_repeats(self):
        events = detect_structure_on_staff_crop(str(UDN_STAFF), bar_count=8, use_alt=False)
        kinds = {e.kind for e in events}
        # Printed first system has start and end repeats.
        self.assertTrue(
            KIND_START_REPEAT in kinds or KIND_END_REPEAT in kinds,
            f"expected repeat markers, got {events}",
        )


if __name__ == "__main__":
    unittest.main()
