"""Prepare notation MIDI for style melody stems (melody-only, lead program)."""

from __future__ import annotations

import io
from pathlib import Path

DEFAULT_LEAD_MIDI_PROGRAM = 40  # violin


def _is_drum_channel(channel: int) -> bool:
    return int(channel) == 9


def prepare_melody_stem_midi(
    midi_bytes: bytes,
    *,
    lead_program: int = DEFAULT_LEAD_MIDI_PROGRAM,
) -> bytes:
    """
    Keep the busiest non-drum melodic track and force its program to lead_program.
    Drops chord/accompaniment tracks so FluidSynth does not render piano pads.
    """
    try:
        import mido
    except ImportError as exc:
        raise RuntimeError("mido is required for MIDI stem preparation") from exc

    program = max(0, min(127, int(lead_program)))
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    if not mid.tracks:
        return midi_bytes

    track_note_counts: list[int] = []
    for track in mid.tracks:
        count = 0
        for msg in track:
            if msg.type == "note_on" and getattr(msg, "velocity", 0) > 0:
                if not _is_drum_channel(getattr(msg, "channel", 0)):
                    count += 1
        track_note_counts.append(count)

    if max(track_note_counts, default=0) <= 0:
        return midi_bytes

    lead_index = track_note_counts.index(max(track_note_counts))
    lead_track = mid.tracks[lead_index]

    out = mido.MidiFile(ticks_per_beat=mid.ticks_per_beat)
    merged = mido.MidiTrack()
    out.tracks.append(merged)

    tempo_written = False
    for msg in lead_track:
        if msg.type == "set_tempo":
            merged.append(msg.copy())
            tempo_written = True
        elif msg.type in ("time_signature", "key_signature"):
            merged.append(msg.copy())

    if not tempo_written:
        for track in mid.tracks:
            for msg in track:
                if msg.type == "set_tempo":
                    merged.append(msg.copy())
                    tempo_written = True
                    break
            if tempo_written:
                break

    merged.append(mido.Message("program_change", program=program, channel=0, time=0))

    for msg in lead_track:
        if msg.is_meta:
            continue
        if msg.type not in ("note_on", "note_off", "pitchwheel", "control_change"):
            continue
        if _is_drum_channel(getattr(msg, "channel", 0)):
            continue
        copied = msg.copy()
        copied.channel = 0
        merged.append(copied)

    buffer = io.BytesIO()
    out.save(file=buffer)
    return buffer.getvalue()


def write_prepared_melody_stem(
    score_path: Path,
    output_path: Path,
    *,
    lead_program: int = DEFAULT_LEAD_MIDI_PROGRAM,
) -> Path:
    midi_bytes = score_path.read_bytes()
    prepared = prepare_melody_stem_midi(midi_bytes, lead_program=lead_program)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(prepared)
    return output_path
