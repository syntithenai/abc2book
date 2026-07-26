import os
import tempfile
import unittest

from music_collection_analytics import (
    build_collection_stats,
    metadata_sources,
    normalize_match_text,
    quick_content_fingerprint,
    soft_duplicate_key,
    summarize_stats_for_health,
)


class MusicCollectionAnalyticsTests(unittest.TestCase):
    def test_metadata_sources(self):
        sources = metadata_sources(
            {"title": "Sally Gardens", "artist": "Altan"},
            {"title": "Sally Gardens", "artist": "Altan", "album": "The Gap"},
        )
        self.assertEqual(sources["title"], "tag")
        self.assertEqual(sources["artist"], "tag")
        self.assertEqual(sources["album"], "derived")

    def test_soft_duplicate_key(self):
        key_a = soft_duplicate_key("Sally Gardens", "Altan", 180.2)
        key_b = soft_duplicate_key("sally gardens", "altan", 180.4)
        self.assertEqual(key_a, key_b)

    def test_quick_content_fingerprint(self):
        with tempfile.NamedTemporaryFile(delete=False) as handle:
            handle.write(b"abc2book-test-audio")
            path = handle.name
        try:
            fingerprint = quick_content_fingerprint(path, os.path.getsize(path))
            self.assertTrue(fingerprint)
            self.assertEqual(fingerprint, quick_content_fingerprint(path, os.path.getsize(path)))
        finally:
            os.unlink(path)

    def test_build_collection_stats(self):
        entries = {
            "0": {
                "title": "Sally Gardens",
                "artist": "Altan",
                "album": "The Gap",
                "genre": "folk",
                "category": "celtic",
                "ext": ".mp3",
                "size": 1000,
                "duration": 180,
                "addedAt": "2020-05-01T00:00:00+00:00",
                "playCount": 3,
                "hasArt": True,
                "meta": {
                    "title": "tag",
                    "artist": "tag",
                    "album": "tag",
                    "genre": "tag",
                    "year": "missing",
                    "composer": "missing",
                    "tracknumber": "missing",
                },
                "tagKeys": ["title", "artist"],
                "fingerprint": "abc",
                "softDupKey": soft_duplicate_key("Sally Gardens", "Altan", 180),
            },
            "1": {
                "title": "Sally Gardens",
                "artist": "Altan",
                "album": "",
                "genre": "",
                "category": "celtic",
                "ext": ".mp3",
                "size": 1000,
                "duration": 180,
                "addedAt": "2021-01-01T00:00:00+00:00",
                "meta": {
                    "title": "derived",
                    "artist": "derived",
                    "album": "missing",
                    "genre": "missing",
                    "year": "missing",
                    "composer": "missing",
                    "tracknumber": "missing",
                },
                "tagKeys": [],
                "fingerprint": "abc",
                "softDupKey": soft_duplicate_key("Sally Gardens", "Altan", 180),
            },
        }
        stats = build_collection_stats(entries)
        self.assertEqual(stats["tracks"], 2)
        self.assertEqual(stats["metadata"]["taggedTitle"], 1)
        self.assertEqual(stats["duplicates"]["exact"]["extraCopies"], 1)
        self.assertEqual(stats["duplicates"]["metadata"]["extraCopies"], 1)
        self.assertEqual(stats["playback"]["withPlayCount"], 1)
        summary = summarize_stats_for_health(stats)
        self.assertEqual(summary["tracks"], 2)
        self.assertEqual(summary["duplicateExtras"], 1)


if __name__ == "__main__":
    unittest.main()
