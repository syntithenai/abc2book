import unittest

from midi_cleanup import apply_midi_cleanup, cleanup_is_active, normalize_cleanup_options


class MidiCleanupTests(unittest.TestCase):
  def test_normalize_cleanup_options_clamps_values(self):
    opts = normalize_cleanup_options({
      "velocityGate": 200,
      "minDurationMs": -5,
      "swingAmount": 0.9,
    })
    self.assertEqual(opts["velocityGate"], 127)
    self.assertEqual(opts["minDurationMs"], 0.0)
    self.assertEqual(opts["swingAmount"], 0.5)

  def test_velocity_gate_removes_quiet_notes(self):
    notes = [
      {"midi": 60, "start": 0.0, "end": 0.5, "velocity": 10},
      {"midi": 62, "start": 0.5, "end": 1.0, "velocity": 100},
    ]
    cleaned, stats = apply_midi_cleanup(notes, {"velocityGate": 50})
    self.assertEqual(len(cleaned), 1)
    self.assertEqual(cleaned[0]["midi"], 62)
    self.assertEqual(stats["removedCount"], 1)

  def test_retrigger_merge_joins_adjacent_same_pitch(self):
    notes = [
      {"midi": 60, "start": 0.0, "end": 0.2, "velocity": 90},
      {"midi": 60, "start": 0.21, "end": 0.5, "velocity": 90},
    ]
    cleaned, _stats = apply_midi_cleanup(notes, {"retriggerMergeMs": 50})
    self.assertEqual(len(cleaned), 1)
    self.assertAlmostEqual(cleaned[0]["end"], 0.5)

  def test_cleanup_is_active_detects_options(self):
    self.assertFalse(cleanup_is_active({}))
    self.assertTrue(cleanup_is_active({"velocityGate": 1}))


if __name__ == "__main__":
  unittest.main()
