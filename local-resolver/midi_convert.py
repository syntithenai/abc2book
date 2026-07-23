"""MIDI bytes → MusicXML via music21 (shared by /midi2xml and MIDI search)."""

from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Any

from midi_analysis import MidiProfile, analyze_midi_bytes

MAX_MIDI_IMPORT_BYTES = int(os.getenv("MAX_MIDI_IMPORT_BYTES", str(4 * 1024 * 1024)))
MAX_MIDI_IMPORT_PARTS_MELODY = 1
MAX_MIDI_IMPORT_PARTS_MULTI = 8
MIDI_QUANTIZE_DIVISOR_CANDIDATES = (2, 4, 8, 3, 6, 12)


def _is_drum_part(part) -> bool:
    """True if this part looks like GM percussion (channel 10) or unpitched drums."""
    try:
        from music21 import instrument as m21instrument
    except Exception:
        m21instrument = None

    for inst in part.recurse().getElementsByClass("Instrument"):
        channel = getattr(inst, "midiChannel", None)
        if channel is not None and int(channel) == 9:
            return True
        drum_types = []
        if m21instrument is not None:
            for class_name in ("Percussion", "UnpitchedPercussion"):
                cls = getattr(m21instrument, class_name, None)
                if cls is not None:
                    drum_types.append(cls)
        if drum_types and isinstance(inst, tuple(drum_types)):
            return True
        name = str(getattr(inst, "instrumentName", "") or "").lower()
        if "drum" in name or "perc" in name:
            return True

    try:
        from music21 import note as m21note
    except Exception:
        m21note = None
    if m21note is not None:
        unpitched_only = True
        has_notes = False
        for el in part.recurse().notes:
            has_notes = True
            if isinstance(el, m21note.Unpitched):
                continue
            if getattr(el, "isChord", False) or (
                getattr(el, "isNote", False) and getattr(el, "pitch", None) is not None
            ):
                unpitched_only = False
                break
        if has_notes and unpitched_only:
            return True
    return False


def _part_index(part, parts: list) -> int:
    for index, candidate in enumerate(parts):
        if candidate is part:
            return index
    return -1


def _flatten_chords_in_part(part) -> None:
    from music21 import chord, note

    for el in list(part.recurse().getElementsByClass(chord.Chord)):
        pitches = list(getattr(el, "pitches", ()) or ())
        if not pitches:
            continue
        top = max(pitches, key=lambda p: p.ps)
        replacement = note.Note(top)
        replacement.duration = el.duration
        replacement.volume = el.volume
        site = el.activeSite
        if site is None:
            continue
        try:
            site.replace(el, replacement)
        except Exception:
            try:
                offset = el.getOffsetInHierarchy(site) if hasattr(el, "getOffsetInHierarchy") else el.offset
                site.remove(el)
                site.insert(offset, replacement)
            except Exception:
                pass


