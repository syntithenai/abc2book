import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from music_collection import (
    build_music_collection_candidate,
    build_music_collection_entry_url,
    build_music_collection_public_url,
    ensure_music_collection_art_file,
    infer_title_artist_from_query,
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

    def test_build_entry_url(self):
        self.assertEqual(
            build_music_collection_entry_url("42", request_base_url="https://resolver.example"),
            "https://resolver.example/music-collection-by-entry/42",
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
        self.assertIn("/music-collection-by-entry/0", candidate["collectionEntryLink"])
        self.assertIn("/music-collection/Altan/sally.mp3", candidate["link"])
        self.assertIn("/music-collection-art/0", candidate["image"])

    def test_build_candidate_includes_tag_metadata(self):
        candidate = build_music_collection_candidate({
            "id": "1",
            "title": "Track",
            "artist": "Band",
            "path": "Band/track.mp3",
            "genre": "Folk",
            "year": "1998",
            "composer": "Writer",
            "duration": 200,
            "tracknumber": "3",
            "albumartist": "Various",
        }, request_base_url="https://resolver.example")
        self.assertEqual(candidate["genre"], "Folk")
        self.assertEqual(candidate["year"], "1998")
        self.assertEqual(candidate["composer"], "Writer")
        self.assertEqual(candidate["duration"], 200)
        self.assertEqual(candidate["tracknumber"], "3")
        self.assertEqual(candidate["albumartist"], "Various")

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
                "southern": ["1"],
                "cross": ["1"],
                "crosby": ["1"],
                "stills": ["1"],
                "nash": ["1"],
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

    def test_ignores_path_only_token_matches(self):
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            matches = search_music_collection(
                "Southern Cross Crosby Stills Nash",
                artist="",
            )
            self.assertEqual(matches, [])

    def test_infer_title_artist_from_query(self):
        self.assertEqual(
            infer_title_artist_from_query("elvis presley love me"),
            ("love me", "elvis presley"),
        )
        self.assertEqual(
            infer_title_artist_from_query("After The Battle Of Aughrim"),
            ("After The Battle Of Aughrim", ""),
        )

    def test_matches_artist_only_queries(self):
        index = {
            "version": 1,
            "entries": {
                "2": {
                    "title": "The Miller's Maggot",
                    "artist": "Lunasa",
                    "path": "Lunasa/millers_maggot.mp3",
                    "duration": 180,
                    "hasArt": False,
                },
            },
            "tokens": {
                "lunasa": ["2"],
                "miller": ["2"],
                "maggot": ["2"],
            },
        }
        with open(os.path.join(self.root, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump(index, handle)
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            matches = search_music_collection("Lúnasa", artist="")
            self.assertTrue(matches)
            self.assertEqual(matches[0]["artist"], "Lunasa")

    def test_matches_filename_when_tags_missing(self):
        index = {
            "version": 1,
            "entries": {
                "3": {
                    "title": "",
                    "artist": "",
                    "path": "folk/sally_gardens.mp3",
                    "duration": 180,
                    "hasArt": False,
                },
            },
            "tokens": {
                "sally": ["3"],
                "gardens": ["3"],
                "folk": ["3"],
            },
        }
        with open(os.path.join(self.root, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump(index, handle)
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            matches = search_music_collection("Sally Gardens", artist="")
            self.assertTrue(matches)
            self.assertIn("sally", matches[0]["title"].lower())

    def test_matches_life_in_you_by_okee_dokee_brothers(self):
        index = {
            "version": 1,
            "entries": {
                "4": {
                    "title": "The Life That's in You",
                    "artist": "The Okee Dokee Brothers",
                    "path": "Kids/The Life That's in You.mp3",
                    "duration": 210,
                    "hasArt": False,
                },
            },
            "tokens": {
                "life": ["4"],
                "you": ["4"],
                "okee": ["4"],
                "dokee": ["4"],
                "brothers": ["4"],
            },
        }
        with open(os.path.join(self.root, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump(index, handle)
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            from music_collection import load_music_collection_index

            load_music_collection_index(force_reload=True)
            by_life = search_music_collection("life", artist="")
            by_okee = search_music_collection("okee", artist="")
            self.assertTrue(by_life)
            self.assertTrue(by_okee)
            self.assertEqual(by_life[0]["title"], "The Life That's in You")
            self.assertEqual(by_okee[0]["artist"], "The Okee Dokee Brothers")

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
        with patch.dict(
            os.environ,
            {
                "MUSIC_COLLECTION_EMAILS": "user@example.com",
                "REQUIRE_AUTH": "false",
            },
            clear=False,
        ):
            from music_collection import load_music_collection_emails

            allowlist = load_music_collection_emails()
            self.assertTrue(music_collection_access_allowed("user@example.com", require_auth=False))
            self.assertFalse(music_collection_access_allowed("other@example.com", require_auth=False))
            self.assertFalse(music_collection_access_allowed(None, require_auth=False))
            self.assertTrue("user@example.com" in allowlist)

    def test_dedicated_allowlist_when_auth_required(self):
        with patch.dict(
            os.environ,
            {
                "MUSIC_COLLECTION_EMAILS": "user@example.com",
                "REQUIRE_AUTH": "true",
            },
            clear=False,
        ):
            self.assertTrue(music_collection_access_allowed("user@example.com", require_auth=True))
            self.assertFalse(music_collection_access_allowed("other@example.com", require_auth=True))

    def test_fallback_when_allowlist_empty(self):
        with patch.dict(
            os.environ,
            {"MUSIC_COLLECTION_EMAILS": "", "REQUIRE_AUTH": "false"},
            clear=False,
        ):
            self.assertTrue(music_collection_access_allowed(None, require_auth=False))


class MusicCollectionServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "folk"), exist_ok=True)
        with open(os.path.join(self.root, "folk", "sally.mp3"), "wb") as handle:
            handle.write(b"ID3demo")
        with open(os.path.join(self.root, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "version": 1,
                "entries": {
                    "42": {
                        "title": "Sally",
                        "artist": "Altan",
                        "path": "folk/sally.mp3",
                    },
                },
                "tokens": {},
            }, handle)
        self.env = patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root})
        self.env.start()
        import server

        self.server = server
        self.client = TestClient(server.app)

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_music_collection_by_entry_serves_audio(self):
        with patch.object(self.server, "require_music_collection_access", new=AsyncMock(return_value=None)):
            response = self.client.get("/music-collection-by-entry/42")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"ID3demo")

    def test_music_collection_by_entry_404s_for_missing_id(self):
        with patch.object(self.server, "require_music_collection_access", new=AsyncMock(return_value=None)):
            response = self.client.get("/music-collection-by-entry/999")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
