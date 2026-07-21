"""Score MIDI import candidates (ABC text quality)."""

from __future__ import annotations

import re
from typing import Any


def _count_abc_notes(abc: str) -> int:
    if not abc:
        return 0
    body = abc.split("K:", 1)[-1]
    tokens = re.findall(r"[\^_=]?[A-Ga-g][',]*\d*|z\d*", body)
    return len([t for t in tokens if t and not t.startswith("z")])


def _has_required_headers(abc: str) -> bool:
    text = abc or ""
    return bool(re.search(r"^K:\s*\S", text, re.M)) and bool(re.search(r"^M:\s*\S", text, re.M))


def _pitch_variety_score(abc: str) -> float:
    pitches = re.findall(r"[\^_=]?[A-Ga-g]", abc.split("K:", 1)[-1])
    if not pitches:
        return 0.0
    return min(1.0, len(set(pitches)) / 6.0)


def _chromatic_penalty(abc: str, key: str = "C") -> float:
    body = abc.split("K:", 1)[-1]
    accidentals = len(re.findall(r"[\^_]", body))
    notes = max(_count_abc_notes(abc), 1)
    ratio = accidentals / notes
    if key in ("C", "G", "D", "A", "E", "B", "F#"):
        return max(0.0, ratio - 0.35) * 0.5
    return max(0.0, ratio - 0.5) * 0.3


def score_abc_import(
    abc: str,
    *,
    source_note_count: int = 0,
    has_title: bool = False,
    key: str = "C",
) -> dict[str, Any]:
    warnings: list[str] = []
    if not abc or not abc.strip():
        return {"score": 0.0, "confidence": 0.0, "warnings": ["Empty ABC output"], "gates_passed": False}

    gates = _has_required_headers(abc) and _count_abc_notes(abc) > 0
    if not gates:
        return {
            "score": 0.0,
            "confidence": 0.0,
            "warnings": ["ABC missing key, meter, or notes"],
            "gates_passed": False,
        }

    note_count = _count_abc_notes(abc)
    score = 0.4
    if source_note_count > 0:
        ratio = note_count / source_note_count
        if 0.5 <= ratio <= 1.5:
            score += 0.25
        elif 0.3 <= ratio <= 2.0:
            score += 0.1
        else:
            warnings.append("Imported note count differs significantly from source MIDI")
    else:
        score += 0.15

    score += 0.15 * _pitch_variety_score(abc)
    if has_title or re.search(r"^T:\s*\S", abc, re.M):
        score += 0.05
    if "|" in abc:
        score += 0.1

    score -= _chromatic_penalty(abc, key)
    score = max(0.0, min(1.0, score))
    confidence = score
    if score < 0.35:
        warnings.append("Low confidence: notation may not represent the MIDI well")

    return {
        "score": round(score, 3),
        "confidence": round(confidence, 3),
        "warnings": warnings,
        "gates_passed": True,
        "note_count": note_count,
    }


def score_musicxml_candidate(
    music_xml: str,
    *,
    diagnostics: dict[str, Any] | None = None,
    source_note_count: int = 0,
    has_title: bool = False,
) -> dict[str, Any]:
    warnings: list[str] = []
    if not music_xml or not music_xml.strip():
        return {"score": 0.0, "confidence": 0.0, "warnings": ["Empty MusicXML output"], "gates_passed": False}

    note_count = len(re.findall(r"<note(?:\s|>|/)", music_xml))
    if note_count <= 0:
        return {
            "score": 0.0,
            "confidence": 0.0,
            "warnings": ["MusicXML has no notes"],
            "gates_passed": False,
        }

    diag = diagnostics or {}
    score = 0.45
    quant_error = float(diag.get("quant_error", 1.0) or 1.0)
    if quant_error < 0.1:
        score += 0.2
    elif quant_error < 0.2:
        score += 0.12
    elif quant_error < 0.35:
        score += 0.05
    else:
        warnings.append("Quantization error is high; rhythms may be approximate")

    if source_note_count > 0:
        ratio = note_count / max(source_note_count, 1)
        if 0.4 <= ratio <= 2.0:
            score += 0.2
        elif 0.2 <= ratio <= 3.0:
            score += 0.08
        else:
            warnings.append("Imported note count differs significantly from source MIDI")
    else:
        score += 0.1

    if int(diag.get("tracks_imported", 0) or 0) > 0:
        score += 0.05
    if has_title or "<work-title>" in music_xml:
        score += 0.05

    score = max(0.0, min(1.0, score))
    confidence = score
    if score < 0.35:
        warnings.append("Low confidence: notation may not represent the MIDI well")

    return {
        "score": round(score, 3),
        "confidence": round(confidence, 3),
        "warnings": warnings,
        "gates_passed": True,
        "note_count": note_count,
    }


def pick_best_candidate(candidates: list[dict[str, Any]], profile_mode: str = "melody") -> dict[str, Any]:
    """Pick highest-scoring candidate; tie-break by mode preference."""
    if not candidates:
        return {
            "abc": "",
            "strategy": "none",
            "confidence": 0.0,
            "warnings": ["No conversion strategy produced output"],
            "diagnostics": {},
        }

    ranked = sorted(
        candidates,
        key=lambda item: (
            1 if ((item.get("abc") or "").strip() or (item.get("musicXml") or "").strip()) else 0,
            float(item.get("score", 0) or 0),
            1 if item.get("strategy") == "note_events" and profile_mode == "melody" else 0,
            1 if item.get("strategy") == "musicxml" and profile_mode == "multi_voice" else 0,
        ),
        reverse=True,
    )
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    if second and abs(best.get("score", 0) - second.get("score", 0)) <= 0.05:
        if profile_mode == "melody" and second.get("strategy") == "note_events":
            best = second
        elif profile_mode == "multi_voice" and second.get("strategy") == "musicxml":
            best = second

    warnings = list(best.get("warnings") or [])
    if float(best.get("confidence", 0) or 0) < 0.35:
        warnings.append("Import confidence is low; review notation carefully")

    return {
        "abc": best.get("abc") or "",
        "musicXml": best.get("musicXml") or "",
        "strategy": best.get("strategy") or "unknown",
        "mode": best.get("mode") or profile_mode,
        "confidence": float(best.get("confidence", 0) or 0),
        "warnings": warnings,
        "diagnostics": best.get("diagnostics") or {},
        "profile": best.get("profile") or {},
        "score": best.get("score", 0),
    }
