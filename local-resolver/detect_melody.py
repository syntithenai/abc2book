import contextlib
import io
import json
import os
import sys
import tempfile

import numpy as np


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
DEFAULT_MIN_NOTE_SECONDS = 0.12
DEFAULT_CONFIDENCE_THRESHOLD = 0.55


def _load_config(argv):
    config = {
        "sourceSeparation": os.getenv("MELODY_SOURCE_SEPARATION", "auto"),
        "noiseMode": "balanced",
        "confidenceThreshold": float(os.getenv("MELODY_CONFIDENCE_THRESHOLD", DEFAULT_CONFIDENCE_THRESHOLD)),
        "minNoteSeconds": float(os.getenv("MELODY_MIN_NOTE_SECONDS", DEFAULT_MIN_NOTE_SECONDS)),
        "quantizeStrength": 0.7,
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


def _hz_to_midi(hz):
    if hz is None:
        return None
    value = float(hz)
    if value <= 0 or np.isnan(value):
        return None
    return int(round(69 + 12 * np.log2(value / 440.0)))


def _midi_name(midi):
    midi = int(midi)
    return NOTE_NAMES[midi % 12] + str((midi // 12) - 1)


def _should_separate(config):
    mode = str(config.get("sourceSeparation", "auto")).lower()
    if mode == "off":
        return False
    if mode == "on":
        return True
    return True


def _melody_device():
    preference = os.getenv("MELODY_BACKEND_PREFERENCE", "auto").lower()
    if preference == "cpu":
        return "cpu"
    try:
        import torch

        if torch.cuda.is_available() and preference in ("gpu", "auto", "cuda"):
            return "cuda"
    except Exception:
        pass
    return "cpu"


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


def _quantize_time(value, beat_times, strength):
    if not beat_times:
        return float(value)
    nearest = min(beat_times, key=lambda beat: abs(float(beat) - float(value)))
    strength = max(0.0, min(1.0, float(strength)))
    return float(value) * (1.0 - strength) + float(nearest) * strength


def _segment_notes(times, frequency, confidence, config):
    min_note_seconds = float(config.get("minNoteSeconds", DEFAULT_MIN_NOTE_SECONDS))
    threshold = float(config.get("confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD))
    beat_times = config.get("beatTimes") or []
    quantize_strength = float(config.get("quantizeStrength", 0.7))

    notes = []
    noise = []
    candidates = []
    current = None

    def flush_note():
        nonlocal current
        if not current:
            return
        candidates.append(dict(current))
        length = current["end"] - current["start"]
        if length >= min_note_seconds and current.get("confidence", 0) >= threshold:
            notes.append(current)
        elif length > 0:
            noise.append({
                "start": current["start"],
                "end": current["end"],
                "reason": "low-confidence",
            })
        current = None

    for index, hz in enumerate(frequency):
        time = float(times[index])
        conf = float(confidence[index]) if confidence is not None else 0.0
        midi = _hz_to_midi(hz) if conf >= threshold * 0.5 else None

        if midi is None:
            flush_note()
            continue

        if current and current["midi"] == midi:
            current["end"] = time
            current["confidence"] = max(current["confidence"], conf)
            continue

        flush_note()
        current = {
            "start": _quantize_time(time, beat_times, quantize_strength),
            "end": time,
            "midi": midi,
            "name": _midi_name(midi),
            "confidence": conf,
        }

    flush_note()

    if beat_times:
        for note in notes:
            note["start"] = _quantize_time(note["start"], beat_times, quantize_strength)
            note["end"] = _quantize_time(note["end"], beat_times, quantize_strength)

    return notes, noise, candidates


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
        from music21 import pitch, stream, note

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


def _detect(audio_path, config):
    import librosa

    working_path = audio_path
    separated = False
    separation_backend = None
    if _should_separate(config):
        working_path, separated, separation_backend = _isolate_vocal_stem(audio_path)

    y, sr = librosa.load(working_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    backend = "librosa-pyin"
    try:
        times, frequency, confidence, backend = _track_crepe(y, sr, config)
    except Exception:
        times, frequency, confidence, backend = _track_pyin(y, sr)

    notes, noise, candidates = _segment_notes(times, frequency, confidence, config)
    silences = _detect_silences(notes, duration)
    detected_key = config.get("detectedKey") or _detect_key_from_notes(notes)

    if separated and separation_backend:
        backend = separation_backend + "+" + backend

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
            "noiseMode": config.get("noiseMode"),
            "confidenceThreshold": config.get("confidenceThreshold"),
            "minNoteSeconds": config.get("minNoteSeconds"),
            "quantizeStrength": config.get("quantizeStrength"),
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
