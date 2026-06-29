import contextlib
import io
import json
import sys

import numpy as np


def _detect_meter_from_downbeats(downbeat_times, beat_times):
    if not downbeat_times or len(downbeat_times) < 2:
        return "4/4", 4
    intervals = []
    for index in range(1, len(downbeat_times)):
        intervals.append(float(downbeat_times[index]) - float(downbeat_times[index - 1]))
    if not intervals:
        return "4/4", 4
    median = float(np.median(intervals))
    beats_per_bar = 4
    if median > 0 and beat_times:
        beat_interval = None
        if len(beat_times) > 1:
            beat_interval = float(np.median(np.diff(beat_times[: min(32, len(beat_times))])))
        if beat_interval and beat_interval > 0:
            estimate = int(round(median / beat_interval))
            if 2 <= estimate <= 12:
                beats_per_bar = estimate
    return f"{beats_per_bar}/4", beats_per_bar


def _meter_for_beats_per_bar(beats_per_bar):
    safe = int(beats_per_bar) if beats_per_bar else 4
    if safe <= 0:
        safe = 4
    return f"{safe}/4"


def _estimate_beat_interval(beat_times):
    if not beat_times or len(beat_times) < 2:
        return None
    diffs = np.diff(beat_times[: min(64, len(beat_times))])
    diffs = [float(value) for value in diffs if float(value) > 0]
    if not diffs:
        return None
    return float(np.median(diffs))


def _detect_meter_changes(downbeat_times, beat_times, default_beats_per_bar):
    if not downbeat_times or len(downbeat_times) < 2:
        return [
            {
                "start": 0.0,
                "meter": _meter_for_beats_per_bar(default_beats_per_bar),
                "beatsPerBar": int(default_beats_per_bar or 4),
            }
        ]

    beat_interval = _estimate_beat_interval(beat_times)
    if not beat_interval:
        return [
            {
                "start": float(downbeat_times[0]),
                "meter": _meter_for_beats_per_bar(default_beats_per_bar),
                "beatsPerBar": int(default_beats_per_bar or 4),
            }
        ]

    changes = []
    previous_beats = None
    previous_start = None

    for index in range(0, len(downbeat_times) - 1):
        start = float(downbeat_times[index])
        end = float(downbeat_times[index + 1])
        interval = max(0.0, end - start)
        beats = int(round(interval / beat_interval)) if beat_interval > 0 else int(default_beats_per_bar or 4)
        if beats < 2 or beats > 12:
            beats = int(default_beats_per_bar or 4)

        if previous_beats is None:
            previous_beats = beats
            previous_start = start
            continue

        if beats != previous_beats:
            changes.append(
                {
                    "start": float(previous_start),
                    "meter": _meter_for_beats_per_bar(previous_beats),
                    "beatsPerBar": int(previous_beats),
                }
            )
            previous_beats = beats
            previous_start = start

    if previous_beats is None:
        previous_beats = int(default_beats_per_bar or 4)
        previous_start = float(downbeat_times[0])

    changes.append(
        {
            "start": float(previous_start),
            "meter": _meter_for_beats_per_bar(previous_beats),
            "beatsPerBar": int(previous_beats),
        }
    )

    # Ensure downstream consumers always have a change entry from the beginning.
    if changes and changes[0]["start"] > 0:
        changes.insert(
            0,
            {
                "start": 0.0,
                "meter": changes[0]["meter"],
                "beatsPerBar": changes[0]["beatsPerBar"],
            },
        )

    return changes


def _try_madmom_downbeats(audio_path):
    try:
        from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor

        # madmom requires explicit candidate bar lengths; provide a range so the
        # HMM can track varying meters (incl. odd time signatures) across the song.
        proc = DBNDownBeatTrackingProcessor(beats_per_bar=[2, 3, 4, 5, 6, 7], fps=100)
        activations = RNNDownBeatProcessor()(audio_path)
        beats = proc(activations)
        beat_times = []
        downbeat_times = []
        for row in beats:
            time = float(row[0])
            beat_index = int(row[1])
            beat_times.append(time)
            if beat_index == 1:
                downbeat_times.append(time)
        return beat_times, downbeat_times, "madmom-downbeats"
    except Exception:
        return None, None, None


def _try_madmom_beats(audio_path):
    try:
        from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor

        activations = RNNBeatProcessor()(audio_path)
        beats = DBNBeatTrackingProcessor(fps=100)(activations)
        beat_times = [float(value) for value in beats.tolist()]
        downbeat_times = [beat_times[i] for i in range(0, len(beat_times), 4)]
        return beat_times, downbeat_times, "madmom-beats"
    except Exception:
        return None, None, None


def _detect(audio_path):
    import librosa

    beat_times, downbeat_times, backend = _try_madmom_downbeats(audio_path)
    if not beat_times:
        beat_times, downbeat_times, backend = _try_madmom_beats(audio_path)

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    if not beat_times:
        sys.stderr.write("detect_timing: madmom unavailable, using librosa beat_track fallback\n")
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
        beat_times = [float(value) for value in librosa.frames_to_time(beat_frames, sr=sr).tolist()]
        downbeat_times = [beat_times[i] for i in range(0, len(beat_times), 4)]
        backend = "librosa"

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    tempo_value = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    meter, beats_per_bar = _detect_meter_from_downbeats(downbeat_times, beat_times)
    meter_changes = _detect_meter_changes(downbeat_times, beat_times, beats_per_bar)

    return {
        "beatTimes": beat_times,
        "downbeatTimes": downbeat_times,
        "tempo": tempo_value,
        "meter": meter,
        "beatsPerBar": beats_per_bar,
        "meterChanges": meter_changes,
        "detectedKey": "",
        "detectedMeter": meter,
        "duration": duration,
        "backend": backend,
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: detect_timing.py <audio-path>")

    audio_path = sys.argv[1]
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture):
        result = _detect(audio_path)

    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
