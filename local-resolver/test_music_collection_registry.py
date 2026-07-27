import unittest

from music_collection_analytics import build_duplicate_groups, song_key
from music_collection_registry import (
    is_preserved_path,
    library_target_path,
    map_genre_to_library_folder,
    match_phase,
    path_under_prefix,
    sanitize_path_component,
)


class MusicCollectionRegistryTests(unittest.TestCase):
    def test_path_under_prefix(self):
        self.assertTrue(path_under_prefix("slipperyhill/01 tune.mp3", "slipperyhill"))
        self.assertFalse(path_under_prefix("clementine/folk/a.mp3", "slipperyhill"))

    def test_preserved_path(self):
        registry = {"preserve": ["slipperyhill", "WORLDOFMUSIC"]}
        self.assertTrue(is_preserved_path("slipperyhill/a.mp3", registry))
        self.assertFalse(is_preserved_path("incoming/a.mp3", registry))

    def test_song_key(self):
        self.assertEqual(song_key("Altan", "Sally Gardens"), song_key("altan", "sally gardens"))

    def test_library_target_path(self):
        target = library_target_path({
            "title": "Sally Gardens",
            "artist": "Altan",
            "genre": "Folk",
            "ext": ".mp3",
        })
        self.assertEqual(target, "library/folk/Altan/Sally Gardens.mp3")

    def test_map_genre(self):
        self.assertEqual(map_genre_to_library_folder("Traditional Folk", {"genreMap": {"folk": ["folk", "traditional"]}, "libraryGenres": ["folk"]}), "folk")

    def test_duplicate_groups_by_song_key(self):
        entries = {
            "1": {"title": "A", "artist": "X", "songKey": "x|a", "path": "a/1.mp3", "playCount": 1},
            "2": {"title": "A", "artist": "X", "songKey": "x|a", "path": "a/2.mp3", "playCount": 5},
        }
        groups = build_duplicate_groups(entries, group_type="songKey", limit=10)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["keeperId"], "2")


if __name__ == "__main__":
    unittest.main()
