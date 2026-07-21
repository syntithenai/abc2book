import os
import unittest

from midi_analysis import analyze_midi_bytes
from midi_chord_infer import (
    infer_chords_from_midi,
    should_infer_chords,
    _match_pitch_classes_to_label,
)
from midi_harmony_voice import build_harmony_voice_abc
from midi_import_orchestrator import import_midi_bytes


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


class MidiChordInferTests(unittest.TestCase):
    def _read(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    def test_match_c_major_triad(self):
        label, score = _match_pitch_classes_to_label({0, 4, 7})
        self.assertTrue(label.endswith(":maj") or label == "C:maj")
        self.assertGreater(score, 0.5)

    def test_match_a_minor_triad(self):
        label, score = _match_pitch_classes_to_label({9, 0, 4})
        self.assertIn("min", label)
        self.assertGreater(score, 0.5)

    def test_monophonic_jig_has_no_chords(self):
        profile = analyze_midi_bytes(self._read("monophonic_jig.mid"), "monophonic_jig.mid")
        self.assertFalse(should_infer_chords(profile, include_chords=None))
        result = infer_chords_from_midi(self._read("monophonic_jig.mid"), profile)
        self.assertEqual(result.get("segments"), [])

    def test_abcjs_fixture_infers_chords(self):
        profile = analyze_midi_bytes(self._read("abcjs_melody_plus_chords.mid"), "abcjs_melody_plus_chords.mid")
        self.assertTrue(should_infer_chords(profile))
        result = infer_chords_from_midi(self._read("abcjs_melody_plus_chords.mid"), profile)
        self.assertGreater(len(result.get("segments") or []), 0)
        self.assertIn(result.get("source"), ("harmony_track", "melody_polyphony", "mixed"))

    def test_abcjs_harmony_voice_has_bracket_chords(self):
        midi = self._read("abcjs_melody_plus_chords.mid")
        profile = analyze_midi_bytes(midi, "abcjs_melody_plus_chords.mid")
        harmony = build_harmony_voice_abc(midi, profile)
        body = harmony.get("body") or ""
        self.assertIn("[", body)
        self.assertIn("]", body)


    def test_bass_and_melody_fixture(self):
        if not os.path.isfile(os.path.join(FIXTURES, "bass_and_melody.mid")):
            self.skipTest("bass_and_melody.mid fixture missing")
        midi = self._read("bass_and_melody.mid")
        profile = analyze_midi_bytes(midi, "bass_and_melody.mid")
        result = infer_chords_from_midi(midi, profile, include_chords=True)
        self.assertGreater(len(result.get("segments") or []), 0)


class MidiChordOrchestratorTests(unittest.TestCase):
    def _read(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    def test_orchestrator_returns_chord_segments_for_abcjs(self):
        result = import_midi_bytes(
            self._read("abcjs_melody_plus_chords.mid"),
            "abcjs_melody_plus_chords.mid",
            include_chords=True,
        )
        self.assertIn("chordSegments", result)
        self.assertTrue((result.get("chordSegments") or {}).get("segments"))
        self.assertTrue(result.get("harmonyAbc") or result.get("chords"))


if __name__ == "__main__":
    unittest.main()
