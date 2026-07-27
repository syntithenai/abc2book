"""Tests for music collection browse aggregates and bulk triage."""

from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from music_collection_browse import aggregate_artists, aggregate_chunks, resolve_chunk_key
from music_collection_curation import set_triage_bulk, set_triage_bulk_scope


class MusicCollectionBrowseTests(unittest.TestCase):
    def test_resolve_chunk_key_uses_phase_source(self):
        registry = {
            "phases": {
                "folk-world": {
                    "sources": ["clementine/folk songs", "WORLDOFMUSIC"],
                }
            }
        }
        key = resolve_chunk_key("clementine/folk songs/Artist/track.mp3", registry, "folk-world")
        self.assertEqual(key, "clementine/folk songs")

    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_aggregate_artists_counts_triage(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {"e1": {"status": "keep", "note": ""}}
        index_mock.return_value = {
            "entries": {
                "e1": {"artist": "Altan", "title": "A", "path": "clementine/folk songs/a.mp3", "phase": "folk-world"},
                "e2": {"artist": "Altan", "title": "B", "path": "clementine/folk songs/b.mp3", "phase": "folk-world"},
                "e3": {"artist": "Other", "title": "C", "path": "clementine/folk songs/c.mp3", "phase": "folk-world"},
            }
        }
        body = aggregate_artists(phase="folk-world", limit=10)
        self.assertEqual(body["total"], 2)
        altan = next(row for row in body["artists"] if row["artist"] == "Altan")
        self.assertEqual(altan["trackCount"], 2)
        self.assertEqual(altan["keepCount"], 1)
        self.assertEqual(altan["unsetCount"], 1)

    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_aggregate_chunks_marks_preserved(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {"artist": "A", "title": "T", "path": "slipperyhill/track.mp3", "phase": "folk-world"},
            }
        }
        body = aggregate_chunks(phase="folk-world", limit=10)
        self.assertEqual(body["total"], 1)
        self.assertTrue(body["chunks"][0]["preserved"])


class MusicCollectionBulkTriageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.db_path = os.path.join(self.tmp, "curation.db")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    @patch("music_collection_curation.curation_db_path")
    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_bulk_triage_by_artist(self, triage_map_mock, index_mock, db_path_mock):
        db_path_mock.return_value = self.db_path
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {"artist": "Altan", "title": "A", "path": "clementine/folk songs/a.mp3", "phase": "folk-world"},
                "e2": {"artist": "Altan", "title": "B", "path": "clementine/folk songs/b.mp3", "phase": "folk-world"},
            }
        }
        result = set_triage_bulk_scope(scope="artist", value="Altan", phase="folk-world", status="keep")
        self.assertEqual(result["updated"], 2)


if __name__ == "__main__":
    unittest.main()
