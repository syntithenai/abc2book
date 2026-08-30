#!/usr/bin/env python3
"""Tests for oldtimefiddletunes index parsing."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from scrape_index import parse_index_html  # noqa: E402
from common import parse_youtube_start, slug_from_pdf_url  # noqa: E402


SAMPLE = """
<html><body>
<h2>Old Time Reels (Appalachian and Midwestern)</h2>
<a href="tunes/Abe'sRetreat.pdf">Abe's Retreat</a>&nbsp;(<a href="http://example.com/">Bruce Greene</a> from Emory Bailey A<sub>mix</sub>)&nbsp;
<a href="tunes/Abe'sRetreat.MID"><img alt="piano keys"></a>&nbsp;
<a href="tunes/audio/Abe'sRetreat.mp3"><img alt="audio"></a>Emory Bailey<br>
<a href="tunes/AddieOnSandbar.pdf">Addie On The Sandbar</a>&nbsp;(by Ben Knowles G)&nbsp;
<a href="tunes/AddieOnSandbar.MID"><img alt="piano keys"></a>&nbsp;
<a href="tunes/audio/AddieOnSandbar.mp3"><img alt="audio"></a><br>
<h2>Waltzes</h2>
<a href="tunes/BlackVelvet.pdf">Black Velvet Waltz</a>&nbsp;(Don Messer C)&nbsp;
<a href="tunes/BlackVelvetWithHarmony.pdf">with harmony</a>
<a href="tunes/BlackVelvet.MID"><img alt="piano keys"></a>&nbsp;
<a href="tunes/audio/BlackVelvetDonMesser.mp3"><img alt="audio"></a>
<a href="tunes/audio/BlackVelvetPattiKusturok.mp3"><img alt="audio"></a>
<a href="https://youtu.be/abc123?t=15"><img alt="Youtube logo"></a>
</body></html>
"""


class ParseIndexTests(unittest.TestCase):
    def test_parses_titles_media_and_sections(self):
        tunes = parse_index_html(SAMPLE)
        by_slug = {t["slug"]: t for t in tunes}
        self.assertIn("abesretreat", by_slug)
        abe = by_slug["abesretreat"]
        self.assertEqual(abe["title"], "Abe's Retreat")
        self.assertTrue(abe["midiUrl"].endswith("Abe'sRetreat.MID"))
        self.assertEqual(len(abe["audioUrls"]), 1)
        self.assertIn("mix", abe["key"].lower())
        self.assertIn("Appalachian", abe["section"])

        velvet = by_slug["blackvelvet"]
        self.assertEqual(len(velvet["audioUrls"]), 2)
        self.assertEqual(len(velvet["youtubeUrls"]), 1)
        self.assertTrue(velvet["midiUrl"].endswith("BlackVelvet.MID"))
        self.assertEqual(len(velvet.get("altPdfUrls") or []), 1)
        self.assertIn("Waltzes", velvet["section"])
        self.assertNotIn("blackvelvetwithharmony", by_slug)

    def test_slug_and_youtube_start(self):
        self.assertEqual(
            slug_from_pdf_url("https://www.oldtimefiddletunes.net/tunes/Abe'sRetreat.pdf"),
            "abesretreat",
        )
        self.assertEqual(parse_youtube_start("https://youtu.be/x?t=15"), 15)
        self.assertEqual(parse_youtube_start("https://www.youtube.com/watch?v=x&t=1m5s"), 65)


if __name__ == "__main__":
    unittest.main()
