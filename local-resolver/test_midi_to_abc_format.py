"""Unit tests for MIDI note_events ABC measure join, overlap clip, and polish."""

from __future__ import annotations

import os
import unittest

from midi_to_abc import (
    _join_abc_measures,
    _prepare_events_for_abc_body,
    format_notes_to_abc_body,
    grid_beats_per_bar_from_meter,
    quarters_per_bar_from_meter,
)
from sheet_image_abc_repair import safe_autofix_abc

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")
OLDTIME_MEDIA = os.path.join(
    os.path.dirname(__file__),
    "..",
    "scripts",
    "oldtimefiddletunes",
    "data",
    "media",
)


class MidiAbcFormatTests(unittest.TestCase):
    def test_join_packs_eight_bars_per_line(self):
        parts = [f"C{i}" for i in range(16)]
        body = _join_abc_measures(parts, bars_per_line=8)
        lines = body.split("\n")
        self.assertEqual(len(lines), 2)
        self.assertEqual(len([p for p in lines[0].split("|") if p.strip()]), 8)
        self.assertEqual(len([p for p in lines[1].split("|") if p.strip()]), 8)

    def test_join_one_bar_per_line_for_multi_voice(self):
        body = _join_abc_measures(["C2", "D2"], bars_per_line=1)
        self.assertEqual(len(body.split("\n")), 2)

    def test_prepare_clips_overlapping_legato(self):
        events = [
            (0, 8, "C8"),
            (2, 2, "D2"),
            (4, 2, "E2"),
            (6, 2, "F2"),
        ]
        prepared = _prepare_events_for_abc_body(events, slots_per_beat=2, allow_chords=False)
        self.assertEqual(prepared[0][1], 2)
        self.assertEqual(prepared[0][2], "C2")

    def test_format_body_does_not_emit_overfull_first_note(self):
        beat_times = [i * 0.5 for i in range(0, 9)]
        notes = [
            {"start": 0.0, "end": 2.0, "midi": 60},
            {"start": 0.5, "end": 1.0, "midi": 62},
            {"start": 1.0, "end": 1.5, "midi": 64},
            {"start": 1.5, "end": 2.0, "midi": 65},
        ]
        body = format_notes_to_abc_body(
            notes,
            beat_times,
            beats_per_bar=4,
            slots_per_beat=2,
            key="C",
            allow_chords=False,
        )
        first_bar = body.split("|")[0]
        self.assertNotIn("C8", first_bar)
        self.assertIn("D", first_bar)

    def test_cut_time_uses_four_quarter_pulses_per_bar(self):
        self.assertEqual(quarters_per_bar_from_meter("2/2"), 4.0)
        self.assertEqual(grid_beats_per_bar_from_meter("2/2"), 4)
        self.assertEqual(grid_beats_per_bar_from_meter("4/4"), 4)
        self.assertEqual(grid_beats_per_bar_from_meter("6/8"), 3)
        self.assertEqual(grid_beats_per_bar_from_meter("3/4"), 3)

        # One 2/2 bar of eighths at 120bpm (quarter=0.5s): 8 eighths over 2.0s.
        beat_times = [i * 0.5 for i in range(0, 9)]
        notes = []
        for i in range(8):
            start = i * 0.25
            notes.append({"start": start, "end": start + 0.25, "midi": 60})
        body = format_notes_to_abc_body(
            notes,
            beat_times,
            beats_per_bar=grid_beats_per_bar_from_meter("2/2"),
            slots_per_beat=2,
            key="C",
            allow_chords=False,
            bars_per_line=8,
        )
        first_bar = body.split("|")[0]
        # Full cut-time bar should not end after only ~4 eighths of content + rests padding to half.
        self.assertGreaterEqual(len(first_bar.replace(" ", "")), 8)

    def test_safe_autofix_ends_with_double_bar(self):
        abc = "X:1\nM:4/4\nK:C\n\n\nC2 D2 |"
        fixed = safe_autofix_abc(abc)
        self.assertNotRegex(fixed, r"K:C\n\n")
        self.assertTrue(fixed.rstrip().endswith("||"))


class MidiAbcOldtimeSpotCheck(unittest.TestCase):
    def test_melody_body_packs_eight_bars_and_polish_ends_double_bar(self):
        """End-to-end-ish: 16 quantized bars → 2 lines of 8, then || via safe_autofix."""
        beat_times = [i * 0.5 for i in range(0, 65)]
        notes = []
        for bar in range(16):
            start = bar * 2.0
            notes.append({"start": start, "end": start + 0.5, "midi": 60 + (bar % 5)})
        body = format_notes_to_abc_body(
            notes,
            beat_times,
            beats_per_bar=4,
            slots_per_beat=2,
            key="C",
            allow_chords=False,
            bars_per_line=8,
        )
        lines = [ln for ln in body.split("\n") if ln.strip()]
        self.assertEqual(len(lines), 2)
        self.assertGreaterEqual(lines[0].count("|"), 8)
        self.assertGreaterEqual(lines[1].count("|"), 8)

        abc = safe_autofix_abc("X:1\nM:4/4\nL:1/8\nK:C\n" + body)
        self.assertTrue(abc.rstrip().endswith("||"))

    def test_cuckoo_note_events_when_analyzer_available(self):
        try:
            import pretty_midi  # noqa: F401
        except Exception:
            self.skipTest("pretty_midi not installed")

        from midi_to_abc import convert_midi_to_abc_note_events

        path = os.path.join(OLDTIME_MEDIA, "cuckoosnest2.mid")
        if not os.path.isfile(path):
            path = os.path.join(FIXTURES, "monophonic_jig.mid")
        if not os.path.isfile(path):
            self.skipTest("No MIDI fixture available for spot-check")

        with open(path, "rb") as handle:
            midi_bytes = handle.read()
        result = convert_midi_to_abc_note_events(midi_bytes, os.path.basename(path), mode="melody")
        abc = result.get("abc") or ""
        if not abc.strip():
            self.skipTest("MIDI analyzer returned empty ABC")
        self.assertTrue(abc.rstrip().endswith("||"))
        music_lines = [
            line
            for line in abc.splitlines()
            if line.strip()
            and not line.strip().startswith("%")
            and not line.strip().startswith("[V:")
            and not (len(line) > 1 and line[1] == ":" and line[0].isalpha())
        ]
        self.assertTrue(music_lines)
        self.assertGreaterEqual(music_lines[0].count("|"), 2)


if __name__ == "__main__":
    unittest.main()
