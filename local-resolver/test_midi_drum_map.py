import unittest

from midi_drum_map import build_drummap_lines, drum_note_to_abc_token, gm_drum_entry


class MidiDrumMapTests(unittest.TestCase):
  def test_gm_drum_entry_maps_snare(self):
    abc_note, notehead, label = gm_drum_entry(38)
    self.assertEqual(abc_note, "D")
    self.assertEqual(notehead, "normal")
    self.assertIn("Snare", label)

  def test_build_drummap_lines_emits_midi_drummap(self):
    lines = build_drummap_lines({38, 42})
    self.assertTrue(any(line.startswith("%%MIDI drummap") for line in lines))
    self.assertEqual(len(lines), 2)

  def test_drum_note_to_abc_token_includes_duration(self):
    token = drum_note_to_abc_token(38, "8")
    self.assertIn("8", token)


if __name__ == "__main__":
  unittest.main()
