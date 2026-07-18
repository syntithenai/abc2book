import unittest
from unittest.mock import AsyncMock, patch

from notation_fetch import (
    annotate_candidate,
    build_thesession_setting_abc,
    build_web_abc_queries,
    extract_abc_from_text,
    extract_thesession_tune_meta,
    extract_urls_from_search_item,
    filter_notation_candidates,
    is_allowed_abc_host,
    is_direct_abc_file_url,
    normalize_song_type,
    notation_candidate_score,
    parse_abc_header_fields,
    strip_notation_match_decorations,
    tune_meta_from_abc_headers,
    validate_abc_page_url,
)


class NotationFetchTests(unittest.TestCase):
    def test_normalize_song_type(self):
        self.assertEqual(normalize_song_type("Song"), "song")
        self.assertEqual(normalize_song_type("traditional tune"), "traditional_tune")
        self.assertEqual(normalize_song_type(""), "instrumental")

    def test_strip_notation_match_decorations_removes_setting_labels(self):
        self.assertEqual(
            strip_notation_match_decorations("Planxty Burke (waltz) — setting 1"),
            "Planxty Burke",
        )

    def test_notation_candidate_score_matches_thesession_setting_titles(self):
        candidate = annotate_candidate(
            "X:1\nT:Planxty Burke\nK:G\nGAB|",
            "Planxty Burke (waltz) — setting 1",
            "thesession.org",
            "https://thesession.org/tunes/10039#setting1",
            artist="",
            tune_meta={"name": "Planxty Burke", "composer": ""},
        )
        score = notation_candidate_score(candidate, "Planxty Burke", "Turlough O Carolan")
        self.assertGreaterEqual(score, 80)
        kept = filter_notation_candidates([candidate], "Planxty Burke", "Turlough O Carolan")
        self.assertEqual(len(kept), 1)

    def test_build_web_abc_queries_varies_by_song_type(self):
        song_queries = build_web_abc_queries("Wild Rover", "song")
        tune_queries = build_web_abc_queries("Wild Rover", "traditional_tune")
        self.assertTrue(any("lyrics" in query for query in song_queries))
        self.assertTrue(any("traditional" in query or "irish tune" in query for query in tune_queries))
        self.assertNotEqual(song_queries, tune_queries)

    def test_build_web_abc_queries_includes_artist(self):
        queries = build_web_abc_queries("Bicycle Race", "song", "Queen")
        self.assertTrue(any("Queen" in query for query in queries))
        self.assertTrue(any("Bicycle Race" in query for query in queries))
        self.assertTrue(any("filetype:abc" in query for query in queries))

    def test_build_web_abc_queries_includes_new_site_hosts(self):
        queries = build_web_abc_queries("Drowsy Maggie", "traditional_tune")
        self.assertTrue(any("site:folkwiki.ibiblio.org" in query for query in queries))
        self.assertTrue(any("site:abc.sourceforge.net" in query for query in queries))
        self.assertTrue(any("site:john-chambers.us" in query for query in queries))
        self.assertTrue(any("site:irishtune.info" in query for query in queries))
        self.assertTrue(any("site:sessionite.com" in query for query in queries))
        self.assertTrue(any("site:themusicofireland.com" in query for query in queries))

    def test_is_allowed_abc_host_includes_new_hosts(self):
        self.assertTrue(is_allowed_abc_host("folkwiki.ibiblio.org"))
        self.assertTrue(is_allowed_abc_host("www.irishtune.info"))
        self.assertTrue(is_allowed_abc_host("abc.sourceforge.net"))
        self.assertTrue(is_allowed_abc_host("john-chambers.us"))
        self.assertTrue(is_allowed_abc_host("sessionite.com"))
        self.assertTrue(is_allowed_abc_host("themusicofireland.com"))

    def test_is_direct_abc_file_url(self):
        self.assertTrue(is_direct_abc_file_url("https://example.org/tunes/wild-rover.abc"))
        self.assertTrue(is_direct_abc_file_url("https://example.org/WildRover.ABC"))
        self.assertFalse(is_direct_abc_file_url("https://example.org/tunes/wild-rover.html"))

    def test_validate_abc_page_url_allows_direct_abc_on_any_host(self):
        url, error = validate_abc_page_url("https://personal.example.net/archive/rover.abc")
        self.assertIsNone(error)
        self.assertEqual(url, "https://personal.example.net/archive/rover.abc")

    def test_validate_abc_page_url_rejects_unknown_html_pages(self):
        url, error = validate_abc_page_url("https://personal.example.net/tune-page.html")
        self.assertIsNone(url)
        self.assertIn("not supported", error)

    def test_extract_urls_from_search_item_finds_abc_in_snippet(self):
        urls = extract_urls_from_search_item({
            "url": "https://example.com/not-abc",
            "snippet": "Download https://archive.example.org/tunes/drowsy.abc and enjoy.",
        })
        self.assertEqual(urls[0], "https://example.com/not-abc")
        self.assertIn("https://archive.example.org/tunes/drowsy.abc", urls)

    def test_extract_abc_from_text_finds_x_k_block(self):
        abc = """X:1
T:Test Tune
M:4/4
L:1/8
K:Edor
|:D2|"""
        blocks = extract_abc_from_text(abc)
        self.assertEqual(len(blocks), 1)
        self.assertIn("K:Edor", blocks[0])

    def test_extract_abc_from_html_pre_block(self):
        html_text = """
        <html><body>
        <pre>
X:1
T:Drowsy Maggie
M:4/4
L:1/8
K:Edor
|:E2|</pre>
        </body></html>
        """
        blocks = extract_abc_from_text(html_text)
        self.assertEqual(len(blocks), 1)
        self.assertIn("Drowsy Maggie", blocks[0])
        self.assertNotIn("</pre>", blocks[0])
        self.assertNotIn("<", blocks[0])

    def test_extract_abc_strips_html_after_pre(self):
        """abcnotation-style pages: X: match must not swallow chrome after </pre>."""
        html_text = """
        <html><body><div class="tune">
        <pre>
X:1
T:The Foggy Dew
M:4/4
L:1/8
K:Edor
|:E2B2|</pre>
        </div>
        <div class="footer"><a href="/">Home</a><script>alert(1)</script></div>
        <p>More tunes at abcnotation.com</p>
        </body></html>
        """
        blocks = extract_abc_from_text(html_text)
        self.assertEqual(len(blocks), 1)
        self.assertIn("The Foggy Dew", blocks[0])
        self.assertIn("|:E2B2|", blocks[0])
        self.assertNotIn("</pre>", blocks[0])
        self.assertNotIn("<div", blocks[0])
        self.assertNotIn("script", blocks[0])
        self.assertNotIn("abcnotation.com", blocks[0])
        self.assertNotIn("Home", blocks[0])

    def test_sanitize_abc_block_cuts_at_html_tag(self):
        from notation_fetch import sanitize_abc_block
        leaked = """X:1
T:Leak
K:G
|:G2|
</pre>
<div class="chrome">nav</div>"""
        cleaned = sanitize_abc_block(leaked)
        self.assertIn("K:G", cleaned)
        self.assertIn("|:G2|", cleaned)
        self.assertNotIn("</pre>", cleaned)
        self.assertNotIn("chrome", cleaned)

    def test_parse_abc_header_fields_takes_first_of_each(self):
        abc = """X:1
T:First Title
T:Second Title
C:Composer One
C:Composer Two
Q:1/4=112
M:6/8
R:jig
K:G
|:G2|"""
        fields = parse_abc_header_fields(abc)
        self.assertEqual(fields["T"], "First Title")
        self.assertEqual(fields["T_aliases"], ["Second Title"])
        self.assertEqual(fields["C"], "Composer One")
        self.assertEqual(fields["C_artists"], ["Composer Two"])
        self.assertEqual(fields["Q"], "1/4=112")
        self.assertEqual(fields["M"], "6/8")
        self.assertEqual(fields["R"], "jig")
        self.assertEqual(fields["K"], "G")

    def test_tune_meta_from_abc_headers_maps_multi_title_and_composer(self):
        abc = """X:1
T:Main Title
T:Alt Title
C:Writer
C:Band
M:4/4
K:G
|:G2|"""
        meta = tune_meta_from_abc_headers(abc)
        self.assertEqual(meta["name"], "Main Title")
        self.assertEqual(meta["aliases"], ["Alt Title"])
        self.assertEqual(meta["composer"], "Writer")
        self.assertEqual(meta["artists"], ["Band"])

    def test_tune_meta_from_abc_headers_maps_candidate_fields(self):
        abc = """X:1
T:Drowsy Maggie
C:Traditional
Q:1/2=90
M:4/4
R:reel
K:Edor
|:E2|"""
        meta = tune_meta_from_abc_headers(abc, "https://abcnotation.com/tunePage?a=1")
        self.assertEqual(meta["name"], "Drowsy Maggie")
        self.assertEqual(meta["composer"], "Traditional")
        self.assertEqual(meta["tempo"], 90)
        self.assertEqual(meta["meter"], "4/4")
        self.assertEqual(meta["rhythm"], "reel")
        self.assertEqual(meta["key"], "Edor")
        self.assertEqual(meta["srcUrl"], "https://abcnotation.com/tunePage?a=1")

    def test_annotate_candidate_includes_preview(self):
        candidate = annotate_candidate("X:1\nK:G\nGAB|", "Test", "thesession.org", "https://thesession.org/tunes/1")
        self.assertIn("preview", candidate)
        self.assertIn("K:G", candidate["preview"])

    def test_build_thesession_setting_abc_wraps_body_only_notation(self):
        tune = {"name": "Snow On The Tracks", "type": "march", "composer": "Rachel Darling"}
        setting = {
            "id": 43446,
            "key": "Dmajor",
            "abc": "|:d2 c2A2|B2AG F2A2-|AA,DE F2A2|E3E- EEDE|D2:|",
        }
        abc = build_thesession_setting_abc(tune, setting)
        self.assertIn("T:Snow On The Tracks", abc)
        self.assertIn("C:Rachel Darling", abc)
        self.assertIn("R:march", abc)
        self.assertIn("K:Dmajor", abc)
        self.assertIn("|:d2 c2A2", abc)

    def test_extract_thesession_tune_meta_includes_comments_and_links(self):
        tune = {
            "id": 21706,
            "name": "Snow On The Tracks",
            "type": "march",
            "composer": "Rachel Darling",
            "url": "https://thesession.org/tunes/21706",
            "aliases": ["Snow"],
            "recordings": 1,
            "tunebooks": 44,
            "comments": [
                {
                    "content": "Beautiful tune by Rachel Darling.",
                    "member": {"name": "bdh"},
                    "date": "2022-03-26 13:50:09",
                }
            ],
        }
        setting = {
            "id": 43446,
            "key": "Dmajor",
            "url": "https://thesession.org/tunes/21706#setting43446",
            "member": {"name": "bdh"},
            "date": "2022-03-26 13:50:09",
        }
        meta = extract_thesession_tune_meta(tune, setting)
        self.assertEqual(meta["name"], "Snow On The Tracks")
        self.assertEqual(meta["composer"], "Rachel Darling")
        self.assertEqual(meta["rhythm"], "march")
        self.assertEqual(meta["aliases"], ["Snow"])
        self.assertEqual(meta["srcUrl"], "https://thesession.org/tunes/21706")
        self.assertIn("Beautiful tune", meta["backgroundInfo"])
        self.assertIn("Setting contributed by bdh", meta["backgroundInfo"])
        self.assertEqual(meta["links"][0]["link"], "https://thesession.org/tunes/21706")
        self.assertEqual(meta["meta"]["thesession_tune_id"], ["21706"])
        self.assertEqual(meta["meta"]["thesession_setting_id"], ["43446"])


