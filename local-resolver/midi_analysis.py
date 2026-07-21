"""Analyze MIDI bytes for import routing (melody vs multi-voice vs reject)."""

from __future__ import annotations

import io
import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any

ABCBOOK_META_RE = re.compile(r"abcbook:version=(\d+)", re.I)
MELODY_NAME_RE = re.compile(r"melody|lead|voice\s*1|v:\s*1|soprano|treble", re.I)
CHORD_NAME_RE = re.compile(r"chord|accomp|harmony|pad|guitar|piano", re.I)
BASS_NAME_RE = re.compile(r"bass|cello|tuba|baritone", re.I)

KEY_PROFILES = {
    "C": [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "G": [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 6.35],
    "D": [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 6.35, 2.29, 2.88],
    "A": [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 6.35, 2.39, 3.66, 2.29, 2.88],
    "E": [2.88, 2.23, 3.48, 2.33, 4.38, 6.35, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "B": [2.88, 2.23, 3.48, 2.33, 6.35, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "F#": [2.88, 2.23, 3.48, 6.35, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "F": [2.88, 2.23, 6.35, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "Bb": [2.88, 6.35, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "Eb": [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    "Ab": [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 6.35, 5.19, 2.39, 3.66, 2.29, 2.88],
    "Db": [2.88, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 6.35, 3.66, 2.29, 2.88],
}


@dataclass
class MidiTrackProfile:
    index: int
    name: str = ""
    is_drum: bool = False
    program: int = 0
    note_count: int = 0
    chord_event_count: int = 0
    monophony_score: float = 0.0
    mean_pitch: float = 0.0
    min_pitch: int = 0
    max_pitch: int = 0
    pitch_range: int = 0
    notes_per_second: float = 0.0
    role_hint: str = "unknown"  # melody | harmony | bass | drum | unknown


@dataclass
class MidiProfile:
    tracks: list[MidiTrackProfile] = field(default_factory=list)
    recommended_mode: str = "melody"  # melody | multi_voice | reject
    routing_hint: str = "melody"  # melody | multi_voice | ambiguous | reject
    recommended_track_ids: list[int] = field(default_factory=list)
    tempo_bpm: float = 120.0
    time_signature: str = "4/4"
    beats_per_bar: int = 4
    estimated_key: str = "C"
    source_hint: str = "unknown"  # abcjs_export | general_midi | abcbook_export | unknown
    title: str = ""
    duration_seconds: float = 0.0
    total_pitched_notes: int = 0
    reject_reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _pitch_class_histogram(notes: list[dict[str, Any]]) -> list[float]:
    hist = [0.0] * 12
    for note in notes:
        midi = int(note.get("midi", 0))
        if midi <= 0:
            continue
        hist[midi % 12] += 1.0
    total = sum(hist) or 1.0
    return [value / total for value in hist]


def estimate_key_from_notes(notes: list[dict[str, Any]]) -> str:
    hist = _pitch_class_histogram(notes)
    if sum(hist) <= 0:
        return "C"
    best_key = "C"
    best_corr = -2.0
    for key, profile in KEY_PROFILES.items():
        corr = sum(hist[i] * profile[i] for i in range(12))
        if corr > best_corr:
            best_corr = corr
            best_key = key
    return best_key


def _role_hint_from_name(name: str) -> str:
    text = str(name or "").strip()
    if not text:
        return "unknown"
    if MELODY_NAME_RE.search(text):
        return "melody"
    if BASS_NAME_RE.search(text):
        return "bass"
    if CHORD_NAME_RE.search(text):
        return "harmony"
    return "unknown"


def _track_metrics_from_notes(
    index: int,
    name: str,
    is_drum: bool,
    program: int,
    notes: list[Any],
    duration: float,
) -> MidiTrackProfile:
    profile = MidiTrackProfile(index=index, name=name, is_drum=is_drum, program=program)
    if is_drum or not notes:
        profile.role_hint = "drum" if is_drum else "unknown"
        return profile

    pitches: list[int] = []
    mono_score = 0.0
    chord_events = 0
    starts: dict[float, int] = {}
    for note in notes:
        if getattr(note, "isChord", False):
            chord_pitches = list(getattr(note, "pitches", ()) or ())
            for pitch_obj in chord_pitches:
                midi_val = int(getattr(pitch_obj, "midi", 0) or 0)
                if midi_val > 0:
                    pitches.append(midi_val)
            start = round(float(getattr(note, "offset", getattr(note, "start", 0)) or 0), 3)
            starts[start] = starts.get(start, 0) + max(len(chord_pitches), 1)
            continue
        pitch_attr = getattr(note, "pitch", getattr(note, "midi", 0))
        if hasattr(pitch_attr, "midi"):
            pitch = int(pitch_attr.midi)
        else:
            pitch = int(pitch_attr or 0)
        if pitch <= 0:
            continue
        pitches.append(pitch)
        start = round(float(getattr(note, "offset", getattr(note, "start", 0)) or 0), 3)
        starts[start] = starts.get(start, 0) + 1

    if not pitches:
        return profile

    profile.note_count = len(pitches)
    for count in starts.values():
        if count > 1:
            chord_events += 1
            mono_score += 1.0 / count
        else:
            mono_score += 1.0
    profile.chord_event_count = chord_events
    profile.monophony_score = mono_score / max(len(pitches), 1)
    profile.mean_pitch = sum(pitches) / len(pitches)
    profile.min_pitch = min(pitches)
    profile.max_pitch = max(pitches)
    profile.pitch_range = profile.max_pitch - profile.min_pitch
    profile.notes_per_second = len(pitches) / max(duration, 0.25)
    profile.role_hint = _role_hint_from_name(name)

    if profile.monophony_score >= 0.85 and profile.mean_pitch >= 60:
        profile.role_hint = profile.role_hint if profile.role_hint != "unknown" else "melody"
    elif profile.monophony_score < 0.5 or chord_events > len(pitches) * 0.4:
        profile.role_hint = profile.role_hint if profile.role_hint != "unknown" else "harmony"
    if profile.mean_pitch < 55 and profile.monophony_score >= 0.7:
        profile.role_hint = "bass"

    return profile


def _analyze_with_pretty_midi(midi_bytes: bytes) -> MidiProfile | None:
    try:
        import pretty_midi
    except Exception:
        return None

    try:
        pm = pretty_midi.PrettyMIDI(io.BytesIO(midi_bytes))
    except Exception:
        return None

    profile = MidiProfile()
    profile.duration_seconds = float(getattr(pm, "get_end_time", lambda: 0)() or 0)
    if pm.get_tempo_changes()[1].size:
        profile.tempo_bpm = float(pm.get_tempo_changes()[1][0])
    ts = pm.time_signature_changes
    if ts:
        profile.time_signature = f"{ts[0].numerator}/{ts[0].denominator}"
        profile.beats_per_bar = int(ts[0].numerator)

    meta_text = " ".join(str(getattr(pm, "text", "") or ""))
    if ABCBOOK_META_RE.search(meta_text):
        profile.source_hint = "abcbook_export"
    for text in (getattr(pm, "text", None),):
        if text and "abcjs" in str(text).lower():
            profile.source_hint = "abcjs_export"

    all_notes: list[dict[str, Any]] = []
    piano_programs = 0
    duplicate_chord_tracks = 0
    pitched_tracks = 0

    for index, instrument in enumerate(pm.instruments):
        name = str(getattr(instrument, "name", "") or "")
        is_drum = bool(getattr(instrument, "is_drum", False))
        program = int(getattr(instrument, "program", 0) or 0)
        if program in (0, 1):
            piano_programs += 1
        track = _track_metrics_from_notes(index, name, is_drum, program, instrument.notes, profile.duration_seconds)
        profile.tracks.append(track)
        if not is_drum and track.note_count > 0:
            pitched_tracks += 1
            for note in instrument.notes:
                all_notes.append({
                    "midi": int(note.pitch),
                    "start": float(note.start),
                    "end": float(note.end),
                })

    if profile.source_hint == "unknown" and piano_programs >= max(1, pitched_tracks) and pitched_tracks >= 2:
        profile.source_hint = "abcjs_export"

    harmony_tracks = [t for t in profile.tracks if not t.is_drum and t.role_hint == "harmony"]
    if len(harmony_tracks) >= 2:
        duplicate_chord_tracks = len(harmony_tracks) - 1

    profile.total_pitched_notes = len(all_notes)
    profile.estimated_key = estimate_key_from_notes(all_notes)

    pitched = [t for t in profile.tracks if not t.is_drum and t.note_count > 0]
    if not pitched:
        profile.recommended_mode = "reject"
        profile.routing_hint = "reject"
        profile.reject_reason = "No pitched notes found"
        return profile

    if len(pitched) == 1 or all(t.monophony_score >= 0.9 for t in pitched):
        profile.recommended_mode = "melody"
        profile.routing_hint = "melody"
        profile.recommended_track_ids = [_best_melody_track(pitched)]
        return profile

    # Multi-voice: 2-4 parts with separated pitch ranges
    ranked = sorted(pitched, key=lambda t: (t.monophony_score, t.mean_pitch), reverse=True)
    melody_track = ranked[0]
    others = ranked[1:]
    independent = []
    for track in others:
        if track.role_hint == "harmony" and profile.source_hint == "abcjs_export":
            continue
        if abs(track.mean_pitch - melody_track.mean_pitch) >= 7:
            independent.append(track)
        elif track.monophony_score >= 0.75 and track.role_hint in ("bass", "melody"):
            independent.append(track)

    if 1 <= len(independent) <= 3:
        profile.recommended_mode = "multi_voice"
        profile.routing_hint = "multi_voice"
        ids = [melody_track.index] + [t.index for t in independent[:3]]
        profile.recommended_track_ids = ids[:4]
        return profile

    profile.recommended_mode = "melody"
    profile.routing_hint = "ambiguous"
    profile.recommended_track_ids = [_best_melody_track(pitched)]
    return profile


def _best_melody_track(tracks: list[MidiTrackProfile]) -> int:
    melody_named = [t for t in tracks if t.role_hint == "melody"]
    pool = melody_named or tracks
    ranked = sorted(
        pool,
        key=lambda t: (t.monophony_score, t.mean_pitch, t.note_count),
        reverse=True,
    )
    return ranked[0].index


def harmony_track_ids_for_profile(profile: MidiProfile) -> list[int]:
    pitched = [t for t in profile.tracks if not t.is_drum and t.note_count > 0]
    if len(pitched) == 1 and getattr(profile, "routing_hint", "") == "melody":
        return []
    harmony = [t for t in pitched if t.role_hint == "harmony"]
    if harmony:
        if len(harmony) > 1:
            ranked = sorted(harmony, key=lambda t: (t.mean_pitch, -t.chord_event_count))
        else:
            ranked = sorted(harmony, key=lambda t: (t.chord_event_count, t.note_count), reverse=True)
        return [ranked[0].index]
    polyphonic = [
        t for t in pitched
        if t.chord_event_count > 0
        and t.monophony_score < 0.85
        and t.index not in (profile.recommended_track_ids or [])
    ]
    if polyphonic:
        ranked = sorted(polyphonic, key=lambda t: (t.chord_event_count, t.note_count), reverse=True)
        return [ranked[0].index]
    return []


def track_ids_for_import(
    profile: MidiProfile,
    mode: str | None = None,
    *,
    include_chords: bool = False,
) -> list[int]:
    import_mode = mode or profile.recommended_mode
    if import_mode == "multi_voice":
        return list(profile.recommended_track_ids or [])
    melody_id = (profile.recommended_track_ids or [None])[0]
    if melody_id is None:
        pitched = [t for t in profile.tracks if not t.is_drum and t.note_count > 0]
        melody_id = _best_melody_track(pitched) if pitched else 0
    if not include_chords:
        return [melody_id]
    harm_ids = harmony_track_ids_for_profile(profile)
    ids = [melody_id]
    for track_id in harm_ids:
        if track_id not in ids:
            ids.append(track_id)
    return ids[:2]


def _analyze_with_music21(midi_bytes: bytes) -> MidiProfile | None:
    try:
        from music21 import converter
    except Exception:
        return None
    try:
        score = converter.parseData(midi_bytes)
    except Exception:
        return None

    profile = MidiProfile()
    try:
        profile.duration_seconds = float(score.highestTime)
    except Exception:
        profile.duration_seconds = 0.0
    all_notes: list[dict[str, Any]] = []

    for index, part in enumerate(score.parts):
        is_drum = False
        program = 0
        name = ""
        for inst in part.recurse().getElementsByClass("Instrument"):
            channel = getattr(inst, "midiChannel", None)
            if channel is not None and int(channel) == 9:
                is_drum = True
            name = str(getattr(inst, "instrumentName", "") or name)
        notes = list(part.recurse().notes)
        track = _track_metrics_from_notes(index, name, is_drum, program, notes, max(profile.duration_seconds, 1.0))
        profile.tracks.append(track)
        if not is_drum:
            for el in notes:
                if getattr(el, "isChord", False):
                    for pitch in getattr(el, "pitches", ()) or ():
                        all_notes.append({"midi": pitch.midi})
                elif getattr(el, "isNote", False) and getattr(el, "pitch", None) is not None:
                    all_notes.append({"midi": el.pitch.midi})

    try:
        mm = score.metronomeMarkBoundaries()
        if mm:
            profile.tempo_bpm = float(mm[0][2].number)
    except Exception:
        pass
    try:
        ts = score.getTimeSignatures()
        if ts:
            profile.time_signature = f"{ts[0].numerator}/{ts[0].denominator}"
            profile.beats_per_bar = int(ts[0].numerator)
    except Exception:
        pass

    profile.total_pitched_notes = len(all_notes)
    profile.estimated_key = estimate_key_from_notes(all_notes)
    pitched = [t for t in profile.tracks if not t.is_drum and t.note_count > 0]
    if not pitched:
        profile.recommended_mode = "reject"
        profile.routing_hint = "reject"
        profile.reject_reason = "No pitched notes found"
        return profile
    if len(pitched) >= 2:
        profile.source_hint = "abcjs_export"
    profile.recommended_mode = "melody"
    profile.routing_hint = "ambiguous" if len(pitched) >= 2 else "melody"
    profile.recommended_track_ids = [_best_melody_track(pitched)]
    return profile


def analyze_midi_bytes(midi_bytes: bytes, filename: str = "") -> MidiProfile:
    profile = _analyze_with_pretty_midi(midi_bytes)
    if profile is None or profile.recommended_mode == "reject" or not profile.tracks:
        m21_profile = _analyze_with_music21(midi_bytes)
        if m21_profile is not None:
            profile = m21_profile
    if profile is None:
        profile = MidiProfile()
        profile.recommended_mode = "melody"
        profile.routing_hint = "melody"
        profile.recommended_track_ids = [0]
    if filename and not profile.title:
        profile.title = re.sub(r"\.[^.]+$", "", filename).replace("_", " ").strip()
    return profile
