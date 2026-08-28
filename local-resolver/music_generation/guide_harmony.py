"""Build style-aware harmony MIDI from a chord chart (not abcjs boom-chick).

Practice-track AI guides use melody from notation MIDI plus harmony derived from
the client chord chart (chordsPerBar). This replaces abcjs accompaniment tracks
for init-audio conditioning.
"""

from __future__ import annotations

import io
from pathlib import Path

from chord_processing import _parse_chord_label

# MIDI note numbers (C4 = 60)
_CHORD_INTERVALS = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
    "7": (0, 4, 7, 10),
    "maj7": (0, 4, 7, 11),
    "min7": (0, 3, 7, 10),
}

DEFAULT_TICKS_PER_BEAT = 480
# GM programs for chamber layers
CLASSICAL_BASS_PROGRAM = 42  # Cello
CLASSICAL_PAD_PROGRAM = 48  # String Ensemble 1


def _beats_per_bar(meter: str) -> int:
    parts = str(meter or "4/4").split("/")
    try:
        return max(1, int(parts[0]))
    except (TypeError, ValueError):
        return 4


def chord_label_to_midi_pitches(label: str, *, base_octave: int = 3) -> list[int]:
    """Return sorted MIDI pitches for a chord symbol (e.g. G, Em, D7)."""
    parsed = _parse_chord_label(str(label or "").strip())
    if not parsed:
        return []
    root_index = int(parsed["root_index"])
    quality = str(parsed.get("quality") or "maj")
    intervals = _CHORD_INTERVALS.get(quality, _CHORD_INTERVALS["maj"])
    # Scientific octave (C4=60): root at base_octave, e.g. G3=55 when base_octave=3.
    base = 12 * (base_octave + 1) + root_index
    return sorted(base + interval for interval in intervals)


def _chord_for_bar(chords_per_bar: list[str], bar_index: int) -> str:
    if not chords_per_bar:
        return ""
    if bar_index < len(chords_per_bar):
        return str(chords_per_bar[bar_index] or "").strip()
    # Repeated strains: tile the chart.
    return str(chords_per_bar[bar_index % len(chords_per_bar)] or "").strip()


def _bar_tick_range(
    bar_index: int,
    *,
    ticks_per_beat: int,
    beats_per_bar: int,
) -> tuple[int, int]:
    tpb = max(1, int(ticks_per_beat))
    bpb = max(1, int(beats_per_bar))
    start = bar_index * bpb * tpb
    end = start + bpb * tpb
    return start, end


def _classical_voicing(pitches: list[int]) -> tuple[int, list[int]]:
    """Bass root in cello range; closed mid-register triad (avoid muddy low thirds)."""
    if not pitches:
        return 0, []
    root = min(pitches)
    # Drop bass an octave when root is mid-staff (keep cello ~C2–G3).
    bass = root
    while bass > 55:
        bass -= 12
    while bass < 36:
        bass += 12
    pad = []
    for pitch in pitches:
        p = pitch
        # Keep inner voices roughly G3–E5.
        while p < 55:
            p += 12
        while p > 76:
            p -= 12
        if p != bass and p not in pad:
            pad.append(p)
    if not pad:
        pad = [bass + 12, bass + 19]
    return bass, sorted(pad)


