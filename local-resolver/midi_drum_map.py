"""GM drum pitch → ABC percussion notation mapping."""

from __future__ import annotations

from typing import Any

# Common General MIDI drum map: midi pitch -> (abc_note, notehead, label)
GM_DRUM_MAP: dict[int, tuple[str, str, str]] = {
    35: ("C,", "normal", "Acoustic Bass Drum"),
    36: ("C,", "normal", "Bass Drum 1"),
    37: ("^C,", "normal", "Side Stick"),
    38: ("D", "normal", "Acoustic Snare"),
    39: ("^D", "normal", "Hand Clap"),
    40: ("E", "normal", "Electric Snare"),
    41: ("F,", "normal", "Low Floor Tom"),
    42: ("^F", "x", "Closed Hi-Hat"),
    43: ("G,", "normal", "High Floor Tom"),
    44: ("^G", "x", "Pedal Hi-Hat"),
    45: ("A,", "normal", "Low Tom"),
    46: ("^A", "x", "Open Hi-Hat"),
    47: ("B,", "normal", "Low-Mid Tom"),
    48: ("c", "normal", "Hi-Mid Tom"),
    49: ("^c", "x", "Crash Cymbal 1"),
    50: ("d", "normal", "High Tom"),
    51: ("^d", "x", "Ride Cymbal 1"),
    52: ("e", "x", "Chinese Cymbal"),
    53: ("f", "normal", "Ride Bell"),
    54: ("^f", "x", "Tambourine"),
    55: ("g", "x", "Splash Cymbal"),
    56: ("^g", "normal", "Cowbell"),
    57: ("a", "x", "Crash Cymbal 2"),
    58: ("^a", "x", "Vibraslap"),
    59: ("b", "x", "Ride Cymbal 2"),
    60: ("c'", "normal", "Hi Bongo"),
    61: ("^c'", "normal", "Low Bongo"),
    62: ("d'", "normal", "Mute Hi Conga"),
    63: ("^d'", "normal", "Open Hi Conga"),
    64: ("e'", "normal", "Low Conga"),
    65: ("f'", "normal", "High Timbale"),
    66: ("^f'", "normal", "Low Timbale"),
    67: ("g'", "normal", "High Agogo"),
    68: ("^g'", "normal", "Low Agogo"),
    69: ("a'", "normal", "Cabasa"),
    70: ("^a'", "normal", "Maracas"),
    71: ("b'", "normal", "Short Whistle"),
    72: ("c''", "normal", "Long Whistle"),
    73: ("^c''", "normal", "Short Guiro"),
    74: ("d''", "normal", "Long Guiro"),
    75: ("^d''", "normal", "Claves"),
    76: ("e''", "normal", "Hi Wood Block"),
    77: ("^e''", "normal", "Low Wood Block"),
    78: ("f''", "normal", "Mute Cuica"),
    79: ("^f''", "normal", "Open Cuica"),
    80: ("g''", "normal", "Mute Triangle"),
    81: ("^g''", "normal", "Open Triangle"),
}


def gm_drum_entry(midi_pitch: int) -> tuple[str, str, str]:
    entry = GM_DRUM_MAP.get(int(midi_pitch))
    if entry:
        return entry
    # Fallback: map unknown pitches to a generic unpitched note
    octave = max(0, (int(midi_pitch) // 12) - 1)
    letter = "c" if octave >= 5 else "C"
    suffix = "'" * max(0, octave - 5) if octave >= 5 else "," * max(0, 4 - octave)
    return (letter + suffix, "normal", f"Drum {midi_pitch}")


def build_drummap_lines(used_pitches: set[int]) -> list[str]:
    lines: list[str] = []
    for pitch in sorted(used_pitches):
        abc_note, _nh, _label = gm_drum_entry(pitch)
        lines.append(f"%%MIDI drummap {abc_note} {pitch}")
    return lines


def drum_note_to_abc_token(midi_pitch: int, duration_suffix: str = "") -> str:
    abc_note, notehead, _label = gm_drum_entry(midi_pitch)
    token = abc_note + duration_suffix
    if notehead == "x":
        return "!" + token + "!"
    return token


def drum_track_profile_label(midi_pitch: int) -> str:
    _abc, _nh, label = gm_drum_entry(midi_pitch)
    return label
