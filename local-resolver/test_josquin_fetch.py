import unittest
from unittest.mock import AsyncMock, patch

from josquin_fetch import (
    annotate_josquin_candidate,
    is_josquin_url,
    josquin_musicxml_url,
    parse_josquin_catalog_id,
)


MINIMAL_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name/></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch></note></measure></part>
</score-partwise>
"""


class JosquinFetchTests(unittest.TestCase):
    def test_parse_josquin_catalog_id(self):
        self.assertEqual(parse_josquin_catalog_id("https://data.josqu.in/Jos2721.musicxml"), "Jos2721")
        self.assertEqual(parse_josquin_catalog_id("https://josquin.stanford.edu/data?id=Ano3001"), "Ano3001")
        self.assertEqual(josquin_musicxml_url("Jos2721"), "https://data.josqu.in/Jos2721.musicxml")
        self.assertTrue(is_josquin_url("https://data.josqu.in/Jos2721.musicxml"))

    def test_annotate_josquin_candidate(self):
        candidate = annotate_josquin_candidate(
            MINIMAL_MUSICXML,
            title="La Bernardina",
            artist="Josquin",
            source_url="https://data.josqu.in/Jos2721.musicxml",
            catalog_id="Jos2721",
        )
        self.assertEqual(candidate["source"], "josquin.stanford.edu")
        self.assertEqual(candidate["tuneMeta"]["meta"]["archive"], "josquin")
        self.assertIn("musicXml", candidate)


class JosquinFetchAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_josquin_url(self):
        response = AsyncMock()
        response.status_code = 200
        response.headers = {"content-type": "application/xml"}
        response.content = MINIMAL_MUSICXML.encode("utf-8")

        with patch("josquin_fetch.fetch_binary", AsyncMock(return_value=response)):
            from josquin_fetch import fetch_josquin_url
            candidate = await fetch_josquin_url("https://data.josqu.in/Jos2721.musicxml")
        self.assertEqual(candidate["tuneMeta"]["meta"]["josquin_catalog_id"], "Jos2721")


if __name__ == "__main__":
    unittest.main()
