import os
import unittest
from unittest.mock import AsyncMock, patch

from chord_sheet_utils import (
    build_sections_from_lines,
    classify_lyric_chord_lines,
    estimate_chord_sheet_confidence,
    reconstruct_chords_over_words,
)
from sheet_image_enhanced_omr import (
    _choose_key,
    _choose_meter,
    merge_close_bands,
    strip_abc_headers,
)
from sheet_image_melody import extract_main_melody_from_musicxml
from sheet_image_format import (
    build_lyrics_only_payload,
    build_unified_sheet_meta,
    classify_sheet_format,
)
from sheet_image_staff_detect import classify_page_type, detect_staff_regions


SAMPLE_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>
"""


class ChordSheetUtilsTests(unittest.TestCase):
    def test_classify_lines(self):
        lines = ["Verse", "C G Am F", "Hello world"]
        classified = classify_lyric_chord_lines(lines)
        self.assertEqual(classified[0]["type"], "header")
        self.assertEqual(classified[1]["type"], "chord")
        self.assertEqual(classified[2]["type"], "lyric")

    def test_reconstruct_from_boxes(self):
        boxes = [
            {"text": "Verse", "x": 10, "y": 10, "width": 40, "height": 12, "confidence": 0.9},
            {"text": "C", "x": 10, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
            {"text": "G", "x": 60, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
            {"text": "Hello", "x": 10, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
            {"text": "world", "x": 60, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
        ]
        lines = reconstruct_chords_over_words(boxes)
        self.assertTrue(any("Hello world" in line for line in lines))
        self.assertTrue(any(line.strip().startswith("C") for line in lines))

    def test_sections_and_confidence(self):
        lines = ["Verse", "C G", "Line one", "", "Chorus", "F C", "Line two"]
        sections = build_sections_from_lines(lines)
        self.assertEqual(len(sections), 2)
        self.assertGreater(estimate_chord_sheet_confidence(lines), 0.5)


class StaffDetectTests(unittest.TestCase):
    def test_detect_staff_fixture(self):
        fixture = os.path.join(
            os.path.dirname(__file__),
            "test_fixtures",
            "sheet_images",
            "staff_only.png",
        )
        result = detect_staff_regions(fixture)
        self.assertTrue(result["hasStaff"])
        self.assertGreater(result["staffRegionCount"], 0)

    def test_classify_page_type(self):
        self.assertEqual(classify_page_type(True, ["C G", "Lyrics"]), "mixed")
        self.assertEqual(classify_page_type(True, []), "notation_only")
        self.assertEqual(classify_page_type(False, ["C G", "Lyrics"]), "chord_chart")


class SheetFormatClassifierTests(unittest.TestCase):
    def test_classify_chord_chart(self):
        boxes = [
            {"text": "Amazing Grace", "x": 10, "y": 10, "width": 120, "height": 14, "confidence": 0.9},
            {"text": "G", "x": 10, "y": 50, "width": 12, "height": 12, "confidence": 0.9},
            {"text": "C", "x": 60, "y": 50, "width": 12, "height": 12, "confidence": 0.9},
            {"text": "how", "x": 10, "y": 80, "width": 30, "height": 12, "confidence": 0.9},
            {"text": "sweet", "x": 50, "y": 80, "width": 40, "height": 12, "confidence": 0.9},
        ]
        lines = ["Amazing Grace", "G C", "how sweet"]
        out = classify_sheet_format(
            {"hasStaff": False, "staffRegionCount": 0, "staffRegions": []},
            boxes,
            lines,
            image_height=400,
        )
        self.assertEqual(out["sheetFormat"], "chord_chart")
        self.assertTrue(out["skipHomr"])
        self.assertFalse(out["needsOmr"])

    def test_classify_lyrics_only(self):
        lines = [
            "Amazing Grace - Traditional",
            "Amazing grace how sweet the sound",
            "That saved a wretch like me",
            "",
            "I once was lost but now am found",
            "Was blind but now I see",
        ]
        boxes = [
            {"text": t, "x": 10, "y": 20 + i * 30, "width": 200, "height": 14, "confidence": 0.9}
            for i, t in enumerate(lines)
            if t
        ]
        out = classify_sheet_format(
            {"hasStaff": False, "staffRegionCount": 0, "staffRegions": []},
            boxes,
            lines,
            image_height=400,
        )
        self.assertEqual(out["sheetFormat"], "lyrics_only")
        self.assertTrue(out["skipHomr"])

    def test_classify_notation_only(self):
        out = classify_sheet_format(
            {
                "hasStaff": True,
                "staffRegionCount": 3,
                "staffRegions": [
                    {"top": 40, "bottom": 80},
                    {"top": 100, "bottom": 140},
                    {"top": 160, "bottom": 200},
                ],
            },
            [],
            [],
            image_height=400,
        )
        self.assertEqual(out["sheetFormat"], "notation_only")
        self.assertTrue(out["needsOmr"])
        self.assertFalse(out["skipHomr"])

    def test_classify_mixed(self):
        boxes = [
            {"text": "C", "x": 10, "y": 20, "width": 10, "height": 10, "confidence": 0.9},
            {"text": "hello", "x": 10, "y": 90, "width": 40, "height": 12, "confidence": 0.9},
        ]
        out = classify_sheet_format(
            {
                "hasStaff": True,
                "staffRegionCount": 1,
                "staffRegions": [{"top": 40, "bottom": 80}],
            },
            boxes,
            ["C", "hello"],
            image_height=200,
        )
        self.assertEqual(out["sheetFormat"], "mixed")
        self.assertTrue(out["needsOmr"])

    def test_lyrics_only_payload_skips_lone_chords(self):
        payload = build_lyrics_only_payload(
            ["Title Song", "Hello world", "C", "Another line", "", "Second stanza"],
            {"title": "Title Song", "artist": "Anon"},
        )
        self.assertEqual(payload["format"], "lyrics-only")
        self.assertIn("{title:", payload["text"])
        self.assertNotIn("\nC\n", "\n" + payload["text"] + "\n")
        self.assertEqual(len(payload["stanzas"]), 2)

    def test_unified_meta(self):
        meta = build_unified_sheet_meta(
            title="",
            artist="",
            source_format="chord_chart",
            confidence=0.8,
            ocr_boxes=[
                {"text": "Song Title - Artist Name", "x": 10, "y": 8, "width": 200, "height": 14, "confidence": 0.9},
            ],
            image_height=500,
        )
        self.assertEqual(meta["title"], "Song Title")
        self.assertEqual(meta["artist"], "Artist Name")
        self.assertEqual(meta["sourceFormat"], "chord_chart")

    def test_unified_meta_folder_composer_hint(self):
        meta = build_unified_sheet_meta(
            title="Untitled",
            artist="",
            source_format="lyrics_only",
            confidence=0.6,
            folder_composer_hint="Joplin",
        )
        self.assertEqual(meta["composer"], "Joplin")
        self.assertEqual(meta["title"], "Untitled")


class MelodyExtractTests(unittest.TestCase):
    def test_extract_main_melody(self):
        result = extract_main_melody_from_musicxml(SAMPLE_MUSICXML)
        self.assertIn("C", result["abc"])
        self.assertEqual(result["partName"], "Melody")
        self.assertGreater(result["confidence"], 0.5)

    def test_duration_suffix_snaps_homr_floats(self):
        from sheet_image_melody import _duration_suffix

        self.assertEqual(_duration_suffix(1.0), "")
        self.assertEqual(_duration_suffix(0.5), "/2")
        self.assertEqual(_duration_suffix(0.125), "/8")
        self.assertEqual(_duration_suffix(0.13), "/8")
        self.assertEqual(_duration_suffix(0.75), "3/4")
        self.assertNotIn(".", _duration_suffix(0.333))

    def test_abc_body_includes_measure_line_breaks(self):
        musicxml = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Melody</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>c</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="3">
      <note><pitch><step>d</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>e</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>f</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>g</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="4">
      <note><pitch><step>a</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>g</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>f</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>e</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="5">
      <print new-system="yes"/>
      <note><pitch><step>d</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>c</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>
"""
        result = extract_main_melody_from_musicxml(musicxml)
        lines = [ln for ln in result["abc"].splitlines() if ln and not ln.startswith(("M:", "L:", "K:"))]
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[0].endswith("|"))
        self.assertTrue(lines[1].endswith("|]"))
        self.assertIn("C D E F |", lines[0])
        self.assertIn("d c B A |]", lines[1])
        self.assertIn("L:1/4", result["abc"])
        self.assertIn("M:4/4", result["abc"])


