"""Infer lead-sheet chord symbols from MIDI note content."""

from __future__ import annotations

from typing import Any

from chord_processing import (
    _format_chord_label,
    _index_to_root,
    _parse_key_signature,
    constrain_chord_label,
    post_process_chords,
)
from midi_analysis import MidiProfile
from midi_note_events import midi_bytes_to_note_events
from midi_to_abc import build_beat_times, _note_events_for_track

CHORD_TEMPLATES: dict[str, set[int]] = {
    "maj": {0, 4, 7},
    "min": {0, 3, 7},
    "7": {0, 4, 7, 10},
    "maj7": {0, 4, 7, 11},
    "min7": {0, 3, 7, 10},
}

SIMULTANEOUS_TOL = 0.03


def should_infer_chords_for_import(
    profile: MidiProfile,
    include_chords: bool | None,
    track_ids: list[int] | None,
    import_mode: str,
) -> bool:
    """Skip automatic chord inference on large multi-voice imports unless opted in."""
    if include_chords is False:
        return False
    if import_mode == "multi_voice" and track_ids and len(track_ids) > 2:
        return include_chords is True
    return should_infer_chords(profile, include_chords)


def should_infer_chords(profile: MidiProfile, include_chords: bool | None = None) -> bool:
    if include_chords is False:
        return False
    if profile.recommended_mode == "reject":
        return False
    if include_chords is True:
        return True
    pitched = [t for t in profile.tracks if not t.is_drum and t.note_count > 0]
    if len(pitched) == 1 and getattr(profile, "routing_hint", "") == "melody":
        return False
    if len(pitched) == 1 and pitched[0].monophony_score >= 0.85:
        return False
    if getattr(profile, "routing_hint", "") == "ambiguous":
        return True
    if harmony_track_ids(profile):
        return True
    melody_ids = list(profile.recommended_track_ids or [])
    if melody_ids:
        track = next((t for t in profile.tracks if t.index == melody_ids[0]), None)
        if track and track.monophony_score < 0.85 and track.chord_event_count > 0:
            return True
    return False


def harmony_track_ids(profile: MidiProfile) -> list[int]:
    from midi_analysis import harmony_track_ids_for_profile

    return harmony_track_ids_for_profile(profile)


def bass_track_id(profile: MidiProfile) -> int | None:
    bass_tracks = [t for t in profile.tracks if not t.is_drum and t.role_hint == "bass" and t.note_count > 0]
    if not bass_tracks:
        return None
    return sorted(bass_tracks, key=lambda t: t.note_count, reverse=True)[0].index


def _notes_at_time(notes: list[dict[str, Any]], time_point: float, tol: float = SIMULTANEOUS_TOL) -> list[dict[str, Any]]:
    active = []
    for note in notes:
        start = float(note["start"])
        end = float(note.get("end", start) or start)
        if start - tol <= time_point < end + tol:
            active.append(note)
    if not active:
        return []
    groups: dict[float, list[dict[str, Any]]] = {}
    for note in active:
        bucket = round(float(note["start"]) / tol) * tol
        groups.setdefault(bucket, []).append(note)
    best_key = min(groups.keys(), key=lambda key: abs(key - time_point))
    return groups.get(best_key, [])


def _pitch_classes_from_notes(notes: list[dict[str, Any]], *, exclude_top: bool = False) -> tuple[set[int], int | None]:
    if not notes:
        return set(), None
    ordered = sorted(notes, key=lambda n: int(n["midi"]))
    bass_pc = ordered[0]["midi"] % 12
    pool = ordered[:-1] if exclude_top and len(ordered) > 1 else ordered
    pcs = {int(n["midi"]) % 12 for n in pool}
    return pcs, bass_pc


