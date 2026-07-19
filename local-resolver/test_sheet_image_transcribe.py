import os
import unittest
from unittest.mock import AsyncMock, patch

from chord_sheet_utils import (
    build_sections_from_lines,
    classify_lyric_chord_lines,
    estimate_chord_sheet_confidence,
    reconstruct_chords_over_words,
)
from sheet_image_melody import extract_main_melody_from_musicxml
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


class MelodyExtractTests(unittest.TestCase):
    def test_extract_main_melody(self):
        result = extract_main_melody_from_musicxml(SAMPLE_MUSICXML)
        self.assertIn("C", result["abc"])
        self.assertEqual(result["partName"], "Melody")
        self.assertGreater(result["confidence"], 0.5)

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
        lines = result["abc"].splitlines()
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[0].endswith("|"))
        self.assertTrue(lines[1].endswith("|]"))
        self.assertIn("C D E F |", lines[0])
        self.assertIn("d c B A |]", lines[1])


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
        ):
            from sheet_image_transcribe import transcribe_sheet_image_bytes

            result = await transcribe_sheet_image_bytes(data, "chord_chart.png")
            self.assertEqual(result["pageType"], "chord_chart")
            self.assertIn("Amazing", result["chordSheet"]["text"])

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
            return_value={"hasStaff": True, "staffRegionCount": 1, "staffRegions": [], "confidence": 0.8},
        ):
            from sheet_image_transcribe import transcribe_sheet_image_bytes

            with self.assertRaisesRegex(RuntimeError, "melody recognition failed"):
                await transcribe_sheet_image_bytes(data, "staff_only.png")


if __name__ == "__main__":
    unittest.main()
