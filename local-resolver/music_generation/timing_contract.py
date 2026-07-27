"""Validate and normalize TimingContract JSON from the client."""

from __future__ import annotations


def _as_float(value, default=0.0):
    try:
        parsed = float(value)
        return parsed if parsed == parsed else default
    except (TypeError, ValueError):
        return default


def _as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def validate_timing_plan(raw: dict | None) -> dict:
    if not raw or not isinstance(raw, dict):
        raise ValueError("Missing timing plan")

    timing = raw.get("timing")
    if not timing or not isinstance(timing, dict):
        raise ValueError("Missing timing contract")

    total = _as_float(timing.get("totalDurationSec"))
    if total <= 0:
        raise ValueError("Invalid totalDurationSec")

    bar_boundaries = timing.get("barBoundariesSec")
    if not isinstance(bar_boundaries, list) or len(bar_boundaries) < 2:
        raise ValueError("barBoundariesSec must have at least two entries")

    boundaries = [_as_float(v) for v in bar_boundaries]
    if any(v < 0 for v in boundaries):
        raise ValueError("Invalid bar boundary times")

    prompt = str(raw.get("backingPrompt") or "").strip()
    if not prompt:
        raise ValueError("Missing backingPrompt")

    negative = str(raw.get("backingNegativePrompt") or "").strip()

    return {
        "title": str(raw.get("title") or "Practice track").strip() or "Practice track",
        "musical": raw.get("musical") if isinstance(raw.get("musical"), dict) else {},
        "timing": {
            "tempoBpm": _as_float(timing.get("tempoBpm"), 120),
            "meter": str(timing.get("meter") or "4/4"),
            "totalDurationSec": total,
            "barBoundariesSec": boundaries,
            "source": str(timing.get("source") or "abcjs"),
        },
        "backingPrompt": prompt,
        "backingNegativePrompt": negative,
        "structureWarnings": [
            str(item)
            for item in (raw.get("structureWarnings") or [])
            if item
        ],
        "includeChordLayer": bool(raw.get("includeChordLayer")),
        "backingGainDb": _as_float(raw.get("backingGainDb"), -9.0),
    }
