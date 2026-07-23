"""Orchestrate MIDI import strategies and pick the best ABC output."""

from __future__ import annotations

import os
import shutil
from typing import Any

from midi_analysis import analyze_midi_bytes, apply_profile_overrides
from midi_chord_infer import infer_chords_from_midi, should_infer_chords
from midi_convert import convert_midi_bytes_to_musicxml_sync
from midi_harmony_voice import build_harmony_voice_abc
from midi_import_score import pick_best_candidate, score_abc_import, score_musicxml_candidate
from midi_to_abc import MidiAbcBuildOptions, convert_midi_to_abc_note_events
from musescore_fetch import convert_midi_bytes_to_musicxml_via_musescore

MUSESCORE_BACKUP_SCORE_THRESHOLD = 0.45
MUSESCORE_TIE_DELTA = 0.05


def _musescore_disabled_by_env() -> bool:
    return os.getenv("MIDI_IMPORT_MUSESCORE", "").strip().lower() in ("0", "false", "no")


def _musescore_cli_available() -> bool:
    if _musescore_disabled_by_env():
        return False
    return bool(
        shutil.which("mscore")
        or shutil.which("musescore")
        or shutil.which("MuseScore4")
        or os.path.isfile("/opt/musescore/AppRun")
    )


def _try_musescore_musicxml(midi_bytes: bytes, filename: str) -> str:
    if not _musescore_cli_available():
        return ""
    return convert_midi_bytes_to_musicxml_via_musescore(midi_bytes, filename)


def _best_candidate_score(candidates: list[dict[str, Any]]) -> float:
    if not candidates:
        return 0.0
    return max(float(item.get("score", 0) or 0) for item in candidates)


def _candidates_are_tied(candidates: list[dict[str, Any]], delta: float = MUSESCORE_TIE_DELTA) -> bool:
    scores = sorted((float(item.get("score", 0) or 0) for item in candidates), reverse=True)
    if len(scores) < 2:
        return False
    return abs(scores[0] - scores[1]) <= delta


def _should_run_musescore(
    strategy: str,
    profile,
    candidates: list[dict[str, Any]],
) -> bool:
    if strategy == "musescore":
        return True
    if strategy != "auto":
        return False
    if not _musescore_cli_available():
        return False

    routing_hint = getattr(profile, "routing_hint", None) or profile.recommended_mode
    if routing_hint == "ambiguous":
        return True

    if not candidates:
        return True

    best_score = _best_candidate_score(candidates)
    if best_score < MUSESCORE_BACKUP_SCORE_THRESHOLD:
        return True
    if _candidates_are_tied(candidates):
        return True
    return False


def analyze_midi_for_import(midi_bytes: bytes, filename: str = "import.mid") -> dict[str, Any]:
    profile = analyze_midi_bytes(midi_bytes, filename)
    return profile.to_dict()