def _keep_profile_parts(
    score,
    profile: MidiProfile | None = None,
    mode: str | None = None,
    *,
    include_chords: bool = False,
    explicit_track_ids: list[int] | None = None,
    include_drums: bool = False,
    max_parts: int | None = None,
):
    from music21 import stream

    parts = list(score.parts)
    if not parts:
        return score, []

    import_mode = mode or (profile.recommended_mode if profile else "melody")
    if max_parts is None:
        if include_chords and import_mode != "multi_voice":
            max_parts = 2
        elif import_mode == "multi_voice":
            max_parts = MAX_MIDI_IMPORT_PARTS_MULTI
        else:
            max_parts = MAX_MIDI_IMPORT_PARTS_MELODY

    keep: list = []
    if profile:
        from midi_analysis import track_ids_for_import

        id_list = track_ids_for_import(
            profile,
            import_mode,
            include_chords=include_chords,
            explicit_track_ids=explicit_track_ids,
            max_voices=max_parts,
        )
        id_set = set(id_list)
        for index, part in enumerate(parts):
            if index not in id_set:
                continue
            if _is_drum_part(part) and not include_drums:
                continue
            keep.append(part)
        keep = keep[:max_parts]

    if not keep:
        ranked = []
        for part in parts:
            if _is_drum_part(part):
                continue
            notes = list(part.recurse().notes)
            if not notes:
                continue
            mono = 0.0
            pitch_sum = 0.0
            pitch_count = 0
            for el in notes:
                if getattr(el, "isChord", False):
                    pitches = list(getattr(el, "pitches", ()) or ())
                    mono += 1.0 / max(len(pitches), 1)
                    for pitch in pitches:
                        pitch_sum += pitch.ps
                        pitch_count += 1
                elif getattr(el, "isNote", False) and getattr(el, "pitch", None) is not None:
                    mono += 1.0
                    pitch_sum += el.pitch.ps
                    pitch_count += 1
            ranked.append(((mono, pitch_sum / max(pitch_count, 1), len(notes)), part))
        ranked.sort(key=lambda item: item[0], reverse=True)
        keep = [part for priority, part in ranked[:max_parts]]

    if not keep:
        for part in parts:
            if not _is_drum_part(part):
                keep = [part]
                break
        if not keep:
            keep = [parts[0]]

    if len(keep) == len(parts):
        return score, keep

    cleaned = stream.Score()
    if score.metadata is not None:
        cleaned.metadata = score.metadata
    for part in keep:
        cleaned.insert(0, part)
    return cleaned, keep


def _quantize_error(score, divisors: tuple[int, ...]) -> float:
    from copy import deepcopy

    try:
        trial = deepcopy(score)
        trial.quantize(
            quarterLengthDivisors=list(divisors),
            processOffsets=True,
            processDurations=True,
            inPlace=True,
        )
    except Exception:
        return float("inf")

    error = 0.0
    count = 0
    for part in trial.parts:
        for el in part.recurse().notes:
            try:
                ql = float(el.duration.quarterLength)
            except Exception:
                continue
            if ql <= 0:
                continue
            nearest = min(abs(ql - (1.0 / d) * round(ql * d)) for d in divisors)
            error += nearest
            count += 1
    return error / max(count, 1)


def _best_quantize_divisors(score) -> tuple[int, ...]:
    best = MIDI_QUANTIZE_DIVISOR_CANDIDATES
    best_error = float("inf")
    candidates = [
        (4, 8, 3, 6),
        (2, 4, 8, 3, 6),
        (4, 8, 3, 6, 12),
        (2, 4, 8),
        (3, 6, 12),
    ]
    for divisors in candidates:
        err = _quantize_error(score, divisors)
        if err < best_error:
            best_error = err
            best = divisors
    return best


def _quantize_score(score) -> float:
    divisors = _best_quantize_divisors(score)
    try:
        score.quantize(
            quarterLengthDivisors=list(divisors),
            processOffsets=True,
            processDurations=True,
            inPlace=True,
        )
        return _quantize_error(score, divisors)
    except Exception:
        return 1.0


def _apply_metadata(score, profile: MidiProfile | None, filename: str = "") -> None:
    from music21 import metadata, meter, tempo

    if score.metadata is None:
        score.metadata = metadata.Metadata()
    title = (profile.title if profile else "") or os.path.splitext(os.path.basename(filename))[0]
    if title:
        score.metadata.title = title
    if profile and profile.time_signature:
        try:
            score.insert(0, meter.TimeSignature(profile.time_signature))
        except Exception:
            pass
    if profile and profile.tempo_bpm:
        try:
            score.insert(0, tempo.MetronomeMark(number=float(profile.tempo_bpm)))
        except Exception:
            pass


