"""Strategy B: MIDI note events → ABC via beat grid quantisation."""

from __future__ import annotations

import io
import math
import re
from typing import Any

from midi_analysis import MidiProfile, estimate_key_from_notes
from midi_note_events import midi_bytes_to_note_events


def _note_events_for_track(
    midi_bytes: bytes,
    track_index: int,
    *,
    collapse_chords: bool,
    tempo_bpm: float = 120.0,
) -> list[dict[str, Any]]:
    try:
        import pretty_midi
    except Exception:
        return midi_bytes_to_note_events(
            midi_bytes,
            prefer_highest_in_chords=collapse_chords,
            track_index=track_index,
            tempo_bpm=tempo_bpm,
        )

    try:
        pm = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    except Exception:
        return midi_bytes_to_note_events(
            midi_bytes,
            prefer_highest_in_chords=collapse_chords,
            track_index=track_index,
            tempo_bpm=tempo_bpm,
        )

    if track_index < 0 or track_index >= len(pm.instruments):
        return midi_bytes_to_note_events(
            midi_bytes,
            prefer_highest_in_chords=collapse_chords,
            track_index=track_index,
            tempo_bpm=tempo_bpm,
        )
    instrument = pm.instruments[track_index]
    if getattr(instrument, "is_drum", False):
        return []

    notes: list[dict[str, Any]] = []
    for note in instrument.notes:
        notes.append({
            "start": float(note.start),
            "end": float(note.end),
            "midi": int(note.pitch),
            "name": _midi_name(int(note.pitch)),
            "confidence": min(1.0, max(0.05, float(getattr(note, "velocity", 80) or 80) / 127.0)),
        })
    notes.sort(key=lambda row: (row["start"], -row["midi"]))
    if collapse_chords:
        notes = _collapse_simultaneous_to_highest(notes)
    return notes


