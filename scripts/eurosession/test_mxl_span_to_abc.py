#!/usr/bin/env python3
"""Unit tests for mxl_span_to_abc."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mxl_span_to_abc import (  # noqa: E402
    ZERO_DURATION_RE,
    apply_abc_headers,
    attributes_at_or_before,
    is_generic_composer,
    merge_attributes,
    slice_score_xml,
    span_to_abc,
    strip_generic_composer_headers,
)
from match_mxl_spans import load_score, mxl_key_meter_at  # noqa: E402
from xml.etree import ElementTree as ET

MXL = Path("/home/stever/Downloads/eurosessions-tunebook.mxl")


@unittest.skipUnless(MXL.is_file(), "eurosessions-tunebook.mxl not available")
class SpanToAbcTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.root = load_score(MXL)

    def test_slice_contains_measures(self) -> None:
        xml = slice_score_xml(self.root, 368, 370)
        self.assertIn("<score-partwise", xml)
        self.assertIn("<measure", xml)
        self.assertNotIn('number="368"', xml)
        self.assertIn('number="1"', xml)
        self.assertIn('number="3"', xml)

    def test_an_dro_slice_preserves_divisions(self) -> None:
        """Mid-score key/time attrs must not wipe sticky <divisions> from measure 1."""
        carry = attributes_at_or_before(self.root, 192)
        self.assertIsNotNone(carry)
        self.assertEqual(carry.findtext("divisions"), "24")
        xml = slice_score_xml(self.root, 192, 207)
        root = ET.fromstring(xml)
        first = root.find("part").findall("measure")[0]
        attrs = first.find("attributes")
        self.assertIsNotNone(attrs)
        self.assertEqual(attrs.findtext("divisions"), "24")
        self.assertIn("<divisions>24</divisions>", xml)

    def test_an_dro_span_no_zero_durations(self) -> None:
        abc = span_to_abc(
            MXL,
            192,
            207,
            title="An Dro Theme Vannetais",
            key="Em",
            meter="2/4",
            root=self.root,
        )
        self.assertNotRegex(abc, r"/0(?!\d)")
        self.assertIn("K:Em", abc)
        self.assertIn("M:2/4", abc)
        self.assertRegex(abc, r"[A-Ga-g]")
        # With divisions restored, notes get real duration suffixes (not bare /0).
        self.assertTrue(
            re.search(r"[A-Ga-g]\d", abc) or re.search(r"[A-Ga-g]/[2-9]", abc),
            f"expected numeric durations, got:\n{abc[:400]}",
        )

    def test_moshe_emes_span(self) -> None:
        abc = span_to_abc(
            MXL,
            368,
            386,
            title="Moshe Emes",
            key="Eb",
            meter="4/4",
            root=self.root,
        )
        self.assertIn("T:Moshe Emes", abc)
        self.assertIn("K:Eb", abc)
        self.assertIn("M:4/4", abc)
        self.assertGreater(len(abc), 200)
        # Melody body present (not empty headers only).
        self.assertRegex(abc, r"[A-Ga-g=][^\n]{8,}")

    def test_rue_de_pres_span(self) -> None:
        abc = span_to_abc(
            MXL,
            1333,
            1350,
            title="Rue des Pres Stephane Durand",
            key="G",
            meter="2/2",
            root=self.root,
        )
        self.assertIn("T:Rue des Pres", abc)
        self.assertIn("K:G", abc)
        self.assertIn("M:2/2", abc)
        self.assertGreater(len(abc), 200)

    def test_key_meter_from_mxl(self) -> None:
        key, meter = mxl_key_meter_at(self.root, 1333)
        self.assertEqual(meter, "2/2")
        abc = span_to_abc(MXL, 1333, 1350, title="Rue de Pres", root=self.root)
        self.assertIn(f"K:{key}", abc)


class AttributeMergeTests(unittest.TestCase):
    def test_merge_keeps_sticky_divisions(self) -> None:
        base = ET.fromstring("<attributes><divisions>24</divisions><clef><sign>G</sign></clef></attributes>")
        incoming = ET.fromstring("<attributes><key><fifths>0</fifths></key><time><beats>2</beats></time></attributes>")
        merged = merge_attributes(base, incoming)
        self.assertEqual(merged.findtext("divisions"), "24")
        self.assertIsNotNone(merged.find("clef"))
        self.assertEqual(merged.findtext("key/fifths"), "0")
        self.assertEqual(merged.findtext("time/beats"), "2")

    def test_merge_overrides_same_tag(self) -> None:
        base = ET.fromstring("<attributes><divisions>24</divisions><key><fifths>1</fifths></key></attributes>")
        incoming = ET.fromstring("<attributes><key><fifths>-2</fifths></key></attributes>")
        merged = merge_attributes(base, incoming)
        self.assertEqual(merged.findtext("divisions"), "24")
        self.assertEqual(merged.findtext("key/fifths"), "-2")

    def test_zero_duration_guard(self) -> None:
        self.assertTrue(ZERO_DURATION_RE.search("E/0B/0"))
        self.assertFalse(ZERO_DURATION_RE.search("E/10"))
        self.assertFalse(ZERO_DURATION_RE.search("E/2"))


class HeaderTests(unittest.TestCase):
    def test_apply_composer(self) -> None:
        abc = apply_abc_headers(
            "X:1\nT:Old\nM:4/4\nL:1/8\nK:C\n",
            title="Tune",
            key="G",
            meter="2/4",
            composer="Jo Freya",
        )
        self.assertIn("C:Jo Freya", abc)
        abc = apply_abc_headers("X:1\nT:Old\nM:3/4\nL:1/8\nK:Am\nABC", title="New", key="G", meter="2/4")
        self.assertIn("T:New", abc)
        self.assertIn("K:G", abc)
        self.assertIn("M:2/4", abc)

    def test_strips_musescore_placeholder_composer(self) -> None:
        self.assertTrue(is_generic_composer("Composer / arranger"))
        self.assertTrue(is_generic_composer("composer/arranger"))
        self.assertFalse(is_generic_composer("Jo Freya"))
        abc = apply_abc_headers(
            "X:1\nT:Old\nC:Composer / arranger\nM:4/4\nL:1/8\nK:C\n",
            title="Tune",
            key="G",
            meter="2/4",
            composer="Composer / arranger",
        )
        self.assertNotIn("C:", abc)
        self.assertEqual(
            strip_generic_composer_headers("C:Composer / arranger\nC:Real\n"),
            "C:Real",
        )


if __name__ == "__main__":
    unittest.main()
