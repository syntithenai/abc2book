import os
import tempfile
import time
import unittest
from unittest import mock

from remote_playback_cache import (
    build_resolve_cache_key,
    cache_stats,
    get_cached_input_path,
    store_cached_input_path,
)


class RemotePlaybackCacheTests(unittest.TestCase):
    def setUp(self):
        self._cache = {}
        self._patch_lock = mock.patch("remote_playback_cache._CACHE", self._cache)
        self._patch_lock.start()

    def tearDown(self):
        self._patch_lock.stop()
        for path, _created in self._cache.values():
            try:
                os.unlink(path)
            except OSError:
                pass
        self._cache.clear()

    def test_build_resolve_cache_key_stable(self):
        body = {"pitch": 0, "fineTune": 0, "tempo": 1, "midiBase64": "abc"}
        key_a = build_resolve_cache_key(source="https://x/a.mp3", source_type="audio", body=body)
        key_b = build_resolve_cache_key(source="https://x/a.mp3", source_type="audio", body=body)
        self.assertEqual(key_a, key_b)
        self.assertEqual(len(key_a), 64)

    def test_store_and_get_cached_path(self):
        with tempfile.NamedTemporaryFile(delete=False) as handle:
            handle.write(b"audio")
            path = handle.name
        key = build_resolve_cache_key(source="s", source_type="audio", body={})
        store_cached_input_path(key, path)
        self.assertEqual(get_cached_input_path(key), path)
        self.assertEqual(cache_stats()["entries"], 1)

    def test_expired_entry_removed(self):
        with tempfile.NamedTemporaryFile(delete=False) as handle:
            handle.write(b"audio")
            path = handle.name
        key = build_resolve_cache_key(source="s", source_type="audio", body={})
        self._cache[key] = (path, time.time() - 7200)
        with mock.patch("remote_playback_cache.cache_ttl_seconds", return_value=3600):
            self.assertIsNone(get_cached_input_path(key))
        self.assertFalse(os.path.isfile(path))


if __name__ == "__main__":
    unittest.main()