class EnhancedOmrHelperTests(unittest.TestCase):
    def test_merge_close_bands(self):
        bands = [
            {"top": 10, "bottom": 40, "lineCount": 5},
            {"top": 50, "bottom": 80, "lineCount": 5},
            {"top": 200, "bottom": 240, "lineCount": 5},
        ]
        merged = merge_close_bands(bands, gap=20)
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["bottom"], 80)
        self.assertEqual(merged[1]["top"], 200)

    def test_strip_abc_headers(self):
        abc = "X:1\nT:Tune\nM:2/4\nL:1/4\nK:G\nA B |\nc d |]"
        self.assertEqual(strip_abc_headers(abc), ["A B |", "c d |]"])

    def test_choose_meter_prefers_non_44_on_dense_pages(self):
        self.assertEqual(_choose_meter(["4/4", "2/4", "2/4", "4/4"], 6), "2/4")
        self.assertEqual(_choose_meter(["4/4", "4/4", "4/4", "4/4"], 6), "2/4")
        self.assertEqual(_choose_meter(["3/4", "3/4"], 2), "3/4")
        self.assertEqual(_choose_meter(["2/4", "2/4", "3/8"], 3), "3/8")

    def test_choose_key_prefers_minor_on_dense_pages(self):
        self.assertEqual(_choose_key(["G", "Am", "Am", "Am", "G", "Am"], 6), "Am")
        self.assertEqual(_choose_key(["G", "G", "G"], 3), "G")
        self.assertEqual(_choose_key(["A minor", "G", "Am", "Am"], 4), "Am")

    def test_keys_disagree_strongly_ignores_relative(self):
        from sheet_image_enhanced_omr import _keys_disagree_strongly, _normalize_key_token

        self.assertEqual(_normalize_key_token("A minor"), "Am")
        self.assertFalse(_keys_disagree_strongly("C", "Am"))
        self.assertTrue(_keys_disagree_strongly("Am", "Dm"))

    def test_extract_melody_uses_enhanced_path(self):
        fake = {
            "abc": "M:2/4\nL:1/4\nK:G\nA B |\nc d |]",
            "key": "G",
            "meter": "2/4",
            "source": "homr",
            "mode": "per-staff",
            "enhancedOmr": {"mode": "per-staff", "bandCount": 6, "okSystems": 6},
        }
        with patch("sheet_image_transcribe.ensure_homr_available", return_value=True), patch(
            "sheet_image_transcribe.extract_enhanced_melody",
            return_value=fake,
        ) as enhanced:
            from sheet_image_transcribe import _extract_melody

            out = _extract_melody("/tmp/fake.png", work_dir="/tmp", title="Ukrainian Dance Nign")
            self.assertEqual(out["meter"], "2/4")
            self.assertEqual(out["enhancedOmr"]["mode"], "per-staff")
            enhanced.assert_called_once()


