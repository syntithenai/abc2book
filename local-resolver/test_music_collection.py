import json
import os
import tempfile
import unittest
from unittest.mock import patch

from music_collection import (
    build_music_collection_candidate,
    build_music_collection_public_url,
    ensure_music_collection_art_file,
    music_collection_access_allowed,
    music_collection_enabled,
    resolve_music_collection_file,
    search_music_collection,
    title_artist_from_filename,
    title_from_audio_relative_path,
    tokenize_music_search_query,
)


class MusicCollectionHelperTests(unittest.TestCase):
    def test_title_from_relative_path(self):
        self.assertEqual(
            title_from_audio_relative_path("Altan/The Gap/01 Sally Gardens.mp3"),
            "The Gap — Sally Gardens",
        )

    def test_title_artist_from_filename(self):
        self.assertEqual(
            title_artist_from_filename("Altan - Sally Gardens.mp3"),
            ("Sally Gardens", "Altan"),
        )

    def test_tokenize_search_query(self):
        self.assertEqual(tokenize_music_search_query("The Sally Gardens"), ["sally", "gardens"])

    def test_build_public_url(self):
        self.assertEqual(
            build_music_collection_public_url("Altan/Sally Gardens.mp3"),
            "/music-collection/Altan/Sally%20Gardens.mp3",
        )

    def test_build_candidate(self):
        candidate = build_music_collection_candidate({
            "id": "0",
            "title": "Sally Gardens",
            "artist": "Altan",
            "album": "The Gap",
            "path": "Altan/sally.mp3",
            "duration": 125,
            "hasArt": True,
            "matchScore": 90,
        }, request_base_url="https://resolver.example")
        self.assertEqual(candidate["source"], "music-collection")
        self.assertEqual(candidate["path"], "Altan/sally.mp3")
        self.assertIn("/music-collection/Altan/sally.mp3", candidate["link"])
        self.assertIn("/music-collection-art/0", candidate["image"])

    def test_build_candidate_includes_art_url_without_has_art_flag(self):
        candidate = build_music_collection_candidate({
            "id": "12",
            "title": "Sally Gardens",
            "artist": "Altan",
            "path": "Altan/sally.mp3",
            "hasArt": False,
        }, request_base_url="https://resolver.example")
        self.assertIn("/music-collection-art/12", candidate["image"])


class MusicCollectionIndexTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "folk"), exist_ok=True)
        with open(os.path.join(self.root, "folk", "sally_gardens.mp3"), "wb") as handle:
            handle.write(b"ID3")
        index = {
            "version": 1,
            "entries": {
                "0": {
                    "title": "Sally Gardens",
                    "artist": "Altan",
                    "album": "The Gap",
                    "path": "folk/sally_gardens.mp3",
                    "duration": 180,
                    "hasArt": False,
                },
                "1": {
                    "title": "Star of the County Down",
                    "artist": "Various",
                    "path": "folk/star_of_county_down.mp3",
                    "duration": 200,
                    "hasArt": False,
                },
            },
            "tokens": {
                "sally": ["0"],
                "gardens": ["0"],
                "star": ["1"],
                "county": ["1"],
                "down": ["1"],
                "altan": ["0"],
            },
        }
        with open(os.path.join(self.root, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump(index, handle)

    def tearDown(self):
        self.tmp.cleanup()

    def test_enabled_and_search(self):
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            self.assertTrue(music_collection_enabled())
            matches = search_music_collection("Sally Gardens", artist="Altan")
            self.assertTrue(matches)
            self.assertEqual(matches[0]["title"], "Sally Gardens")

    def test_resolve_file(self):
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            path = resolve_music_collection_file("folk/sally_gardens.mp3")
            self.assertTrue(os.path.isfile(path))

    def test_ensure_art_extracts_on_demand(self):
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            expected = os.path.join(self.root, "music_collection_art", "0.jpg")
            with patch(
                "music_collection.extract_music_collection_art_from_file",
                return_value=expected,
            ) as extract_mock:
                art_path = ensure_music_collection_art_file("0")
            extract_mock.assert_called_once()
            self.assertEqual(art_path, expected)


class MusicCollectionAccessTests(unittest.TestCase):
    def test_dedicated_allowlist(self):
        with patch.dict(os.environ, {"MUSIC_COLLECTION_EMAILS": "user@example.com", "REQUIRE_AUTH": "false"}):
            from music_collection import load_music_collection_emails

            allowlist = load_music_collection_emails()
            self.assertTrue(music_collection_access_allowed("user@example.com", require_auth=False))
            self.assertFalse(music_collection_access_allowed("other@example.com", require_auth=False))
            self.assertFalse(music_collection_access_allowed(None, require_auth=False))
            self.assertTrue("user@example.com" in allowlist)

    def test_fallback_when_allowlist_empty(self):
        with patch.dict(os.environ, {"MUSIC_COLLECTION_EMAILS": "", "REQUIRE_AUTH": "false"}, clear=False):
            self.assertTrue(music_collection_access_allowed(None, require_auth=False))


if __name__ == "__main__":
    unittest.main()
