"""Pre-quantization MIDI note cleanup (mirrors src/midiCleanupPreview.js)."""

from __future__ import annotations

from typing import Any


def normalize_cleanup_options(options: dict[str, Any] | None) -> dict[str, Any]:
    opts = options if isinstance(options, dict) else {}
    velocity_gate = int(opts.get("velocityGate", opts.get("velocity_gate", 0)) or 0)
    min_duration_ms = float(opts.get("minDurationMs", opts.get("min_duration_ms", 0)) or 0)
    retrigger_merge_ms = float(opts.get("retriggerMergeMs", opts.get("retrigger_merge_ms", 0)) or 0)
    swing_amount = float(opts.get("swingAmount", opts.get("swing_amount", 0)) or 0)
    sustain_trim = bool(opts.get("sustainTrim", opts.get("sustain_trim", False)))
    return {
        "velocityGate": max(0, min(127, velocity_gate)),
        "minDurationMs": max(0.0, min_duration_ms),
        "retriggerMergeMs": max(0.0, retrigger_merge_ms),
        "swingAmount": max(0.0, min(0.5, swing_amount)),
        "sustainTrim": sustain_trim,
    }


def _apply_velocity_gate(notes: list[dict[str, Any]], gate: int) -> list[dict[str, Any]]:
    if gate <= 0:
        return notes
    return [
        note for note in notes
        if int(note.get("velocity", note.get("confidence", 1) * 127) or 0) >= gate
    ]


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
        # Off-beat eighth: shift later by swing_amount * eighth
        if 0.4 < pos_in_beat < 0.6:
            shift = swing_amount * eighth
            row["start"] = start + shift
            row["end"] = float(row.get("end", start)) + shift
        adjusted.append(row)
    return adjusted


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
    cleaned = _apply_min_duration(cleaned, opts["minDurationMs"])
    cleaned = _apply_retrigger_merge(cleaned, opts["retriggerMergeMs"])
    cleaned = _apply_swing(cleaned, opts["swingAmount"], tempo_bpm)

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
        or opts["minDurationMs"] > 0
        or opts["retriggerMergeMs"] > 0
        or opts["swingAmount"] > 0
        or opts["sustainTrim"]
    )
