import base64
import unittest

from remote_playback_resolve import decode_uploaded_audio_bytes


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


if __name__ == "__main__":
    unittest.main()