def _match_pitch_classes_to_label(pitch_classes: set[int], bass_pc: int | None = None) -> tuple[str, float]:
    if len(pitch_classes) < 2:
        return "", 0.0
    best_label = ""
    best_score = 0.0
    for root in range(12):
        normalized = {(pc - root) % 12 for pc in pitch_classes}
        for quality, template in CHORD_TEMPLATES.items():
            if not template.issubset(normalized):
                continue
            extra = len(normalized - template)
            score = len(template) / (len(template) + extra + 0.5)
            if score > best_score:
                best_score = score
                best_label = _format_chord_label(root, quality)
    if not best_label:
        return "", 0.0
    if bass_pc is not None:
        from chord_processing import _parse_chord_label

        parsed = _parse_chord_label(best_label)
        if parsed and bass_pc != parsed["root_index"]:
            bass_name = _index_to_root(bass_pc)
            display_root = _index_to_root(parsed["root_index"])
            quality = parsed["quality"]
            if quality == "maj":
                best_label = f"{display_root}/{bass_name}"
            else:
                best_label = f"{display_root}:{quality}/{bass_name}"
    return best_label, min(1.0, best_score)


def _collect_chord_source_notes(
    midi_bytes: bytes,
    profile: MidiProfile,
) -> tuple[list[dict[str, Any]], list[int], str]:
    tracks_used: list[int] = []
    tempo = profile.tempo_bpm or 120.0
    harmony_ids = harmony_track_ids(profile)
    notes: list[dict[str, Any]] = []
    source = "melody_polyphony"

    if harmony_ids:
        for track_id in harmony_ids:
            track_notes = _note_events_for_track(
                midi_bytes,
                track_id,
                collapse_chords=False,
                tempo_bpm=tempo,
            )
            if track_notes:
                notes.extend(track_notes)
                tracks_used.append(track_id)
        if notes:
            source = "harmony_track"

    if not notes:
        melody_ids = list(profile.recommended_track_ids or [])
        if not melody_ids:
            return [], [], source
        melody_track = melody_ids[0]
        raw = _note_events_for_track(
            midi_bytes,
            melody_track,
            collapse_chords=False,
            tempo_bpm=tempo,
        )
        if not raw:
            return [], [], source
        starts = sorted({round(float(n["start"]), 3) for n in raw})
        for start in starts:
            group = [n for n in raw if abs(float(n["start"]) - start) <= SIMULTANEOUS_TOL]
            if len(group) < 2:
                continue
            pcs, bass_pc = _pitch_classes_from_notes(group, exclude_top=True)
            if len(pcs) < 2:
                continue
            label, confidence = _match_pitch_classes_to_label(pcs, bass_pc)
            if not label:
                continue
            end = max(float(n.get("end", n["start"]) or n["start"]) for n in group)
            notes.append({
                "start": start,
                "end": end,
                "label": label,
                "confidence": confidence,
                "midi": max(int(n["midi"]) for n in group),
            })
        tracks_used = [melody_track]
        source = "melody_polyphony"
        return notes, tracks_used, source

    return notes, tracks_used, source


