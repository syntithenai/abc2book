"""Orchestrate practice-track generation: backing AI + melody mix."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from music_generation.jobs import (
    ensure_job_dir,
    job_backing_wav,
    job_melody_wav,
    job_output_wav,
    job_timing_plan_path,
    write_job_progress,
)
from music_generation.mix_tracks import mix_practice_track, stretch_to_duration
from music_generation.providers import get_audio_generation_provider
from music_generation.timing_contract import validate_timing_plan


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


def _maybe_stretch_backing(
    backing_path: Path,
    target_duration_sec: float,
    target_bpm: float,
) -> dict:
    import soundfile as sf

    audio, sr = sf.read(str(backing_path), always_2d=False)
    if audio.ndim > 1:
        import numpy as np

        audio = np.mean(audio, axis=1)
    audio = audio.astype("float32")

    detected_bpm = _detect_tempo_bpm(backing_path)
    stretch_notes = []

    if detected_bpm > 0 and target_bpm > 0:
        drift = abs(detected_bpm - target_bpm) / target_bpm
        if drift > 0.03:
            rate = detected_bpm / target_bpm
            import librosa

            audio = librosa.effects.time_stretch(audio, rate=rate)
            stretch_notes.append(f"stretched backing BPM {detected_bpm:.1f} -> {target_bpm:.1f}")

    current_duration = len(audio) / float(sr)
    if abs(current_duration - target_duration_sec) > 0.5:
        audio = stretch_to_duration(audio, sr, target_duration_sec)
        stretch_notes.append(
            f"length {current_duration:.2f}s -> {target_duration_sec:.2f}s"
        )

    sf.write(str(backing_path), audio, sr)
    return {
        "detectedBpm": detected_bpm,
        "targetBpm": target_bpm,
        "stretchNotes": stretch_notes,
    }


def run_practice_track_job(job_id: str, timing_plan_raw: dict, melody_path: Path) -> dict:
    plan = validate_timing_plan(timing_plan_raw)
    timing = plan["timing"]
    target_duration = float(timing["totalDurationSec"])
    target_bpm = float(timing.get("tempoBpm") or 120)

    write_job_progress(job_id, {"stage": "generating", "progress": 10, "message": "Generating backing"})

    provider = get_audio_generation_provider()
    backing_path = job_backing_wav(job_id)
    provider.generate_backing(
        plan["backingPrompt"],
        target_duration,
        negative_prompt=plan.get("backingNegativePrompt") or "",
        output_path=backing_path,
    )

    write_job_progress(job_id, {"stage": "validating", "progress": 60, "message": "Validating timing"})
    validation = _maybe_stretch_backing(backing_path, target_duration, target_bpm)

    write_job_progress(job_id, {"stage": "mixing", "progress": 80, "message": "Mixing practice track"})
    output_path = job_output_wav(job_id)
    mix_info = mix_practice_track(
        melody_path,
        backing_path,
        output_path,
        backing_gain_db=float(plan.get("backingGainDb") or -9.0),
        target_duration_sec=target_duration,
    )

    result = {
        "stage": "complete",
        "progress": 100,
        "message": "Complete",
        "validation": validation,
        "mix": mix_info,
        "provider": provider.health(),
        "audioPath": str(output_path),
    }
    write_job_progress(job_id, result)
    return result


def save_job_inputs(job_id: str, timing_plan_raw: dict, melody_bytes: bytes) -> None:
    ensure_job_dir(job_id)
    job_timing_plan_path(job_id).write_text(
        json.dumps(timing_plan_raw),
        encoding="utf-8",
    )
    job_melody_wav(job_id).write_bytes(melody_bytes)
