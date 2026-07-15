import unittest
from unittest.mock import AsyncMock, patch

from midi_fetch import (
    annotate_midi_candidate,
    build_midi_search_queries,
    extract_midi_file_urls_from_html,
    is_allowed_midi_host,
    is_direct_midi_file_url,
    midi_urls_from_search_results,
    title_from_midi_url,
)
from notation_fetch import finalize_notation_candidates, search_notation
from notation_title_variants import notation_title_variants


MINIMAL_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>
"""


class NotationTitleVariantTests(unittest.TestCase):
    def test_clare_clair_variants(self):
        variants = notation_title_variants("Clare de Lune")
        self.assertEqual(variants[0], "Clare de Lune")
        self.assertIn("Clair de Lune", variants)

    def test_clair_to_clare(self):
        variants = notation_title_variants("Clair de Lune")
        self.assertIn("Clare de Lune", variants)
        self.assertIn("Claire de Lune", variants)

    def test_claire_to_clair(self):
        variants = notation_title_variants("Claire de Lune")
        self.assertEqual(variants[0], "Claire de Lune")
        self.assertIn("Clair de Lune", variants)


class MidiFetchHelperTests(unittest.TestCase):
    def test_allowlist_and_direct_url(self):
        self.assertTrue(is_allowed_midi_host("www.bitmidi.com"))
        self.assertTrue(is_allowed_midi_host("archive.org"))
        self.assertFalse(is_allowed_midi_host("evil.example"))
        self.assertTrue(is_direct_midi_file_url("https://bitmidi.com/files/clair.mid"))
        self.assertTrue(is_direct_midi_file_url("https://example.com/a.midi"))
        self.assertFalse(is_direct_midi_file_url("https://bitmidi.com/clair-de-lune"))

    def test_build_queries_include_sites_and_variants(self):
        queries = build_midi_search_queries("Clare de Lune")
        self.assertTrue(any("site:bitmidi.com" in q for q in queries))
        self.assertTrue(any("site:midiworld.com" in q for q in queries))
        self.assertTrue(any("Clair de Lune" in q for q in queries))
        self.assertTrue(any("filetype:mid" in q for q in queries))

    def test_extract_midi_from_html_and_search(self):
        html = """
        <html><body>
          <a href="/files/clair-de-lune.mid">Download</a>
          <a href="https://evil.example/bad.mid">nope</a>
        </body></html>
        """
        urls = extract_midi_file_urls_from_html(html, "https://bitmidi.com/clair")
        self.assertEqual(urls[0], "https://bitmidi.com/files/clair-de-lune.mid")
        files, pages = midi_urls_from_search_results([
            {
                "url": "https://example.com/other",
                "snippet": "See https://archive.org/download/x/clair.mid here",
            },
            {"url": "https://bitmidi.com/clair-de-lune"},
        ])
        self.assertIn("https://archive.org/download/x/clair.mid", files)
        self.assertIn("https://bitmidi.com/clair-de-lune", pages)

    def test_title_from_url_and_annotate(self):
        self.assertEqual(
            title_from_midi_url("https://bitmidi.com/files/clair_de_lune.mid", "Fallback"),
            "clair de lune",
        )
        candidate = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Clair de Lune",
            source_url="https://bitmidi.com/files/clair.mid",
        )
        self.assertEqual(candidate["source"], "bitmidi.com")
        self.assertEqual(candidate["tuneMeta"]["meta"]["importFormat"], "midi")
        self.assertIn("<score-partwise", candidate["musicXml"])


class MidiCascadeTests(unittest.IsolatedAsyncioTestCase):
    async def test_finalize_demotes_weak_session_when_midi_present(self):
        session = {
            "abc": "X:1\nT:Clare\nM:4/4\nL:1/8\nK:G\n|:G2|",
            "title": "Clare",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Clair de Lune",
            source_url="https://bitmidi.com/files/clair.mid",
        )
        finalized = finalize_notation_candidates(
            [session, midi],
            "Clare de Lune",
            "",
        )
        sources = [c.get("source") for c in finalized]
        self.assertIn("bitmidi.com", sources)
        self.assertNotIn("thesession.org", sources)

    async def test_search_notation_runs_midi_when_only_weak_session(self):
        weak_session = {
            "abc": "X:1\nT:Clare\nM:4/4\nL:1/8\nK:G\n|:G2|",
            "title": "Clare",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        midi = annotate_midi_candidate(
            MINIMAL_MUSICXML,
            title="Clair de Lune",
            source_url="https://bitmidi.com/files/clair.mid",
        )

        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[weak_session],
        ), patch(
            "notation_fetch.collect_web_abc_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_web_midi_candidates",
            new_callable=AsyncMock,
            return_value=[midi],
        ) as midi_mock:
            body = await search_notation("Clare de Lune")

        midi_mock.assert_awaited()
        if body.get("multiple"):
            sources = [c.get("source") for c in body["candidates"]]
        else:
            sources = [body.get("source")]
        self.assertIn("bitmidi.com", sources)
        self.assertNotIn("thesession.org", sources)

    async def test_search_notation_skips_midi_when_strong_match(self):
        strong = {
            "abc": "X:1\nT:Clare de Lune\nM:4/4\nL:1/8\nK:C\n|:C2|",
            "title": "Clare de Lune",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/9",
            "preview": "X:1",
            "titleOnly": False,
        }
        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[strong],
        ), patch(
            "notation_fetch.collect_web_abc_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_web_midi_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ) as midi_mock:
            body = await search_notation("Clare de Lune")

        midi_mock.assert_not_awaited()
        self.assertEqual(body["source"], "thesession.org")


if __name__ == "__main__":
    unittest.main()
