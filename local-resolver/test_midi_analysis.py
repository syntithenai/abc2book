import os
import unittest

from midi_analysis import analyze_midi_bytes


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


class MidiAnalysisTests(unittest.TestCase):
    def _read(self, name: str) -> bytes:
        path = os.path.join(FIXTURES, name)
        with open(path, "rb") as handle:
            return handle.read()

    def test_monophonic_jig_recommends_melody(self):
        profile = analyze_midi_bytes(self._read("monophonic_jig.mid"), "monophonic_jig.mid")
        self.assertEqual(profile.recommended_mode, "melody")
        self.assertEqual(profile.routing_hint, "melody")
        self.assertEqual(len(profile.recommended_track_ids), 1)
        self.assertGreater(profile.total_pitched_notes, 0)
        self.assertTrue(profile.estimated_key)

    def test_abcjs_export_detected(self):
        profile = analyze_midi_bytes(self._read("abcjs_melody_plus_chords.mid"), "abcjs_melody_plus_chords.mid")
        self.assertIn(profile.source_hint, ("abcjs_export", "general_midi", "unknown"))
        self.assertEqual(profile.recommended_mode, "melody")
        self.assertEqual(profile.routing_hint, "ambiguous")
        self.assertGreaterEqual(len(profile.tracks), 1)

    def test_profile_serializes(self):
        profile = analyze_midi_bytes(self._read("monophonic_jig.mid"), "monophonic_jig.mid")
        data = profile.to_dict()
        self.assertIn("tracks", data)
        self.assertIn("recommended_mode", data)


if __name__ == "__main__":
    unittest.main()
