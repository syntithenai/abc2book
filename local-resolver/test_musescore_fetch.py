import io
import unittest
import zipfile
from unittest.mock import AsyncMock, patch

from musescore_fetch import (
    MuseScoreDownloadUnavailable,
    annotate_musescore_candidate,
    build_musescore_search_queries,
    extract_musicxml_download_urls,
    extract_musicxml_from_mxl_bytes,
    extract_musescore_page_meta,
    is_musescore_url,
    musescore_urls_from_search_results,
    page_looks_paywalled,
    parse_musescore_score_url,
)
from notation_fetch import search_notation


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


def _mxl_bytes_for(music_xml, root_name="score.xml"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container><rootfiles>'
            '<rootfile full-path="{0}"/>'
            '</rootfiles></container>'.format(root_name),
        )
        archive.writestr(root_name, music_xml)
    return buf.getvalue()


class MuseScoreFetchTests(unittest.TestCase):
    def test_parse_musescore_score_url(self):
        parsed = parse_musescore_score_url(
            "https://www.musescore.com/user/123/scores/4074271?share=copy"
        )
        self.assertEqual(parsed["scoreId"], "4074271")
        self.assertEqual(parsed["user"], "123")
        self.assertEqual(parsed["url"], "https://musescore.com/user/123/scores/4074271")
        self.assertTrue(is_musescore_url(parsed["url"]))
        self.assertIsNone(parse_musescore_score_url("https://thesession.org/tunes/1"))
        openscore = parse_musescore_score_url("https://musescore.com/openscore/scores/4074271")
        self.assertEqual(openscore["url"], "https://musescore.com/openscore/scores/4074271")
        self.assertEqual(openscore["scoreId"], "4074271")

    def test_extract_page_meta_and_download_urls(self):
        html = """
        <html><head>
          <meta property="og:title" content="Aequale No. 1"/>
        </head><body>
          <a href="https://cdn.example.com/files/aequale.mxl">Download</a>
          <script>{"composer":"Ludwig van Beethoven","title":"Aequale No. 1"}</script>
        </body></html>
        """
        meta = extract_musescore_page_meta(
            html,
            "https://musescore.com/openscore/scores/4074271",
        )
        self.assertEqual(meta["title"], "Aequale No. 1")
        self.assertEqual(meta["artist"], "Ludwig van Beethoven")
        self.assertEqual(meta["scoreId"], "4074271")
        urls = extract_musicxml_download_urls(
            html,
            "https://musescore.com/openscore/scores/4074271",
        )
        self.assertIn("https://cdn.example.com/files/aequale.mxl", urls)

    def test_page_looks_paywalled(self):
        self.assertTrue(page_looks_paywalled("Upgrade to MuseScore Pro to download"))
        self.assertFalse(page_looks_paywalled("<html><body>Public domain score</body></html>"))

    def test_extract_musicxml_from_mxl_bytes(self):
        data = _mxl_bytes_for(MINIMAL_MUSICXML, root_name="path/to/score.xml")
        text = extract_musicxml_from_mxl_bytes(data)
        self.assertIn("<score-partwise", text)

    def test_build_queries_and_search_url_extraction(self):
        queries = build_musescore_search_queries("Wild Rover", "Dubliners")
        self.assertTrue(any("site:musescore.com" in q for q in queries))
        self.assertTrue(any("Dubliners" in q for q in queries))
        urls = musescore_urls_from_search_results([
            {
                "url": "https://example.com/other",
                "snippet": "See https://musescore.com/user/9/scores/12345 for sheet",
            },
            {"url": "https://musescore.com/openscore/scores/999"},
        ])
        self.assertEqual(urls[0], "https://musescore.com/user/9/scores/12345")
        self.assertIn("https://musescore.com/openscore/scores/999", urls)

    def test_annotate_musescore_candidate(self):
        candidate = annotate_musescore_candidate(
            MINIMAL_MUSICXML,
            title="Test",
            artist="Anon",
            source_url="https://musescore.com/user/1/scores/2",
            score_id="2",
        )
        self.assertEqual(candidate["source"], "musescore.com")
        self.assertIn("<score-partwise", candidate["musicXml"])
        self.assertEqual(candidate["abc"], "")
        self.assertEqual(candidate["tuneMeta"]["meta"]["musescore_score_id"], "2")


class MuseScoreNotationCascadeTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_notation_merges_musescore_and_succeeds_when_gated(self):
        session_candidate = {
            "abc": "X:1\nT:Drowsy Maggie\nM:4/4\nL:1/8\nK:Edor\n|:E2|",
            "title": "Drowsy Maggie",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        muse_ok = annotate_musescore_candidate(
            MINIMAL_MUSICXML,
            title="Drowsy Maggie",
            source_url="https://musescore.com/user/1/scores/42",
            score_id="42",
        )

        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[session_candidate],
        ), patch(
            "notation_fetch.has_strong_notation_match",
            return_value=False,
        ), patch(
            "notation_fetch.collect_web_abc_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value=[muse_ok],
        ):
            body = await search_notation("Drowsy Maggie")

        self.assertTrue(body.get("multiple"))
        sources = [c.get("source") for c in body["candidates"]]
        self.assertIn("thesession.org", sources)
        self.assertIn("musescore.com", sources)

    async def test_search_notation_succeeds_when_all_musescore_gated(self):
        session_candidate = {
            "abc": "X:1\nT:Drowsy Maggie\nM:4/4\nL:1/8\nK:Edor\n|:E2|",
            "title": "Drowsy Maggie",
            "artist": "",
            "source": "thesession.org",
            "sourceUrl": "https://thesession.org/tunes/1",
            "preview": "X:1",
            "titleOnly": False,
        }
        with patch(
            "notation_fetch.collect_thesession_candidates",
            new_callable=AsyncMock,
            return_value=[session_candidate],
        ), patch(
            "notation_fetch.has_strong_notation_match",
            return_value=True,
        ), patch(
            "notation_fetch.collect_musescore_candidates",
            new_callable=AsyncMock,
            return_value=[],
        ):
            body = await search_notation("Drowsy Maggie")

        self.assertEqual(body["source"], "thesession.org")

    async def test_fetch_musescore_url_raises_on_paywall(self):
        from musescore_fetch import fetch_musescore_url
        from polite_fetch import FetchResult

        html = "<html><body>Upgrade to MuseScore Pro to download this score</body></html>"
        with patch(
            "musescore_fetch.fetch_html_with_fallback",
            new_callable=AsyncMock,
            return_value=FetchResult(
                status=200,
                text=html,
                final_url="https://musescore.com/user/1/scores/9",
                blocked_reason="none",
            ),
        ):
            with self.assertRaises(MuseScoreDownloadUnavailable):
                await fetch_musescore_url("https://musescore.com/user/1/scores/9")

    async def test_fetch_musescore_url_public_mxl(self):
        from musescore_fetch import fetch_musescore_url
        from polite_fetch import FetchResult

        page_html = """
        <html><head><meta property="og:title" content="Public Tune"/></head>
        <body><a href="https://cdn.example.com/public.mxl">mxl</a></body></html>
        """
        mxl = _mxl_bytes_for(MINIMAL_MUSICXML)

        class FakeResponse:
            status_code = 200
            headers = {"content-type": "application/octet-stream"}
            content = mxl

        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=FakeResponse())
        fake_client.aclose = AsyncMock()

        with patch(
            "musescore_fetch.fetch_html_with_fallback",
            new_callable=AsyncMock,
            return_value=FetchResult(
                status=200,
                text=page_html,
                final_url="https://musescore.com/user/1/scores/9",
                blocked_reason="none",
            ),
        ), patch(
            "musescore_fetch.httpx.AsyncClient",
            return_value=fake_client,
        ):
            # httpx.AsyncClient used as context manager in fetch_musescore_url when client is None
            fake_client.__aenter__ = AsyncMock(return_value=fake_client)
            fake_client.__aexit__ = AsyncMock(return_value=False)
            result = await fetch_musescore_url("https://musescore.com/user/1/scores/9")

        self.assertEqual(result["source"], "musescore.com")
        self.assertIn("<score-partwise", result["musicXml"])
        self.assertEqual(result["title"], "Public Tune")


if __name__ == "__main__":
    unittest.main()
