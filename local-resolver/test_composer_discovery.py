import unittest

from unittest.mock import AsyncMock, patch

from composer_discovery import (
    _format_candidates,
    _add_candidate,
    _match_writer_in_list,
    _promote_candidate,
    _rank_writers_best_effort,
    _rank_writers_llm,
    discover_composer,
    extract_writers_from_text,
    is_plausible_writer_name,
    parse_title_composer_hint,
    pick_prominent_writer,
)
from recording_artists import (
    discover_work_writers,
    discover_work_writers_with_prominence,
    WRITER_RELATION_TYPES,
)


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

    def test_rejects_debussy_snippet_debris_as_writer(self):
        debris = (
            "who wrote Claire De Lune and Nocturnes, died on March 25th, "
            "1918 at the height of"
        )
        self.assertFalse(is_plausible_writer_name(debris))
        store = {}
        _add_candidate(store, debris, role="writer", source="web search")
        self.assertEqual(store, {})

    def test_extract_writers_from_debussy_bio_snippet(self):
        snippet = (
            "French composer Claude Debussy who wrote Claire De Lune and "
            "Nocturnes, died on March 25th, 1918 at the height of World War I."
        )
        writers = extract_writers_from_text(snippet)
        self.assertIn("Claude Debussy", writers)
        self.assertFalse(
            any("who wrote" in name.lower() for name in writers)
        )

    def test_extract_writers_composed_by_and_written_by(self):
        self.assertEqual(
            extract_writers_from_text("Wonderwall was written by Noel Gallagher."),
            ["Noel Gallagher"],
        )
        self.assertEqual(
            extract_writers_from_text("Clair de lune was composed by Claude Debussy."),
            ["Claude Debussy"],
        )

    def test_pick_prominent_writer_requires_clear_winner(self):
        writers = [
            {"artist": "Joseph Kosma", "recording_count": 2, "score": 100},
            {"artist": "Claude Debussy", "recording_count": 40, "score": 94},
        ]
        self.assertEqual(pick_prominent_writer(writers), "Claude Debussy")
        tied = [
            {"artist": "Joseph Kosma", "recording_count": 2, "score": 100},
            {"artist": "Django Reinhardt", "recording_count": 2, "score": 100},
        ]
        self.assertEqual(pick_prominent_writer(tied), "")

    def test_match_and_promote_writer(self):
        self.assertEqual(
            _match_writer_in_list("Claude Debussy", ["Joseph Kosma", "Claude Debussy"]),
            "Claude Debussy",
        )
        self.assertEqual(
            _match_writer_in_list("debussy", ["Joseph Kosma", "Claude Debussy"]),
            "Claude Debussy",
        )
        store = {}
        _add_candidate(store, "Joseph Kosma", role="writer", source="MusicBrainz")
        _add_candidate(store, "Claude Debussy", role="writer", source="MusicBrainz")
        self.assertEqual(list(store.values())[0]["artist"], "Joseph Kosma")
        self.assertTrue(_promote_candidate(store, "Claude Debussy"))
        self.assertEqual(list(store.values())[0]["artist"], "Claude Debussy")


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

    async def test_discover_work_writers_collects_from_multiple_exact_works(self):
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
        self.assertEqual(writers, ["Noel Gallagher", "Metome"])

    async def test_discover_work_writers_claire_variant_includes_debussy(self):
        claire_works = {
            "works": [
                {
                    "id": "work-bieler",
                    "title": "Claire de Lune",
                    "score": 100,
                },
            ],
        }
        clair_works = {
            "works": [
                {
                    "id": "work-django",
                    "title": "Clair de Lune",
                    "score": 100,
                },
                {
                    "id": "work-debussy",
                    "title": "Clair de lune",
                    "score": 94,
                },
            ],
        }
        lookups = {
            "work-bieler": "Torstein Bieler",
            "work-django": "Django Reinhardt",
            "work-debussy": "Claude Debussy",
        }
        queried = []

        class WorkSearchResponse:
            def __init__(self, payload):
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

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
                    query = (params or {}).get("query") or ""
                    queried.append(query)
                    if 'work:"Claire de Lune"' in query:
                        return WorkSearchResponse(claire_works)
                    if 'work:"Clair de Lune"' in query:
                        return WorkSearchResponse(clair_works)
                    return WorkSearchResponse({"works": []})
                for work_id, name in lookups.items():
                    if work_id in url:
                        return WorkLookupResponse(name)
                raise AssertionError("unexpected url " + url)

        writers = await discover_work_writers(
            FakeClient(), "Claire de Lune", max_writers=8, max_works=8
        )
        self.assertTrue(any('work:"Claire de Lune"' in q for q in queried))
        self.assertTrue(any('work:"Clair de Lune"' in q for q in queried))
        self.assertIn("Claude Debussy", writers)
        self.assertIn("Torstein Bieler", writers)
        self.assertIn("Django Reinhardt", writers)

    async def test_discover_work_writers_with_prominence_tracks_recording_count(self):
        class WorkSearchResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "works": [
                        {
                            "id": "work-kosma",
                            "title": "Clair de Lune",
                            "score": 100,
                        },
                        {
                            "id": "work-debussy",
                            "title": "Clair de Lune",
                            "score": 94,
                            "recording-count": 12,
                        },
                    ],
                }

        class WorkLookupResponse:
            def __init__(self, name, performances=0):
                self._name = name
                self._performances = performances

            def raise_for_status(self):
                return None

            def json(self):
                relations = [
                    {"type": "composer", "artist": {"name": self._name}},
                ]
                for index in range(self._performances):
                    relations.append({
                        "type": "performance",
                        "recording": {"id": "rec-%s" % index, "title": "x"},
                    })
                return {"relations": relations}

        class FakeClient:
            async def get(self, url, params=None, headers=None):
                if url.endswith("/work"):
                    return WorkSearchResponse()
                if "work-kosma" in url:
                    return WorkLookupResponse("Joseph Kosma", performances=1)
                if "work-debussy" in url:
                    return WorkLookupResponse("Claude Debussy", performances=3)
                raise AssertionError("unexpected url " + url)

        enriched = await discover_work_writers_with_prominence(
            FakeClient(), "Clair de Lune", max_writers=5
        )
        by_name = {entry["artist"]: entry for entry in enriched}
        self.assertEqual(by_name["Joseph Kosma"]["recording_count"], 1)
        self.assertEqual(by_name["Claude Debussy"]["recording_count"], 12)


