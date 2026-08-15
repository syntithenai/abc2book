import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from midi_resources import (
    build_midi_resource_public_url,
    metadata_from_midi_relative_path,
    midi_resources_enabled,
    read_midi_resource_bytes,
    resolve_midi_resource_file,
    search_midi_resources,
    title_from_midi_relative_path,
    tokenize_midi_search_query,
)
from midi_fetch import collect_local_midi_candidates, collect_midi_candidates


MINIMAL_MIDI = (
    b"MThd\x00\x00\x00\x06\x00\x00\x00\x01\x00\x60"
    b"MTrk\x00\x00\x00\x04\x00\xff/\x00"
)


class MidiResourcesHelperTests(unittest.TestCase):
    def test_title_from_relative_path(self):
        self.assertEqual(
            title_from_midi_relative_path("Classical/Bach/prelude_in_c.mid"),
            "prelude in c",
        )

    def test_metadata_from_various_artists_filename(self):
        meta = metadata_from_midi_relative_path(
            "50000midifiles/Various Artists/Moonlight Sonata (Beethoven).mid"
        )
        self.assertEqual(meta["title"], "Moonlight Sonata")
        self.assertEqual(meta["artist"], "Beethoven")
        self.assertEqual(meta["category"], "50000midifiles")

    def test_metadata_from_composer_folder_and_quoted_nickname(self):
        meta = metadata_from_midi_relative_path(
            "Classical Archives - The Greats (MIDI)/Beethoven/Piano Sonatas/"
            "Piano Sonata n14 op27 ''Moonlight''.mid"
        )
        self.assertEqual(meta["title"], "Piano Sonata n14 op27 Moonlight")
        self.assertEqual(meta["artist"], "Beethoven")
        self.assertIn("Moonlight", meta["aliases"])

    def test_metadata_skips_nested_dump_folders(self):
        meta = metadata_from_midi_relative_path(
            "Classical Archives - The Greats (MIDI)/Greats/"
            "Classical Archives - The Greats (MIDI)/Beethoven/Piano Sonatas/"
            "Piano Sonata n14 op27 ''Moonlight''.mid"
        )
        self.assertEqual(meta["artist"], "Beethoven")
        self.assertEqual(meta["title"], "Piano Sonata n14 op27 Moonlight")

    def test_tokenize_search_query(self):
        self.assertEqual(tokenize_midi_search_query("The Sally Gardens"), ["sally", "gardens"])

    def test_tokenize_splits_camel_case(self):
        self.assertEqual(tokenize_midi_search_query("MoonlightSonata"), ["moonlight", "sonata"])

    def test_build_public_url(self):
        self.assertEqual(
            build_midi_resource_public_url("drum patterns/Rock7.mid"),
            "/midi-resources/drum%20patterns/Rock7.mid",
        )


class MidiResourcesIndexTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "folk"), exist_ok=True)
        with open(os.path.join(self.root, "folk", "sally_gardens.mid"), "wb") as handle:
            handle.write(MINIMAL_MIDI)
        with open(os.path.join(self.root, "folk", "star_of_county_down.mid"), "wb") as handle:
            handle.write(MINIMAL_MIDI)
        index = {
            "version": 1,
            "entries": {
                "0": {"title": "folk — sally gardens", "path": "folk/sally_gardens.mid", "category": "folk"},
                "1": {
                    "title": "folk — star of county down",
                    "path": "folk/star_of_county_down.mid",
                    "category": "folk",
                },
            },
            "tokens": {
                "sally": ["0"],
                "gardens": ["0"],
                "star": ["1"],
                "county": ["1"],
                "down": ["1"],
                "folk": ["0", "1"],
            },
        }
        with open(os.path.join(self.root, "midi_resources_index.json"), "w", encoding="utf-8") as handle:
            json.dump(index, handle)

    def tearDown(self):
        self.tmp.cleanup()

    def test_enabled_and_search(self):
        with patch.dict(os.environ, {"MIDI_RESOURCES_DIR": self.root}):
            from midi_resources import load_midi_resources_index

            load_midi_resources_index(force_reload=True)
            self.assertTrue(midi_resources_enabled())
            matches = search_midi_resources("Sally Gardens")
            self.assertEqual(matches[0]["path"], "folk/sally_gardens.mid")

    def test_resolve_and_read_file(self):
        with patch.dict(os.environ, {"MIDI_RESOURCES_DIR": self.root}):
            from midi_resources import load_midi_resources_index

            load_midi_resources_index(force_reload=True)
            abs_path = resolve_midi_resource_file("folk/sally_gardens.mid")
            self.assertTrue(abs_path.endswith("sally_gardens.mid"))
            data = read_midi_resource_bytes("folk/sally_gardens.mid")
            self.assertEqual(data[:4], b"MThd")

    def test_rejects_path_traversal(self):
        with patch.dict(os.environ, {"MIDI_RESOURCES_DIR": self.root}):
            from midi_resources import load_midi_resources_index

            load_midi_resources_index(force_reload=True)
            with self.assertRaises(ValueError):
                resolve_midi_resource_file("../secrets.txt")


class MidiMoonlightSearchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        index = {
            "version": 1,
            "entries": {
                "0": {
                    "title": "Various Artists — Moonlight Sonata (Beethoven)",
                    "path": "50000midifiles/Various Artists/Moonlight Sonata (Beethoven).mid",
                    "category": "50000midifiles",
                },
                "1": {
                    "title": "Piano Sonatas — Piano Sonata n14 op27 ''Moonlight''",
                    "path": (
                        "Classical Archives - The Greats (MIDI)/Beethoven/Piano Sonatas/"
                        "Piano Sonata n14 op27 ''Moonlight''.mid"
                    ),
                    "category": "Classical Archives - The Greats (MIDI)",
                },
                "2": {
                    "title": "sonata practice",
                    "path": "patterns/sonata_practice.mid",
                    "category": "patterns",
                },
            },
            "tokens": {
                "moonlight": ["0", "1"],
                "sonata": ["0", "1", "2"],
                "beethoven": ["0", "1"],
                "piano": ["1"],
            },
        }
        with open(os.path.join(self.root, "midi_resources_index.json"), "w", encoding="utf-8") as handle:
            json.dump(index, handle)

    def tearDown(self):
        self.tmp.cleanup()

    def test_search_moonlight_sonata_scores_filename_not_parent_prefix(self):
        with patch.dict(os.environ, {"MIDI_RESOURCES_DIR": self.root}):
            from midi_resources import load_midi_resources_index

            load_midi_resources_index(force_reload=True)
            matches = search_midi_resources("Moonlight Sonata")
        paths = [item["path"] for item in matches]
        self.assertTrue(any("Moonlight Sonata (Beethoven)" in path for path in paths))
        self.assertTrue(any("Moonlight" in path and "Piano Sonata" in path for path in paths))
        for item in matches:
            if "Moonlight Sonata (Beethoven)" in item["path"]:
                self.assertGreaterEqual(item["matchScore"], 45)
                self.assertEqual(item["title"], "Moonlight Sonata")
                self.assertEqual(item["artist"], "Beethoven")
            if "Piano Sonata n14" in item["path"]:
                self.assertGreaterEqual(item["matchScore"], 45)
                self.assertEqual(item["artist"], "Beethoven")

    def test_partial_token_coverage_ranks_below_full_title_hits(self):
        with patch.dict(os.environ, {"MIDI_RESOURCES_DIR": self.root}):
            from midi_resources import load_midi_resources_index

            load_midi_resources_index(force_reload=True)
            matches = search_midi_resources("Moonlight Sonata")
        practice = [item for item in matches if item["path"].endswith("sonata_practice.mid")]
        if practice:
            self.assertLess(practice[0]["matchScore"], 45)
        moonlight = [item for item in matches if "Moonlight" in item["path"]]
        self.assertTrue(moonlight)
        self.assertGreaterEqual(min(item["matchScore"] for item in moonlight), 45)


class MidiFetchLocalLibraryTests(unittest.IsolatedAsyncioTestCase):
    async def test_collect_midi_candidates_prefers_local(self):
        local_candidate = {
            "musicXml": "<score/>",
            "source": "midi-resources",
            "title": "Sally Gardens",
        }
        with patch("midi_fetch.collect_local_midi_candidates", new=AsyncMock(return_value=[local_candidate])):
            with patch("midi_fetch.collect_web_midi_candidates", new=AsyncMock(return_value=[])) as web_mock:
                results = await collect_midi_candidates(None, "Sally Gardens")
        self.assertEqual(results, [local_candidate])
        web_mock.assert_not_called()

    async def test_collect_midi_candidates_relaxed_still_searches_web(self):
        local_candidate = {"source": "midi-resources", "title": "Suite 1", "midiBytes": "YQ=="}
        web_candidate = {"source": "bitmidi.com", "title": "Suite 1", "midiBytes": "YQ=="}
        with patch("midi_fetch.collect_local_midi_candidates", new=AsyncMock(return_value=[local_candidate])):
            with patch(
                "midi_fetch.collect_web_midi_candidates",
                new=AsyncMock(return_value=[web_candidate]),
            ) as web_mock:
                results = await collect_midi_candidates(None, "Suite 1", relaxed=True)
        web_mock.assert_awaited_once()
        self.assertEqual(results, [local_candidate, web_candidate])

    async def test_collect_midi_candidates_falls_back_to_web(self):
        web_candidate = {"musicXml": "<score/>", "source": "bitmidi.com"}
        with patch("midi_fetch.collect_local_midi_candidates", new=AsyncMock(return_value=[])):
            with patch("midi_fetch.collect_web_midi_candidates", new=AsyncMock(return_value=[web_candidate])) as web_mock:
                results = await collect_midi_candidates(None, "Unknown Tune")
        self.assertEqual(results, [web_candidate])
        web_mock.assert_awaited_once()

    async def test_collect_local_midi_candidates_converts_matches(self):
        with patch.dict(os.environ, {"MIDI_RESOURCES_DIR": "/tmp/missing"}):
            with patch("midi_fetch.midi_resources_enabled", return_value=True):
                with patch(
                    "midi_fetch.search_midi_resources",
                    return_value=[{"path": "folk/sally_gardens.mid", "title": "Sally Gardens", "matchScore": 80}],
                ):
                    results = await collect_local_midi_candidates("Sally Gardens")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["source"], "midi-resources")
        self.assertEqual(results[0]["sourceUrl"], "/midi-resources/folk/sally_gardens.mid")
        self.assertFalse(results[0].get("midiBytes"))
        self.assertEqual(results[0]["importFormat"], "midi")
        self.assertEqual(results[0]["tuneMeta"]["meta"]["importFormat"], "midi")
        self.assertTrue(results[0]["tuneMeta"]["meta"]["midiLibrary"])


if __name__ == "__main__":
    unittest.main()
