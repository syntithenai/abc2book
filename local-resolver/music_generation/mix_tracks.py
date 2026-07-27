"""Mix melody and backing WAVs; optional tempo conform on backing."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


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


def mix_practice_track(
    melody_path: Path,
    backing_path: Path,
    output_path: Path,
    *,
    backing_gain_db: float = -9.0,
    target_duration_sec: float | None = None,
) -> dict:
    melody, sr = _load_mono(melody_path)
    backing, backing_sr = _load_mono(backing_path, target_sr=sr)

    target_samples = len(melody)
    if target_duration_sec and target_duration_sec > 0:
        target_samples = int(round(target_duration_sec * sr))

    melody = _match_length(melody, target_samples)
    backing = _match_length(backing, target_samples)

    backing_gain = _db_to_gain(backing_gain_db)
    mixed = melody + backing * backing_gain
    peak = float(np.max(np.abs(mixed))) if len(mixed) else 0.0
    if peak > 0.99:
        mixed = mixed * (0.98 / peak)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), mixed, sr)

    return {
        "sampleRate": sr,
        "durationSec": len(mixed) / float(sr),
        "melodySamples": len(melody),
        "backingSamples": len(backing),
        "backingGainDb": backing_gain_db,
    }
