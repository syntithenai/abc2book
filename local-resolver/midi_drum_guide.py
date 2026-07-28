"""Beat-locked General MIDI drum guide from TimingContract bar grid."""

from __future__ import annotations

import io
from typing import Any

DEFAULT_GM_PITCHES = {
    "kick": 36,
    "snare": 38,
    "hat": 42,
    "rim": 37,
    "tom": 45,
}


def _slot_times_in_bar(
    bar_start_sec: float,
    bar_end_sec: float,
    beats_per_bar: int,
    pulses_per_beat: list[int],
    swing: float,
) -> list[float]:
    bar_duration = max(0.001, bar_end_sec - bar_start_sec)
    if not pulses_per_beat:
        pulses_per_beat = [1] * max(1, beats_per_bar)
    total_pulses = sum(max(1, int(p)) for p in pulses_per_beat)
    if total_pulses <= 0:
        return [bar_start_sec]

    times: list[float] = []
    pulse_index = 0
    for beat_index, pulses in enumerate(pulses_per_beat):
        pulses = max(1, int(pulses))
        beat_duration = bar_duration / max(1, beats_per_bar)
        for pulse in range(pulses):
            if pulses == 1 or swing <= 0:
                offset = beat_index * beat_duration + (pulse * beat_duration / pulses)
            elif pulses == 2:
                long = beat_duration * (0.5 + swing * 0.5)
                short = beat_duration - long
                offset = beat_index * beat_duration + (0 if pulse == 0 else long)
                _ = short
            else:
                even = beat_duration / pulses
                offset = beat_index * beat_duration + pulse * even
            times.append(bar_start_sec + offset)
            pulse_index += 1
    return times


def build_drum_guide_midi(config: dict[str, Any]) -> bytes:
    """Return Type-0 MIDI bytes for channel-10 drum hits on the bar grid."""
    try:
        import mido
    except ImportError as exc:
        raise RuntimeError("mido is required for drum guide MIDI") from exc

    boundaries = [float(v) for v in (config.get("barBoundariesSec") or [])]
    if len(boundaries) < 2:
        total = float(config.get("totalDurationSec") or 8.0)
        tempo_bpm = float(config.get("tempoBpm") or 120)
        bar_duration = 60.0 / tempo_bpm * 4.0
        bar_count = max(1, int(round(total / bar_duration)))
        boundaries = [i * bar_duration for i in range(bar_count + 1)]

    beats_per_bar = max(1, int(config.get("beatsPerBar") or 4))
    pulses_per_beat = config.get("pulsesPerBeat") or [4] * beats_per_bar
    pulses_per_beat = [max(1, int(p)) for p in pulses_per_beat]
    swing = float(config.get("swing") or 0.0)
    tracks = config.get("tracks") or {}
    gm = dict(DEFAULT_GM_PITCHES)
    gm.update(config.get("gmPitches") or {})

    bar_count = len(boundaries) - 1
    events: list[tuple[float, str, int, int]] = []
    for bar_index in range(bar_count):
        bar_slots = _slot_times_in_bar(
            boundaries[bar_index],
            boundaries[bar_index + 1],
            beats_per_bar,
            pulses_per_beat,
            swing,
        )
        for track_id, hit_slots in tracks.items():
            pitch = int(gm.get(track_id, 36))
            for slot in hit_slots:
                slot_index = int(slot)
                if slot_index < 0 or slot_index >= len(bar_slots):
                    continue
                hit_time = bar_slots[slot_index]
                events.append((hit_time, "note_on", pitch, 90))
                events.append((hit_time + 0.05, "note_off", pitch, 0))

    events.sort(key=lambda item: item[0])
    tempo_bpm = max(40.0, float(config.get("tempoBpm") or 120))
    mid = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    microseconds = int(60_000_000 / tempo_bpm)
    track.append(mido.MetaMessage("set_tempo", tempo=microseconds, time=0))

    last_sec = 0.0
    ticks_per_sec = mid.ticks_per_beat * tempo_bpm / 60.0
    for event_sec, msg_type, pitch, velocity in events:
        delta_ticks = max(0, int(round((event_sec - last_sec) * ticks_per_sec)))
        last_sec = event_sec
        if msg_type == "note_on":
            track.append(mido.Message("note_on", channel=9, note=pitch, velocity=velocity, time=delta_ticks))
        else:
            track.append(mido.Message("note_off", channel=9, note=pitch, velocity=velocity, time=delta_ticks))

    buffer = io.BytesIO()
    mid.save(file=buffer)
    return buffer.getvalue()
