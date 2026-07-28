import unittest

try:
    import mido  # noqa: F401
    HAS_MIDO = True
except ImportError:
    HAS_MIDO = False

from midi_score_prepare import prepare_melody_stem_midi


@unittest.skipUnless(HAS_MIDO, "mido not installed")
class MidiScorePrepareTests(unittest.TestCase):
    def _two_track_midi(self) -> bytes:
        import io

        import mido

        mid = mido.MidiFile(ticks_per_beat=480)
        melody = mido.MidiTrack()
        chords = mido.MidiTrack()
        mid.tracks.append(melody)
        mid.tracks.append(chords)
        melody.append(mido.Message("program_change", program=0, channel=0, time=0))
        melody.append(mido.Message("note_on", note=62, velocity=80, channel=0, time=0))
        melody.append(mido.Message("note_off", note=62, velocity=0, channel=0, time=480))
        chords.append(mido.Message("program_change", program=0, channel=1, time=0))
        chords.append(mido.Message("note_on", note=48, velocity=60, channel=1, time=0))
        chords.append(mido.Message("note_off", note=48, velocity=0, channel=1, time=480))
        buffer = io.BytesIO()
        mid.save(file=buffer)
        return buffer.getvalue()

    def test_prepare_keeps_melody_track_only(self):
        prepared = prepare_melody_stem_midi(self._two_track_midi(), lead_program=40)
        import io

        import mido

        mid = mido.MidiFile(file=io.BytesIO(prepared))
        self.assertEqual(len(mid.tracks), 1)
        programs = [msg.program for track in mid.tracks for msg in track if msg.type == "program_change"]
        self.assertEqual(programs, [40])


if __name__ == "__main__":
    unittest.main()
