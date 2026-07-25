"""MIDI bytes → MusicXML via music21 (shared by /midi2xml and MIDI search)."""

from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Any

from midi_analysis import MidiProfile, analyze_midi_bytes

MAX_MIDI_IMPORT_BYTES = int(os.getenv("MAX_MIDI_IMPORT_BYTES", str(4 * 1024 * 1024)))
MAX_MIDI_IMPORT_PARTS_MELODY = 1
MAX_MIDI_IMPORT_PARTS_MULTI = 32
MIDI_QUANTIZE_DIVISOR_CANDIDATES = (2, 4, 8, 3, 6, 12)
RHYTHM_DETAIL_CANDIDATES: dict[str, tuple[tuple[int, ...], ...]] = {
    "simple": ((4, 2), (2, 4)),
    "standard": ((4, 8, 3, 6), (2, 4, 8, 3, 6)),
    "detailed": ((4, 8, 3, 6, 12), (2, 4, 8, 3, 6, 12)),
}
NOTATION_BIAS_TOLERANCE = 0.02


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
    kept_indices: list[int] = []
    if profile:
        from midi_analysis import track_ids_for_import

        id_list = track_ids_for_import(
            profile,
            import_mode,
            include_chords=include_chords,
            explicit_track_ids=explicit_track_ids,
            max_voices=max_parts,
        )
        part_by_index = {index: part for index, part in enumerate(parts)}
        for track_id in id_list:
            part = part_by_index.get(track_id)
            if part is None:
                continue
            if _is_drum_part(part) and not include_drums:
                continue
            keep.append(part)
            kept_indices.append(track_id)
        keep = keep[:max_parts]
        kept_indices = kept_indices[:max_parts]

    if not keep:
        ranked = []
        for index, part in enumerate(parts):
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
            ranked.append(((mono, pitch_sum / max(pitch_count, 1), len(notes)), part, index))
        ranked.sort(key=lambda item: item[0], reverse=True)
        keep = [part for priority, part, index in ranked[:max_parts]]
        kept_indices = [index for priority, part, index in ranked[:max_parts]]

    if not keep:
        for index, part in enumerate(parts):
            if not _is_drum_part(part):
                keep = [part]
                kept_indices = [index]
                break
        if not keep:
            keep = [parts[0]]
            kept_indices = [0]

    if len(keep) == len(parts):
        _apply_part_names_from_profile(keep, kept_indices, profile)
        return score, keep

    cleaned = stream.Score()
    if score.metadata is not None:
        cleaned.metadata = score.metadata
    for part in keep:
        cleaned.insert(0, part)
    _apply_part_names_from_profile(keep, kept_indices, profile)
    return cleaned, keep


def _apply_part_names_from_profile(
    kept_parts: list,
    kept_indices: list[int],
    profile: MidiProfile | None,
) -> None:
    if not profile or not kept_parts:
        return
    from midi_to_abc import display_name_for_track

    track_by_index = {track.index: track for track in profile.tracks}
    for voice_id, track_index in enumerate(kept_indices, start=1):
        if voice_id - 1 >= len(kept_parts):
            break
        part = kept_parts[voice_id - 1]
        track = track_by_index.get(track_index)
        name = display_name_for_track(track, voice_id, track.name if track else "")
        try:
            part.partName = name
        except Exception:
            pass
        try:
            for inst in part.recurse().getElementsByClass("Instrument"):
                inst.instrumentName = name
        except Exception:
            pass


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


def _best_quantize_divisors(
    score,
    *,
    rhythm_detail: str = "standard",
    quant_strength: float = 0.7,
) -> tuple[int, ...]:
    candidate_sets = RHYTHM_DETAIL_CANDIDATES.get(rhythm_detail, RHYTHM_DETAIL_CANDIDATES["standard"])
    best: tuple[int, ...] = candidate_sets[0]
    best_error = float("inf")
    scored: list[tuple[float, int, tuple[int, ...]]] = []
    for divisors in candidate_sets:
        err = _quantize_error(score, divisors)
        scored.append((err, len(divisors), divisors))
        if err < best_error:
            best_error = err
            best = divisors

    strength = max(0.0, min(1.0, float(quant_strength or 0.7)))
    if strength < 0.85:
        tolerance = NOTATION_BIAS_TOLERANCE + (0.85 - strength) * 0.08
        scored.sort(key=lambda item: (item[0], item[1]))
        for err, _count, divisors in scored:
            if err <= best_error + tolerance:
                return divisors
    return best


def _quantize_score(
    score,
    *,
    rhythm_detail: str = "standard",
    quant_strength: float = 0.7,
) -> tuple[float, tuple[int, ...]]:
    divisors = _best_quantize_divisors(
        score,
        rhythm_detail=rhythm_detail,
        quant_strength=quant_strength,
    )
    try:
        score.quantize(
            quarterLengthDivisors=list(divisors),
            processOffsets=True,
            processDurations=True,
            inPlace=True,
        )
        return _quantize_error(score, divisors), divisors
    except Exception:
        return 1.0, divisors


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


def _trim_leading_silence(score, profile: MidiProfile | None = None) -> None:
    trim_to = 0.0
    if profile is not None:
        downbeats = getattr(profile, "downbeat_times", None) or []
        beats = getattr(profile, "beat_times", None) or []
        if downbeats:
            trim_to = max(0.0, float(downbeats[0]))
        elif beats:
            trim_to = max(0.0, float(beats[0]))
    if trim_to <= 0.001:
        first_offset = None
        for el in score.recurse().notes:
            off = float(getattr(el, "offset", 0) or 0)
            first_offset = off if first_offset is None else min(first_offset, off)
        trim_to = first_offset or 0.0
    if trim_to <= 0.05:
        return
    for el in score.recurse().notesAndRests:
        el.offset = float(getattr(el, "offset", 0) or 0) - trim_to


def _align_score_to_profile(score, profile: MidiProfile | None) -> None:
    if score is None:
        return
    try:
        _trim_leading_silence(score, profile)
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
    rhythm_detail: str = "standard",
    quant_strength: float = 0.7,
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
    _align_score_to_profile(simplified, profile)
    quant_error, divisors = _quantize_score(
        simplified,
        rhythm_detail=rhythm_detail,
        quant_strength=quant_strength,
    )
    return simplified, {
        "quant_error": round(quant_error, 4),
        "quant_divisors": ",".join(str(value) for value in divisors),
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
    rhythm_detail: str = "standard",
    quant_strength: float = 0.7,
) -> tuple[str, dict[str, Any]]:
    simplified, diagnostics = simplify_midi_score_for_notation(
        score,
        profile,
        mode,
        include_chords=include_chords,
        explicit_track_ids=explicit_track_ids,
        include_drums=include_drums,
        max_parts=max_parts,
        rhythm_detail=rhythm_detail,
        quant_strength=quant_strength,
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
    rhythm_detail: str = "standard",
    quant_strength: float = 0.7,
) -> tuple[str, dict[str, Any]]:
    from music21 import converter

    if profile is None:
        profile = analyze_midi_bytes(midi_bytes, filename)
    divisors = _best_quantize_divisors(
        converter.parseData(midi_bytes, quarterLengthDivisors=(4, 8, 3, 6)),
        rhythm_detail=rhythm_detail,
        quant_strength=quant_strength,
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
        rhythm_detail=rhythm_detail,
        quant_strength=quant_strength,
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
