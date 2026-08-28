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
    chunk_starts_sec: list[float] | None = None,
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

    midtrack = validate_midtrack_continuity(
        output_path,
        guide_path=guide_path,
        chunk_starts_sec=chunk_starts_sec,
    )

    return {
        "detectedBpm": detected_bpm,
        "targetBpm": target_bpm,
        "tempoDriftRatio": tempo_drift,
        "tempoOk": tempo_ok,
        "chromaCorrelation": chroma_score,
        "chordChangeAlignment": chord_alignment,
        "midtrackContinuity": midtrack,
    }


def _beats_per_bar(meter: str) -> int:
    parts = str(meter or "4/4").split("/")
    try:
        return max(1, int(parts[0]))
    except (TypeError, ValueError):
        return 4


def _detect_boom_chick_ratio(
    guide_path: Path,
    *,
    meter: str = "3/4",
    sr_target: int = 22050,
) -> float | None:
    """Estimate boom-chick strength: downbeat onset vs weak-beat onset."""
    try:
        import librosa
        import numpy as np
    except ImportError:
        return None

    try:
        y, sr = librosa.load(str(guide_path), sr=sr_target, mono=True)
        if len(y) < sr:
            return None
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        if len(onset_env) < 8:
            return None
        _, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=512)
        if beats is None or len(beats) < 4:
            return None
        beat_frames = librosa.frames_to_time(beats, sr=sr, hop_length=512)
        bpb = _beats_per_bar(meter)
        strong = []
        weak = []
        for i, t in enumerate(beat_frames):
            frame = min(len(onset_env) - 1, int(t * sr / 512))
            val = float(onset_env[frame])
            if i % bpb == 0:
                strong.append(val)
            elif bpb >= 3 and i % bpb == 1:
                weak.append(val)
        if not strong or not weak:
            return None
        return float(np.mean(strong) / max(1e-6, np.mean(weak)))
    except Exception:
        return None


GUIDE_LISTEN_CHECKLIST = [
    "Melody pitches clear and complete",
    "Harmony matches chord chart (not random GM pulses)",
    "No polka/oom-pa bass pattern (especially for chamber)",
    "Acceptable: simple pads/strums; unacceptable: clunky boom-chick",
    "Accompaniment present through the second half (no mid-track dropout)",
]


def _half_rms_ratio(wav_path: Path, *, sr_target: int = 22050) -> float | None:
    """Second-half RMS / first-half RMS (accompaniment continuity proxy)."""
    try:
        import librosa
        import numpy as np
    except ImportError:
        return None
    if not wav_path or not wav_path.is_file():
        return None
    try:
        y, sr = librosa.load(str(wav_path), sr=sr_target, mono=True)
        if len(y) < sr * 4:
            return None
        mid = len(y) // 2
        first = float(np.sqrt(np.mean(np.square(y[:mid]))))
        second = float(np.sqrt(np.mean(np.square(y[mid:]))))
        if first <= 1e-6:
            return None
        return second / first
    except Exception:
        return None


def _chunk_chroma_scores(
    guide_path: Path,
    output_path: Path,
    chunk_starts_sec: list[float],
    *,
    chunk_duration_sec: float = 28.0,
) -> list[dict]:
    """Per-chunk chroma correlation vs guide (detect seam washout)."""
    scores: list[dict] = []
    if not guide_path.is_file() or not output_path.is_file() or not chunk_starts_sec:
        return scores
    try:
        import librosa
        import numpy as np
        import soundfile as sf
    except ImportError:
        return scores
    try:
        guide_y, sr = librosa.load(str(guide_path), sr=22050, mono=True)
        out_y, _ = librosa.load(str(output_path), sr=sr, mono=True)
    except Exception:
        return scores
    for start in chunk_starts_sec:
        start_s = max(0, int(round(float(start) * sr)))
        end_s = start_s + max(1, int(round(float(chunk_duration_sec) * sr)))
        g = guide_y[start_s:end_s]
        o = out_y[start_s:min(end_s, len(out_y))]
        length = min(len(g), len(o))
        row = {"startSec": float(start), "chromaCorrelation": None}
        if length < sr:
            scores.append(row)
            continue
        try:
            g_ch = librosa.feature.chroma_cqt(y=g[:length], sr=sr).mean(axis=1)
            o_ch = librosa.feature.chroma_cqt(y=o[:length], sr=sr).mean(axis=1)
            denom = float(np.linalg.norm(g_ch) * np.linalg.norm(o_ch))
            if denom > 0:
                row["chromaCorrelation"] = float(np.dot(g_ch, o_ch) / denom)
        except Exception:
            pass
        scores.append(row)
    return scores


def validate_midtrack_continuity(
    output_path: Path,
    *,
    guide_path: Path | None = None,
    half_rms_min: float = 0.55,
    chunk_starts_sec: list[float] | None = None,
    chunk_chroma_min: float = 0.45,
) -> dict:
    """Warn when second half or chunk chroma collapses (mid-track fill dropout)."""
    half_ratio = _half_rms_ratio(output_path)
    half_ok = None if half_ratio is None else half_ratio >= half_rms_min
    chunk_scores = []
    if guide_path and chunk_starts_sec:
        chunk_scores = _chunk_chroma_scores(guide_path, output_path, chunk_starts_sec)
    weak_chunks = [
        c for c in chunk_scores
        if c.get("chromaCorrelation") is not None and c["chromaCorrelation"] < chunk_chroma_min
    ]
    gate_passed = (half_ok is not False) and len(weak_chunks) == 0
    return {
        "halfRmsRatio": half_ratio,
        "halfRmsOk": half_ok,
        "halfRmsMin": half_rms_min,
        "chunkChroma": chunk_scores,
        "weakChunkCount": len(weak_chunks),
        "gatePassed": gate_passed,
    }


def validate_guide_wav(
    guide_path: Path,
    *,
    meter: str = "4/4",
    render_style: str = "trad_session",
    harmony_source: str = "chord_chart",
    boom_chick_threshold: float = 1.8,
) -> dict:
    """Automated hints for guide.wav listen gate (ear is final authority)."""
    style = str(render_style or "").lower()
    chamber = style in ("classical", "chamber")
    boom_ratio = _detect_boom_chick_ratio(guide_path, meter=meter) if guide_path.is_file() else None
    boom_chick_suspect = (
        boom_ratio is not None
        and boom_ratio >= boom_chick_threshold
        and chamber
    )
    harmony_ok = harmony_source == "chord_chart" and not boom_chick_suspect
    if chamber:
        gate_passed = harmony_ok
    elif harmony_source == "chord_chart":
        # Trad block strums emphasize downbeats; waltz 3/4 is not boom-chick.
        gate_passed = harmony_ok
    else:
        gate_passed = boom_ratio is None or boom_ratio < boom_chick_threshold + 0.5
    return {
        "listenChecklist": GUIDE_LISTEN_CHECKLIST,
        "harmonySource": harmony_source,
        "boomChickRatio": boom_ratio,
        "boomChickSuspect": boom_chick_suspect,
        "guideHarmonyOk": harmony_ok,
        "gatePassed": gate_passed,
    }
