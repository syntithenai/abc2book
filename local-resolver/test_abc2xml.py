import asyncio
import re
import unittest

from server import (
    convert_abc_to_musicxml,
    _parse_abc_lyrics,
    _sanitize_abc_for_musicxml,
)


SAMPLE_ABC = """X:1
T:After the Battle
M:4/4
L:1/8
K:D
|:FA|d2f2 e2d2|B2d2 A2FA|d2f2 e2d2|B2A2 FED2:|
"""

SAMPLE_ABC_WITH_LYRICS = """X:1
T:Test Song
M:4/4
L:1/4
K:C
CDEF|
w: one two three four
"""

SAMPLE_ABC_WITH_BLOCK_LYRICS = """X:1
T:Block Lyrics
M:4/4
L:1/4
K:C
CDEF|
W: First line of verse
W: Second line of verse
"""

THESESSION_ABC = """X: 671
T: After The Battle Of Aughrim
R: march
M: 
K: Adorian
M:4/4
AG|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|BGAG E2D2|
"""


class Abc2XmlTests(unittest.TestCase):
    def test_sanitize_abc_strips_blank_meter_and_comments(self):
        cleaned = _sanitize_abc_for_musicxml(THESESSION_ABC)
        self.assertNotIn("M: \n", cleaned)
        self.assertIn("M:4/4", cleaned)

    def test_parse_abc_lyrics_extracts_w_and_w_lines(self):
        block_lines, voice_w_lines, voice_order = _parse_abc_lyrics(SAMPLE_ABC_WITH_LYRICS)
        self.assertEqual(block_lines, [])
        self.assertEqual(voice_w_lines.get("1"), ["one two three four"])
        self.assertEqual(voice_order, ["1"])

        block_lines, voice_w_lines, voice_order = _parse_abc_lyrics(SAMPLE_ABC_WITH_BLOCK_LYRICS)
        self.assertEqual(block_lines, ["First line of verse", "Second line of verse"])
        self.assertEqual(voice_w_lines, {})

    def test_convert_abc_to_musicxml_returns_complete_measures(self):
        music_xml = asyncio.run(convert_abc_to_musicxml(SAMPLE_ABC))
        self.assertIn("<score-partwise", music_xml)
        self.assertIn("<measure", music_xml)
        self.assertNotIn("Found: 0/1", music_xml)

    def test_convert_abc_to_musicxml_includes_note_aligned_lyrics(self):
        music_xml = asyncio.run(convert_abc_to_musicxml(SAMPLE_ABC_WITH_LYRICS))
        self.assertIn("<lyric", music_xml)
        self.assertIn("<text>one</text>", music_xml)
        self.assertIn("<text>two</text>", music_xml)
        self.assertIn("<text>three</text>", music_xml)
        self.assertIn("<text>four</text>", music_xml)

    def test_convert_abc_to_musicxml_includes_block_lyrics(self):
        music_xml = asyncio.run(convert_abc_to_musicxml(SAMPLE_ABC_WITH_BLOCK_LYRICS))
        self.assertIn("<lyric", music_xml)
        self.assertIn("<text>First</text>", music_xml)
        self.assertIn("<text>line</text>", music_xml)

    def test_convert_thesession_abc_to_musicxml(self):
        music_xml = asyncio.run(convert_abc_to_musicxml(THESESSION_ABC))
        self.assertIn("<measure", music_xml)
        self.assertGreater(music_xml.count("<note"), 5)


if __name__ == "__main__":
    unittest.main()