def simplify_midi_score_for_notation(
    score,
    profile: MidiProfile | None = None,
    mode: str | None = None,
    *,
    include_chords: bool = False,
    explicit_track_ids: list[int] | None = None,
    include_drums: bool = False,
    max_parts: int | None = None,
):
    if score is None:
        return score, {"quant_error": 1.0, "tracks_imported": 0}
    simplified, kept = _keep_profile_parts(
        score,
        profile,
        mode,
        include_chords=include_chords,
        explicit_track_ids=explicit_track_ids,
        include_drums=include_drums,
        max_parts=max_parts,
    )
    import_mode = mode or (profile.recommended_mode if profile else "melody")
    flatten = import_mode != "multi_voice"
    if flatten:
        parts = list(simplified.parts)
        flatten_parts = parts[:1] if include_chords and len(parts) > 1 else parts
        for part in flatten_parts:
            _flatten_chords_in_part(part)
    quant_error = _quantize_score(simplified)
    return simplified, {
        "quant_error": round(quant_error, 4),
        "tracks_imported": len(kept),
        "tracks_analyzed": len(list(score.parts)),
    }


def _finalize_score_for_musicxml(score):
    from music21 import note, stream

    prepared = score.makeNotation()
    for part in prepared.parts:
        part.makeRests(inPlace=True, fillGaps=True, timeRangeFromBarDuration=True)
        for measure in part.getElementsByClass(stream.Measure):
            notes_rests = list(measure.notesAndRests)
            expected = measure.barDuration.quarterLength
            if not expected:
                continue
            if not notes_rests:
                measure.insert(0, note.Rest(quarterLength=expected))
                continue
            filled = sum(n.duration.quarterLength for n in notes_rests)
            if filled + 0.001 < expected:
                measure.insert(filled, note.Rest(quarterLength=expected - filled))
    return prepared


def _write_prepared_score_to_musicxml(prepared) -> str:
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".musicxml", delete=False) as temp_file:
        temp_path = temp_file.name
    try:
        prepared.write("musicxml", fp=temp_path)
        with open(temp_path, "r", encoding="utf-8") as handle:
            return handle.read()
    finally:
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass


def write_score_to_musicxml(
    score,
    profile: MidiProfile | None = None,
    mode: str | None = None,
    *,
    include_chords: bool = False,
    explicit_track_ids: list[int] | None = None,
    include_drums: bool = False,
    max_parts: int | None = None,
) -> tuple[str, dict[str, Any]]:
    simplified, diagnostics = simplify_midi_score_for_notation(
        score,
        profile,
        mode,
        include_chords=include_chords,
        explicit_track_ids=explicit_track_ids,
        include_drums=include_drums,
        max_parts=max_parts,
    )
    _apply_metadata(simplified, profile)
    prepared = _finalize_score_for_musicxml(simplified)
    return _write_prepared_score_to_musicxml(prepared), diagnostics


def convert_midi_bytes_to_musicxml_sync(
    midi_bytes: bytes,
    filename: str = "import.mid",
    *,
    profile: MidiProfile | None = None,
    mode: str | None = None,
    include_chords: bool = False,
    explicit_track_ids: list[int] | None = None,
    include_drums: bool = False,
    max_parts: int | None = None,
) -> tuple[str, dict[str, Any]]:
    from music21 import converter

    if profile is None:
        profile = analyze_midi_bytes(midi_bytes, filename)
    divisors = _best_quantize_divisors(
        converter.parseData(midi_bytes, quarterLengthDivisors=(4, 8, 3, 6))
    )
    score = converter.parseData(midi_bytes, quarterLengthDivisors=divisors)
    return write_score_to_musicxml(
        score,
        profile,
        mode,
        include_chords=include_chords,
        explicit_track_ids=explicit_track_ids,
        include_drums=include_drums,
        max_parts=max_parts,
    )


async def convert_midi_to_musicxml(
    midi_bytes: bytes,
    filename: str = "import.mid",
    *,
    profile: MidiProfile | None = None,
    mode: str | None = None,
) -> tuple[str, dict[str, Any]]:
    return await asyncio.to_thread(
        convert_midi_bytes_to_musicxml_sync,
        midi_bytes,
        filename,
        profile=profile,
        mode=mode,
    )