class _FakeHttpResponse:
    def __init__(self, text, url="https://example.com/", status_code=200, headers=None):
        self.text = text
        self.url = url
        self.status_code = status_code
        self.headers = headers or {"content-type": "text/html"}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception("HTTP {0}".format(self.status_code))


class NotationFetchAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_notation_emits_progress_and_returns_session_candidate(self):
        from notation_fetch import search_notation

        progress = []

        async def on_progress(stage, message, progress_value):
            progress.append({
                "stage": stage,
                "message": message,
                "progress": progress_value,
            })

        session_search = {
            "tunes": [
                {"id": 123, "name": "Drowsy Maggie", "type": "reel"},
            ]
        }
        session_tune = {
            "settings": [
                {
                    "id": 456,
                    "abc": "X:1\nT:Drowsy Maggie\nM:4/4\nL:1/8\nK:Edor\n|:E2|",
                    "key": "Edor",
                }
            ]
        }

        class FakeResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        class FakeClient:
            async def get(self, url, **kwargs):
                if url.endswith("/tunes/search"):
                    return FakeResponse(session_search)
                if "/tunes/123" in url:
                    return FakeResponse(session_tune)
                raise AssertionError("Unexpected URL: " + url)

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

        with patch("notation_fetch.httpx.AsyncClient", return_value=FakeClient()):
            with patch("notation_fetch.collect_web_abc_candidates", new=AsyncMock(return_value=[])):
                with patch("notation_fetch.collect_musescore_candidates", new=AsyncMock(return_value=[])):
                    with patch("notation_fetch.collect_web_midi_candidates", new=AsyncMock(return_value=[])):
                        result = await search_notation(
                            "Drowsy Maggie",
                            song_type="traditional_tune",
                            on_progress=on_progress,
                        )

        self.assertIn("abc", result)
        self.assertIn("K:Edor", result["abc"])
        self.assertTrue(any(item["stage"] == "thesession" for item in progress))
        self.assertTrue(any(item["stage"] == "sources" for item in progress))
        self.assertTrue(any(item["stage"] == "done" for item in progress))

    async def test_search_notation_handles_snow_on_the_tracks_style_settings(self):
        from notation_fetch import search_notation

        session_search = {
            "tunes": [
                {"id": 21706, "name": "Snow On The Tracks", "type": "march"},
            ]
        }
        session_tune = {
            "name": "Snow On The Tracks",
            "type": "march",
            "settings": [
                {
                    "id": 43446,
                    "key": "Dmajor",
                    "abc": "|:d2 c2A2|B2AG F2A2-|AA,DE F2A2|E3E- EEDE|D2:|",
                }
            ],
        }

        class FakeResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        class FakeClient:
            async def get(self, url, **kwargs):
                if url.endswith("/tunes/search"):
                    return FakeResponse(session_search)
                if "/tunes/21706" in url:
                    return FakeResponse(session_tune)
                raise AssertionError("Unexpected URL: " + url)

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

        with patch("notation_fetch.httpx.AsyncClient", return_value=FakeClient()):
            with patch("notation_fetch.collect_web_abc_candidates", new=AsyncMock(return_value=[])):
                with patch("notation_fetch.collect_musescore_candidates", new=AsyncMock(return_value=[])):
                    with patch("notation_fetch.collect_web_midi_candidates", new=AsyncMock(return_value=[])):
                        result = await search_notation("Snow On The Tracks", song_type="traditional_tune")

        self.assertIn("abc", result)
        self.assertIn("Snow On The Tracks", result["abc"])
        self.assertIn("K:Dmajor", result["abc"])
        self.assertIn("|:d2 c2A2", result["abc"])

    async def test_collect_web_abc_candidates_uses_song_type_queries(self):
        from notation_fetch import collect_web_abc_candidates

        progress = []

        async def on_progress(stage, message, progress_value):
            progress.append(message)

        web_results = [{
            "title": "Wild Rover ABC",
            "url": "https://abcnotation.com/tunePage?a=1",
            "snippet": "abc",
            "source": "brave",
        }]
        abc_page = """X:1
T:Wild Rover
C:Traditional
Q:1/4=100
M:4/4
R:song
K:D
|:D|"""

        class FakeClient:
            async def get(self, url, **kwargs):
                return _FakeHttpResponse(abc_page, url=url)

        with patch("notation_fetch.search_web", new=AsyncMock(return_value=web_results)):
            with patch("browser_fetch.browser_get_html", new=AsyncMock()):
                candidates = await collect_web_abc_candidates(
                    FakeClient(),
                    "Wild Rover",
                    "song",
                    on_progress=on_progress,
                )

        self.assertEqual(len(candidates), 1)
        self.assertIn("K:D", candidates[0]["abc"])
        self.assertEqual(candidates[0]["title"], "Wild Rover")
        self.assertEqual(candidates[0]["artist"], "Traditional")
        self.assertEqual(candidates[0]["tuneMeta"]["key"], "D")
        self.assertEqual(candidates[0]["tuneMeta"]["meter"], "4/4")
        self.assertEqual(candidates[0]["tuneMeta"]["rhythm"], "song")
        self.assertEqual(candidates[0]["tuneMeta"]["tempo"], 100)
        self.assertFalse(candidates[0]["titleOnly"])
        self.assertTrue(any("Searching the web" in message for message in progress))

    async def test_collect_web_abc_candidates_fetches_direct_abc_from_snippet(self):
        from notation_fetch import collect_web_abc_candidates

        web_results = [{
            "title": "Personal tune archive",
            "url": "https://example.com/blog/post",
            "snippet": "ABC file: https://personal.example.net/tunes/wild-rover.abc",
            "source": "duckduckgo",
        }]
        abc_file = """X:1
T:Wild Rover
M:4/4
L:1/8
K:D
|:D|"""

        class FakeClient:
            async def get(self, url, **kwargs):
                return _FakeHttpResponse(
                    abc_file,
                    url=url,
                    headers={"content-type": "text/plain; charset=utf-8"},
                )

        with patch("notation_fetch.search_web", new=AsyncMock(return_value=web_results)):
            with patch("browser_fetch.browser_get_html", new=AsyncMock()):
                candidates = await collect_web_abc_candidates(
                    FakeClient(),
                    "Query Title Should Be Replaced",
                    "song",
                    on_progress=None,
                )

        self.assertEqual(len(candidates), 1)
        self.assertIn("K:D", candidates[0]["abc"])
        self.assertEqual(candidates[0]["title"], "Wild Rover")
        self.assertEqual(candidates[0]["sourceUrl"], "https://personal.example.net/tunes/wild-rover.abc")
        self.assertEqual(candidates[0]["tuneMeta"]["name"], "Wild Rover")

    async def test_search_notation_runs_web_when_session_matches_are_weak(self):
        from notation_fetch import search_notation

        progress = []
        web_called = {"value": False}

        async def on_progress(stage, message, progress_value):
            progress.append(stage)

        session_search = {
            "tunes": [
                {"id": 999, "name": "The Bicycle", "type": "reel"},
            ]
        }
        session_tune = {
            "settings": [
                {
                    "id": 1,
                    "abc": "X:1\nT:The Bicycle\nM:4/4\nL:1/8\nK:G\n|:G2|",
                    "key": "G",
                }
            ]
        }
        web_candidate = {
            "abc": "X:1\nT:Bicycle Race\nC:Queen\nM:4/4\nL:1/8\nK:C\n|:C2|",
            "title": "Bicycle Race",
            "artist": "Queen",
            "source": "abcnotation.com",
            "sourceUrl": "https://abcnotation.com/tunePage?a=1",
        }

        class FakeResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        class FakeClient:
            async def get(self, url, **kwargs):
                if url.endswith("/tunes/search"):
                    return FakeResponse(session_search)
                if "/tunes/999" in url:
                    return FakeResponse(session_tune)
                raise AssertionError("Unexpected URL: " + url)

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

        async def fake_collect_web_abc_candidates(client, title, song_type, artist="", on_progress=None):
            web_called["value"] = True
            return [web_candidate]

        with patch("notation_fetch.httpx.AsyncClient", return_value=FakeClient()):
            with patch("notation_fetch.collect_web_abc_candidates", new=fake_collect_web_abc_candidates):
                with patch("notation_fetch.collect_musescore_candidates", new=AsyncMock(return_value=[])):
                    with patch("notation_fetch.collect_web_midi_candidates", new=AsyncMock(return_value=[])):
                        result = await search_notation(
                            "Bicycle Race",
                            artist="Queen",
                            song_type="song",
                            on_progress=on_progress,
                        )

        self.assertTrue(web_called["value"])
        self.assertIn("abc", result)
        self.assertIn("Bicycle Race", result["abc"])
        self.assertTrue(any(stage == "sources" for stage in progress))


if __name__ == "__main__":
    unittest.main()
