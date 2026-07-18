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
        "musicType": "vocal",
        "melodyVoicing": "",
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


def _prefer_highest_in_chords(config):
    voicing = str((config or {}).get("melodyVoicing") or "").strip().lower()
    if voicing in ("full",):
        return False
    if voicing in ("melody-line", "melody_line", "melodyline"):
        return True
    if str((config or {}).get("musicType") or "").lower() == "piano":
        return False
    return True


def _track_kong(audio_path, config=None):
    """ByteDance high-resolution piano transcription → note events."""
    from midi_note_events import midi_bytes_to_note_events

    prefer_highest = _prefer_highest_in_chords(config)
    # Local package first.
    try:
        from piano_transcription_inference import PianoTranscription, sample_rate, load_audio

        audio, _ = load_audio(audio_path, sr=sample_rate, mono=True)
        device = "cuda"
        try:
            import torch
            if not torch.cuda.is_available():
                device = "cpu"
        except Exception:
            device = "cpu"
        checkpoint_path = (
            os.getenv("KONG_CHECKPOINT_PATH", "").strip()
            or os.path.join(
                os.getenv("KONG_MODEL_DIR", "/opt/kong-piano").strip() or "/opt/kong-piano",
                "note_F1=0.9677_pedal_F1=0.9186.pth",
            )
        )
        if not os.path.isfile(checkpoint_path):
            checkpoint_path = None
        transcriptor = PianoTranscription(device=device, checkpoint_path=checkpoint_path)
        with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as handle:
            midi_path = handle.name
        try:
            transcriptor.transcribe(audio, midi_path)
            with open(midi_path, "rb") as handle:
                midi_bytes = handle.read()
        finally:
            try:
                os.unlink(midi_path)
            except FileNotFoundError:
                pass
        notes = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=prefer_highest)
        if notes:
            return notes, [dict(row) for row in notes], "kong"
    except Exception:
        pass

    # Optional Replicate fallback.
    if os.getenv("MELODY_AMT_PROVIDER", "").strip().lower() != "replicate":
        return None, None, None
    api_key = os.getenv("REPLICATE_API_TOKEN") or os.getenv("REPLICATE_API_KEY") or ""
    if not api_key:
        return None, None, None
    try:
        from provider_amt_cloud import transcribe_kong_replicate_sync

        with open(audio_path, "rb") as handle:
            audio_bytes = handle.read()
        midi_bytes = transcribe_kong_replicate_sync(audio_bytes, os.path.basename(audio_path), api_key)
        notes = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=prefer_highest)
        if not notes:
            return None, None, None
        return notes, [dict(row) for row in notes], "kong-replicate"
    except Exception:
        return None, None, None


def _track_mt3(audio_path, config=None):
    """Local MT3 / YourMT3 via mt3-infer when installed; optional Replicate fallback."""
    from midi_note_events import midi_bytes_to_note_events

    prefer_highest = _prefer_highest_in_chords(config)
    try:
        from mt3_infer import transcribe

        model_name = os.getenv("MELODY_MT3_MODEL", "yourmt3")
        midi = transcribe(audio_path, model=model_name)
        midi_bytes = None
        if hasattr(midi, "write"):
            buf = io.BytesIO()
            midi.write(buf)
            midi_bytes = buf.getvalue()
        elif isinstance(midi, (bytes, bytearray)):
            midi_bytes = bytes(midi)
        elif isinstance(midi, str) and os.path.exists(midi):
            with open(midi, "rb") as handle:
                midi_bytes = handle.read()
        if midi_bytes:
            notes = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=prefer_highest)
            if notes:
                return notes, [dict(row) for row in notes], "mt3-" + str(model_name)
    except Exception:
        pass

    if os.getenv("MELODY_AMT_PROVIDER", "").strip().lower() != "replicate":
        return None, None, None
    api_key = os.getenv("REPLICATE_API_TOKEN") or os.getenv("REPLICATE_API_KEY") or ""
    if not api_key:
        return None, None, None
    try:
        from provider_amt_cloud import transcribe_mt3_replicate_sync

        with open(audio_path, "rb") as handle:
            audio_bytes = handle.read()
        midi_bytes = transcribe_mt3_replicate_sync(
            audio_bytes,
            os.path.basename(audio_path),
            api_key,
            model_type=os.getenv("MELODY_MT3_REPLICATE_TYPE", "mt3"),
        )
        notes = midi_bytes_to_note_events(midi_bytes, prefer_highest_in_chords=prefer_highest)
        if not notes:
            return None, None, None
        return notes, [dict(row) for row in notes], "mt3-replicate"
    except Exception:
        return None, None, None


