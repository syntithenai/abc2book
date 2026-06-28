import contextlib
import io
import json
import sys

import numpy as np


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MIN_NOTE_SECONDS = 0.12


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


def _detect(audio_path):
    import librosa

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    hop_length = 512
    f0, voiced_flag, _voiced_prob = librosa.pyin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr,
        hop_length=hop_length,
    )
    times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop_length)

    notes = []
    current = None

    def flush_note():
        nonlocal current
        if not current:
            return
        length = current["end"] - current["start"]
        if length >= MIN_NOTE_SECONDS:
            notes.append(current)
        current = None

    for index, hz in enumerate(f0):
        time = float(times[index])
        voiced = bool(voiced_flag[index]) if voiced_flag is not None else False
        midi = _hz_to_midi(hz) if voiced else None

        if midi is None:
            flush_note()
            continue

        if current and current["midi"] == midi:
            current["end"] = time
            continue

        flush_note()
        current = {
            "start": time,
            "end": time,
            "midi": midi,
            "name": _midi_name(midi),
        }

    flush_note()

    return {
        "notes": notes,
        "duration": duration,
        "backend": "librosa-pyin",
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: detect_melody.py <audio-path>")

    audio_path = sys.argv[1]
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture):
        result = _detect(audio_path)

    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
