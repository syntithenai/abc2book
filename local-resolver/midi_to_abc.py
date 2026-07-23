"""Strategy B: MIDI note events → ABC via beat grid quantisation."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

from midi_analysis import (
    MidiProfile,
    MidiTrackProfile,
    analyze_midi_bytes,
    apply_profile_overrides,
    clef_hint_for_track,
    estimate_key_from_notes,
    track_ids_for_import,
)
from midi_cleanup import apply_midi_cleanup, cleanup_is_active
from midi_drum_map import build_drummap_lines, drum_note_to_abc_token
from midi_note_events import midi_bytes_to_note_events

MAX_MIDI_IMPORT_VOICES = 8


@dataclass
class MidiAbcBuildOptions:
    mode: str | None = None
    track_ids: list[int] | None = None
    drum_track_ids: list[int] = field(default_factory=list)
    include_drums: bool = False
    quant_slots_per_beat: int = 2
    note_length: str = "1/8"
    cleanup_options: dict[str, Any] | None = None
    max_voices: int = MAX_MIDI_IMPORT_VOICES
    tempo_bpm: float | None = None
    time_signature: str | None = None
    estimated_key: str | None = None


def _note_events_for_track(
    midi_bytes: bytes,
    track_index: int,
    *,
    collapse_chords: bool,
    tempo_bpm: float = 120.0,
    is_drum: bool = False,
    cleanup_options: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if is_drum:
        notes = _drum_note_events_for_track(midi_bytes, track_index, tempo_bpm=tempo_bpm)
    else:
        notes = _pitched_note_events_for_track(
            midi_bytes,
            track_index,
            collapse_chords=collapse_chords,
            tempo_bpm=tempo_bpm,
        )
    if cleanup_is_active(cleanup_options):
        notes, _stats = apply_midi_cleanup(notes, cleanup_options, tempo_bpm=tempo_bpm)
    return notes


def _drum_note_events_for_track(
    midi_bytes: bytes,
    track_index: int,
    *,
    tempo_bpm: float = 120.0,
) -> list[dict[str, Any]]:
    try:
        import pretty_midi
    except Exception:
        return []

    try:
        pm = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    except Exception:
        return []

    if track_index < 0 or track_index >= len(pm.instruments):
        return []
    instrument = pm.instruments[track_index]
    if not getattr(instrument, "is_drum", False):
        return []

    notes: list[dict[str, Any]] = []
    for note in instrument.notes:
        notes.append({
            "start": float(note.start),
            "end": float(note.end),
            "midi": int(note.pitch),
            "velocity": int(getattr(note, "velocity", 80) or 80),
            "confidence": min(1.0, max(0.05, float(getattr(note, "velocity", 80) or 80) / 127.0)),
        })
    notes.sort(key=lambda row: (row["start"], row["midi"]))
    return notes


def _pitched_note_events_for_track(
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
            "velocity": int(getattr(note, "velocity", 80) or 80),
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
    is_drum: bool = False,
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
        dur = _duration_suffix(dur_slots, slots_per_beat * 2)
        if is_drum:
            pitch = drum_note_to_abc_token(int(note["midi"]), dur)
        else:
            pitch = _abc_pitch(int(note["midi"]), key) + dur
        events.append((global_slot, pitch))

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


def _track_by_index(profile: MidiProfile, track_id: int) -> MidiTrackProfile | None:
    for track in profile.tracks:
        if track.index == track_id:
            return track
    return None


def _voice_meta_line(voice_id: int, track: MidiTrackProfile | None, name: str) -> str:
    clef = clef_hint_for_track(track) if track else "treble"
    display_name = name or (track.name if track and track.name else f"Voice {voice_id}")
    safe_name = display_name.replace('"', "")
    return f'V:{voice_id} nm="{safe_name}" clef={clef}'


def _voice_program_prefix(track: MidiTrackProfile | None) -> list[str]:
    if not track or track.is_drum:
        return []
    program = int(track.program or 0)
    return [f"%%MIDI program {program}"]


def build_abc_from_profile(
    midi_bytes: bytes,
    profile: MidiProfile,
    *,
    title: str = "",
    options: MidiAbcBuildOptions | None = None,
) -> dict[str, Any]:
    opts = options or MidiAbcBuildOptions()
    apply_profile_overrides(
        profile,
        tempo_bpm=opts.tempo_bpm,
        time_signature=opts.time_signature,
        estimated_key=opts.estimated_key,
        explicit_track_ids=opts.track_ids,
    )

    import_mode = opts.mode or profile.recommended_mode
    track_ids = track_ids_for_import(
        profile,
        import_mode,
        explicit_track_ids=opts.track_ids,
        max_voices=opts.max_voices,
    )

    drum_ids: list[int] = []
    if opts.include_drums and opts.drum_track_ids:
        drum_ids = [int(track_id) for track_id in opts.drum_track_ids]
    elif opts.include_drums:
        drum_ids = [t.index for t in profile.tracks if t.is_drum]

    tempo = float(opts.tempo_bpm or profile.tempo_bpm or 120.0)
    beat_times = build_beat_times(
        profile.duration_seconds or 8.0,
        tempo,
        profile.beats_per_bar or 4,
    )
    key = opts.estimated_key or profile.estimated_key or "C"
    meter = opts.time_signature or profile.time_signature or "4/4"
    note_length = opts.note_length or "1/8"
    slots_per_beat = max(1, min(12, int(opts.quant_slots_per_beat or 2)))

    voices: list[dict[str, Any]] = []
    multi = import_mode == "multi_voice" and (len(track_ids) > 1 or drum_ids)

    if multi:
        voice_specs: list[tuple[int, int, bool]] = []
        for track_id in track_ids[: opts.max_voices]:
            track = _track_by_index(profile, track_id)
            if track and not track.is_drum:
                voice_specs.append((track_id, len(voice_specs) + 1, False))
        for track_id in drum_ids:
            if len(voice_specs) >= opts.max_voices:
                break
            track = _track_by_index(profile, track_id)
            if track and track.is_drum:
                voice_specs.append((track_id, len(voice_specs) + 1, True))

        for track_id, vid, is_drum in voice_specs:
            track = _track_by_index(profile, track_id)
            collapse = (vid > 1) and not is_drum and import_mode == "multi_voice"
            notes = _note_events_for_track(
                midi_bytes,
                track_id,
                collapse_chords=collapse,
                tempo_bpm=tempo,
                is_drum=is_drum,
                cleanup_options=opts.cleanup_options,
            )
            if not notes:
                continue
            track_name = track.name if track and track.name else (f"Drums {vid}" if is_drum else f"Voice {vid}")
            body = format_notes_to_abc_body(
                notes,
                beat_times,
                beats_per_bar=profile.beats_per_bar or 4,
                slots_per_beat=slots_per_beat,
                key=key,
                is_drum=is_drum,
            )
            if not body:
                continue
            prefix = []
            if is_drum:
                used_pitches = {int(note["midi"]) for note in notes}
                prefix.extend(build_drummap_lines(used_pitches))
            else:
                prefix.extend(_voice_program_prefix(track))
            voices.append({
                "id": vid,
                "name": track_name,
                "body": "\n".join(prefix + [body]) if prefix else body,
                "trackId": track_id,
                "isDrum": is_drum,
            })
    else:
        primary_id = track_ids[0] if track_ids else None
        track = _track_by_index(profile, primary_id) if primary_id is not None else None
        is_drum = bool(track and track.is_drum)
        if primary_id is not None:
            notes = _note_events_for_track(
                midi_bytes,
                primary_id,
                collapse_chords=not is_drum,
                tempo_bpm=tempo,
                is_drum=is_drum,
                cleanup_options=opts.cleanup_options,
            )
        else:
            notes = midi_bytes_to_note_events(
                midi_bytes,
                prefer_highest_in_chords=True,
                tempo_bpm=tempo,
            )
            if cleanup_is_active(opts.cleanup_options):
                notes, _stats = apply_midi_cleanup(notes, opts.cleanup_options, tempo_bpm=tempo)
        if notes:
            body = format_notes_to_abc_body(
                notes,
                beat_times,
                beats_per_bar=profile.beats_per_bar or 4,
                slots_per_beat=slots_per_beat,
                key=estimate_key_from_notes(notes) if notes and not is_drum else key,
                is_drum=is_drum,
            )
            if body:
                prefix = []
                if is_drum:
                    prefix.extend(build_drummap_lines({int(note["midi"]) for note in notes}))
                else:
                    prefix.extend(_voice_program_prefix(track))
                voices.append({
                    "id": 1,
                    "name": track.name if track and track.name else "",
                    "body": "\n".join(prefix + [body]) if prefix else body,
                    "trackId": primary_id,
                    "isDrum": is_drum,
                })
                if not is_drum:
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
        "Q:1/4=" + str(int(round(tempo))),
        "K:" + key,
    ]
    if len(voices) == 1:
        lines.append(voices[0]["body"])
    else:
        for voice in voices:
            track = _track_by_index(profile, voice.get("trackId", -1))
            lines.append(_voice_meta_line(voice["id"], track, voice["name"]))
        lines.append("[V:1]")
        lines.append(voices[0]["body"])
        for voice in voices[1:]:
            lines.append("[V:" + str(voice["id"]) + "]")
            lines.append(voice["body"])

    abc = "\n".join(lines).strip()
    warnings = ["Note durations were quantized to fit the beat grid"]
    if cleanup_is_active(opts.cleanup_options):
        warnings.append("MIDI cleanup filters were applied before quantization")
    return {
        "abc": abc,
        "mode": import_mode,
        "strategy": "note_events",
        "warnings": warnings,
        "diagnostics": {
            "tracks_analyzed": len(profile.tracks),
            "tracks_imported": len(voices),
            "tempo_bpm": int(round(tempo)),
            "meter": meter,
            "key": key,
            "slots_per_beat": slots_per_beat,
        },
        "beatTimes": beat_times,
        "notes": voices,
    }


def convert_midi_to_abc_note_events(
    midi_bytes: bytes,
    filename: str = "",
    mode: str | None = None,
    *,
    options: MidiAbcBuildOptions | None = None,
) -> dict[str, Any]:
    profile = analyze_midi_bytes(midi_bytes, filename)
    if profile.recommended_mode == "reject" and not (options and options.track_ids):
        return {
            "abc": "",
            "strategy": "note_events",
            "mode": "reject",
            "confidence": 0.0,
            "warnings": [profile.reject_reason or "MIDI is not suitable for notation import"],
            "diagnostics": profile.to_dict(),
        }
    build_opts = options or MidiAbcBuildOptions()
    if mode in ("melody", "multi_voice"):
        build_opts.mode = mode
    result = build_abc_from_profile(
        midi_bytes,
        profile,
        title=profile.title,
        options=build_opts,
    )
    result["profile"] = profile.to_dict()
    return result
