import contextlib
import io
import json
import os
import sys
import tempfile

import numpy as np

from melody_pitch_processing import (
    correct_octave_jumps,
    detect_onset_times,
    hz_to_midi,
    midi_name,
    segment_notes_from_contour,
    smooth_frequency_contour,
)


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
DEFAULT_MIN_NOTE_SECONDS = 0.12
DEFAULT_CONFIDENCE_THRESHOLD = 0.55


def _load_config(argv):
    config = {
        "sourceSeparation": os.getenv("MELODY_SOURCE_SEPARATION", "auto"),
        "melodyBackend": os.getenv("MELODY_BACKEND", "auto"),
        "noiseMode": "balanced",
        "confidenceThreshold": float(os.getenv("MELODY_CONFIDENCE_THRESHOLD", DEFAULT_CONFIDENCE_THRESHOLD)),
        "minNoteSeconds": float(os.getenv("MELODY_MIN_NOTE_SECONDS", DEFAULT_MIN_NOTE_SECONDS)),
        "quantizeStrength": 0.7,
        "snapToScale": False,
        "beatTimes": [],
        "tempo": 0,
        "meter": "",
        "beatsPerBar": 4,
        "detectedKey": "",
        "detectedMeter": "",
        "melodySource": "auto",
    }
    if len(argv) >= 3 and argv[2]:
        try:
            with open(argv[2], "r", encoding="utf-8") as handle:
                config.update(json.load(handle))
        except Exception:
            pass
    noise_presets = {
        "sparse": {"confidenceThreshold": 0.7, "minNoteSeconds": 0.18},
        "balanced": {"confidenceThreshold": 0.55, "minNoteSeconds": 0.12},
        "permissive": {"confidenceThreshold": 0.35, "minNoteSeconds": 0.08},
    }
    preset = noise_presets.get(str(config.get("noiseMode", "balanced")).lower())
    if preset:
        config.update(preset)
    return config


def _should_separate(config):
    mode = str(config.get("sourceSeparation", "auto")).lower()
    if mode == "off":
        return False
    if mode == "on":
        return True
    return True


def _isolate_vocal_stem(audio_path):
    try:
        from stem_separation import separate_stems_to_dir

        output_dir = tempfile.mkdtemp(prefix="melody-stems-")
        result = separate_stems_to_dir(audio_path, output_dir)
        vocal_path = result["paths"].get("vocals")
        if not vocal_path:
            return audio_path, False, None
        return vocal_path, True, result["backend"]
    except Exception:
        return audio_path, False, None


def _track_crepe(y, sr, config):
    import crepe

    device_pref = os.getenv("MELODY_BACKEND_PREFERENCE", "auto").lower()
    if device_pref in ("gpu", "cuda", "auto"):
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", os.getenv("CUDA_VISIBLE_DEVICES", "0"))
    time, frequency, confidence, _ = crepe.predict(
        y,
        sr,
        viterbi=True,
        model_capacity=os.getenv("MELODY_CREPE_MODEL", "medium"),
    )
    return time, frequency, confidence, "crepe"


def _track_pyin(y, sr):
    import librosa

    hop_length = 512
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr,
        hop_length=hop_length,
    )
    times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop_length)
    confidence = np.where(voiced_prob is not None, voiced_prob, np.where(voiced_flag, 0.6, 0.0))
    return times, f0, confidence, "librosa-pyin"


def _track_basic_pitch(audio_path):
    try:
        from basic_pitch.inference import predict

        _, _, note_events = predict(audio_path)
        notes = []
        candidates = []
        for event in note_events:
            start = float(event[0])
            end = float(event[1])
            midi = int(round(float(event[2])))
            amplitude = float(event[3]) if len(event) > 3 else 0.7
            row = {
                "start": start,
                "end": end,
                "midi": midi,
                "name": midi_name(midi),
                "confidence": min(1.0, max(0.05, amplitude)),
            }
            candidates.append(dict(row))
            notes.append(row)
        return notes, candidates, "basic-pitch"
    except Exception:
        return None, None, None


def _detect_silences(notes, duration, min_gap=0.2):
    silences = []
    cursor = 0.0
    for note in sorted(notes, key=lambda row: row["start"]):
        if note["start"] - cursor >= min_gap:
            silences.append({"start": cursor, "end": note["start"]})
        cursor = max(cursor, note["end"])
    if duration - cursor >= min_gap:
        silences.append({"start": cursor, "end": duration})
    return silences


