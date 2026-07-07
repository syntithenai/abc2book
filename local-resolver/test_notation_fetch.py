import unittest
from unittest.mock import AsyncMock, patch

from notation_fetch import (
    annotate_candidate,
    build_thesession_setting_abc,
    build_web_abc_queries,
    extract_abc_from_text,
    extract_thesession_tune_meta,
    extract_urls_from_search_item,
    is_direct_abc_file_url,
    normalize_song_type,
    validate_abc_page_url,
)


class NotationFetchTests(unittest.TestCase):
    def test_normalize_song_type(self):
        self.assertEqual(normalize_song_type("Song"), "song")
        self.assertEqual(normalize_song_type("traditional tune"), "traditional_tune")
        self.assertEqual(normalize_song_type(""), "instrumental")

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
            result = await search_notation("Drowsy Maggie", song_type="traditional_tune", on_progress=on_progress)

        self.assertIn("abc", result)
        self.assertIn("K:Edor", result["abc"])
        self.assertTrue(any(item["stage"] == "thesession" for item in progress))
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
M:4/4
L:1/8
K:D
|:D|"""

        class FakeClient:
            async def get(self, url, **kwargs):
                class Resp:
                    text = abc_page
                    headers = {"content-type": "text/html"}

                    def raise_for_status(self):
                        return None

                return Resp()

        with patch("notation_fetch.search_web", new=AsyncMock(return_value=web_results)):
            candidates = await collect_web_abc_candidates(
                FakeClient(),
                "Wild Rover",
                "song",
                on_progress=on_progress,
            )

        self.assertEqual(len(candidates), 1)
        self.assertIn("K:D", candidates[0]["abc"])
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
                class Resp:
                    text = abc_file
                    headers = {"content-type": "text/plain; charset=utf-8"}

                    def raise_for_status(self):
                        return None

                return Resp()

        with patch("notation_fetch.search_web", new=AsyncMock(return_value=web_results)):
            candidates = await collect_web_abc_candidates(
                FakeClient(),
                "Wild Rover",
                "song",
                on_progress=None,
            )

        self.assertEqual(len(candidates), 1)
        self.assertIn("K:D", candidates[0]["abc"])
        self.assertEqual(candidates[0]["sourceUrl"], "https://personal.example.net/tunes/wild-rover.abc")

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
                result = await search_notation(
                    "Bicycle Race",
                    artist="Queen",
                    song_type="song",
                    on_progress=on_progress,
                )

        self.assertTrue(web_called["value"])
        self.assertIn("abc", result)
        self.assertIn("Bicycle Race", result["abc"])
        self.assertTrue(any(stage == "web" for stage in progress))


if __name__ == "__main__":
    unittest.main()
