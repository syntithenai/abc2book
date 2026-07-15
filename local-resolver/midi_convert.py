"""MIDI bytes → MusicXML via music21 (shared by /midi2xml and MIDI search)."""

from __future__ import annotations

import asyncio
import os
import tempfile

MAX_MIDI_IMPORT_BYTES = int(os.getenv("MAX_MIDI_IMPORT_BYTES", str(4 * 1024 * 1024)))


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
    prepared = _finalize_score_for_musicxml(score)
    return _write_prepared_score_to_musicxml(prepared)


def convert_midi_bytes_to_musicxml_sync(midi_bytes: bytes) -> str:
    from music21 import converter

    score = converter.parseData(midi_bytes, quarterLengthDivisors=(4, 6))
    return write_score_to_musicxml(score)


async def convert_midi_to_musicxml(midi_bytes: bytes, filename: str = "import.mid") -> str:
    del filename  # reserved for future logging / format hints
    return await asyncio.to_thread(convert_midi_bytes_to_musicxml_sync, midi_bytes)