def _midi_name(midi: int) -> str:
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return names[midi % 12] + str((midi // 12) - 1)


def _collapse_simultaneous_to_highest(notes: list[dict[str, Any]], tol: float = 0.03) -> list[dict[str, Any]]:
    if not notes:
        return []
    collapsed: list[dict[str, Any]] = []
    for note in notes:
        if collapsed and abs(note["start"] - collapsed[-1]["start"]) <= tol:
            if note["midi"] > collapsed[-1]["midi"]:
                collapsed[-1] = note
            continue
        collapsed.append(dict(note))
    return collapsed


def build_beat_times(duration: float, tempo_bpm: float, beats_per_bar: int = 4) -> list[float]:
    beat_duration = 60.0 / max(tempo_bpm, 1.0)
    times = [0.0]
    t = beat_duration
    while t < duration + beat_duration:
        times.append(round(t, 4))
        t += beat_duration
    return times


def _abc_pitch(midi: int, key: str) -> str:
    names_sharp = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"]
    names_flat = ["C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B"]
    prefer_flats = "b" in key.lower() or key in ("F", "Bb", "Eb", "Ab", "Db", "Gb")
    names = names_flat if prefer_flats else names_sharp
    octave = (midi // 12) - 1
    letter = names[midi % 12]
    if octave >= 5:
        return letter.lower() + ("'" * (octave - 5) if octave > 5 else "")
    if octave == 4:
        return letter
    # octave 3 and below
    commas = 4 - octave
    return letter + ("," * commas if commas > 0 else "")


def _duration_suffix(slots: int, slots_per_beat: int) -> str:
    if slots <= 0:
        return ""
    if slots == 1:
        return ""
    if slots == slots_per_beat:
        return str(slots_per_beat)
    return str(slots)


def format_notes_to_abc_body(
    notes: list[dict[str, Any]],
    beat_times: list[float],
    *,
    beats_per_bar: int = 4,
    slots_per_beat: int = 2,
    key: str = "C",
) -> str:
    if not notes or not beat_times:
        return ""

    beat_duration = (beat_times[1] - beat_times[0]) if len(beat_times) > 1 else 0.5
    slot_duration = beat_duration / max(slots_per_beat, 1)
    bar_slots = beats_per_bar * slots_per_beat

    events: list[tuple[float, str]] = []
    for note in notes:
        start = float(note["start"])
        end = float(note["end"])
        duration = max(end - start, slot_duration * 0.5)
        beat_index = 0
        for i, bt in enumerate(beat_times):
            if bt <= start + 0.001:
                beat_index = i
        beat_start = beat_times[beat_index]
        offset_in_beat = start - beat_start
        slot_in_beat = max(0, min(slots_per_beat - 1, round(offset_in_beat / slot_duration)))
        global_slot = beat_index * slots_per_beat + slot_in_beat
        dur_slots = max(1, round(duration / slot_duration))
        pitch = _abc_pitch(int(note["midi"]), key)
        dur = _duration_suffix(dur_slots, slots_per_beat * 2)
        events.append((global_slot, pitch + dur))

    events.sort(key=lambda item: item[0])
    if not events:
        return ""

    parts: list[str] = []
    cursor = 0
    for slot, token in events:
        if slot > cursor:
            gap = slot - cursor
            if gap >= bar_slots:
                parts.append(" |")
                cursor = (slot // bar_slots) * bar_slots
                gap = slot - cursor
            if gap > 0:
                parts.append("z" + _duration_suffix(gap, slots_per_beat * 2) if gap > 1 else "z")
                cursor = slot
        parts.append(token)
        cursor = slot + max(1, 1)

    body = " ".join(parts)
    body = re.sub(r"\s+\|", " |", body)
    return body.strip()


def build_abc_from_profile(
    midi_bytes: bytes,
    profile: MidiProfile,
    *,
    title: str = "",
    mode: str | None = None,
) -> dict[str, Any]:
    import_mode = mode or profile.recommended_mode
    track_ids = list(profile.recommended_track_ids or [])
    if not track_ids:
        notes = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=True)
        track_ids = []

    beat_times = build_beat_times(
        profile.duration_seconds or 8.0,
        profile.tempo_bpm or 120.0,
        profile.beats_per_bar or 4,
    )
    key = profile.estimated_key or "C"
    meter = profile.time_signature or "4/4"
    note_length = "1/8"
    slots_per_beat = 2
    tempo = int(round(profile.tempo_bpm or 120))

    voices: list[dict[str, Any]] = []
    if import_mode == "multi_voice" and len(track_ids) > 1:
        for vid, track_id in enumerate(track_ids[:4], start=1):
            notes = _note_events_for_track(
                midi_bytes,
                track_id,
                collapse_chords=(vid > 1),
                tempo_bpm=profile.tempo_bpm or 120.0,
            )
            if not notes:
                continue
            track_name = ""
            for track in profile.tracks:
                if track.index == track_id:
                    track_name = track.name or f"Voice {vid}"
                    break
            body = format_notes_to_abc_body(
                notes,
                beat_times,
                beats_per_bar=profile.beats_per_bar or 4,
                slots_per_beat=slots_per_beat,
                key=key,
            )
            if body:
                voices.append({"id": vid, "name": track_name, "body": body})
    else:
        if track_ids:
            notes = _note_events_for_track(
                midi_bytes,
                track_ids[0],
                collapse_chords=True,
                tempo_bpm=profile.tempo_bpm or 120.0,
            )
            if not notes:
                notes = midi_bytes_to_note_events(
                    midi_bytes,
                    prefer_highest_in_chords=True,
                    tempo_bpm=profile.tempo_bpm or 120.0,
                )
        else:
            notes = midi_bytes_to_note_events(
                midi_bytes,
                prefer_highest_in_chords=True,
                tempo_bpm=profile.tempo_bpm or 120.0,
            )
        body = format_notes_to_abc_body(
            notes,
            beat_times,
            beats_per_bar=profile.beats_per_bar or 4,
            slots_per_beat=slots_per_beat,
            key=estimate_key_from_notes(notes) if notes else key,
        )
        if body:
            voices.append({"id": 1, "name": "", "body": body})
        if notes:
            key = estimate_key_from_notes(notes)

    if not voices:
        return {
            "abc": "",
            "mode": import_mode,
            "strategy": "note_events",
            "warnings": ["No melody could be extracted from MIDI"],
            "diagnostics": {"tracks_imported": 0},
        }

    lines = [
        "X:1",
        "T:" + (title or profile.title or "Imported MIDI"),
        "M:" + meter,
        "L:" + note_length,
        "Q:1/4=" + str(tempo),
        "K:" + key,
    ]
    if len(voices) == 1:
        lines.append(voices[0]["body"])
    else:
        for voice in voices:
            meta = voice["name"] or ("Voice " + str(voice["id"]))
            lines.append("V:" + str(voice["id"]) + " nm=\"" + meta + "\"")
        lines.append("[V:1]")
        lines.append(voices[0]["body"])
        for voice in voices[1:]:
            lines.append("[V:" + str(voice["id"]) + "]")
            lines.append(voice["body"])

    abc = "\n".join(lines).strip()
    return {
        "abc": abc,
        "mode": import_mode,
        "strategy": "note_events",
        "warnings": ["Note durations were quantized to fit the beat grid"],
        "diagnostics": {
            "tracks_analyzed": len(profile.tracks),
            "tracks_imported": len(voices),
            "tempo_bpm": tempo,
            "meter": meter,
            "key": key,
        },
        "beatTimes": beat_times,
        "notes": voices,
    }


def convert_midi_to_abc_note_events(midi_bytes: bytes, filename: str = "", mode: str | None = None) -> dict[str, Any]:
    from midi_analysis import analyze_midi_bytes

    profile = analyze_midi_bytes(midi_bytes, filename)
    if profile.recommended_mode == "reject":
        return {
            "abc": "",
            "strategy": "note_events",
            "mode": "reject",
            "confidence": 0.0,
            "warnings": [profile.reject_reason or "MIDI is not suitable for notation import"],
            "diagnostics": profile.to_dict(),
        }
    forced_mode = mode if mode in ("melody", "multi_voice") else None
    result = build_abc_from_profile(
        midi_bytes,
        profile,
        title=profile.title,
        mode=forced_mode,
    )
    result["profile"] = profile.to_dict()
    return result
