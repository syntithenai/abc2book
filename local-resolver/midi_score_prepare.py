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


def _absolute_track_messages(track):
    abs_time = 0
    out = []
    for msg in track:
        abs_time += int(getattr(msg, "time", 0) or 0)
        out.append((abs_time, msg))
    return out


def _to_delta_track(abs_messages):
    import mido

    track = mido.MidiTrack()
    prev = 0
    for abs_time, msg in sorted(abs_messages, key=lambda item: (item[0], 0 if item[1].is_meta else 1)):
        copied = msg.copy() if hasattr(msg, "copy") else msg
        copied.time = max(0, int(abs_time) - prev)
        track.append(copied)
        prev = int(abs_time)
    return track


def sustain_accompaniment_track(track, ticks_per_beat: int, *, velocity: int = 78):
    """Rewrite boom-chick accompaniment as sustained chord pads.

    abcjs chord tracks pulse bass/chord hits; chamber guides need long soft
    harmony under the melody so Stable Audio does not lock oom-pah rhythm.
    """
    import mido

    tpb = max(1, int(ticks_per_beat or 480))
    cluster_window = max(1, tpb // 16)  # ~semiquaver grouping
    min_hold = tpb  # at least one beat
    abs_msgs = _absolute_track_messages(track)

    meta_abs = [(t, m) for t, m in abs_msgs if m.is_meta]
    program_abs = [
        (t, m) for t, m in abs_msgs
        if m.type == "program_change" and not _is_drum_channel(getattr(m, "channel", 0))
    ]

    # Collect note onsets (ignore drums).
    onsets: list[tuple[int, int, int, int]] = []  # time, note, channel, velocity
    for abs_time, msg in abs_msgs:
        if msg.type == "note_on" and getattr(msg, "velocity", 0) > 0:
            if _is_drum_channel(getattr(msg, "channel", 0)):
                continue
            onsets.append((abs_time, int(msg.note), int(msg.channel), int(msg.velocity)))

    if not onsets:
        return track

    end_time = max(t for t, _ in abs_msgs)
    # Cluster near-simultaneous attacks into chord changes.
    onsets.sort(key=lambda row: (row[0], row[1]))
    clusters: list[tuple[int, set[int], int]] = []  # start, pitches, channel
    current_t = onsets[0][0]
    pitches: set[int] = set()
    channel = onsets[0][2]
    for abs_time, note, ch, _vel in onsets:
        if abs_time - current_t <= cluster_window:
            pitches.add(note)
            channel = ch
        else:
            if pitches:
                clusters.append((current_t, set(pitches), channel))
            current_t = abs_time
            pitches = {note}
            channel = ch
    if pitches:
        clusters.append((current_t, set(pitches), channel))

    soft = max(1, min(127, int(velocity)))
    note_events: list[tuple[int, object]] = []
    for index, (start, chord_pitches, ch) in enumerate(clusters):
        next_start = clusters[index + 1][0] if index + 1 < len(clusters) else end_time + min_hold
        hold_until = max(start + min_hold, next_start)
        # Leave a tiny gap so FluidSynth retriggers cleanly on chord changes.
        if hold_until >= next_start and index + 1 < len(clusters):
            hold_until = max(start + 1, next_start - max(1, tpb // 32))
        for note in sorted(chord_pitches):
            note_events.append((
                start,
                mido.Message("note_on", note=note, velocity=soft, channel=ch, time=0),
            ))
            note_events.append((
                hold_until,
                mido.Message("note_off", note=note, velocity=0, channel=ch, time=0),
            ))

    combined = meta_abs + program_abs + note_events
    return _to_delta_track(combined)


def prepare_style_guide_midi(
    midi_bytes: bytes,
    *,
    lead_program: int = DEFAULT_LEAD_MIDI_PROGRAM,
    accompaniment_program: int = 24,
    accompaniment_velocity_boost: float = 1.2,
    accompaniment_min_velocity: int = 64,
    lead_velocity_boost: float = 1.15,
    lead_min_velocity: int = 88,
    sustain_accompaniment: bool = False,
    accompaniment_pad_velocity: int = 52,
) -> bytes:
    """Remap melody + accompaniment programs for style-matched FluidSynth guides.

    Melody stays loud and clear. When sustain_accompaniment is set (chamber),
    boom-chick hits become soft sustained pads so init-audio does not lock
    dance-band oom-pah rhythm.
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
        if (not is_lead) and sustain_accompaniment and track_note_counts[index] > 0:
            sustained = sustain_accompaniment_track(
                track,
                mid.ticks_per_beat,
                velocity=accompaniment_pad_velocity,
            )
            new_track = mido.MidiTrack()
            wrote_program = False
            for msg in sustained:
                if msg.type == "program_change" and not _is_drum_channel(getattr(msg, "channel", 0)):
                    copied = msg.copy()
                    copied.program = program
                    new_track.append(copied)
                    wrote_program = True
                else:
                    new_track.append(msg.copy() if hasattr(msg, "copy") else msg)
            if not wrote_program:
                channel = 0
                for msg in sustained:
                    if hasattr(msg, "channel") and not _is_drum_channel(msg.channel):
                        channel = int(msg.channel)
                        break
                new_track.insert(0, mido.Message("program_change", program=program, channel=channel, time=0))
            mid.tracks[index] = new_track
            continue

        new_track = mido.MidiTrack()
        wrote_program = False
        for msg in track:
            if msg.type == "program_change" and not _is_drum_channel(getattr(msg, "channel", 0)):
                copied = msg.copy()
                copied.program = program
                new_track.append(copied)
                wrote_program = True
            elif (
                msg.type in ("note_on", "note_off")
                and not _is_drum_channel(getattr(msg, "channel", 0))
            ):
                copied = msg.copy()
                if msg.type == "note_on" and getattr(msg, "velocity", 0) > 0:
                    if is_lead:
                        boosted = int(round(msg.velocity * lead_velocity_boost))
                        copied.velocity = max(lead_min_velocity, min(127, boosted))
                    else:
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
    sustain_accompaniment: bool = False,
    accompaniment_pad_velocity: int = 52,
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
        source = track
        if sustain_accompaniment and counts[index] > 0:
            source = sustain_accompaniment_track(
                track,
                mid.ticks_per_beat,
                velocity=accompaniment_pad_velocity,
            )
        new_track = mido.MidiTrack()
        wrote_program = False
        for msg in source:
            if msg.type == "program_change" and not _is_drum_channel(getattr(msg, "channel", 0)):
                copied = msg.copy()
                copied.program = program
                new_track.append(copied)
                wrote_program = True
            elif (
                not sustain_accompaniment
                and msg.type == "note_on"
                and getattr(msg, "velocity", 0) > 0
                and not _is_drum_channel(getattr(msg, "channel", 0))
            ):
                copied = msg.copy()
                copied.velocity = max(72, min(127, int(round(msg.velocity * 1.25))))
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
    sustain_accompaniment: bool = False,
    accompaniment_pad_velocity: int = 52,
) -> Path:
    prepared = prepare_style_guide_midi(
        score_path.read_bytes(),
        lead_program=lead_program,
        accompaniment_program=accompaniment_program,
        sustain_accompaniment=sustain_accompaniment,
        accompaniment_pad_velocity=accompaniment_pad_velocity,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(prepared)
    return output_path