def _classical_bar_events(
    pitches: list[int],
    bar_start: int,
    bar_end: int,
    *,
    ticks_per_beat: int,
    pad_velocity: int = 82,
    bass_velocity: int = 74,
) -> list[tuple[int, object]]:
    """Chamber recipe: long cello bass + re-attacked ensemble pads (no boom-chick)."""
    import mido

    if not pitches:
        return []
    bass, pad_pitches = _classical_voicing(pitches)
    tpb = max(1, int(ticks_per_beat))
    bar_len = max(1, bar_end - bar_start)
    # Tiny gap before next bar so FluidSynth retriggers cleanly.
    hold_end = max(bar_start + 1, bar_end - max(1, bar_len // 64))
    # Stagger pad onset ~30ms after bass for attack definition (~t/32 at 120BPM).
    pad_onset = bar_start + max(1, tpb // 32)
    if pad_onset >= hold_end:
        pad_onset = bar_start

    events: list[tuple[int, object]] = []
    events.append((bar_start, mido.Message("note_on", note=bass, velocity=bass_velocity, channel=1, time=0)))
    events.append((hold_end, mido.Message("note_off", note=bass, velocity=0, channel=1, time=0)))
    for pitch in pad_pitches:
        events.append((pad_onset, mido.Message("note_on", note=pitch, velocity=pad_velocity, channel=2, time=0)))
        events.append((hold_end, mido.Message("note_off", note=pitch, velocity=0, channel=2, time=0)))
    return events


def _trad_bar_events(
    pitches: list[int],
    bar_start: int,
    bar_end: int,
    *,
    beats_per_bar: int,
    ticks_per_beat: int,
    velocity: int = 76,
) -> list[tuple[int, object]]:
    """Session-style block strum on downbeat (and mid-bar in 4/4), not oom-pa bass/chick."""
    import mido

    if not pitches:
        return []
    tpb = max(1, int(ticks_per_beat))
    bpb = max(1, int(beats_per_bar))
    bar_len = bar_end - bar_start
    # Downbeat strum; optional backbeat in 4/4.
    strum_beats = [0]
    if bpb >= 4:
        strum_beats.append(2)
    elif bpb == 3:
        strum_beats = [0]  # waltz: chord on 1 only, held
    events: list[tuple[int, object]] = []
    for beat in strum_beats:
        onset = bar_start + beat * tpb
        if onset >= bar_end:
            continue
        if bpb <= 3:
            hold_end = bar_end - max(1, tpb // 16)
        else:
            hold_end = min(bar_end, onset + (bar_len // len(strum_beats)) - max(1, tpb // 32))
        for pitch in pitches:
            events.append((onset, mido.Message("note_on", note=pitch, velocity=velocity, channel=1, time=0)))
            events.append((hold_end, mido.Message("note_off", note=pitch, velocity=0, channel=1, time=0)))
    return events


def build_harmony_events(
    chords_per_bar: list[str],
    *,
    bar_count: int,
    meter: str = "4/4",
    ticks_per_beat: int = DEFAULT_TICKS_PER_BEAT,
    render_style: str = "trad_session",
    accompaniment_program: int = 24,
    bass_program: int | None = None,
    pad_program: int | None = None,
) -> list[tuple[int, object]]:
    """Absolute-tick note events for the harmony track(s)."""
    import mido

    style = str(render_style or "trad_session").lower()
    chamber = style in ("classical", "chamber")
    bpb = _beats_per_bar(meter)
    tpb = max(1, int(ticks_per_beat))
    bass_prog = int(bass_program if bass_program is not None else (
        CLASSICAL_BASS_PROGRAM if chamber else accompaniment_program
    ))
    pad_prog = int(pad_program if pad_program is not None else (
        CLASSICAL_PAD_PROGRAM if chamber else accompaniment_program
    ))
    meta_events: list[tuple[int, object]] = [
        (0, mido.Message("program_change", program=bass_prog, channel=1, time=0)),
    ]
    if chamber:
        meta_events.append((0, mido.Message("program_change", program=pad_prog, channel=2, time=0)))

    note_events: list[tuple[int, object]] = []
    for bar in range(max(0, int(bar_count))):
        label = _chord_for_bar(chords_per_bar, bar)
        if not label:
            continue
        pitches = chord_label_to_midi_pitches(label, base_octave=3)
        if not pitches:
            continue
        bar_start, bar_end = _bar_tick_range(bar, ticks_per_beat=tpb, beats_per_bar=bpb)
        if chamber:
            note_events.extend(
                _classical_bar_events(
                    pitches,
                    bar_start,
                    bar_end,
                    ticks_per_beat=tpb,
                    pad_velocity=82,
                    bass_velocity=74,
                )
            )
        else:
            note_events.extend(
                _trad_bar_events(
                    pitches,
                    bar_start,
                    bar_end,
                    beats_per_bar=bpb,
                    ticks_per_beat=tpb,
                    velocity=78,
                )
            )
    return meta_events + note_events


def _to_delta_track(abs_messages: list[tuple[int, object]]):
    import mido

    track = mido.MidiTrack()
    prev = 0
    for abs_time, msg in sorted(abs_messages, key=lambda item: (item[0], 0 if getattr(item[1], "is_meta", False) else 1)):
        copied = msg.copy() if hasattr(msg, "copy") else msg
        copied.time = max(0, int(abs_time) - prev)
        track.append(copied)
        prev = int(abs_time)
    return track


def _melody_track_from_score(mid_bytes: bytes, *, lead_program: int = 40):
    from midi_score_prepare import prepare_melody_stem_midi

    return prepare_melody_stem_midi(mid_bytes, lead_program=lead_program)


def build_harmony_only_midi(
    chords_per_bar: list[str],
    *,
    bar_count: int,
    meter: str = "4/4",
    tempo_bpm: float = 120,
    render_style: str = "trad_session",
    accompaniment_program: int = 24,
    ticks_per_beat: int = DEFAULT_TICKS_PER_BEAT,
) -> bytes:
    """Harmony-only Type-1 MIDI for separate FluidSynth stem rendering."""
    try:
        import mido
    except ImportError as exc:
        raise RuntimeError("mido is required for guide harmony") from exc

    harmony_events = build_harmony_events(
        chords_per_bar,
        bar_count=bar_count,
        meter=meter,
        ticks_per_beat=ticks_per_beat,
        render_style=render_style,
        accompaniment_program=accompaniment_program,
    )
    out = mido.MidiFile(ticks_per_beat=ticks_per_beat)
    tempo_track = mido.MidiTrack()
    tempo_track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(float(tempo_bpm) or 120), time=0))
    parts = str(meter or "4/4").split("/")
    try:
        numer, denom = int(parts[0]), int(parts[1])
    except (TypeError, ValueError, IndexError):
        numer, denom = 4, 4
    tempo_track.append(mido.MetaMessage("time_signature", numerator=numer, denominator=denom, time=0))
    out.tracks.append(tempo_track)
    out.tracks.append(_to_delta_track(harmony_events))
    buffer = io.BytesIO()
    out.save(file=buffer)
    return buffer.getvalue()


def build_chord_chart_guide_midi(
    score_bytes: bytes,
    chords_per_bar: list[str],
    *,
    bar_count: int,
    meter: str = "4/4",
    tempo_bpm: float = 120,
    render_style: str = "trad_session",
    lead_program: int = 40,
    accompaniment_program: int = 24,
    ticks_per_beat: int = DEFAULT_TICKS_PER_BEAT,
) -> bytes:
    """Merge melody-only notation MIDI with chord-chart harmony."""
    try:
        import mido
    except ImportError as exc:
        raise RuntimeError("mido is required for guide harmony") from exc

    melody_bytes = _melody_track_from_score(score_bytes, lead_program=lead_program)
    melody_mid = mido.MidiFile(file=io.BytesIO(melody_bytes))
    harmony_events = build_harmony_events(
        chords_per_bar,
        bar_count=bar_count,
        meter=meter,
        ticks_per_beat=melody_mid.ticks_per_beat or ticks_per_beat,
        render_style=render_style,
        accompaniment_program=accompaniment_program,
    )

    out = mido.MidiFile(ticks_per_beat=melody_mid.ticks_per_beat or ticks_per_beat)
    for track in melody_mid.tracks:
        out.tracks.append(track)
    out.tracks.append(_to_delta_track(harmony_events))

    buffer = io.BytesIO()
    out.save(file=buffer)
    return buffer.getvalue()


def write_chord_chart_guide_midi(
    score_path: Path,
    output_path: Path,
    chords_per_bar: list[str],
    *,
    bar_count: int,
    meter: str = "4/4",
    tempo_bpm: float = 120,
    render_style: str = "trad_session",
    lead_program: int = 40,
    accompaniment_program: int = 24,
) -> Path:
    prepared = build_chord_chart_guide_midi(
        score_path.read_bytes(),
        chords_per_bar,
        bar_count=bar_count,
        meter=meter,
        tempo_bpm=tempo_bpm,
        render_style=render_style,
        lead_program=lead_program,
        accompaniment_program=accompaniment_program,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(prepared)
    return output_path


def write_harmony_only_midi(
    output_path: Path,
    chords_per_bar: list[str],
    *,
    bar_count: int,
    meter: str = "4/4",
    tempo_bpm: float = 120,
    render_style: str = "trad_session",
    accompaniment_program: int = 24,
) -> Path:
    prepared = build_harmony_only_midi(
        chords_per_bar,
        bar_count=bar_count,
        meter=meter,
        tempo_bpm=tempo_bpm,
        render_style=render_style,
        accompaniment_program=accompaniment_program,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(prepared)
    return output_path


def chords_per_bar_from_plan(plan: dict) -> list[str]:
    raw = plan.get("chordsPerBar")
    if isinstance(raw, list) and raw:
        return [str(c or "").strip() for c in raw]
    timing = plan.get("timing") or {}
    boundaries = timing.get("barBoundariesSec") or []
    bar_count = max(0, len(boundaries) - 1)
    # Flatten section-attached chords if present.
    sections = timing.get("sections") or []
    if not sections:
        return []
    by_bar: dict[int, str] = {}
    for section in sections:
        start = int(section.get("startBar") or 0)
        chords = section.get("chords") or []
        for offset, chord in enumerate(chords):
            if chord:
                by_bar[start + offset] = str(chord).strip()
    if not by_bar:
        return []
    return [by_bar.get(i, "") for i in range(bar_count)]


def guide_harmony_source(plan: dict) -> str:
    """Return 'chord_chart' or 'abcjs'."""
    explicit = str(plan.get("guideHarmonySource") or "").strip().lower()
    if explicit in ("abcjs", "chord_chart"):
        return explicit
    if chords_per_bar_from_plan(plan):
        return "chord_chart"
    return "abcjs"
