import json
import os
import tempfile
import unittest
from unittest.mock import patch

from music_collection_moves import apply_move_plan


class MusicCollectionMovesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "source"), exist_ok=True)
        with open(os.path.join(self.root, "source", "song.mp3"), "wb") as handle:
            handle.write(b"ID3move")
        with open(os.path.join(self.root, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "version": 2,
                "entries": {
                    "11": {
                        "title": "Song",
                        "artist": "Band",
                        "path": "source/song.mp3",
                    },
                },
                "tokens": {},
            }, handle)

    def tearDown(self):
        self.tmp.cleanup()

    def test_apply_move_plan_updates_index_path(self):
        payload = {
            "moves": [
                {
                    "entryId": "11",
                    "from": "source/song.mp3",
                    "to": "library/song.mp3",
                },
            ],
        }
        with patch.dict(os.environ, {"MUSIC_COLLECTION_DIR": self.root}):
            result = apply_move_plan(payload, apply=True, staging=False)
            self.assertEqual(result["moves"][0]["status"], "moved")
            self.assertTrue(os.path.isfile(os.path.join(self.root, "library", "song.mp3")))
            with open(os.path.join(self.root, "music_collection_index.json"), "r", encoding="utf-8") as handle:
                saved = json.load(handle)
        self.assertEqual(saved["entries"]["11"]["path"], "library/song.mp3")


if __name__ == "__main__":
    unittest.main()
