"""Convert MIDI bytes into melody note-event dicts (basic-pitch compatible)."""

from __future__ import annotations

import io
from typing import Any


def midi_bytes_to_note_events(
    midi_bytes: bytes,
    *,
    prefer_highest_in_chords: bool = True,
    drop_drums: bool = True,
    program_filter: int | None = None,
) -> list[dict[str, Any]]:
    """Return note events: {start, end, midi, name, confidence, velocity?}."""
    if not midi_bytes:
        return []
    try:
        import pretty_midi
    except Exception:
        return _midi_bytes_via_mido(midi_bytes, prefer_highest_in_chords=prefer_highest_in_chords)

    try:
        pm = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    except Exception:
        return _midi_bytes_via_mido(midi_bytes, prefer_highest_in_chords=prefer_highest_in_chords)

    notes: list[dict[str, Any]] = []
    for instrument in pm.instruments:
        if drop_drums and getattr(instrument, "is_drum", False):
            continue
        if program_filter is not None and int(getattr(instrument, "program", -1)) != int(program_filter):
            continue
        for note in instrument.notes:
            velocity = float(getattr(note, "velocity", 80) or 80)
            notes.append({
                "start": float(note.start),
                "end": float(note.end),
                "midi": int(note.pitch),
                "name": _midi_name(int(note.pitch)),
                "confidence": min(1.0, max(0.05, velocity / 127.0)),
                "velocity": int(velocity),
            })

    if not notes:
        return []

    if prefer_highest_in_chords:
        notes = _collapse_simultaneous_to_highest(notes)
    notes.sort(key=lambda row: (row["start"], -row["midi"]))
    return notes


def _midi_name(midi: int) -> str:
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return names[midi % 12] + str((midi // 12) - 1)


def _collapse_simultaneous_to_highest(notes: list[dict[str, Any]], tol: float = 0.03) -> list[dict[str, Any]]:
    if not notes:
        return []
    ordered = sorted(notes, key=lambda row: (row["start"], -row["midi"]))
    collapsed: list[dict[str, Any]] = []
    for note in ordered:
        if collapsed and abs(note["start"] - collapsed[-1]["start"]) <= tol:
            # Keep the highest pitch for melody-oriented ABC.
            if note["midi"] > collapsed[-1]["midi"]:
                collapsed[-1] = note
            continue
        collapsed.append(dict(note))
    return collapsed


def _midi_bytes_via_mido(midi_bytes: bytes, prefer_highest_in_chords: bool = True) -> list[dict[str, Any]]:
    try:
        import mido
    except Exception:
        return []
    try:
        mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    except Exception:
        return []

    tempo = 500000
    ticks_per_beat = mid.ticks_per_beat or 480
    abs_ticks = 0
    active: dict[int, tuple[float, int]] = {}
    notes: list[dict[str, Any]] = []

    def ticks_to_seconds(ticks: int) -> float:
        return mido.tick2second(ticks, ticks_per_beat, tempo)

    for msg in mid:
        abs_ticks += msg.time
        if msg.type == "set_tempo":
            tempo = msg.tempo
            continue
        if msg.type == "note_on" and msg.velocity > 0:
            active[msg.note] = (ticks_to_seconds(abs_ticks), msg.velocity)
        elif msg.type in ("note_off", "note_on"):
            started = active.pop(msg.note, None)
            if not started:
                continue
            start, velocity = started
            end = ticks_to_seconds(abs_ticks)
            if end <= start:
                end = start + 0.05
            notes.append({
                "start": float(start),
                "end": float(end),
                "midi": int(msg.note),
                "name": _midi_name(int(msg.note)),
                "confidence": min(1.0, max(0.05, float(velocity) / 127.0)),
                "velocity": int(velocity),
            })

    if prefer_highest_in_chords:
        notes = _collapse_simultaneous_to_highest(notes)
    notes.sort(key=lambda row: (row["start"], -row["midi"]))
    return notes
