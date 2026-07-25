import unittest

from midi_import_score import (
    _empty_measure_penalty,
    _rest_ratio_penalty,
    score_abc_import,
)


class MidiImportScorePenaltyTests(unittest.TestCase):
    def test_rest_ratio_penalty_triggers_on_rest_heavy_abc(self):
        abc = "X:1\nM:4/4\nL:1/8\nK:C\nz8 z8 z8 z8 |"
        self.assertGreater(_rest_ratio_penalty(abc), 0)

    def test_empty_measure_penalty_triggers_on_long_rest_tail(self):
        abc = "X:1\nM:4/4\nL:1/8\nK:C\nC2 |" + "\n".join(["z8 |"] * 30)
        self.assertGreater(_empty_measure_penalty(abc, source_note_count=4), 0)

    def test_score_abc_import_applies_penalties(self):
        abc = "X:1\nM:4/4\nL:1/8\nK:C\nC2 |" + "\n".join(["z8 |"] * 20)
        clean = score_abc_import("X:1\nM:4/4\nL:1/8\nK:C\nC2 D2 E2 F2 |", source_note_count=4)
        noisy = score_abc_import(abc, source_note_count=4)
        self.assertGreater(clean["score"], noisy["score"])


if __name__ == "__main__":
    unittest.main()
