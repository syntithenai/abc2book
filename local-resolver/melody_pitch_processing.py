import numpy as np


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
DEFAULT_PITCH_TOLERANCE_SEMITONES = 0.55
DEFAULT_MIN_PERSIST_FRAMES = 3


def hz_to_midi(hz):
    if hz is None:
        return None
    value = float(hz)
    if value <= 0 or np.isnan(value):
        return None
    return int(round(69 + 12 * np.log2(value / 440.0)))


def midi_name(midi):
    midi = int(midi)
    return NOTE_NAMES[midi % 12] + str((midi // 12) - 1)


def smooth_frequency_contour(frequency, confidence, window=5):
    values = np.asarray(frequency, dtype=float)
    conf = np.asarray(confidence if confidence is not None else np.ones(len(values)), dtype=float)
    if values.size == 0:
        return values
    radius = max(1, int(window) // 2)
    smoothed = values.copy()
    for index in range(len(values)):
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        chunk = values[start:end]
        weights = conf[start:end]
        mask = (~np.isnan(chunk)) & (chunk > 0) & (weights > 0.05)
        if not np.any(mask):
            smoothed[index] = np.nan
            continue
        smoothed[index] = float(np.median(chunk[mask]))
    return smoothed


def correct_octave_jumps(frequency, confidence, max_jump_semitones=7):
    values = np.asarray(frequency, dtype=float).copy()
    conf = np.asarray(confidence if confidence is not None else np.ones(len(values)), dtype=float)
    previous_midi = None
    for index, hz in enumerate(values):
        if hz is None or np.isnan(hz) or hz <= 0 or conf[index] < 0.1:
            previous_midi = None
            continue
        midi = hz_to_midi(hz)
        if midi is None:
            continue
        if previous_midi is not None and abs(midi - previous_midi) > max_jump_semitones:
            candidates = [midi + shift for shift in (-24, -12, 0, 12, 24)]
            midi = min(candidates, key=lambda candidate: abs(candidate - previous_midi))
            values[index] = 440.0 * (2.0 ** ((midi - 69) / 12.0))
        previous_midi = midi
    return values


def detect_onset_times(y, sr):
    try:
        import librosa

        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="time", backtrack=True)
        return [float(value) for value in onset_frames.tolist()]
    except Exception:
        return []


def _pitch_close(left_midi, right_midi, tolerance_semitones):
    if left_midi is None or right_midi is None:
        return False
    return abs(int(left_midi) - int(right_midi)) <= tolerance_semitones


def segment_notes_from_contour(times, frequency, confidence, config, onset_times=None):
    min_note_seconds = float(config.get("minNoteSeconds", 0.12))
    threshold = float(config.get("confidenceThreshold", 0.55))
    tolerance = float(config.get("pitchToleranceSemitones", DEFAULT_PITCH_TOLERANCE_SEMITONES))
    min_persist_frames = int(config.get("minPersistFrames", DEFAULT_MIN_PERSIST_FRAMES))

    notes = []
    noise = []
    candidates = []
    current = None
    pending = None
    pending_frames = 0

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

    def merge_fragment_into_current(fragment):
        nonlocal current
        if not fragment:
            return
        if not current:
            current = dict(fragment)
            return
        if _pitch_close(current.get("midi"), fragment.get("midi"), tolerance):
            current["end"] = fragment["end"]
            current["confidence"] = max(current.get("confidence", 0), fragment.get("confidence", 0))
            return
        flush_note()
        current = dict(fragment)

    onset_set = set(round(value, 3) for value in (onset_times or []))

    for index, hz in enumerate(frequency):
        time = float(times[index])
        conf = float(confidence[index]) if confidence is not None else 0.0
        midi = hz_to_midi(hz) if conf >= threshold * 0.5 else None

        if midi is None:
            pending = None
            pending_frames = 0
            flush_note()
            continue

        near_onset = any(abs(time - onset) <= 0.04 for onset in onset_set)
        if current and _pitch_close(current.get("midi"), midi, tolerance):
            current["end"] = time
            current["confidence"] = max(current.get("confidence", conf), conf)
            pending = None
            pending_frames = 0
            continue

        if pending and _pitch_close(pending.get("midi"), midi, tolerance):
            pending_frames += 1
            pending["end"] = time
            pending["confidence"] = max(pending.get("confidence", conf), conf)
            if pending_frames >= min_persist_frames or near_onset:
                merge_fragment_into_current(pending)
                pending = None
                pending_frames = 0
            continue

        pending = {
            "start": time,
            "end": time,
            "midi": int(midi),
            "name": midi_name(midi),
            "confidence": conf,
        }
        pending_frames = 1
        if near_onset:
            merge_fragment_into_current(pending)
            pending = None
            pending_frames = 0

    if pending:
        merge_fragment_into_current(pending)
    flush_note()

    merged_notes = []
    for note in notes:
        if merged_notes and _pitch_close(merged_notes[-1].get("midi"), note.get("midi"), tolerance):
            gap = note["start"] - merged_notes[-1]["end"]
            if gap < min_note_seconds:
                merged_notes[-1]["end"] = note["end"]
                merged_notes[-1]["confidence"] = max(merged_notes[-1].get("confidence", 0), note.get("confidence", 0))
                continue
        merged_notes.append(note)

    return merged_notes, noise, candidates