def _filter_note_events(notes, config):
    threshold = float(config.get("confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD))
    min_note_seconds = float(config.get("minNoteSeconds", DEFAULT_MIN_NOTE_SECONDS))
    return [
        note for note in notes
        if (note["end"] - note["start"]) >= min_note_seconds and note.get("confidence", 0) >= threshold
    ]


def _result_from_note_events(notes, candidates, duration, backend, separated, separation_backend, config):
    if separated and separation_backend:
        backend = separation_backend + "+" + backend
    filtered = _filter_note_events(notes, config)
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
        from chord_processing import format_key_signature_short
        from music21 import note, pitch, stream

        score = stream.Stream()
        for row in notes:
            n = note.Note()
            n.pitch = pitch.Pitch()
            n.pitch.midi = int(row["midi"])
            n.duration.quarterLength = max(0.25, float(row["end"]) - float(row["start"]))
            score.append(n)
        detected = score.analyze("key")
        try:
            tonic_name = detected.tonic.name
            mode = detected.mode or "major"
            root = tonic_name.replace("-", "b")
            if mode == "minor":
                return root + "m"
            return root
        except Exception:
            return format_key_signature_short(str(detected))
    except Exception:
        return ""


def _resolve_backend(config):
    requested = str(config.get("melodyBackend") or os.getenv("MELODY_BACKEND", "auto")).lower()
    if requested in ("basic-pitch", "basic_pitch", "basicpitch"):
        return "basic-pitch"
    if requested in ("kong", "piano-transcription", "piano_transcription", "bytedance"):
        return "kong"
    if requested in ("mt3", "yourmt3", "mr-mt3", "mr_mt3"):
        return "mt3"
    if requested in ("crepe", "pyin", "librosa-pyin"):
        return requested
    # auto: route by music type when present
    music_type = str(config.get("musicType") or "").lower()
    if music_type == "piano":
        return "kong-auto"
    if music_type in ("multi", "multi-instrument", "band"):
        return "mt3-auto"
    return "auto"


def _should_separate_for_backend(config, backend_choice):
    if backend_choice in ("kong", "kong-auto", "mt3", "mt3-auto"):
        # AMT models prefer instrumental / piano mixes already prepared upstream.
        return False
    return _should_separate(config)


def _detect(audio_path, config):
    import librosa

    backend_choice = _resolve_backend(config)
    working_path = audio_path
    separated = False
    separation_backend = None
    if _should_separate_for_backend(config, backend_choice):
        working_path, separated, separation_backend = _isolate_vocal_stem(audio_path)

    y, sr = librosa.load(working_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    if backend_choice in ("kong", "kong-auto"):
        notes, candidates, amt_backend = _track_kong(working_path, config)
        if notes is not None:
            return _result_from_note_events(
                notes, candidates, duration, amt_backend, separated, separation_backend, config
            )
        if backend_choice == "kong":
            backend_choice = "basic-pitch"
        else:
            backend_choice = "auto"

    if backend_choice in ("mt3", "mt3-auto"):
        notes, candidates, amt_backend = _track_mt3(working_path, config)
        if notes is not None:
            return _result_from_note_events(
                notes, candidates, duration, amt_backend, separated, separation_backend, config
            )
        if backend_choice == "mt3":
            backend_choice = "basic-pitch"
        else:
            backend_choice = "auto"

    if backend_choice in ("basic-pitch", "auto"):
        notes, candidates, basic_backend = _track_basic_pitch(working_path)
        if notes is not None:
            return _result_from_note_events(
                notes, candidates, duration, basic_backend, separated, separation_backend, config
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
            "melodyVoicing": config.get("melodyVoicing") or ("full" if not _prefer_highest_in_chords(config) else "melody-line"),
            "musicType": config.get("musicType"),
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
