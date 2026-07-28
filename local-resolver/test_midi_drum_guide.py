import unittest

try:
    import mido  # noqa: F401
    HAS_MIDO = True
except ImportError:
    HAS_MIDO = False

from midi_drum_guide import build_drum_guide_midi


@unittest.skipUnless(HAS_MIDO, "mido not installed")
class MidiDrumGuideTests(unittest.TestCase):
    def test_build_drum_guide_midi(self):
        config = {
            "tempoBpm": 120,
            "beatsPerBar": 4,
            "pulsesPerBeat": [4, 4, 4, 4],
            "barBoundariesSec": [0.0, 2.0, 4.0],
            "tracks": {
                "kick": [0, 8],
                "snare": [4, 12],
            },
            "gmPitches": {"kick": 36, "snare": 38},
        }
        midi_bytes = build_drum_guide_midi(config)
        self.assertTrue(midi_bytes.startswith(b"MThd"))
        self.assertGreater(len(midi_bytes), 32)


if __name__ == "__main__":
    unittest.main()
