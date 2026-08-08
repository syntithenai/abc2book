import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from music_collection_transcode import (
    BROWSER_TRANSCODE_EXTENSIONS,
    needs_browser_transcode,
    resolve_playable_audio_path,
    transcode_cache_path,
)


class MusicCollectionTranscodeTests(unittest.TestCase):
    def test_needs_browser_transcode(self):
        self.assertTrue(needs_browser_transcode("/music/track.wma"))
        self.assertFalse(needs_browser_transcode("/music/track.mp3"))
        self.assertIn(".wma", BROWSER_TRANSCODE_EXTENSIONS)

    def test_transcode_temp_path_keeps_mp3_extension(self):
        cached = transcode_cache_path("/music/track.wma")
        root, ext = os.path.splitext(cached)
        tmp_path = root + ".part" + ext
        self.assertTrue(tmp_path.endswith(".mp3"))
        self.assertTrue(tmp_path.endswith(".part.mp3"))

        with tempfile.NamedTemporaryFile(suffix=".wma", delete=False) as handle:
            handle.write(b"fake")
            path = handle.name
        try:
            first = transcode_cache_path(path)
            second = transcode_cache_path(path)
            self.assertEqual(first, second)
            self.assertTrue(first.endswith(".mp3"))
        finally:
            os.unlink(path)

    def test_resolve_playable_audio_path_returns_original_for_mp3(self):
        async def run():
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as handle:
                handle.write(b"fake")
                path = handle.name
            try:
                serve_path, mime = await resolve_playable_audio_path(path, playable=True)
                self.assertEqual(serve_path, path)
                self.assertEqual(mime, "audio/mpeg")
            finally:
                os.unlink(path)

        import asyncio
        asyncio.run(run())

    def test_resolve_playable_audio_path_transcodes_wma(self):
        async def run():
            with tempfile.TemporaryDirectory() as tmp:
                source = os.path.join(tmp, "track.wma")
                with open(source, "wb") as handle:
                    handle.write(b"fake")

                with patch.dict(os.environ, {"MUSIC_COLLECTION_INDEX_DIR": tmp}):
                    cached = transcode_cache_path(source)
                    os.makedirs(os.path.dirname(cached), exist_ok=True)
                    with open(cached, "wb") as handle:
                        handle.write(b"mp3")

                    serve_path, mime = await resolve_playable_audio_path(source, playable=True)
                self.assertEqual(serve_path, cached)
                self.assertEqual(mime, "audio/mpeg")

        import asyncio
        asyncio.run(run())

    def test_resolve_playable_audio_path_invokes_ffmpeg_when_cache_missing(self):
        async def run():
            with tempfile.TemporaryDirectory() as tmp:
                source = os.path.join(tmp, "track.wma")
                with open(source, "wb") as handle:
                    handle.write(b"fake")

                with patch.dict(os.environ, {"MUSIC_COLLECTION_INDEX_DIR": tmp}):
                    cached = transcode_cache_path(source)

                    async def fake_transcode(abs_path, output_path, **kwargs):
                        os.makedirs(os.path.dirname(output_path), exist_ok=True)
                        with open(output_path, "wb") as handle:
                            handle.write(b"mp3")

                    with patch(
                        "music_collection_transcode.transcode_to_mp3",
                        new=AsyncMock(side_effect=fake_transcode),
                    ):
                        serve_path, mime = await resolve_playable_audio_path(source, playable=True)
                    self.assertEqual(serve_path, cached)
                    self.assertEqual(mime, "audio/mpeg")
                    self.assertTrue(os.path.isfile(cached))

        import asyncio
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
