"""MIDI bytes → MusicXML via music21 (shared by /midi2xml and MIDI search)."""

from __future__ import annotations

import asyncio
import os
import tempfile

MAX_MIDI_IMPORT_BYTES = int(os.getenv("MAX_MIDI_IMPORT_BYTES", str(4 * 1024 * 1024)))
MAX_MIDI_IMPORT_PARTS = 2
MIDI_QUANTIZE_DIVISORS = (4, 8, 3, 6)


def _is_drum_part(part) -> bool:
    """True if this part looks like GM percussion (channel 10) or unpitched drums."""
    try:
        from music21 import instrument as m21instrument
    except Exception:
        m21instrument = None

    for inst in part.recurse().getElementsByClass("Instrument"):
        channel = getattr(inst, "midiChannel", None)
        # music21 midiChannel is 0-based; GM drums are channel 10 → 9.
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

    # Unpitched notes only → treat as drums.
    notes = list(part.recurse().notes)
    if notes and all(getattr(n, "isNote", False) is False for n in notes):
        return True
    return False


def _part_melodic_note_count(part) -> int:
    count = 0
    for el in part.recurse().notes:
        if getattr(el, "isChord", False):
            count += len(getattr(el, "pitches", ()) or ())
        elif getattr(el, "isNote", False) and getattr(el, "pitch", None) is not None:
            count += 1
    return count


def _flatten_chords_in_part(part) -> None:
    """Replace chords with the highest pitch note (cleaner ABC for melody import)."""
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


def _keep_top_melodic_parts(score, max_parts=MAX_MIDI_IMPORT_PARTS):
    """Drop drums and keep the busiest 1–2 pitched parts."""
    from music21 import stream

    parts = list(score.parts)
    if not parts:
        return score

    ranked = []
    for part in parts:
        if _is_drum_part(part):
            continue
        ranked.append((_part_melodic_note_count(part), part))
    ranked.sort(key=lambda item: item[0], reverse=True)
    keep = [part for count, part in ranked if count > 0][:max_parts]
    if not keep:
        # All drums or empty: keep first non-drum part, else first part.
        for part in parts:
            if not _is_drum_part(part):
                keep = [part]
                break
        if not keep:
            keep = [parts[0]]

    if len(keep) == len(parts) and len(parts) <= max_parts:
        return score

    cleaned = stream.Score()
    if score.metadata is not None:
        cleaned.metadata = score.metadata
    for part in keep:
        cleaned.insert(0, part)
    return cleaned


def _quantize_score(score) -> None:
    try:
        score.quantize(
            quarterLengthDivisors=list(MIDI_QUANTIZE_DIVISORS),
            processOffsets=True,
            processDurations=True,
            inPlace=True,
        )
    except Exception:
        pass


def simplify_midi_score_for_notation(score):
    """
    Clean a parsed MIDI score before MusicXML export:
    drop drums, keep top melodic parts, flatten chords, quantize.
    """
    if score is None:
        return score
    simplified = _keep_top_melodic_parts(score)
    for part in simplified.parts:
        _flatten_chords_in_part(part)
    _quantize_score(simplified)
    return simplified


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


def write_score_to_musicxml(score) -> str:
    simplified = simplify_midi_score_for_notation(score)
    prepared = _finalize_score_for_musicxml(simplified)
    return _write_prepared_score_to_musicxml(prepared)


def convert_midi_bytes_to_musicxml_sync(midi_bytes: bytes) -> str:
    from music21 import converter

    score = converter.parseData(midi_bytes, quarterLengthDivisors=MIDI_QUANTIZE_DIVISORS)
    return write_score_to_musicxml(score)


async def convert_midi_to_musicxml(midi_bytes: bytes, filename: str = "import.mid") -> str:
    del filename  # reserved for future logging / format hints
    return await asyncio.to_thread(convert_midi_bytes_to_musicxml_sync, midi_bytes)
