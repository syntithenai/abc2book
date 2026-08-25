"""Prepare notation MIDI for style melody stems (melody-only, lead program)."""

from __future__ import annotations

import io
from pathlib import Path

DEFAULT_LEAD_MIDI_PROGRAM = 40  # violin


def _is_drum_channel(channel: int) -> bool:
    return int(channel) == 9


def _track_note_stats(track) -> tuple[int, float]:
    """Return (note_on_count, average_velocity) for non-drum notes."""
    count = 0
    velocity_sum = 0
    for msg in track:
        if msg.type == "note_on" and getattr(msg, "velocity", 0) > 0:
            if _is_drum_channel(getattr(msg, "channel", 0)):
                continue
            count += 1
            velocity_sum += int(msg.velocity)
    avg = (velocity_sum / count) if count else 0.0
    return count, avg


def _lead_track_index(track_note_counts: list[int], track_avg_velocity: list[float] | None = None) -> int:
    """
    Pick the melody track.

    Chord accompaniment tracks often have *more* note-ons than the melody
    (block chords). Prefer the louder/sparser track when counts diverge.
    """
    if not track_note_counts or max(track_note_counts, default=0) <= 0:
        return 0
    positive = [(i, c) for i, c in enumerate(track_note_counts) if c > 0]
    if len(positive) == 1:
        return positive[0][0]

    # If one track has far more notes, it is usually chords — pick the sparser one.
    counts = [c for _, c in positive]
    sparse_i, sparse_c = min(positive, key=lambda item: item[1])
    busy_i, busy_c = max(positive, key=lambda item: item[1])
    if busy_c >= max(2 * sparse_c, sparse_c + 40):
        return sparse_i

    # Otherwise prefer higher average velocity (melody is usually louder).
    if track_avg_velocity:
        return max(
            positive,
            key=lambda item: (track_avg_velocity[item[0]], item[1]),
        )[0]
    return busy_i


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
    track_avg_velocity: list[float] = []
    for track in mid.tracks:
        count, avg = _track_note_stats(track)
        track_note_counts.append(count)
        track_avg_velocity.append(avg)

    if max(track_note_counts, default=0) <= 0:
        return midi_bytes

    lead_index = _lead_track_index(track_note_counts, track_avg_velocity)
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


def prepare_style_guide_midi(
    midi_bytes: bytes,
    *,
    lead_program: int = DEFAULT_LEAD_MIDI_PROGRAM,
    accompaniment_program: int = 24,
    accompaniment_velocity_boost: float = 1.55,
    accompaniment_min_velocity: int = 78,
) -> bytes:
    """Remap melody + accompaniment programs for style-matched FluidSynth guides.

    Chord tracks are velocity-boosted so init-audio / cover conditioning hears
    harmony changes, not only the lead line.
    """
    try:
        import mido
    except ImportError as exc:
        raise RuntimeError("mido is required for MIDI guide preparation") from exc

    lead = max(0, min(127, int(lead_program)))
    accompaniment = max(0, min(127, int(accompaniment_program)))
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    if not mid.tracks:
        return midi_bytes

    track_note_counts: list[int] = []
    track_avg_velocity: list[float] = []
    for track in mid.tracks:
        count, avg = _track_note_stats(track)
        track_note_counts.append(count)
        track_avg_velocity.append(avg)

    lead_index = _lead_track_index(track_note_counts, track_avg_velocity)

    for index, track in enumerate(mid.tracks):
        is_lead = index == lead_index
        program = lead if is_lead else accompaniment
        new_track = mido.MidiTrack()
        wrote_program = False
        for msg in track:
            if msg.type == "program_change" and not _is_drum_channel(getattr(msg, "channel", 0)):
                copied = msg.copy()
                copied.program = program
                new_track.append(copied)
                wrote_program = True
            elif (
                not is_lead
                and msg.type in ("note_on", "note_off")
                and not _is_drum_channel(getattr(msg, "channel", 0))
            ):
                copied = msg.copy()
                if msg.type == "note_on" and getattr(msg, "velocity", 0) > 0:
                    boosted = int(round(msg.velocity * accompaniment_velocity_boost))
                    copied.velocity = max(accompaniment_min_velocity, min(127, boosted))
                new_track.append(copied)
            else:
                new_track.append(msg.copy() if hasattr(msg, "copy") else msg)
        if not wrote_program and track_note_counts[index] > 0:
            channel = 0
            for msg in track:
                if hasattr(msg, "channel") and not _is_drum_channel(msg.channel):
                    channel = int(msg.channel)
                    break
            new_track.insert(0, mido.Message("program_change", program=program, channel=channel, time=0))
        mid.tracks[index] = new_track

    buffer = io.BytesIO()
    mid.save(file=buffer)
    return buffer.getvalue()


def write_accompaniment_stem_midi(
    score_path: Path,
    output_path: Path,
    *,
    accompaniment_program: int = 24,
) -> Path | None:
    """Write accompaniment-only MIDI (drops the lead track) for chord-heavy guides."""
    try:
        import mido
    except ImportError:
        return None

    mid = mido.MidiFile(file=io.BytesIO(score_path.read_bytes()))
    if len(mid.tracks) < 2:
        return None
    counts = []
    velocities = []
    for track in mid.tracks:
        count, avg = _track_note_stats(track)
        counts.append(count)
        velocities.append(avg)
    lead_index = _lead_track_index(counts, velocities)
    out = mido.MidiFile(ticks_per_beat=mid.ticks_per_beat)
    program = max(0, min(127, int(accompaniment_program)))
    for index, track in enumerate(mid.tracks):
        if index == lead_index and counts[index] > 0 and sum(1 for c in counts if c > 0) > 1:
            # Keep tempo/meta from lead track header if needed via track 0.
            if index == 0:
                meta = mido.MidiTrack()
                for msg in track:
                    if msg.is_meta:
                        meta.append(msg.copy())
                if meta:
                    out.tracks.append(meta)
            continue
        new_track = mido.MidiTrack()
        wrote_program = False
        for msg in track:
            if msg.type == "program_change" and not _is_drum_channel(getattr(msg, "channel", 0)):
                copied = msg.copy()
                copied.program = program
                new_track.append(copied)
                wrote_program = True
            elif msg.type == "note_on" and getattr(msg, "velocity", 0) > 0 and not _is_drum_channel(getattr(msg, "channel", 0)):
                copied = msg.copy()
                copied.velocity = max(85, min(127, int(round(msg.velocity * 1.6))))
                new_track.append(copied)
            else:
                new_track.append(msg.copy() if hasattr(msg, "copy") else msg)
        if not wrote_program and counts[index] > 0:
            new_track.insert(0, mido.Message("program_change", program=program, channel=0, time=0))
        out.tracks.append(new_track)
    if not out.tracks:
        return None
    output_path.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.BytesIO()
    out.save(file=buffer)
    output_path.write_bytes(buffer.getvalue())
    return output_path


def write_style_guide_midi(
    score_path: Path,
    output_path: Path,
    *,
    lead_program: int = DEFAULT_LEAD_MIDI_PROGRAM,
    accompaniment_program: int = 24,
) -> Path:
    prepared = prepare_style_guide_midi(
        score_path.read_bytes(),
        lead_program=lead_program,
        accompaniment_program=accompaniment_program,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(prepared)
    return output_path
