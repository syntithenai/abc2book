import unittest

from playback_region_detect import (
    detect_end_from_outro_segments,
    detect_playback_region,
    detect_start_from_intro_segments,
)


class PlaybackRegionDetectTests(unittest.TestCase):
    def test_detects_intro_speech_before_gap(self):
        segments = [
            {"start": 0.0, "end": 8.0, "text": "Welcome to the session"},
            {"start": 10.0, "end": 18.0, "text": "This tune is called The Silver Spear"},
            {"start": 25.0, "end": 30.0, "text": "one two three"},
        ]
        start_at, confidence, method = detect_start_from_intro_segments(segments)
        self.assertEqual(start_at, 18.3)
        self.assertGreater(confidence, 0.5)
        self.assertEqual(method, "gap")

    def test_no_intro_when_speech_runs_into_lyrics(self):
        segments = [
            {"start": 0.0, "end": 4.0, "text": "Hello everyone"},
            {"start": 5.0, "end": 12.0, "text": "la la la la la"},
            {"start": 13.0, "end": 20.0, "text": "more singing here"},
        ]
        start_at, confidence, method = detect_start_from_intro_segments(segments)
        self.assertEqual(start_at, 0.0)
        self.assertEqual(confidence, 0.0)
        self.assertEqual(method, "none")

    def test_no_intro_when_no_segments(self):
        start_at, confidence, method = detect_start_from_intro_segments([])
        self.assertEqual(start_at, 0.0)
        self.assertEqual(method, "none")

    def test_detects_trailing_outro_speech(self):
        duration = 300.0
        tail_offset = 120.0
        segments = [
            {"start": 0.0, "end": 10.0, "text": "music continues"},
            {"start": 170.0, "end": 178.0, "text": "Thanks for watching"},
            {"start": 179.0, "end": 185.0, "text": "Please subscribe"},
        ]
        end_at, confidence, method = detect_end_from_outro_segments(segments, duration, tail_offset)
        self.assertEqual(end_at, 289.7)
        self.assertGreater(confidence, 0.5)
        self.assertEqual(method, "gap")

    def test_no_outro_when_trailing_speech_follows_music_immediately(self):
        duration = 200.0
        tail_offset = 20.0
        segments = [
            {"start": 0.0, "end": 20.0, "text": "still playing"},
            {"start": 20.5, "end": 28.0, "text": "thanks folks"},
        ]
        end_at, confidence, method = detect_end_from_outro_segments(segments, duration, tail_offset)
        self.assertEqual(end_at, 0.0)
        self.assertEqual(method, "none")

    def test_detect_playback_region_combines_boundaries(self):
        intro_segments = [
            {"start": 0.0, "end": 12.0, "text": "Intro chat"},
            {"start": 20.0, "end": 24.0, "text": "counting in"},
        ]
        outro_segments = [
            {"start": 150.0, "end": 158.0, "text": "Thanks everyone"},
        ]
        result = detect_playback_region(
            intro_segments,
            outro_segments,
            duration=320.0,
            tail_offset_seconds=140.0,
        )
        self.assertEqual(result["startAt"], 11.3)
        self.assertEqual(result["endAt"], 290.7)
        self.assertGreater(result["confidence"], 0.0)

    def test_music_boundary_buffer_clamps_end_to_duration(self):
        intro_segments = [
            {"start": 0.0, "end": 12.0, "text": "Intro chat"},
            {"start": 20.0, "end": 24.0, "text": "counting in"},
        ]
        outro_segments = [
            {"start": 150.0, "end": 158.0, "text": "Thanks everyone"},
        ]
        result = detect_playback_region(
            intro_segments,
            outro_segments,
            duration=290.0,
            tail_offset_seconds=140.0,
        )
        self.assertEqual(result["startAt"], 11.3)
        self.assertEqual(result["endAt"], 290.0)


if __name__ == "__main__":
    unittest.main()
