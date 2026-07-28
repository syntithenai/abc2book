"""Async job cache for practice-track generation."""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path


def practice_track_cache_root() -> Path:
    root = os.getenv("PRACTICE_TRACK_CACHE_DIR") or "/tmp/practice-track-cache"
    path = Path(root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _job_dir(job_id: str) -> Path:
    if not job_id or not all(c in "0123456789abcdef" for c in job_id):
        raise ValueError("Invalid job id")
    return practice_track_cache_root() / job_id


def ensure_job_dir(job_id: str) -> Path:
    directory = _job_dir(job_id)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def create_job_id() -> str:
    return uuid.uuid4().hex


def write_job_progress(job_id: str, payload: dict) -> None:
    directory = ensure_job_dir(job_id)
    data = dict(payload)
    data["updatedAt"] = time.time()
    (directory / "progress.json").write_text(json.dumps(data), encoding="utf-8")


def read_job_progress(job_id: str) -> dict | None:
    path = _job_dir(job_id) / "progress.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def job_output_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "practice-track.wav"


def job_melody_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "melody.wav"


def job_backing_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "backing.wav"


def job_chords_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "chords.wav"


def job_section_backing_wav(job_id: str, index: int) -> Path:
    return _job_dir(job_id) / f"backing-section-{index}.wav"


def job_timing_plan_path(job_id: str) -> Path:
    return _job_dir(job_id) / "timing-plan.json"


def job_score_mid(job_id: str) -> Path:
    return _job_dir(job_id) / "score.mid"


def job_drums_mid(job_id: str) -> Path:
    return _job_dir(job_id) / "drums.mid"


def job_drums_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "drums.wav"


def job_guide_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "guide.wav"


def job_melody_rendered_wav(job_id: str) -> Path:
    return _job_dir(job_id) / "melody-rendered.wav"


def hash_melody_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
