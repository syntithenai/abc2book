import os
import re
import unittest

from midi_import_orchestrator import import_midi_bytes
from midi_import_score import score_abc_import

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


def _read(name: str) -> bytes:
    with open(os.path.join(FIXTURES, name), "rb") as handle:
        return handle.read()


def _voice_count(abc: str) -> int:
    return len(re.findall(r"^V:\d+", abc, re.M))


class MidiImportEndToEndTests(unittest.TestCase):
    def test_monophonic_jig_has_meter_and_notes(self):
        result = import_midi_bytes(_read("monophonic_jig.mid"), "monophonic_jig.mid", strategy="auto")
        self.assertTrue(result.get("abc") or result.get("musicXml"))
        abc = result.get("abc") or ""
        if not abc and result.get("musicXml"):
            self.skipTest("Client xml2abc not available in python test")
        if abc:
            self.assertIn("M:6/8", abc)
            scored = score_abc_import(abc, source_note_count=48)
            self.assertGreater(scored["note_count"], 0)
            self.assertLess(scored["score"], 1.0)

    def test_bass_and_melody_multi_voice(self):
        result = import_midi_bytes(
            _read("bass_and_melody.mid"),
            "bass_and_melody.mid",
            mode="multi_voice",
            strategy="auto",
            track_ids=[0, 1],
        )
        self.assertEqual(result.get("mode"), "multi_voice")
        self.assertTrue(result.get("abc") or result.get("musicXml"))
        if result.get("musicXml"):
            self.assertIn("score-partwise", result["musicXml"])

    def test_abcjs_melody_plus_chords_scores_reasonably(self):
        result = import_midi_bytes(
            _read("abcjs_melody_plus_chords.mid"),
            "abcjs_melody_plus_chords.mid",
            strategy="auto",
        )
        self.assertGreater(result.get("confidence", 0), 0.2)
        if result.get("abc"):
            scored = score_abc_import(result["abc"])
            self.assertTrue(scored["gates_passed"])


if __name__ == "__main__":
    unittest.main()
