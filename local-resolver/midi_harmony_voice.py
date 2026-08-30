"""Build a harmony ABC voice with block chords from MIDI tracks."""

from __future__ import annotations

import re
from typing import Any

from midi_analysis import MidiProfile, harmony_track_ids_for_profile
from midi_to_abc import (
    _abc_pitch,
    _duration_suffix,
    _note_events_for_track,
    build_beat_times,
    grid_beats_per_bar_from_meter,
)

SIMULTANEOUS_TOL = 0.03


def _group_simultaneous_notes(notes: list[dict[str, Any]], tol: float = SIMULTANEOUS_TOL) -> list[dict[str, Any]]:
    if not notes:
        return []
    ordered = sorted(notes, key=lambda row: (row["start"], row["midi"]))
    groups: list[dict[str, Any]] = []
    for note in ordered:
        if groups and abs(float(note["start"]) - float(groups[-1]["start"])) <= tol:
            groups[-1]["midi_notes"].append(int(note["midi"]))
            groups[-1]["end"] = max(float(groups[-1]["end"]), float(note.get("end", note["start"]) or note["start"]))
            continue
        groups.append({
            "start": float(note["start"]),
            "end": float(note.get("end", note["start"]) or note["start"]),
            "midi_notes": [int(note["midi"])],
        })
    return groups


def format_chord_groups_to_abc_body(
    groups: list[dict[str, Any]],
    beat_times: list[float],
    *,
    beats_per_bar: int = 4,
    slots_per_beat: int = 2,
    key: str = "C",
) -> str:
    if not groups or not beat_times:
        return ""

    beat_duration = (beat_times[1] - beat_times[0]) if len(beat_times) > 1 else 0.5
    slot_duration = beat_duration / max(slots_per_beat, 1)
    bar_slots = beats_per_bar * slots_per_beat
    events: list[tuple[int, str]] = []

    for group in groups:
        midi_notes = sorted(set(int(m) for m in group.get("midi_notes", []) if int(m) > 0))
        if len(midi_notes) < 2:
            continue
        start = float(group["start"])
        end = float(group["end"])
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
        pitches = [_abc_pitch(midi, key) for midi in midi_notes]
        token = "[" + "".join(pitches) + "]" + _duration_suffix(dur_slots, slots_per_beat * 2)
        events.append((global_slot, token))

    if not events:
        return ""

    events.sort(key=lambda item: item[0])
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


def build_harmony_voice_abc(
    midi_bytes: bytes,
    profile: MidiProfile,
    *,
    track_ids: list[int] | None = None,
) -> dict[str, Any]:
    track_ids = list(track_ids or harmony_track_ids_for_profile(profile))
    if not track_ids:
        return {"body": "", "voiceName": "", "trackIds": []}

    meter = profile.time_signature or "4/4"
    grid_beats = grid_beats_per_bar_from_meter(meter)
    beat_times = build_beat_times(
        profile.duration_seconds or 8.0,
        profile.tempo_bpm or 120.0,
        grid_beats,
    )
    key = profile.estimated_key or "C"
    all_groups: list[dict[str, Any]] = []
    voice_name = "Chords"

    for track_id in track_ids[:2]:
        track_name = ""
        for track in profile.tracks:
            if track.index == track_id:
                track_name = track.name or voice_name
                break
        if track_name:
            voice_name = track_name
        notes = _note_events_for_track(
            midi_bytes,
            track_id,
            collapse_chords=False,
            tempo_bpm=profile.tempo_bpm or 120.0,
        )
        all_groups.extend(_group_simultaneous_notes(notes))

    all_groups.sort(key=lambda row: (row["start"], min(row.get("midi_notes", [0]))))
    body = format_chord_groups_to_abc_body(
        all_groups,
        beat_times,
        beats_per_bar=grid_beats,
        slots_per_beat=2,
        key=key,
    )
    if not body:
        return {"body": "", "voiceName": voice_name, "trackIds": track_ids}

    return {
        "body": body,
        "voiceName": voice_name,
        "trackIds": track_ids,
        "voiceId": 2,
    }
