import unittest

from cast_transcode_session import (
    TranscodeSettings,
    build_audio_filter_chain,
    build_ffmpeg_pcm_command,
    parse_transcode_settings,
)


class CastTranscodeSessionTests(unittest.TestCase):
    def test_parse_transcode_settings(self):
        settings = parse_transcode_settings({
            "pitch": 2,
            "fineTune": 50,
            "tempo": 0.9,
            "startSeconds": 12,
        })
        self.assertEqual(settings.pitch_semitones, 2)
        self.assertEqual(settings.fine_tune_cents, 50)
        self.assertEqual(settings.tempo, 0.9)
        self.assertEqual(settings.start_seconds, 12)

    def test_build_ffmpeg_pcm_command(self):
        cmd = build_ffmpeg_pcm_command("/tmp/test.mp3", TranscodeSettings(), output_target="pipe:1")
        self.assertIn("s16le", cmd)
        self.assertIn("pipe:1", cmd)

    def test_neutral_filter_chain(self):
        self.assertIsNone(build_audio_filter_chain(TranscodeSettings()))


if __name__ == "__main__":
    unittest.main()
