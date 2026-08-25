"""Mix melody, optional chord layer, and backing WAVs."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

STRETCH_BPM_DRIFT_THRESHOLD = 0.07
DURATION_TRIM_PAD_THRESHOLD_SEC = 0.5
DURATION_STRETCH_THRESHOLD_SEC = 1.0
BAR_CROSSFADE_MS = 15.0


def _load_mono(path: Path, target_sr: int | None = None) -> tuple[np.ndarray, int]:
    audio, sr = sf.read(str(path), always_2d=True)
    mono = np.mean(audio, axis=1).astype(np.float32)
    if target_sr and sr != target_sr:
        import librosa

        mono = librosa.resample(mono, orig_sr=sr, target_sr=target_sr)
        sr = target_sr
    return mono, sr


def _match_length(audio: np.ndarray, target_samples: int) -> np.ndarray:
    if len(audio) == target_samples:
        return audio
    if len(audio) > target_samples:
        return audio[:target_samples]
    pad = np.zeros(target_samples - len(audio), dtype=audio.dtype)
    return np.concatenate([audio, pad])


def _db_to_gain(db: float) -> float:
    return float(10 ** (db / 20.0))


def stretch_to_duration(audio: np.ndarray, sr: int, target_duration_sec: float) -> np.ndarray:
    import librosa

    current = len(audio) / float(sr)
    target = max(0.1, float(target_duration_sec))
    if current <= 0 or abs(current - target) < 0.02:
        return audio
    rate = current / target
    return librosa.effects.time_stretch(audio, rate=rate)


def _highpass_backing(audio: np.ndarray, sr: int, cutoff_hz: float = 180.0) -> np.ndarray:
    if len(audio) < 8:
        return audio
    try:
        from scipy.signal import butter, sosfiltfilt

        sos = butter(2, cutoff_hz / (sr / 2.0), btype="high", output="sos")
        return sosfiltfilt(sos, audio).astype(np.float32)
    except Exception:
        return audio


def _duck_backing(melody: np.ndarray, backing: np.ndarray, amount: float = 0.4) -> np.ndarray:
    if len(melody) == 0 or len(backing) == 0:
        return backing
    length = min(len(melody), len(backing))
    melody = melody[:length]
    backing = backing[:length].copy()
    window = max(256, int(round(len(melody) / 200)))
    if window % 2 == 0:
        window += 1
    kernel = np.ones(window, dtype=np.float32) / float(window)
    envelope = np.convolve(np.abs(melody), kernel, mode="same")
    peak = float(np.max(envelope)) if len(envelope) else 0.0
    if peak <= 1e-6:
        return backing
    normalized = np.clip(envelope / peak, 0.0, 1.0)
    duck_gain = 1.0 - (normalized * amount)
    return backing * duck_gain


def _crossfade_join(chunks: list[np.ndarray], fade_samples: int) -> np.ndarray:
    if not chunks:
        return np.array([], dtype=np.float32)
    if len(chunks) == 1:
        return chunks[0]
    fade = max(0, int(fade_samples))
    out = chunks[0]
    for chunk in chunks[1:]:
        if fade <= 0 or len(out) < fade or len(chunk) < fade:
            out = np.concatenate([out, chunk])
            continue
        fade_out = np.linspace(1.0, 0.0, fade, dtype=np.float32)
        fade_in = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        blended = out[-fade:] * fade_out + chunk[:fade] * fade_in
        out = np.concatenate([out[:-fade], blended, chunk[fade:]])
    return out


def trim_trailing_silence(
    audio: np.ndarray,
    sr: int,
    *,
    threshold: float = 0.01,
    min_keep_sec: float = 2.0,
) -> tuple[np.ndarray, list[str]]:
    """Drop trailing near-silence so loop tiling does not propagate dead air."""
    notes: list[str] = []
    if len(audio) == 0:
        return audio, notes
    window = max(1, int(round(0.05 * sr)))
    min_keep = max(window, int(round(min_keep_sec * sr)))
    end = len(audio)
    while end > min_keep:
        start = max(0, end - window)
        if float(np.max(np.abs(audio[start:end]))) > threshold:
            break
        end = start
    if end < len(audio):
        notes.append(f"trimmed trailing silence {len(audio) / sr:.2f}s -> {end / sr:.2f}s")
        return audio[:end], notes
    return audio, notes


def fit_audio_to_duration(
    audio: np.ndarray,
    sr: int,
    target_duration_sec: float,
    *,
    bar_boundaries_sec: list[float] | None = None,
) -> tuple[np.ndarray, list[str]]:
    notes: list[str] = []
    target_samples = max(1, int(round(max(0.1, float(target_duration_sec)) * sr)))
    current_samples = len(audio)
    if current_samples == target_samples:
        return audio, notes

    delta_sec = abs(current_samples - target_samples) / float(sr)
    if delta_sec <= DURATION_TRIM_PAD_THRESHOLD_SEC:
        notes.append(f"trim/pad {current_samples / sr:.2f}s -> {target_duration_sec:.2f}s")
        return _match_length(audio, target_samples), notes

    if bar_boundaries_sec and len(bar_boundaries_sec) >= 2:
        fade_samples = max(1, int(round(BAR_CROSSFADE_MS / 1000.0 * sr)))
        bar_samples = []
        for start_idx in range(len(bar_boundaries_sec) - 1):
            start_sec = float(bar_boundaries_sec[start_idx])
            end_sec = float(bar_boundaries_sec[start_idx + 1])
            start_sample = max(0, int(round(start_sec * sr)))
            end_sample = min(len(audio), int(round(end_sec * sr)))
            if end_sample > start_sample:
                bar_samples.append(audio[start_sample:end_sample])
        if bar_samples:
            looped = []
            samples = 0
            while samples < target_samples and bar_samples:
                for bar in bar_samples:
                    looped.append(bar)
                    samples += len(bar)
                    if samples >= target_samples:
                        break
            joined = _crossfade_join(looped, fade_samples)[:target_samples]
            if len(joined) < target_samples:
                joined = _match_length(joined, target_samples)
            notes.append(
                f"tiled {len(bar_samples)} bars with crossfade to {target_duration_sec:.2f}s"
            )
            return joined, notes

    notes.append(f"hard trim/pad {current_samples / sr:.2f}s -> {target_duration_sec:.2f}s")
    return _match_length(audio, target_samples), notes


def tile_backing_loop(
    audio: np.ndarray,
    sr: int,
    target_duration_sec: float,
    *,
    bar_boundaries_sec: list[float] | None = None,
) -> tuple[np.ndarray, list[str]]:
    notes: list[str] = []
    if len(audio) == 0:
        return audio, notes
    trimmed, trim_notes = trim_trailing_silence(audio, sr)
    notes.extend(trim_notes)
    audio = trimmed
    target_samples = max(1, int(round(max(0.1, float(target_duration_sec)) * sr)))
    if len(audio) >= target_samples:
        # If the tail is quiet, prefer tiling the active region instead of keeping silence.
        active, active_notes = trim_trailing_silence(audio[:target_samples], sr)
        notes.extend(active_notes)
        if len(active) < int(target_samples * 0.85) and len(active) > int(0.5 * sr):
            audio = active
        else:
            return audio[:target_samples], notes

    if bar_boundaries_sec and len(bar_boundaries_sec) >= 2:
        audio_duration = len(audio) / float(sr)
        bar_chunks = []
        for idx in range(len(bar_boundaries_sec) - 1):
            start_sec = float(bar_boundaries_sec[idx])
            end_sec = float(bar_boundaries_sec[idx + 1])
            if start_sec >= audio_duration - 1e-4:
                break
            start_sample = max(0, int(round(start_sec * sr)))
            end_sample = min(len(audio), int(round(end_sec * sr)))
            if end_sample > start_sample:
                bar_chunks.append(audio[start_sample:end_sample])
        if bar_chunks:
            fade_samples = max(1, int(round(BAR_CROSSFADE_MS / 1000.0 * sr)))
            looped = []
            samples = 0
            while samples < target_samples:
                for bar in bar_chunks:
                    looped.append(bar)
                    samples += len(bar)
                    if samples >= target_samples:
                        break
            tiled = _crossfade_join(looped, fade_samples)[:target_samples]
            notes.append(f"tiled {len(bar_chunks)}-bar loop to {target_duration_sec:.2f}s")
            return tiled, notes

    repeats = int(np.ceil(target_samples / len(audio)))
    tiled = np.tile(audio, repeats)[:target_samples]
    notes.append(f"tiled loop x{repeats} to {target_duration_sec:.2f}s")
    return tiled, notes

def stitch_audio_sections(
    section_paths: list[Path],
    section_durations_sec: list[float],
    output_path: Path,
    *,
    sr: int,
    fade_ms: float = BAR_CROSSFADE_MS,
) -> dict:
    fade_samples = max(1, int(round(fade_ms / 1000.0 * sr)))
    chunks: list[np.ndarray] = []
    for path, duration in zip(section_paths, section_durations_sec, strict=False):
        audio, file_sr = _load_mono(path, target_sr=sr)
        target_samples = max(1, int(round(float(duration) * sr)))
        audio = _match_length(audio, target_samples)
        chunks.append(audio)
    mixed = _crossfade_join(chunks, fade_samples)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), mixed, sr)
    return {
        "sampleRate": sr,
        "durationSec": len(mixed) / float(sr),
        "sectionCount": len(chunks),
    }


def mix_practice_track(
    melody_path: Path | None,
    backing_path: Path,
    output_path: Path,
    *,
    include_notation_stem: bool = False,
    backing_gain_db: float = -16.0,
    arrangement_gain_db: float = 0.0,
    chord_path: Path | None = None,
    chord_gain_db: float = -6.0,
    drum_path: Path | None = None,
    drum_gain_db: float = -10.0,
    target_duration_sec: float | None = None,
    duck_backing: bool = True,
    highpass_backing: bool = True,
) -> dict:
    backing, sr = _load_mono(backing_path)
    melody = None
    if include_notation_stem and melody_path and melody_path.is_file():
        melody, _ = _load_mono(melody_path, target_sr=sr)
    chords = None
    if include_notation_stem and chord_path and chord_path.is_file():
        chords, _ = _load_mono(chord_path, target_sr=sr)
    drums = None
    if drum_path and drum_path.is_file():
        drums, _ = _load_mono(drum_path, target_sr=sr)

    target_samples = len(backing)
    if melody is not None:
        target_samples = len(melody)
    if target_duration_sec and target_duration_sec > 0:
        target_samples = int(round(target_duration_sec * sr))

    backing = _match_length(backing, target_samples)
    if melody is not None:
        melody = _match_length(melody, target_samples)
    if chords is not None:
        chords = _match_length(chords, target_samples)
    if drums is not None:
        drums = _match_length(drums, target_samples)

    if highpass_backing and include_notation_stem:
        backing = _highpass_backing(backing, sr)
    if duck_backing and melody is not None:
        backing = _duck_backing(melody, backing)

    if include_notation_stem and melody is not None:
        backing_gain = _db_to_gain(backing_gain_db)
        mixed = melody + backing * backing_gain
        if chords is not None:
            mixed = mixed + chords * _db_to_gain(chord_gain_db)
    else:
        mixed = backing * _db_to_gain(arrangement_gain_db)

    if drums is not None:
        mixed = mixed + drums * _db_to_gain(drum_gain_db)

    peak = float(np.max(np.abs(mixed))) if len(mixed) else 0.0
    if peak > 0.99:
        mixed = mixed * (0.98 / peak)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), mixed, sr)

    return {
        "sampleRate": sr,
        "durationSec": len(mixed) / float(sr),
        "melodySamples": len(melody) if melody is not None else 0,
        "backingSamples": len(backing),
        "includeNotationStem": include_notation_stem,
        "backingGainDb": backing_gain_db if include_notation_stem else None,
        "arrangementGainDb": arrangement_gain_db if not include_notation_stem else None,
        "chordLayer": chords is not None,
        "chordGainDb": chord_gain_db if chords is not None else None,
        "drumGuide": drums is not None,
        "drumGainDb": drum_gain_db if drums is not None else None,
        "duckBacking": duck_backing and melody is not None,
        "highpassBacking": highpass_backing and include_notation_stem,
    }
