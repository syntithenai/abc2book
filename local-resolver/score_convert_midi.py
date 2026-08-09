"""Shared MIDI import request parsing for score-convert endpoints."""

from __future__ import annotations

import json
from typing import Any

from fastapi import Request


def parse_int_list_param(raw: str | None) -> list[int]:
    if not raw:
        return []
    values: list[int] = []
    for part in str(raw).split(","):
        part = part.strip()
        if not part:
            continue
        try:
            values.append(int(part))
        except ValueError:
            continue
    return values


def parse_cleanup_options(request: Request) -> dict[str, Any] | None:
    raw = request.query_params.get("cleanup_options")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def midi_import_kwargs_from_request(
    request: Request,
    *,
    mode: str | None = None,
    strategy: str = "auto",
) -> dict[str, Any]:
    forced_mode = (mode or "").strip().lower() or None
    if forced_mode not in (None, "melody", "multi_voice"):
        forced_mode = None
    forced_strategy = (strategy or "auto").strip().lower() or "auto"
    include_chords_param = (request.query_params.get("include_chords") or "").strip().lower()
    forced_include_chords = None
    if include_chords_param in ("1", "true", "yes"):
        forced_include_chords = True
    elif include_chords_param in ("0", "false", "no"):
        forced_include_chords = False

    track_ids = parse_int_list_param(request.query_params.get("track_ids"))
    drum_track_ids = parse_int_list_param(request.query_params.get("drum_track_ids"))
    include_drums_param = (request.query_params.get("include_drums") or "").strip().lower()
    include_drums = include_drums_param in ("1", "true", "yes")

    quant_slots = request.query_params.get("quant_slots_per_beat")
    quant_slots_per_beat = int(quant_slots) if quant_slots and quant_slots.isdigit() else None
    note_length = request.query_params.get("note_length") or None

    tempo_param = request.query_params.get("tempo_bpm")
    tempo_bpm = float(tempo_param) if tempo_param else None
    time_signature = request.query_params.get("time_signature") or None
    estimated_key = request.query_params.get("estimated_key") or None
    cleanup_options = parse_cleanup_options(request)

    max_voices_param = request.query_params.get("max_voices")
    max_voices = int(max_voices_param) if max_voices_param and max_voices_param.isdigit() else 0

    rhythm_detail = (request.query_params.get("rhythm_detail") or "standard").strip().lower()
    if rhythm_detail not in ("simple", "standard", "detailed"):
        rhythm_detail = "standard"
    quant_strength_param = request.query_params.get("quant_strength")
    try:
        quant_strength = float(quant_strength_param) if quant_strength_param else 0.7
    except ValueError:
        quant_strength = 0.7
    quant_strength = max(0.0, min(1.0, quant_strength))

    return {
        "mode": forced_mode,
        "strategy": forced_strategy,
        "include_chords": forced_include_chords,
        "track_ids": track_ids or None,
        "drum_track_ids": drum_track_ids or None,
        "include_drums": include_drums,
        "quant_slots_per_beat": quant_slots_per_beat,
        "note_length": note_length,
        "cleanup_options": cleanup_options,
        "tempo_bpm": tempo_bpm,
        "time_signature": time_signature,
        "estimated_key": estimated_key,
        "max_voices": max_voices,
        "rhythm_detail": rhythm_detail,
        "quant_strength": quant_strength,
    }
