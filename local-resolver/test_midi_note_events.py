"""Tests for MIDI → melody note events adapter."""

from midi_note_events import midi_bytes_to_note_events, _collapse_simultaneous_to_highest


def _minimal_midi_bytes():
    # Type-0 MIDI: note C4 on then off via mido if available; otherwise empty.
    try:
        import io
        import mido

        mid = mido.MidiFile()
        track = mido.MidiTrack()
        mid.tracks.append(track)
        track.append(mido.Message("note_on", note=60, velocity=80, time=0))
        track.append(mido.Message("note_off", note=60, velocity=0, time=480))
        track.append(mido.Message("note_on", note=64, velocity=70, time=0))
        track.append(mido.Message("note_on", note=67, velocity=70, time=0))
        track.append(mido.Message("note_off", note=64, velocity=0, time=480))
        track.append(mido.Message("note_off", note=67, velocity=0, time=0))
        buf = io.BytesIO()
        mid.save(file=buf)
        return buf.getvalue()
    except Exception:
        return b""


def test_midi_bytes_to_note_events_basic():
    midi_bytes = _minimal_midi_bytes()
    if not midi_bytes:
        return
    notes = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=True)
    assert notes
    assert all("start" in row and "end" in row and "midi" in row for row in notes)
    assert notes[0]["midi"] == 60


def test_collapse_simultaneous_keeps_highest():
    notes = [
        {"start": 1.0, "end": 2.0, "midi": 60, "name": "C4", "confidence": 0.5},
        {"start": 1.01, "end": 2.0, "midi": 67, "name": "G4", "confidence": 0.5},
    ]
    collapsed = _collapse_simultaneous_to_highest(notes, tol=0.05)
    assert len(collapsed) == 1
    assert collapsed[0]["midi"] == 67


def test_full_voicing_keeps_two_near_simultaneous_pitches():
    midi_bytes = _minimal_midi_bytes()
    if not midi_bytes:
        return
    collapsed = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=True)
    full = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=False)
    assert len(full) > len(collapsed)
    assert {64, 67}.issubset({row["midi"] for row in full})