def _slot_labels_from_notes(
    notes: list[dict[str, Any]],
    beat_times: list[float],
    *,
    bass_notes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not beat_times:
        return []
    beat_duration = (beat_times[1] - beat_times[0]) if len(beat_times) > 1 else 60.0 / 120.0
    rows: list[dict[str, Any]] = []
    warnings: list[str] = []

    if notes and notes[0].get("label"):
        for item in notes:
            rows.append({
                "start": float(item["start"]),
                "end": float(item["end"]),
                "label": str(item.get("label") or ""),
                "confidence": float(item.get("confidence", 0.5) or 0.5),
            })
        return rows

    for index, beat_start in enumerate(beat_times):
        beat_end = beat_times[index + 1] if index + 1 < len(beat_times) else beat_start + beat_duration
        group = [
            note for note in notes
            if float(note["start"]) < beat_end - 1e-6
            and float(note.get("end", note["start"]) or note["start"]) > beat_start + 1e-6
        ]
        bass_group = [
            note for note in (bass_notes or [])
            if float(note["start"]) < beat_end - 1e-6
            and float(note.get("end", note["start"]) or note["start"]) > beat_start + 1e-6
        ]
        pcs, _ = _pitch_classes_from_notes(group, exclude_top=False)
        bass_pc = None
        if bass_group:
            bass_pc = min(int(n["midi"]) for n in bass_group) % 12
        elif group:
            bass_pc = min(int(n["midi"]) for n in group) % 12
        label, confidence = _match_pitch_classes_to_label(pcs, bass_pc)
        if not label:
            continue
        rows.append({
            "start": beat_start,
            "end": beat_end,
            "label": label,
            "confidence": confidence,
        })
    return rows


def infer_chords_from_midi(
    midi_bytes: bytes,
    profile: MidiProfile,
    *,
    include_chords: bool | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    if not should_infer_chords(profile, include_chords):
        return {
            "segments": [],
            "beatTimes": [],
            "tempo": profile.tempo_bpm or 120.0,
            "meter": profile.time_signature or "4/4",
            "detectedKey": profile.estimated_key or "C",
            "source": "none",
            "tracksUsed": [],
            "confidence": 0.0,
            "warnings": warnings,
        }

    beat_times = build_beat_times(
        profile.duration_seconds or 8.0,
        profile.tempo_bpm or 120.0,
        profile.beats_per_bar or 4,
    )
    source_notes, tracks_used, source = _collect_chord_source_notes(midi_bytes, profile)
    if not source_notes and not tracks_used:
        return {
            "segments": [],
            "beatTimes": beat_times,
            "tempo": profile.tempo_bpm or 120.0,
            "meter": profile.time_signature or "4/4",
            "detectedKey": profile.estimated_key or "C",
            "source": "none",
            "tracksUsed": [],
            "confidence": 0.0,
            "warnings": ["No chord content detected in MIDI"],
        }

    bass_id = bass_track_id(profile)
    bass_notes: list[dict[str, Any]] = []
    if bass_id is not None and bass_id not in tracks_used:
        bass_notes = _note_events_for_track(
            midi_bytes,
            bass_id,
            collapse_chords=False,
            tempo_bpm=profile.tempo_bpm or 120.0,
        )

    raw_rows = _slot_labels_from_notes(source_notes, beat_times, bass_notes=bass_notes)
    if not raw_rows:
        warnings.append("Could not infer chord symbols from MIDI note groups")
        return {
            "segments": [],
            "beatTimes": beat_times,
            "tempo": profile.tempo_bpm or 120.0,
            "meter": profile.time_signature or "4/4",
            "detectedKey": profile.estimated_key or "C",
            "source": source,
            "tracksUsed": tracks_used,
            "confidence": 0.0,
            "warnings": warnings,
        }

    low_conf = [row for row in raw_rows if float(row.get("confidence", 0) or 0) < 0.45]
    if low_conf:
        warnings.append("Some bars had ambiguous voicings; nearest triad used")

    segments = [
        {
            "start": row["start"],
            "end": row["end"],
            "label": row["label"],
            "confidence": row.get("confidence", 0.5),
        }
        for row in raw_rows
        if row.get("label")
    ]
    key_text = profile.estimated_key or "C"
    processed = post_process_chords(
        segments,
        key_text=key_text,
        constrain_to_key=True,
        beat_times=beat_times,
        beats_per_bar=profile.beats_per_bar or 4,
    )
    confidences = [float(row.get("confidence", 0.5) or 0.5) for row in raw_rows if row.get("label")]
    overall_confidence = sum(confidences) / max(len(confidences), 1)
    if overall_confidence < 0.35:
        warnings.append("Chord inference confidence is low; review symbols carefully")

    return {
        "segments": processed,
        "beatTimes": beat_times,
        "tempo": profile.tempo_bpm or 120.0,
        "meter": profile.time_signature or "4/4",
        "detectedKey": key_text,
        "source": source,
        "tracksUsed": tracks_used,
        "confidence": round(overall_confidence, 3),
        "warnings": warnings,
    }
