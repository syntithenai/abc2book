import unittest

from tts.gateway import piper_payload_from_openai


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


if __name__ == "__main__":
    unittest.main()
