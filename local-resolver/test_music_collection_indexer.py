import json
import os
import tempfile
import unittest

from music_collection_analytics import quick_content_fingerprint, read_standard_tags
from music_collection_indexer import (
    BuildErrorLog,
    BuildLock,
    IndexBuildOptions,
    atomic_write_json,
    build_index,
    iter_audio_files,
    process_file,
    run_build,
)


class MusicCollectionIndexerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.metadata = os.path.join(self.tmp.name, "meta")
        os.makedirs(self.metadata, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def _opts(self, **kwargs):
        return IndexBuildOptions(
            root_dir=self.root,
            metadata_dir=self.metadata,
            extract_art=False,
            resume=False,
            **kwargs,
        )

    def test_iter_audio_files_skips_zero_byte(self):
        good = os.path.join(self.root, "good.mp3")
        empty = os.path.join(self.root, "empty.mp3")
        with open(good, "wb") as handle:
            handle.write(b"ID3")
        open(empty, "wb").close()
        paths = list(iter_audio_files(self.root))
        self.assertEqual(len(paths), 1)
        self.assertEqual(paths[0][0], "good.mp3")

    def test_process_file_truncated_mp3(self):
        path = os.path.join(self.root, "bad.mp3")
        with open(path, "wb") as handle:
            handle.write(b"not-really-mp3")
        entry = process_file("bad.mp3", path, "0", extract_art=False, art_dir=self.metadata, tags_only=True)
        self.assertEqual(entry["path"], "bad.mp3")
        self.assertTrue(entry.get("title"))

    def test_build_index_with_poison_file_completes(self):
        good = os.path.join(self.root, "track.mp3")
        with open(good, "wb") as handle:
            handle.write(b"ID3")
        poison = os.path.join(self.root, "poison.mp3")
        with open(poison, "wb") as handle:
            handle.write(b"\x00" * 10)
        index = build_index(self._opts())
        self.assertEqual(index["count"], 2)

    def test_atomic_write_json(self):
        path = os.path.join(self.metadata, "out.json")
        atomic_write_json(path, {"ok": True})
        with open(path, "r", encoding="utf-8") as handle:
            self.assertEqual(json.load(handle), {"ok": True})

    def test_build_error_log_caps_lines(self):
        path = os.path.join(self.metadata, "errors.jsonl")
        log = BuildErrorLog(path, max_lines=3)
        for i in range(5):
            log.append({"n": i})
        self.assertEqual(log.total, 5)
        self.assertEqual(len(log._lines), 3)

    def test_build_lock_rejects_concurrent(self):
        lock_path = os.path.join(self.metadata, "build.lock")
        lock = BuildLock(lock_path)
        lock.acquire()
        try:
            other = BuildLock(lock_path)
            with self.assertRaises(RuntimeError):
                other.acquire()
        finally:
            lock.release()

    def test_run_build_writes_index_and_progress(self):
        track = os.path.join(self.root, "song.mp3")
        with open(track, "wb") as handle:
            handle.write(b"ID3")
        index_path = os.path.join(self.metadata, "music_collection_index.json")
        stats_path = os.path.join(self.metadata, "music_collection_stats.json")
        index = run_build(
            self._opts(),
            index_output_path=index_path,
            stats_output_path=stats_path,
            acquire_lock=True,
        )
        self.assertTrue(os.path.isfile(index_path))
        self.assertEqual(index["count"], 1)
        with open(os.path.join(self.metadata, "build_progress.json"), "r", encoding="utf-8") as handle:
            progress = json.load(handle)
        self.assertEqual(progress["phase"], "complete")

    def test_read_standard_tags_id3_in_indexer_context(self):
        standard, keys = read_standard_tags({"TIT2": "Tune", "TPE1": "Player"})
        self.assertEqual(standard["title"], "Tune")
        self.assertEqual(standard["artist"], "Player")
        self.assertIn("tit2", keys)

    def test_build_index_preserves_entry_id_for_moved_file_by_fingerprint(self):
        moved_dir = os.path.join(self.root, "moved")
        os.makedirs(moved_dir, exist_ok=True)
        track = os.path.join(moved_dir, "song.mp3")
        with open(track, "wb") as handle:
            handle.write(b"ID3moved-song")
        size = os.path.getsize(track)
        fingerprint = quick_content_fingerprint(track, size)
        with open(os.path.join(self.metadata, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "version": 2,
                "entries": {
                    "7": {
                        "title": "Song",
                        "artist": "Band",
                        "path": "old/song.mp3",
                        "fingerprint": fingerprint,
                    },
                },
                "tokens": {},
            }, handle)
        index = build_index(self._opts())
        self.assertIn("7", index["entries"])
        self.assertEqual(index["entries"]["7"]["path"], "moved/song.mp3")

    def test_build_index_prunes_deleted_entries(self):
        with open(os.path.join(self.metadata, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "version": 2,
                "entries": {
                    "3": {
                        "title": "Gone",
                        "artist": "Band",
                        "path": "gone/song.mp3",
                        "fingerprint": "deadbeef",
                    },
                },
                "tokens": {"gone": ["3"]},
            }, handle)
        index = build_index(self._opts())
        self.assertEqual(index["count"], 0)
        self.assertEqual(index["entries"], {})
        self.assertEqual(index["tokens"], {})

    def test_build_index_claims_previous_entry_id_once_for_duplicate_fingerprint(self):
        left = os.path.join(self.root, "a.mp3")
        right = os.path.join(self.root, "b.mp3")
        for path in (left, right):
            with open(path, "wb") as handle:
                handle.write(b"ID3duplicate")
        fingerprint = quick_content_fingerprint(left, os.path.getsize(left))
        with open(os.path.join(self.metadata, "music_collection_index.json"), "w", encoding="utf-8") as handle:
            json.dump({
                "version": 2,
                "entries": {
                    "9": {
                        "title": "Song",
                        "artist": "Band",
                        "path": "old/song.mp3",
                        "fingerprint": fingerprint,
                    },
                },
                "tokens": {},
            }, handle)
        index = build_index(self._opts())
        holders = sorted([
            entry_id for entry_id, entry in index["entries"].items()
            if entry.get("fingerprint") == fingerprint
        ], key=int)
        self.assertEqual(holders[0], "9")
        self.assertEqual(len(holders), 2)


if __name__ == "__main__":
    unittest.main()