class ComposerRankTests(unittest.IsolatedAsyncioTestCase):
    async def test_rank_writers_llm_promotes_listed_name(self):
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "choices": [
                        {"message": {"content": "Claude Debussy"}},
                    ],
                }

        class FakeClient:
            async def post(self, url, headers=None, json=None, timeout=None):
                return FakeResponse()

        with patch("composer_discovery.LLM_BASE_URL", "http://llm.test"):
            ranked = await _rank_writers_llm(
                FakeClient(),
                "Claire de Lune",
                ["Joseph Kosma", "Django Reinhardt", "Claude Debussy"],
            )
        self.assertEqual(ranked, "Claude Debussy")

    async def test_rank_writers_llm_noop_without_base_url(self):
        class FakeClient:
            async def post(self, *args, **kwargs):
                raise AssertionError("LLM should not be called")

        with patch("composer_discovery.LLM_BASE_URL", ""):
            ranked = await _rank_writers_llm(
                FakeClient(),
                "Claire de Lune",
                ["Joseph Kosma", "Claude Debussy"],
            )
        self.assertEqual(ranked, "")

    async def test_best_effort_uses_prominence_then_web(self):
        writers = [
            {"artist": "Joseph Kosma", "recording_count": 2, "score": 100},
            {"artist": "Claude Debussy", "recording_count": 40, "score": 94},
        ]
        ranked = await _rank_writers_best_effort(object(), "Claire de Lune", writers)
        self.assertEqual(ranked, "Claude Debussy")

        tied = [
            {"artist": "Joseph Kosma", "recording_count": 2, "score": 100},
            {"artist": "Django Reinhardt", "recording_count": 2, "score": 100},
            {"artist": "Claude Debussy", "recording_count": 2, "score": 94},
        ]

        async def fake_web(client, title):
            return ["Claude Debussy"]

        with patch(
            "composer_discovery._discover_writer_web",
            new=AsyncMock(side_effect=fake_web),
        ):
            ranked = await _rank_writers_best_effort(
                object(), "Claire de Lune", tied
            )
        self.assertEqual(ranked, "Claude Debussy")

    async def test_discover_composer_llm_rank_puts_debussy_first(self):
        writers = [
            {"artist": "Joseph Kosma", "recording_count": 2, "score": 100},
            {"artist": "Django Reinhardt", "recording_count": 2, "score": 100},
            {"artist": "Claude Debussy", "recording_count": 2, "score": 94},
        ]

        class FakeClient:
            async def get(self, *args, **kwargs):
                raise AssertionError("unexpected get")

            async def post(self, *args, **kwargs):
                raise AssertionError("unexpected post")

        with patch(
            "composer_discovery.discover_work_writers_with_prominence",
            new=AsyncMock(return_value=writers),
        ), patch(
            "composer_discovery._rank_writers_llm",
            new=AsyncMock(return_value="Claude Debussy"),
        ), patch(
            "composer_discovery._rank_writers_best_effort",
            new=AsyncMock(side_effect=AssertionError("should not fall back")),
        ), patch(
            "composer_discovery.discover_recording_artists",
            new=AsyncMock(return_value=[]),
        ):
            result = await discover_composer(FakeClient(), "Claire de Lune")

        self.assertTrue(result["multiple"])
        artists = [c["artist"] for c in result["candidates"]]
        self.assertEqual(artists[0], "Claude Debussy")
        self.assertIn("Joseph Kosma", artists)

    async def test_discover_composer_best_effort_when_llm_unavailable(self):
        writers = [
            {"artist": "Joseph Kosma", "recording_count": 2, "score": 100},
            {"artist": "Claude Debussy", "recording_count": 40, "score": 94},
        ]

        class FakeClient:
            async def get(self, *args, **kwargs):
                raise AssertionError("unexpected get")

        with patch(
            "composer_discovery.discover_work_writers_with_prominence",
            new=AsyncMock(return_value=writers),
        ), patch(
            "composer_discovery._rank_writers_llm",
            new=AsyncMock(return_value=""),
        ), patch(
            "composer_discovery.discover_recording_artists",
            new=AsyncMock(return_value=[]),
        ):
            result = await discover_composer(FakeClient(), "Claire de Lune")

        artists = [c["artist"] for c in result["candidates"]]
        self.assertEqual(artists[0], "Claude Debussy")

    async def test_discover_composer_skips_rank_for_single_writer(self):
        writers = [
            {"artist": "Noel Gallagher", "recording_count": 10, "score": 100},
        ]

        class FakeClient:
            async def get(self, *args, **kwargs):
                raise AssertionError("unexpected get")

        rank_llm = AsyncMock(return_value="Noel Gallagher")
        best_effort = AsyncMock(return_value="Noel Gallagher")
        with patch(
            "composer_discovery.discover_work_writers_with_prominence",
            new=AsyncMock(return_value=writers),
        ), patch(
            "composer_discovery._rank_writers_llm",
            new=rank_llm,
        ), patch(
            "composer_discovery._rank_writers_best_effort",
            new=best_effort,
        ), patch(
            "composer_discovery.discover_recording_artists",
            new=AsyncMock(return_value=[]),
        ):
            result = await discover_composer(FakeClient(), "Wonderwall")

        self.assertFalse(result["multiple"])
        self.assertEqual(result["artist"], "Noel Gallagher")
        rank_llm.assert_not_called()
        best_effort.assert_not_called()


if __name__ == "__main__":
    unittest.main()
