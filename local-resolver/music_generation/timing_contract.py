"""Validate and normalize TimingContract JSON from the client."""

from __future__ import annotations

DEFAULT_BACKING_GAIN_DB = -16.0
DEFAULT_ARRANGEMENT_GAIN_DB = 0.0


def _as_float(value, default=0.0):
    try:
        parsed = float(value)
        return parsed if parsed == parsed else default
    except (TypeError, ValueError):
        return default


def _normalize_sections(raw_sections) -> list[dict]:
    if not isinstance(raw_sections, list):
        return []
    sections = []
    for item in raw_sections:
        if not isinstance(item, dict):
            continue
        sections.append({
            "id": str(item.get("id") or ""),
            "strainLabel": str(item.get("strainLabel") or ""),
            "startBar": int(item.get("startBar") or 0),
            "endBar": int(item.get("endBar") or 0),
            "startTimeSec": _as_float(item.get("startTimeSec")),
            "endTimeSec": _as_float(item.get("endTimeSec")),
            "durationSec": _as_float(item.get("durationSec")),
            "chords": [
                str(chord)
                for chord in (item.get("chords") or [])
                if chord
            ],
        })
    return sections


def _normalize_repeat_schedule(raw_schedule) -> list[dict]:
    if not isinstance(raw_schedule, list):
        return []
    events = []
    for item in raw_schedule:
        if not isinstance(item, dict):
            continue
        events.append({
            "strainLabel": str(item.get("strainLabel") or ""),
            "playCount": max(1, int(item.get("playCount") or 1)),
        })
    return events


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
    sections = _normalize_sections(timing.get("sections") or raw.get("structure"))
    repeat_schedule = _normalize_repeat_schedule(timing.get("repeatSchedule"))

    drum_guide = raw.get("drumGuide")
    if not isinstance(drum_guide, dict):
        drum_guide = None

    return {
        "title": str(raw.get("title") or "Practice track").strip() or "Practice track",
        "musical": raw.get("musical") if isinstance(raw.get("musical"), dict) else {},
        "timing": {
            "tempoBpm": _as_float(timing.get("tempoBpm"), 120),
            "meter": str(timing.get("meter") or "4/4"),
            "totalDurationSec": total,
            "barBoundariesSec": boundaries,
            "source": str(timing.get("source") or "abcjs"),
            "sections": sections,
            "repeatSchedule": repeat_schedule,
        },
        "backingPrompt": prompt,
        "backingNegativePrompt": negative,
        "structureWarnings": [
            str(item)
            for item in (raw.get("structureWarnings") or [])
            if item
        ],
        "includeChordLayer": bool(raw.get("includeChordLayer")),
        "includeNotationStem": bool(raw.get("includeNotationStem", False)),
        "includeStyleMelodyStem": bool(raw.get("includeStyleMelodyStem", True)),
        "leadMidiProgram": max(0, min(127, int(raw.get("leadMidiProgram") or 40))),
        "backingGainDb": _as_float(raw.get("backingGainDb"), DEFAULT_BACKING_GAIN_DB),
        "arrangementGainDb": _as_float(raw.get("arrangementGainDb"), DEFAULT_ARRANGEMENT_GAIN_DB),
        "loopDurationSec": _as_float(raw.get("loopDurationSec"), 0.0),
        "renderStyle": str(raw.get("renderStyle") or "trad_session"),
        "guideMode": str(raw.get("guideMode") or "midi_wav"),
        "includeDrumGuide": bool(raw.get("includeDrumGuide", True)),
        "drumGuide": drum_guide,
        "melodySource": str(raw.get("melodySource") or "notation_midi"),
        "guideAudioConditioning": bool(raw.get("guideAudioConditioning", False)),
    }


def loop_duration_sec(plan: dict) -> float:
    explicit = _as_float(plan.get("loopDurationSec"))
    if explicit > 0:
        return explicit
    timing = plan.get("timing") or {}
    boundaries = timing.get("barBoundariesSec") or []
    bar_count = max(0, len(boundaries) - 1)
    total = _as_float(timing.get("totalDurationSec"))
    if bar_count <= 0 or total <= 0:
        return min(16.0, total or 8.0)
    bar_duration = total / bar_count
    loop_bars = 8 if bar_count > 8 else max(2, bar_count)
    if bar_count > 16:
        loop_bars = 16
    return max(2.0, min(total, loop_bars * bar_duration))


def section_generation_targets(plan: dict) -> list[dict]:
    timing = plan.get("timing") or {}
    sections = timing.get("sections") or []
    targets = []
    for section in sections:
        duration = _as_float(section.get("durationSec"))
        if duration <= 0:
            start_sec = _as_float(section.get("startTimeSec"))
            end_sec = _as_float(section.get("endTimeSec"))
            duration = max(0.0, end_sec - start_sec)
        if duration <= 0:
            continue
        targets.append({
            "id": section.get("id") or section.get("strainLabel") or f"section-{len(targets)}",
            "strainLabel": section.get("strainLabel") or "",
            "durationSec": duration,
            "startTimeSec": _as_float(section.get("startTimeSec")),
            "endTimeSec": _as_float(section.get("endTimeSec")),
        })
    return targets
