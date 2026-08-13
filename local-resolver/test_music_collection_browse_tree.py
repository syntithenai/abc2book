"""Tests for music collection tree browse, album/genre aggregates, and scoped browse."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from music_collection_browse import (
    aggregate_albums,
    aggregate_genres,
    browse_music_collection,
    list_music_collection_tree_children,
    normalize_path_prefix,
)


class MusicCollectionBrowseTreeTests(unittest.TestCase):
    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_normalize_and_tree_root(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {
                    "title": "Track A",
                    "artist": "Altan",
                    "album": "The Gap",
                    "genre": "Folk",
                    "path": "clementine/folk songs/Altan/a.mp3",
                },
                "e2": {
                    "title": "Track B",
                    "artist": "Other",
                    "album": "Vol 1",
                    "genre": "Rock",
                    "path": "pop-rock/Band/b.mp3",
                },
                "e3": {
                    "title": "Loose",
                    "artist": "Solo",
                    "path": "loose.mp3",
                },
            }
        }

        self.assertEqual(normalize_path_prefix("/clementine/folk songs/"), "clementine/folk songs")

        body = list_music_collection_tree_children(prefix="")
        folder_paths = {row["path"] for row in body["folders"]}
        self.assertIn("clementine", folder_paths)
        self.assertIn("pop-rock", folder_paths)
        self.assertEqual(len(body["tracks"]), 1)
        self.assertEqual(body["tracks"][0]["path"], "loose.mp3")

    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_tree_drill_down(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {"title": "A", "path": "root/sub/track.mp3"},
                "e2": {"title": "B", "path": "root/other.mp3"},
            }
        }

        root = list_music_collection_tree_children(prefix="")
        self.assertEqual(len(root["folders"]), 1)
        self.assertEqual(root["folders"][0]["path"], "root")

        sub = list_music_collection_tree_children(prefix="root")
        folder_paths = {row["path"] for row in sub["folders"]}
        self.assertIn("root/sub", folder_paths)
        track_paths = {row["path"] for row in sub["tracks"]}
        self.assertIn("root/other.mp3", track_paths)

    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_tree_respects_query(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {"title": "Sally", "artist": "Altan", "path": "folk/a.mp3", "genre": "Folk"},
                "e2": {"title": "Rock song", "artist": "Band", "path": "rock/b.mp3", "genre": "Rock"},
            }
        }

        body = list_music_collection_tree_children(prefix="", query="Altan")
        self.assertEqual(len(body["folders"]), 1)
        self.assertEqual(body["folders"][0]["path"], "folk")
        self.assertEqual(len(body["tracks"]), 0)

    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_aggregate_albums_and_genres(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {"title": "A", "album": "The Gap", "genre": "Folk", "path": "a.mp3"},
                "e2": {"title": "B", "album": "The Gap", "genre": "Folk", "path": "b.mp3"},
                "e3": {"title": "C", "album": "Other", "genre": "Rock", "path": "c.mp3"},
                "e4": {"title": "D", "path": "d.mp3"},
            }
        }

        albums = aggregate_albums(limit=10)
        self.assertEqual(albums["total"], 2)
        gap = next(row for row in albums["albums"] if row["album"] == "The Gap")
        self.assertEqual(gap["trackCount"], 2)
        self.assertTrue(gap["samplePaths"])

        genres = aggregate_genres(limit=10)
        self.assertEqual(genres["total"], 2)
        folk = next(row for row in genres["genres"] if row["genre"] == "Folk")
        self.assertEqual(folk["trackCount"], 2)

    @patch("music_collection_browse.load_music_collection_index")
    @patch("music_collection_browse.triage_map")
    def test_browse_path_prefix_and_album(self, triage_map_mock, index_mock):
        triage_map_mock.return_value = {}
        index_mock.return_value = {
            "entries": {
                "e1": {"title": "A", "album": "The Gap", "path": "folk/Altan/a.mp3"},
                "e2": {"title": "B", "album": "The Gap", "path": "rock/Band/b.mp3"},
                "e3": {"title": "C", "album": "Other", "path": "folk/Altan/c.mp3"},
            }
        }

        scoped = browse_music_collection(path_prefix="folk/Altan", limit=10)
        self.assertEqual(scoped["total"], 2)
        paths = {row["path"] for row in scoped["entries"]}
        self.assertIn("folk/Altan/a.mp3", paths)
        self.assertIn("folk/Altan/c.mp3", paths)

        by_album = browse_music_collection(album="gap", limit=10)
        self.assertEqual(by_album["total"], 2)
        self.assertTrue(all("Gap" in (row.get("album") or "") for row in by_album["entries"]))


if __name__ == "__main__":
    unittest.main()
