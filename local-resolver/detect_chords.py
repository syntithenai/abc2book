#!/usr/bin/env python3
"""Chord recognition backends: BTC (preferred), madmom, autochord."""

import contextlib
import io
import json
import os
import sys

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from chord_processing import collapse_chord_label, estimate_key_from_chord_segments, post_process_chords


def _env_bool(name, default=True):
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() not in {"0", "false", "no"}


def _load_config(argv):
    config = {
        "detectedKey": "",
        "constrainChordsToKey": _env_bool("CHORD_CONSTRAIN_TO_KEY", True),
        "chordMinDuration": float(os.getenv("CHORD_MIN_DURATION_SECONDS", "0.35")),
        "chordMedianWindow": int(os.getenv("CHORD_MEDIAN_WINDOW", "3")),
        "chordChangeGrid": os.getenv("CHORD_CHANGE_GRID", "beat").strip().lower() or "beat",
        "beatsPerBar": int(os.getenv("CHORD_BEATS_PER_BAR", "4") or 4),
        "chordChangePenalty": _env_bool("CHORD_CHANGE_PENALTY", True),
        "chordBackend": os.getenv("CHORD_BACKEND", "auto").strip().lower() or "auto",
        "beatTimes": None,
        "tempo": None,
    }
    if len(argv) >= 3 and argv[2]:
        try:
            with open(argv[2], "r", encoding="utf-8") as handle:
                config.update(json.load(handle))
        except Exception:
            pass
    backend = str(config.get("chordBackend") or "auto").strip().lower() or "auto"
    config["chordBackend"] = backend
    return config


def _normalize_label(label):
    return collapse_chord_label(label)


def _beat_times_and_tempo(audio_path, config):
    shared = config.get("beatTimes")
    if isinstance(shared, list) and shared:
        beat_times = [float(value) for value in shared]
        tempo = config.get("tempo")
        if tempo is None:
            tempo = _tempo_from_beats(beat_times)
        return beat_times, float(tempo or 0)

    import librosa

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    beat_times = [float(value) for value in librosa.frames_to_time(beat_frames, sr=sr).tolist()]
    tempo_value = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    return beat_times, tempo_value


def _tempo_from_beats(beat_times):
    if not beat_times or len(beat_times) < 2:
        return 0.0
    intervals = [
        float(beat_times[index + 1]) - float(beat_times[index])
        for index in range(len(beat_times) - 1)
        if float(beat_times[index + 1]) > float(beat_times[index])
    ]
    if not intervals:
        return 0.0
    avg = sum(intervals) / len(intervals)
    if avg <= 0:
        return 0.0
    return 60.0 / avg


def _audio_duration(audio_path):
    import librosa

    return float(librosa.get_duration(path=audio_path))


def _detect_btc(audio_path):
    import btc_chords

    if not btc_chords.is_available():
        raise RuntimeError("BTC checkpoint unavailable")
    segments = btc_chords.recognize(audio_path)
    return [_normalize_segment(segment) for segment in segments], "btc"


def _detect_madmom(audio_path):
    import madmom_chords

    if not madmom_chords.is_available():
        raise RuntimeError("madmom chord backend unavailable")
    segments = madmom_chords.recognize(audio_path)
    return [_normalize_segment(segment) for segment in segments], "madmom"


def _detect_autochord(audio_path):
    import autochord

    segments = []
    for start, end, label in autochord.recognize(audio_path):
        segments.append(
            {
                "start": float(start),
                "end": float(end),
                "label": _normalize_label(label),
            }
        )
    return segments, "autochord"


def _normalize_segment(segment):
    return {
        "start": float(segment["start"]),
        "end": float(segment["end"]),
        "label": _normalize_label(segment.get("label")),
    }


def _backend_chain(requested):
    requested = (requested or "auto").strip().lower() or "auto"
    if requested == "auto":
        return ["btc", "madmom", "autochord"]
    if requested in ("btc", "madmom", "autochord"):
        return [requested]
    raise ValueError(f"Unknown chord backend: {requested}")


def _detect_segments(audio_path, config):
    errors = []
    for backend in _backend_chain(config.get("chordBackend")):
        try:
            if backend == "btc":
                return _detect_btc(audio_path)
            if backend == "madmom":
                return _detect_madmom(audio_path)
            if backend == "autochord":
                return _detect_autochord(audio_path)
        except Exception as exc:
            errors.append(f"{backend}: {exc}")
            if (config.get("chordBackend") or "auto") != "auto":
                raise
            continue
    detail = "; ".join(errors) if errors else "no chord backend available"
    raise RuntimeError(detail)


def _detect(audio_path, config):
    duration = _audio_duration(audio_path)
    beat_times, tempo_value = _beat_times_and_tempo(audio_path, config)
    segments, backend = _detect_segments(audio_path, config)

    key_text = str(config.get("detectedKey") or config.get("key") or "").strip()
    key_source = "tune" if key_text else "none"
    if not key_text:
        estimated = estimate_key_from_chord_segments(segments)
        if estimated:
            key_text = estimated
            key_source = "chords"

    processed = post_process_chords(
        segments,
        key_text=key_text,
        constrain_to_key=bool(config.get("constrainChordsToKey", True)),
        beat_times=beat_times,
        min_duration=float(config.get("chordMinDuration", 0.35)),
        median_window=int(config.get("chordMedianWindow", 3)),
        change_grid=str(config.get("chordChangeGrid") or "beat"),
        beats_per_bar=int(config.get("beatsPerBar") or 4),
        change_penalty=bool(config.get("chordChangePenalty", True)),
    )

    return {
        "segments": processed,
        "beatTimes": beat_times,
        "tempo": tempo_value,
        "duration": duration,
        "backend": backend,
        "detectedKey": key_text,
        "keySource": key_source,
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: detect_chords.py <audio-path> [config-json-path]")

    audio_path = sys.argv[1]
    config = _load_config(sys.argv)
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture):
        result = _detect(audio_path, config)

    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