class SheetImageTranscribeTests(unittest.IsolatedAsyncioTestCase):
    async def test_transcribe_with_mocks(self):
        fixture = os.path.join(
            os.path.dirname(__file__),
            "test_fixtures",
            "sheet_images",
            "chord_chart.png",
        )
        with open(fixture, "rb") as handle:
            data = handle.read()

        with patch("sheet_image_transcribe.ensure_paddleocr_available", return_value=True), patch(
            "sheet_image_transcribe.extract_ocr_boxes",
            return_value=[
                {"text": "Verse", "x": 10, "y": 10, "width": 40, "height": 12, "confidence": 0.9},
                {"text": "G", "x": 10, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
                {"text": "C", "x": 60, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
                {"text": "Amazing", "x": 10, "y": 70, "width": 60, "height": 12, "confidence": 0.9},
                {"text": "grace", "x": 80, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
            ],
        ), patch("sheet_image_transcribe.ensure_homr_available", return_value=False), patch(
            "sheet_image_transcribe.maybe_apply_vlm_fallback",
            new=AsyncMock(return_value=None),
        ), patch(
            "sheet_image_transcribe.detect_staff_regions",
            return_value={"hasStaff": False, "staffRegionCount": 0, "staffRegions": [], "confidence": 0.1},
        ):
            from sheet_image_transcribe import transcribe_sheet_image_bytes

            result = await transcribe_sheet_image_bytes(data, "chord_chart.png")
            self.assertEqual(result["pageType"], "chord_chart")
            self.assertEqual(result["sheetFormat"], "chord_chart")
            self.assertIn("Amazing", result["chordSheet"]["text"])
            self.assertIsNotNone(result.get("meta"))
            self.assertIn("homr_skipped_by_format", result.get("warnings") or [])

    async def test_chord_chart_skips_homr(self):
        fixture = os.path.join(
            os.path.dirname(__file__),
            "test_fixtures",
            "sheet_images",
            "chord_chart.png",
        )
        with open(fixture, "rb") as handle:
            data = handle.read()

        with patch("sheet_image_transcribe.ensure_paddleocr_available", return_value=True), patch(
            "sheet_image_transcribe.extract_ocr_boxes",
            return_value=[
                {"text": "G", "x": 10, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
                {"text": "C", "x": 60, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
                {"text": "Hello", "x": 10, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
                {"text": "world", "x": 60, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
            ],
        ), patch(
            "sheet_image_transcribe.detect_staff_regions",
            return_value={"hasStaff": False, "staffRegionCount": 0, "staffRegions": [], "confidence": 0.1},
        ), patch(
            "sheet_image_transcribe.maybe_apply_vlm_fallback",
            new=AsyncMock(return_value=None),
        ), patch(
            "sheet_image_transcribe._extract_melody",
        ) as extract_melody, patch(
            "sheet_image_transcribe.ensure_homr_available",
        ) as ensure_homr:
            from sheet_image_transcribe import transcribe_sheet_image_bytes

            result = await transcribe_sheet_image_bytes(data, "chord_chart.png")
            self.assertEqual(result["sheetFormat"], "chord_chart")
            self.assertIsNone(result.get("melody"))
            extract_melody.assert_not_called()
            ensure_homr.assert_not_called()

    async def test_lyrics_only_skips_homr(self):
        fixture = os.path.join(
            os.path.dirname(__file__),
            "test_fixtures",
            "sheet_images",
            "lyrics_only.png",
        )
        with open(fixture, "rb") as handle:
            data = handle.read()

        lyric_boxes = [
            {"text": "Amazing Grace - Traditional", "x": 10, "y": 20, "width": 220, "height": 14, "confidence": 0.9},
            {"text": "Amazing grace how sweet the sound", "x": 10, "y": 60, "width": 260, "height": 14, "confidence": 0.9},
            {"text": "That saved a wretch like me", "x": 10, "y": 90, "width": 220, "height": 14, "confidence": 0.9},
            {"text": "I once was lost but now am found", "x": 10, "y": 140, "width": 250, "height": 14, "confidence": 0.9},
            {"text": "Was blind but now I see", "x": 10, "y": 170, "width": 200, "height": 14, "confidence": 0.9},
        ]
        with patch("sheet_image_transcribe.ensure_paddleocr_available", return_value=True), patch(
            "sheet_image_transcribe.extract_ocr_boxes",
            return_value=lyric_boxes,
        ), patch(
            "sheet_image_transcribe.detect_staff_regions",
            return_value={"hasStaff": False, "staffRegionCount": 0, "staffRegions": [], "confidence": 0.1},
        ), patch(
            "sheet_image_transcribe.maybe_apply_vlm_fallback",
            new=AsyncMock(return_value=None),
        ), patch(
            "sheet_image_transcribe._extract_melody",
        ) as extract_melody:
            from sheet_image_transcribe import transcribe_sheet_image_bytes

            result = await transcribe_sheet_image_bytes(data, "lyrics_only.png")
            self.assertEqual(result["sheetFormat"], "lyrics_only")
            self.assertEqual(result["chordSheet"]["format"], "lyrics-only")
            self.assertIn("Amazing", result["chordSheet"]["text"])
            extract_melody.assert_not_called()

    async def test_transcribe_empty_detection_raises(self):
        fixture = os.path.join(
            os.path.dirname(__file__),
            "test_fixtures",
            "sheet_images",
            "staff_only.png",
        )
        with open(fixture, "rb") as handle:
            data = handle.read()

        with patch("sheet_image_transcribe.ensure_paddleocr_available", return_value=True), patch(
            "sheet_image_transcribe.extract_ocr_boxes",
            return_value=[],
        ), patch("sheet_image_transcribe.ensure_homr_available", return_value=True), patch(
            "sheet_image_transcribe._extract_melody",
            side_effect=RuntimeError("No noteheads found"),
        ), patch(
            "sheet_image_transcribe.maybe_apply_vlm_fallback",
            new=AsyncMock(return_value=None),
        ), patch(
            "sheet_image_transcribe.detect_staff_regions",
            return_value={"hasStaff": True, "staffRegionCount": 1, "staffRegions": [{"top": 10, "bottom": 40}], "confidence": 0.8},
        ):
            from sheet_image_transcribe import transcribe_sheet_image_bytes

            with self.assertRaisesRegex(RuntimeError, "melody recognition failed"):
                await transcribe_sheet_image_bytes(data, "staff_only.png")


if __name__ == "__main__":
    unittest.main()
