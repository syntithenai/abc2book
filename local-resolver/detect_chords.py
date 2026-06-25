import contextlib
import io
import json
import os
import sys

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


def _normalize_label(label):
    value = str(label or "").strip()
    return "" if value == "N" else value


def _detect(audio_path):
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

    tempo_value = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    return {
        "segments": segments,
        "beatTimes": beat_times,
        "tempo": tempo_value,
        "duration": duration,
        "backend": "autochord",
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: detect_chords.py <audio-path>")

    audio_path = sys.argv[1]
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture):
        result = _detect(audio_path)

    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
