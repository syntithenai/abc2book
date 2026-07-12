import unittest

from composer_discovery import (
    _format_candidates,
    _add_candidate,
    parse_title_composer_hint,
)
from recording_artists import discover_work_writers, WRITER_RELATION_TYPES


class ComposerDiscoveryTests(unittest.TestCase):
    def test_parse_title_composer_hint_keeps_explicit_artist(self):
        parsed = parse_title_composer_hint("Wonderwall", "Wonderwall", "Oasis")
        self.assertEqual(parsed["title"], "Wonderwall")
        self.assertEqual(parsed["artist_hint"], "Oasis")

    def test_parse_title_composer_hint_splits_title_hint(self):
        parsed = parse_title_composer_hint("", "Oasis - Wonderwall", "")
        self.assertEqual(parsed["title"], "Wonderwall")
        self.assertEqual(parsed["artist_hint"], "Oasis")
        self.assertEqual(parsed["title_hint"], "Oasis - Wonderwall")

    def test_parse_title_composer_hint_splits_title_field(self):
        parsed = parse_title_composer_hint("Beatles - Yesterday", "", "")
        self.assertEqual(parsed["title"], "Yesterday")
        self.assertEqual(parsed["artist_hint"], "Beatles")

    def test_format_candidates_puts_writers_before_performers(self):
        store = {}
        _add_candidate(store, "Oasis", role="performer", source="MusicBrainz/Genius")
        _add_candidate(store, "Noel Gallagher", role="writer", source="MusicBrainz")
        _add_candidate(store, "Ryan Adams", role="performer", source="MusicBrainz/Genius")
        result = _format_candidates(store)
        self.assertTrue(result["multiple"])
        artists = [c["artist"] for c in result["candidates"]]
        self.assertEqual(artists[0], "Noel Gallagher")
        self.assertEqual(result["candidates"][0]["role"], "writer")
        self.assertIn("Writer", result["candidates"][0]["source"])
        self.assertEqual(set(artists[1:]), {"Oasis", "Ryan Adams"})
        for candidate in result["candidates"][1:]:
            self.assertEqual(candidate["role"], "performer")

    def test_add_candidate_upgrades_performer_to_writer(self):
        store = {}
        _add_candidate(store, "Noel Gallagher", role="performer", source="Genius")
        _add_candidate(store, "Noel Gallagher", role="writer", source="MusicBrainz")
        self.assertEqual(len(store), 1)
        entry = list(store.values())[0]
        self.assertEqual(entry["role"], "writer")
        self.assertEqual(entry["source"], "MusicBrainz")


class WorkWritersTests(unittest.IsolatedAsyncioTestCase):
    async def test_discover_work_writers_reads_composer_relations(self):
        class WorkSearchResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "works": [
                        {
                            "id": "work-1",
                            "title": "Wonderwall",
                            "score": 100,
                        },
                    ],
                }

        class WorkLookupResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "relations": [
                        {
                            "type": "composer",
                            "artist": {"name": "Noel Gallagher"},
                        },
                        {
                            "type": "lyricist",
                            "artist": {"name": "Noel Gallagher"},
                        },
                        {
                            "type": "performance",
                            "artist": {"name": "Should Ignore"},
                        },
                    ],
                }

        class FakeClient:
            async def get(self, url, params=None, headers=None):
                if url.endswith("/work"):
                    return WorkSearchResponse()
                if "work-1" in url:
                    return WorkLookupResponse()
                raise AssertionError("unexpected url " + url)

        writers = await discover_work_writers(FakeClient(), "Wonderwall", max_writers=5)
        self.assertEqual(writers, ["Noel Gallagher"])
        self.assertIn("composer", WRITER_RELATION_TYPES)

    async def test_discover_work_writers_prefers_top_scoring_work(self):
        class WorkSearchResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "works": [
                        {"id": "work-top", "title": "Wonderwall", "score": 100},
                        {"id": "work-low", "title": "Wonderwall", "score": 81},
                    ],
                }

        class WorkLookupResponse:
            def __init__(self, name):
                self._name = name

            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "relations": [
                        {"type": "composer", "artist": {"name": self._name}},
                    ],
                }

        class FakeClient:
            async def get(self, url, params=None, headers=None):
                if url.endswith("/work"):
                    return WorkSearchResponse()
                if "work-top" in url:
                    return WorkLookupResponse("Noel Gallagher")
                if "work-low" in url:
                    return WorkLookupResponse("Metome")
                raise AssertionError("unexpected url " + url)

        writers = await discover_work_writers(FakeClient(), "Wonderwall", max_writers=5)
        self.assertEqual(writers, ["Noel Gallagher"])


if __name__ == "__main__":
    unittest.main()