def import_midi_bytes(
    midi_bytes: bytes,
    filename: str = "import.mid",
    *,
    mode: str | None = None,
    strategy: str = "auto",
    include_chords: bool | None = None,
    track_ids: list[int] | None = None,
    drum_track_ids: list[int] | None = None,
    include_drums: bool = False,
    quant_slots_per_beat: int | None = None,
    note_length: str | None = None,
    cleanup_options: dict[str, Any] | None = None,
    tempo_bpm: float | None = None,
    time_signature: str | None = None,
    estimated_key: str | None = None,
    max_voices: int = 8,
) -> dict[str, Any]:
    """
    Run MIDI import strategies and return the best result.

    strategy: auto | note_events | musicxml | musescore
    mode: melody | multi_voice | None (use profile)
    """
    profile = analyze_midi_bytes(midi_bytes, filename)
    apply_profile_overrides(
        profile,
        tempo_bpm=tempo_bpm,
        time_signature=time_signature,
        estimated_key=estimated_key,
        explicit_track_ids=track_ids,
    )
    forced_mode = mode if mode in ("melody", "multi_voice") else None
    import_mode = forced_mode or profile.recommended_mode
    routing_hint = getattr(profile, "routing_hint", None) or import_mode
    infer_chords = should_infer_chords(profile, include_chords)

    if import_mode == "reject" and not track_ids:
        return {
            "abc": "",
            "musicXml": "",
            "strategy": "none",
            "mode": "reject",
            "confidence": 0.0,
            "warnings": [profile.reject_reason or "MIDI is not suitable for notation import"],
            "diagnostics": profile.to_dict(),
            "profile": profile.to_dict(),
        }

    build_options = MidiAbcBuildOptions(
        mode=import_mode,
        track_ids=track_ids,
        drum_track_ids=list(drum_track_ids or []),
        include_drums=include_drums,
        quant_slots_per_beat=int(quant_slots_per_beat or 2),
        note_length=note_length or "1/8",
        cleanup_options=cleanup_options,
        max_voices=max_voices,
        tempo_bpm=tempo_bpm,
        time_signature=time_signature,
        estimated_key=estimated_key,
    )

    source_note_count = profile.total_pitched_notes
    candidates: list[dict[str, Any]] = []

    run_note_events = strategy in ("auto", "note_events")
    run_musicxml = strategy in ("auto", "musicxml")

    if run_note_events:
        note_result = convert_midi_to_abc_note_events(
            midi_bytes,
            filename,
            mode=import_mode,
            options=build_options,
        )
        scored = score_abc_import(
            note_result.get("abc") or "",
            source_note_count=source_note_count,
            has_title=bool(profile.title),
            key=profile.estimated_key,
        )
        candidates.append({
            "abc": note_result.get("abc") or "",
            "strategy": "note_events",
            "mode": note_result.get("mode") or import_mode,
            "warnings": (note_result.get("warnings") or []) + scored.get("warnings", []),
            "diagnostics": note_result.get("diagnostics") or {},
            "profile": note_result.get("profile") or profile.to_dict(),
            "score": scored.get("score", 0),
            "confidence": scored.get("confidence", 0),
        })

    if run_musicxml:
        try:
            music_xml, diagnostics = convert_midi_bytes_to_musicxml_sync(
                midi_bytes,
                filename,
                profile=profile,
                mode=import_mode,
                include_chords=infer_chords,
                explicit_track_ids=track_ids,
                include_drums=include_drums,
                max_parts=max_voices,
            )
            scored = score_musicxml_candidate(
                music_xml,
                diagnostics=diagnostics,
                source_note_count=source_note_count,
                has_title=bool(profile.title),
            )
            warnings = ["MIDI import uses quantized durations"]
            if diagnostics.get("quant_error", 0) > 0.15:
                warnings.append("Quantization error is high; rhythms may be approximate")
            candidates.append({
                "abc": "",
                "musicXml": music_xml,
                "strategy": "musicxml",
                "mode": import_mode,
                "warnings": warnings + scored.get("warnings", []),
                "diagnostics": diagnostics,
                "profile": profile.to_dict(),
                "score": scored.get("score", 0),
                "confidence": scored.get("confidence", 0),
            })
        except Exception as exc:
            candidates.append({
                "abc": "",
                "strategy": "musicxml",
                "mode": import_mode,
                "warnings": [str(exc)[:200] or "MusicXML conversion failed"],
                "score": 0.0,
                "confidence": 0.0,
            })

    if _should_run_musescore(strategy, profile, candidates):
        music_xml = _try_musescore_musicxml(midi_bytes, filename)
        if music_xml:
            scored = score_musicxml_candidate(
                music_xml,
                diagnostics={"tracks_imported": 1, "quant_error": 0.0, "converter": "musescore"},
                source_note_count=source_note_count,
                has_title=bool(profile.title),
            )
            warnings = ["Converted via MuseScore CLI"]
            if routing_hint == "ambiguous":
                warnings.append("Ambiguous MIDI layout — MuseScore conversion included for comparison")
            elif _best_candidate_score(candidates) < MUSESCORE_BACKUP_SCORE_THRESHOLD:
                warnings.append("MuseScore used as backup because other strategies scored low")
            elif _candidates_are_tied(candidates):
                warnings.append("MuseScore used to break a tie between other strategies")
            candidates.append({
                "abc": "",
                "musicXml": music_xml,
                "strategy": "musescore",
                "mode": import_mode,
                "warnings": warnings + scored.get("warnings", []),
                "diagnostics": {"converter": "musescore", "routing_hint": routing_hint},
                "profile": profile.to_dict(),
                "score": scored.get("score", 0),
                "confidence": scored.get("confidence", 0),
            })
        elif strategy == "musescore":
            candidates.append({
                "abc": "",
                "strategy": "musescore",
                "mode": import_mode,
                "warnings": ["MuseScore CLI is not available for MIDI conversion"],
                "score": 0.0,
                "confidence": 0.0,
            })

    best = pick_best_candidate(candidates, profile_mode=import_mode)
    best["profile"] = profile.to_dict()
    if not best.get("abc") and best.get("musicXml"):
        best["warnings"] = list(best.get("warnings") or []) + [
            "ABC will be generated from MusicXML on the client",
        ]

    if infer_chords:
        chord_result = infer_chords_from_midi(midi_bytes, profile, include_chords=include_chords)
        harmony = build_harmony_voice_abc(midi_bytes, profile)
        if chord_result.get("segments"):
            best["chordSegments"] = chord_result
        if harmony.get("body"):
            best["harmonyAbc"] = harmony.get("body") or ""
            best["harmonyVoiceName"] = harmony.get("voiceName") or "Chords"
        best["chords"] = {
            "confidence": chord_result.get("confidence", 0.0),
            "source": chord_result.get("source", "none"),
            "tracksUsed": chord_result.get("tracksUsed") or [],
            "warnings": chord_result.get("warnings") or [],
        }
        best["warnings"] = list(best.get("warnings") or []) + (chord_result.get("warnings") or [])

    return best