def _detect_key_from_notes(notes):
    if not notes:
        return ""
    try:
        from music21 import note, pitch, stream

        score = stream.Stream()
        for row in notes:
            n = note.Note()
            n.pitch = pitch.Pitch()
            n.pitch.midi = int(row["midi"])
            n.duration.quarterLength = max(0.25, float(row["end"]) - float(row["start"]))
            score.append(n)
        detected = score.analyze("key")
        return str(detected)
    except Exception:
        return ""


def _resolve_backend(config):
    requested = str(config.get("melodyBackend") or os.getenv("MELODY_BACKEND", "auto")).lower()
    if requested in ("basic-pitch", "basic_pitch", "basicpitch"):
        return "basic-pitch"
    if requested in ("crepe", "pyin", "librosa-pyin"):
        return requested
    return "auto"


def _detect(audio_path, config):
    import librosa

    working_path = audio_path
    separated = False
    separation_backend = None
    if _should_separate(config):
        working_path, separated, separation_backend = _isolate_vocal_stem(audio_path)

    y, sr = librosa.load(working_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    backend_choice = _resolve_backend(config)

    if backend_choice in ("basic-pitch", "auto"):
        notes, candidates, basic_backend = _track_basic_pitch(working_path)
        if notes is not None:
            backend = basic_backend
            if separated and separation_backend:
                backend = separation_backend + "+" + backend
            threshold = float(config.get("confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD))
            min_note_seconds = float(config.get("minNoteSeconds", DEFAULT_MIN_NOTE_SECONDS))
            filtered = [
                note for note in notes
                if (note["end"] - note["start"]) >= min_note_seconds and note.get("confidence", 0) >= threshold
            ]
            silences = _detect_silences(filtered, duration)
            detected_key = config.get("detectedKey") or _detect_key_from_notes(filtered)
            return _build_result(
                filtered,
                candidates or notes,
                silences,
                [],
                duration,
                backend,
                separated,
                config,
                detected_key,
            )
        if backend_choice == "basic-pitch":
            backend_choice = "crepe"

    backend = "librosa-pyin"
    try:
        if backend_choice == "pyin":
            times, frequency, confidence, backend = _track_pyin(y, sr)
        else:
            times, frequency, confidence, backend = _track_crepe(y, sr, config)
    except Exception:
        times, frequency, confidence, backend = _track_pyin(y, sr)

    frequency = smooth_frequency_contour(frequency, confidence)
    frequency = correct_octave_jumps(frequency, confidence)
    onset_times = detect_onset_times(y, sr)
    notes, noise, candidates = segment_notes_from_contour(
        times,
        frequency,
        confidence,
        config,
        onset_times=onset_times,
    )
    silences = _detect_silences(notes, duration)
    detected_key = config.get("detectedKey") or _detect_key_from_notes(notes)

    if separated and separation_backend:
        backend = separation_backend + "+" + backend

    return _build_result(notes, candidates, silences, noise, duration, backend, separated, config, detected_key)


def _build_result(notes, candidates, silences, noise, duration, backend, separated, config, detected_key):
    return {
        "notes": notes,
        "candidateNotes": candidates,
        "silences": silences,
        "noise": noise,
        "duration": duration,
        "backend": backend,
        "separated": separated,
        "melodySource": "vocal" if separated else str(config.get("melodySource", "auto")),
        "beatTimes": config.get("beatTimes") or [],
        "downbeatTimes": config.get("downbeatTimes") or [],
        "meterChanges": config.get("meterChanges") or [],
        "beatsPerBar": int(config.get("beatsPerBar") or 4),
        "tempo": float(config.get("tempo") or 0),
        "key": detected_key,
        "meter": config.get("meter") or config.get("detectedMeter") or "",
        "detectedKey": detected_key,
        "detectedMeter": config.get("detectedMeter") or config.get("meter") or "",
        "processing": {
            "sourceSeparation": config.get("sourceSeparation"),
            "melodyBackend": config.get("melodyBackend"),
            "noiseMode": config.get("noiseMode"),
            "confidenceThreshold": config.get("confidenceThreshold"),
            "minNoteSeconds": config.get("minNoteSeconds"),
            "quantizeStrength": config.get("quantizeStrength"),
            "snapToScale": bool(config.get("snapToScale")),
        },
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: detect_melody.py <audio-path> [config-json-path]")

    audio_path = sys.argv[1]
    config = _load_config(sys.argv)
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture):
        result = _detect(audio_path, config)

    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
