import io
import unittest
from pathlib import Path

try:
    import mido  # noqa: F401
    HAS_MIDO = True
except ImportError:
    HAS_MIDO = False

from music_generation.guide_harmony import (
    build_harmony_events,
    chord_label_to_midi_pitches,
    chords_per_bar_from_plan,
    guide_harmony_source,
)
from music_generation.fidelity_validation import validate_guide_wav


class GuideHarmonyTests(unittest.TestCase):
    def test_chord_label_to_pitches(self):
        pitches = chord_label_to_midi_pitches("G", base_octave=3)
        self.assertIn(55, pitches)  # G3
        self.assertIn(59, pitches)  # B3
        self.assertIn(62, pitches)  # D4

    def test_chords_per_bar_from_plan(self):
        plan = {
            "chordsPerBar": ["G", "Em", "C"],
            "timing": {"barBoundariesSec": [0, 1, 2, 3]},
        }
        self.assertEqual(chords_per_bar_from_plan(plan), ["G", "Em", "C"])
        self.assertEqual(guide_harmony_source(plan), "chord_chart")

    def test_guide_harmony_source_abcjs_fallback(self):
        plan = {"timing": {"barBoundariesSec": [0, 1]}}
        self.assertEqual(guide_harmony_source(plan), "abcjs")

    def test_validate_guide_trad_chord_chart_passes_gate(self):
        """Waltz downbeat strums must not fail trad chord-chart guides."""
        quality = validate_guide_wav(
            Path("/nonexistent.wav"),
            meter="3/4",
            render_style="trad_session",
            harmony_source="chord_chart",
        )
        self.assertTrue(quality["guideHarmonyOk"])
        self.assertTrue(quality["gatePassed"])

    @unittest.skipUnless(HAS_MIDO, "mido not installed")
    def test_classical_harmony_sustained_per_bar(self):
        events = build_harmony_events(
            ["G", "Em"],
            bar_count=2,
            meter="3/4",
            render_style="classical",
            accompaniment_program=48,
        )
        note_ons = [msg for _, msg in events if msg.type == "note_on" and msg.velocity > 0]
        self.assertGreaterEqual(len(note_ons), 4)
        # Whole-bar pads: fewer note-ons than boom-chick (which would be 4+ per bar).
        self.assertLessEqual(len(note_ons), 16)
        # Dual programs: cello bass + ensemble pad.
        programs = {
            (msg.channel, msg.program)
            for _, msg in events
            if msg.type == "program_change"
        }
        self.assertIn((1, 42), programs)
        self.assertIn((2, 48), programs)

    def test_half_rms_ratio_helper(self):
        from music_generation.fidelity_validation import validate_midtrack_continuity
        quality = validate_midtrack_continuity(Path("/nonexistent.wav"))
        self.assertIsNone(quality["halfRmsRatio"])
        self.assertTrue(quality["gatePassed"])

    @unittest.skipUnless(HAS_MIDO, "mido not installed")
    def test_build_chord_chart_guide_midi(self):
        import mido

        from music_generation.guide_harmony import build_chord_chart_guide_midi

        score = mido.MidiFile(ticks_per_beat=480)
        melody = mido.MidiTrack()
        score.tracks.append(melody)
        melody.append(mido.Message("program_change", program=40, channel=0, time=0))
        melody.append(mido.Message("note_on", note=67, velocity=90, channel=0, time=0))
        melody.append(mido.Message("note_off", note=67, velocity=0, channel=0, time=480))
        buf = io.BytesIO()
        score.save(file=buf)

        out = build_chord_chart_guide_midi(
            buf.getvalue(),
            ["G", "Em"],
            bar_count=2,
            meter="3/4",
            render_style="classical",
            lead_program=40,
            accompaniment_program=48,
        )
        mid = mido.MidiFile(file=io.BytesIO(out))
        self.assertGreaterEqual(len(mid.tracks), 2)


if __name__ == "__main__":
    unittest.main()
