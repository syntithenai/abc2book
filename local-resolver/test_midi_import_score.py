import unittest

from midi_import_score import pick_best_candidate, score_abc_import, score_musicxml_candidate


class MidiImportScoreTests(unittest.TestCase):
    def test_score_abc_import_accepts_valid_abc(self):
        abc = "X:1\nT:Test\nM:4/4\nL:1/8\nK:G\nG2 A2 B2 c2 |"
        scored = score_abc_import(abc, source_note_count=4, has_title=True, key="G")
        self.assertTrue(scored["gates_passed"])
        self.assertGreater(scored["score"], 0.4)

    def test_score_abc_import_rejects_empty(self):
        scored = score_abc_import("", source_note_count=0)
        self.assertFalse(scored["gates_passed"])
        self.assertEqual(scored["score"], 0.0)

    def test_pick_best_candidate_prefers_higher_score(self):
        best = pick_best_candidate([
            {"abc": "X:1\nT:A\nM:4/4\nL:1/8\nK:G\nG A B c |", "strategy": "note_events", "score": 0.8, "confidence": 0.8, "warnings": []},
            {"abc": "X:1\nT:B\nM:4/4\nL:1/8\nK:G\nz8 |", "strategy": "musicxml", "score": 0.2, "confidence": 0.2, "warnings": []},
        ], profile_mode="melody")
        self.assertEqual(best["strategy"], "note_events")
        self.assertIn("G", best["abc"])

    def test_score_musicxml_candidate_accepts_notes(self):
        xml = (
            '<?xml version="1.0"?><score-partwise><part><measure>'
            '<note><pitch><step>C</step><octave>4</octave></pitch></note>'
            '<note><pitch><step>D</step><octave>4</octave></pitch></note>'
            "</measure></part></score-partwise>"
        )
        scored = score_musicxml_candidate(xml, diagnostics={"quant_error": 0.05, "tracks_imported": 1}, source_note_count=2)
        self.assertTrue(scored["gates_passed"])
        self.assertGreater(scored["score"], 0.5)

    def test_pick_best_candidate_prefers_nonempty_musicxml_over_empty_abc(self):
        best = pick_best_candidate([
            {"abc": "", "strategy": "note_events", "score": 0.0, "confidence": 0.0, "warnings": []},
            {"abc": "", "musicXml": "<note></note><note></note>", "strategy": "musicxml", "score": 0.7, "confidence": 0.7, "warnings": []},
        ], profile_mode="melody")
        self.assertEqual(best["strategy"], "musicxml")
        self.assertTrue(best.get("musicXml"))


if __name__ == "__main__":
    unittest.main()
