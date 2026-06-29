import contextlib
import io
import json
import os
import sys

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

from chord_processing import post_process_chords


def _load_config(argv):
    config = {
        "detectedKey": "",
        "constrainChordsToKey": os.getenv("CHORD_CONSTRAIN_TO_KEY", "true").strip().lower()
        not in {"0", "false", "no"},
        "chordMinDuration": float(os.getenv("CHORD_MIN_DURATION_SECONDS", "0.35")),
        "chordMedianWindow": int(os.getenv("CHORD_MEDIAN_WINDOW", "3")),
    }
    if len(argv) >= 3 and argv[2]:
        try:
            with open(argv[2], "r", encoding="utf-8") as handle:
                config.update(json.load(handle))
        except Exception:
            pass
    return config


def _normalize_label(label):
    value = str(label or "").strip()
    return "" if value == "N" else value


def _detect(audio_path, config):
    import autochord
    import librosa

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    beat_times = [float(value) for value in librosa.frames_to_time(beat_frames, sr=sr).tolist()]

    segments = []
    for start, end, label in autochord.recognize(audio_path):
        segments.append(
            {
                "start": float(start),
                "end": float(end),
                "label": _normalize_label(label),
            }
        )

    processed = post_process_chords(
        segments,
        key_text=config.get("detectedKey") or config.get("key") or "",
        constrain_to_key=bool(config.get("constrainChordsToKey", True)),
        beat_times=beat_times,
    )

    tempo_value = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    return {
        "segments": processed,
        "beatTimes": beat_times,
        "tempo": tempo_value,
        "duration": duration,
        "backend": "autochord",
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
