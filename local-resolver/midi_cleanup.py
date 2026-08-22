"""Pre-quantization MIDI note cleanup (mirrors src/midiCleanupPreview.js).
- velocityGate / velocityMax: drop notes outside velocity range
- minDurationMs / maxDurationMs: drop short notes; truncate long notes
- retriggerMergeMs: merge same-pitch retriggered notes within tolerance
- keepPolyphonicChords: when False, collapse simultaneous pitches to highest
- pitchMin / pitchMax: keep notes in MIDI pitch range
- swingAmount: shift off-beat eighths before quantization (engine retained; UI may hide)
- sustainTrim: trim overlapping / overlong sustains
"""

from __future__ import annotations

from typing import Any

LIGHT_CLEANUP_OPTIONS = {
    "velocityGate": 1,
    "velocityMax": 127,
    "minDurationMs": 40.0,
    "maxDurationMs": 0.0,
    "retriggerMergeMs": 25.0,
    "swingAmount": 0.0,
    "sustainTrim": True,
    "keepPolyphonicChords": True,
    "pitchMin": 0,
    "pitchMax": 127,
}


def normalize_cleanup_options(options: dict[str, Any] | None) -> dict[str, Any]:
    opts = options if isinstance(options, dict) else {}
    velocity_gate = int(opts.get("velocityGate", opts.get("velocity_gate", 0)) or 0)
    velocity_max = int(opts.get("velocityMax", opts.get("velocity_max", 127)) or 127)
    min_duration_ms = float(opts.get("minDurationMs", opts.get("min_duration_ms", 0)) or 0)
    max_duration_ms = float(opts.get("maxDurationMs", opts.get("max_duration_ms", 0)) or 0)
    retrigger_merge_ms = float(opts.get("retriggerMergeMs", opts.get("retrigger_merge_ms", 0)) or 0)
    swing_amount = float(opts.get("swingAmount", opts.get("swing_amount", 0)) or 0)
    sustain_trim = bool(opts.get("sustainTrim", opts.get("sustain_trim", False)))
    keep_poly = opts.get("keepPolyphonicChords", opts.get("keep_polyphonic_chords"))
    collapse = opts.get("collapseChords", opts.get("collapse_chords"))
    if keep_poly is not None:
        keep_polyphonic_chords = bool(keep_poly)
    elif collapse is not None:
        keep_polyphonic_chords = not bool(collapse)
    else:
        keep_polyphonic_chords = True
    pitch_min = int(opts.get("pitchMin", opts.get("pitch_min", 0)) or 0)
    pitch_max = int(opts.get("pitchMax", opts.get("pitch_max", 127)) or 127)
    return {
        "velocityGate": max(0, min(127, velocity_gate)),
        "velocityMax": max(0, min(127, velocity_max)),
        "minDurationMs": max(0.0, min_duration_ms),
        "maxDurationMs": max(0.0, max_duration_ms),
        "retriggerMergeMs": max(0.0, retrigger_merge_ms),
        "swingAmount": max(0.0, min(0.5, swing_amount)),
        "sustainTrim": sustain_trim,
        "keepPolyphonicChords": keep_polyphonic_chords,
        "pitchMin": max(0, min(127, pitch_min)),
        "pitchMax": max(0, min(127, pitch_max)),
    }


def _note_velocity(note: dict[str, Any]) -> int:
    if "velocity" in note and note.get("velocity") is not None:
        return int(note.get("velocity") or 0)
    return int(round(float(note.get("confidence", 0.5) or 0.5) * 127))


def _apply_velocity_gate(notes: list[dict[str, Any]], gate: int) -> list[dict[str, Any]]:
    if gate <= 0:
        return notes
    return [note for note in notes if _note_velocity(note) >= gate]


def _apply_velocity_max(notes: list[dict[str, Any]], max_vel: int) -> list[dict[str, Any]]:
    if max_vel >= 127:
        return notes
    return [note for note in notes if _note_velocity(note) <= max_vel]


def _apply_min_duration(notes: list[dict[str, Any]], min_ms: float) -> list[dict[str, Any]]:
    if min_ms <= 0:
        return notes
    min_sec = min_ms / 1000.0
    kept: list[dict[str, Any]] = []
    for note in notes:
        start = float(note.get("start", 0))
        end = float(note.get("end", start))
        if end - start >= min_sec:
            kept.append(note)
    return kept


def _apply_max_duration(
    notes: list[dict[str, Any]],
    max_ms: float,
    min_ms: float,
) -> list[dict[str, Any]]:
    if max_ms <= 0:
        return notes
    max_sec = max_ms / 1000.0
    min_sec = (min_ms or 0) / 1000.0
    kept: list[dict[str, Any]] = []
    for note in notes:
        row = dict(note)
        start = float(row.get("start", 0))
        end = float(row.get("end", start))
        if end - start > max_sec:
            end = start + max_sec
        if min_sec and end - start < min_sec:
            continue
        row["end"] = end
        kept.append(row)
    return kept


def _apply_pitch_range(
    notes: list[dict[str, Any]],
    pitch_min: int,
    pitch_max: int,
) -> list[dict[str, Any]]:
    lo = min(pitch_min, pitch_max)
    hi = max(pitch_min, pitch_max)
    if lo <= 0 and hi >= 127:
        return notes
    return [
        note for note in notes
        if lo <= int(note.get("midi", 0) or 0) <= hi
    ]


