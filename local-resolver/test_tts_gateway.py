import os
import unittest

from tts.gateway import backends_from_env, piper_payload_from_openai


class PiperPayloadTests(unittest.TestCase):
    def test_maps_openai_input_to_text(self):
        payload = piper_payload_from_openai({"input": "Practice session starting."})
        self.assertEqual(payload["text"], "Practice session starting.")

    def test_ignores_kokoro_voice_ids(self):
        payload = piper_payload_from_openai(
            {"input": "Hello", "voice": "af_bella", "speed": 1.0}
        )
        self.assertEqual(payload["text"], "Hello")
        self.assertNotIn("voice", payload)

    def test_forwards_piper_style_voice(self):
        payload = piper_payload_from_openai(
            {"input": "Hello", "voice": "en_US-lessac-medium"}
        )
        self.assertEqual(payload["voice"], "en_US-lessac-medium")

    def test_speed_maps_to_length_scale(self):
        payload = piper_payload_from_openai({"input": "Hi", "speed": 2.0})
        self.assertAlmostEqual(payload["length_scale"], 0.5)

    def test_off_disables_piper_fallback(self):
        previous = os.environ.get("TTS_FALLBACK_URL")
        os.environ["TTS_FALLBACK_URL"] = "off"
        try:
            names = [backend.name for backend in backends_from_env()]
        finally:
            if previous is None:
                os.environ.pop("TTS_FALLBACK_URL", None)
            else:
                os.environ["TTS_FALLBACK_URL"] = previous
        self.assertEqual(names, ["kokoro"])


if __name__ == "__main__":
    unittest.main()
