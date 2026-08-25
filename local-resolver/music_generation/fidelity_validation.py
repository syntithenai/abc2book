"""Lightweight fidelity checks for practice-track output vs timing plan."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def _detect_tempo_bpm(wav_path: Path) -> float:
    script = Path(__file__).resolve().parents[1] / "detect_timing.py"
    if not script.is_file():
        return 0.0
    try:
        proc = subprocess.run(
            [sys.executable, str(script), str(wav_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        body = json.loads(proc.stdout or "{}")
        return float(body.get("tempo") or 0)
    except (subprocess.CalledProcessError, json.JSONDecodeError, ValueError, OSError):
        return 0.0


def _chroma_correlation(guide_path: Path, output_path: Path) -> float | None:
    try:
        import librosa
        import numpy as np
    except ImportError:
        return None

    try:
        guide_y, sr = librosa.load(str(guide_path), sr=22050, mono=True)
        out_y, _ = librosa.load(str(output_path), sr=sr, mono=True)
        length = min(len(guide_y), len(out_y))
        if length < sr:
            return None
        guide_y = guide_y[:length]
        out_y = out_y[:length]
        guide_chroma = librosa.feature.chroma_cqt(y=guide_y, sr=sr)
        out_chroma = librosa.feature.chroma_cqt(y=out_y, sr=sr)
        cols = min(guide_chroma.shape[1], out_chroma.shape[1])
        if cols < 4:
            return None
        guide_chroma = guide_chroma[:, :cols]
        out_chroma = out_chroma[:, :cols]
        guide_vec = guide_chroma.mean(axis=1)
        out_vec = out_chroma.mean(axis=1)
        denom = float(np.linalg.norm(guide_vec) * np.linalg.norm(out_vec))
        if denom <= 0:
            return None
        return float(np.dot(guide_vec, out_vec) / denom)
    except Exception:
        return None


def _chord_change_alignment(
    output_path: Path,
    bar_boundaries_sec: list[float],
    *,
    tolerance_sec: float = 0.15,
) -> dict:
    try:
        import librosa
        import numpy as np
    except ImportError:
        return {"score": None, "matched": 0, "total": 0}

    if len(bar_boundaries_sec) < 2:
        return {"score": None, "matched": 0, "total": 0}

    try:
        y, sr = librosa.load(str(output_path), sr=22050, mono=True)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        hop = librosa.frames_to_time(1, sr=sr, hop_length=512)
        flux = np.sum(np.abs(np.diff(chroma, axis=1)), axis=0)
        if len(flux) == 0:
            return {"score": 0.0, "matched": 0, "total": max(0, len(bar_boundaries_sec) - 1)}

        peak_times = librosa.frames_to_time(
            np.arange(len(flux)),
            sr=sr,
            hop_length=512,
        )
        bar_times = bar_boundaries_sec[1:]
        matched = 0
        for bar_time in bar_times:
            if bar_time <= 0:
                continue
            idx = int(np.argmin(np.abs(peak_times - bar_time)))
            if abs(float(peak_times[idx]) - bar_time) <= tolerance_sec:
                matched += 1
        total = len(bar_times)
        score = (matched / total) if total else None
        return {"score": score, "matched": matched, "total": total}
    except Exception:
        return {"score": None, "matched": 0, "total": max(0, len(bar_boundaries_sec) - 1)}


def validate_practice_track_fidelity(
    output_path: Path,
    *,
    guide_path: Path | None = None,
    target_bpm: float,
    bar_boundaries_sec: list[float] | None = None,
    tempo_tolerance_ratio: float = 0.08,
    chord_tolerance_sec: float = 0.15,
) -> dict:
    """Return validation metrics stored on the job progress payload."""
    detected_bpm = _detect_tempo_bpm(output_path)
    tempo_drift = None
    tempo_ok = None
    if detected_bpm > 0 and target_bpm > 0:
        tempo_drift = abs(detected_bpm - target_bpm) / target_bpm
        tempo_ok = tempo_drift <= tempo_tolerance_ratio

    chroma_score = None
    if guide_path and guide_path.is_file() and output_path.is_file():
        chroma_score = _chroma_correlation(guide_path, output_path)

    chord_alignment = _chord_change_alignment(
        output_path,
        bar_boundaries_sec or [],
        tolerance_sec=chord_tolerance_sec,
    )

    return {
        "detectedBpm": detected_bpm,
        "targetBpm": target_bpm,
        "tempoDriftRatio": tempo_drift,
        "tempoOk": tempo_ok,
        "chromaCorrelation": chroma_score,
        "chordChangeAlignment": chord_alignment,
    }