def _apply_retrigger_merge(notes: list[dict[str, Any]], merge_ms: float) -> list[dict[str, Any]]:
    if merge_ms <= 0 or not notes:
        return notes
    tol = merge_ms / 1000.0
    ordered = sorted(notes, key=lambda row: (float(row.get("start", 0)), int(row.get("midi", 0))))
    merged: list[dict[str, Any]] = []
    for note in ordered:
        if not merged:
            merged.append(dict(note))
            continue
        prev = merged[-1]
        same_pitch = int(prev.get("midi", 0)) == int(note.get("midi", 0))
        close = abs(float(note.get("start", 0)) - float(prev.get("end", prev.get("start", 0)))) <= tol
        if same_pitch and close:
            prev["end"] = max(float(prev.get("end", 0)), float(note.get("end", 0)))
            continue
        merged.append(dict(note))
    return merged


def _apply_collapse_chords(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not notes:
        return notes
    ordered = sorted(
        notes,
        key=lambda row: (float(row.get("start", 0)), -int(row.get("midi", 0) or 0)),
    )
    kept: list[dict[str, Any]] = []
    onset_tol = 0.02
    for note in ordered:
        start = float(note.get("start", 0))
        cluster = None
        for prev in reversed(kept):
            if abs(float(prev.get("start", 0)) - start) <= onset_tol:
                cluster = prev
                break
            if float(prev.get("start", 0)) < start - onset_tol:
                break
        if cluster is None:
            kept.append(dict(note))
            continue
        midi = int(note.get("midi", 0) or 0)
        if midi > int(cluster.get("midi", 0) or 0):
            cluster["midi"] = midi
            cluster["end"] = max(float(cluster.get("end", 0)), float(note.get("end", 0)))
            if note.get("velocity") is not None:
                cluster["velocity"] = max(int(cluster.get("velocity") or 0), int(note.get("velocity") or 0))
    return kept


def _apply_swing(notes: list[dict[str, Any]], swing_amount: float, tempo_bpm: float) -> list[dict[str, Any]]:
    if swing_amount <= 0 or not notes:
        return notes
    beat_duration = 60.0 / max(tempo_bpm, 1.0)
    eighth = beat_duration / 2.0
    adjusted: list[dict[str, Any]] = []
    for note in notes:
        row = dict(note)
        start = float(row.get("start", 0))
        pos_in_beat = (start % beat_duration) / beat_duration if beat_duration > 0 else 0
        if 0.4 < pos_in_beat < 0.6:
            shift = swing_amount * eighth
            row["start"] = start + shift
            row["end"] = float(row.get("end", start)) + shift
        adjusted.append(row)
    return adjusted


def _apply_sustain_trim(notes: list[dict[str, Any]], tempo_bpm: float) -> list[dict[str, Any]]:
    if not notes:
        return notes
    beat_duration = 60.0 / max(tempo_bpm, 1.0)
    max_sustain = beat_duration * 8.0
    ordered = sorted(notes, key=lambda row: (float(row.get("start", 0)), int(row.get("midi", 0))))
    next_start_by_pitch: dict[int, float] = {}
    trimmed: list[dict[str, Any]] = []
    for note in reversed(ordered):
        row = dict(note)
        pitch = int(row.get("midi", 0))
        start = float(row.get("start", 0))
        end = float(row.get("end", start))
        next_same = next_start_by_pitch.get(pitch)
        if next_same is not None and next_same > start + 0.02:
            end = min(end, next_same)
        if end - start > max_sustain:
            end = start + max_sustain
        row["end"] = max(start + 0.03, end)
        next_start_by_pitch[pitch] = start
        trimmed.append(row)
    trimmed.reverse()
    return trimmed


def apply_midi_cleanup(
    notes: list[dict[str, Any]],
    options: dict[str, Any] | None = None,
    *,
    tempo_bpm: float = 120.0,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return cleaned notes and diff stats."""
    original_count = len(notes or [])
    opts = normalize_cleanup_options(options)
    cleaned = [dict(note) for note in (notes or [])]

    cleaned = _apply_velocity_gate(cleaned, opts["velocityGate"])
    cleaned = _apply_velocity_max(cleaned, opts["velocityMax"])
    cleaned = _apply_pitch_range(cleaned, opts["pitchMin"], opts["pitchMax"])
    cleaned = _apply_min_duration(cleaned, opts["minDurationMs"])
    cleaned = _apply_max_duration(cleaned, opts["maxDurationMs"], opts["minDurationMs"])
    cleaned = _apply_retrigger_merge(cleaned, opts["retriggerMergeMs"])
    if not opts["keepPolyphonicChords"]:
        cleaned = _apply_collapse_chords(cleaned)
    cleaned = _apply_swing(cleaned, opts["swingAmount"], tempo_bpm)
    if opts["sustainTrim"]:
        cleaned = _apply_sustain_trim(cleaned, tempo_bpm)

    removed = original_count - len(cleaned)
    stats = {
        "originalCount": original_count,
        "cleanedCount": len(cleaned),
        "removedCount": max(0, removed),
        "removedPercent": round(100.0 * max(0, removed) / max(original_count, 1), 1),
    }
    return cleaned, stats


def cleanup_is_active(options: dict[str, Any] | None) -> bool:
    opts = normalize_cleanup_options(options)
    return (
        opts["velocityGate"] > 0
        or opts["velocityMax"] < 127
        or opts["minDurationMs"] > 0
        or opts["maxDurationMs"] > 0
        or opts["retriggerMergeMs"] > 0
        or opts["swingAmount"] > 0
        or opts["sustainTrim"]
        or not opts["keepPolyphonicChords"]
        or opts["pitchMin"] > 0
        or opts["pitchMax"] < 127
    )
