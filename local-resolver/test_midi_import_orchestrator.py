import os
import unittest
from unittest.mock import patch

from midi_import_orchestrator import import_midi_bytes


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


class MidiImportOrchestratorTests(unittest.TestCase):
    def _read(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    def test_import_monophonic_jig(self):
        result = import_midi_bytes(self._read("monophonic_jig.mid"), "monophonic_jig.mid")
        self.assertIn(result["strategy"], ("note_events", "musicxml", "musescore"))
        self.assertTrue(result.get("abc") or result.get("musicXml"))
        self.assertGreater(result.get("confidence", 0), 0)

    def test_import_abcjs_melody_plus_chords_melody_mode(self):
        result = import_midi_bytes(
            self._read("abcjs_melody_plus_chords.mid"),
            "abcjs_melody_plus_chords.mid",
            mode="melody",
        )
        self.assertTrue(result.get("abc") or result.get("musicXml"))
        if result.get("abc"):
            self.assertIn("K:", result["abc"])

    def test_forced_multi_voice_returns_result(self):
        result = import_midi_bytes(
            self._read("abcjs_melody_plus_chords.mid"),
            "abcjs_melody_plus_chords.mid",
            mode="multi_voice",
        )
        self.assertIn(result.get("mode"), ("multi_voice", "melody"))

    def test_ambiguous_routing_runs_musescore(self):
        midi = self._read("abcjs_melody_plus_chords.mid")
        with patch("midi_import_orchestrator._try_musescore_musicxml", return_value='<?xml version="1.0"?><score-partwise><part><measure><note><pitch><step>C</step><octave>4</octave></pitch></note><note><pitch><step>D</step><octave>4</octave></pitch></note></measure></part></score-partwise>') as mock_muse:
            with patch("midi_import_orchestrator._musescore_cli_available", return_value=True):
                result = import_midi_bytes(midi, "abcjs_melody_plus_chords.mid", strategy="auto")
        mock_muse.assert_called_once()
        self.assertTrue(result.get("abc") or result.get("musicXml"))

    def test_musescore_backup_when_scores_low(self):
        midi = self._read("monophonic_jig.mid")
        with patch("midi_import_orchestrator.convert_midi_to_abc_note_events", return_value={"abc": "", "mode": "melody", "warnings": [], "diagnostics": {}}):
            with patch("midi_import_orchestrator.convert_midi_bytes_to_musicxml_sync", side_effect=RuntimeError("fail")):
                with patch("midi_import_orchestrator._try_musescore_musicxml", return_value='<?xml version="1.0"?><score-partwise><part><measure><note><pitch><step>C</step><octave>4</octave></pitch></note><note><pitch><step>D</step><octave>4</octave></pitch></note></measure></part></score-partwise>') as mock_muse:
                    with patch("midi_import_orchestrator._musescore_cli_available", return_value=True):
                        result = import_midi_bytes(midi, "monophonic_jig.mid", strategy="auto")
        mock_muse.assert_called_once()
        self.assertEqual(result.get("strategy"), "musescore")


if __name__ == "__main__":
    unittest.main()
