import base64
import unittest

from remote_playback_resolve import decode_uploaded_audio_bytes

try:
    from server import normalize_linked_media_source
except ImportError:
    normalize_linked_media_source = None


class RemotePlaybackResolveTest(unittest.TestCase):
    def test_decode_uploaded_audio_bytes(self):
        raw = b"fake-audio"
        body = {
            "audioBase64": base64.b64encode(raw).decode("ascii"),
            "audioFilename": "demo.m4a",
        }
        audio_bytes, filename = decode_uploaded_audio_bytes(body)
        self.assertEqual(audio_bytes, raw)
        self.assertEqual(filename, "demo.m4a")

    def test_decode_uploaded_audio_bytes_missing(self):
        self.assertIsNone(decode_uploaded_audio_bytes({}))

    @unittest.skipUnless(normalize_linked_media_source, "server module unavailable")
    def test_normalize_linked_media_source_unwraps_proxy_audio(self):
        inner = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        wrapped = "http://127.0.0.1:8787/proxy-audio?url=" + inner
        source, source_type = normalize_linked_media_source(wrapped, "audio")
        self.assertEqual(source_type, "youtube")
        self.assertEqual(source, inner)

    @unittest.skipUnless(normalize_linked_media_source, "server module unavailable")
    def test_normalize_linked_media_source_bare_video_id(self):
        source, source_type = normalize_linked_media_source("dQw4w9WgXcQ", "audio")
        self.assertEqual(source_type, "youtube")
        self.assertIn("dQw4w9WgXcQ", source)


if __name__ == "__main__":
    unittest.main()
