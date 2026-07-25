import unittest

from midi_analysis import (
    MidiTrackProfile,
    _apply_track_recommendations,
    _recommend_track_ids_by_note_count,
    MidiProfile,
)


class MidiAnalysisRecommendationTests(unittest.TestCase):
    def test_recommend_track_ids_by_note_count_skips_sparse_tracks(self):
        tracks = [
            MidiTrackProfile(index=0, note_count=1000),
            MidiTrackProfile(index=1, note_count=500),
            MidiTrackProfile(index=2, note_count=5),
        ]
        ids = _recommend_track_ids_by_note_count(tracks)
        self.assertEqual(ids, [0, 1])

    def test_apply_track_recommendations_multi_voice_for_dense_parts(self):
        profile = MidiProfile()
        pitched = [
            MidiTrackProfile(index=0, note_count=800, role_hint="harmony"),
            MidiTrackProfile(index=1, note_count=600, role_hint="harmony"),
            MidiTrackProfile(index=2, note_count=400, role_hint="melody"),
        ]
        result = _apply_track_recommendations(profile, pitched)
        self.assertEqual(result.recommended_mode, "multi_voice")
        self.assertIn(0, result.recommended_track_ids)
        self.assertIn(1, result.recommended_track_ids)


if __name__ == "__main__":
    unittest.main()
