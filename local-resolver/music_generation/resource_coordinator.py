"""Exclusive audio-generation lock and idle-activity tracking for audio.cpp."""

from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager

AUDIO_CPP_IDLE_UNLOAD_SECONDS = float(os.getenv("AUDIO_CPP_IDLE_UNLOAD_SECONDS", "300"))

_audio_generation_lock = asyncio.Lock()
_audio_generation_active = 0
_last_audio_generation_at = 0.0


class AudioGenerationInProgress(Exception):
    """Raised when a heavy job is blocked by an active audio generation run."""

    def __init__(self, message="Audio generation in progress; try again shortly"):
        super().__init__(message)


def touch_audio_generation_activity() -> None:
    global _last_audio_generation_at
    _last_audio_generation_at = time.time()


def audio_generation_busy() -> bool:
    return _audio_generation_active > 0


def audio_generation_idle_status() -> dict:
    now = time.time()
    last = _last_audio_generation_at or 0.0
    idle_seconds = (now - last) if last > 0 else None
    return {
        "active": audio_generation_busy(),
        "lastActivityAt": last if last > 0 else None,
        "idleSeconds": idle_seconds,
        "idleUnloadSeconds": AUDIO_CPP_IDLE_UNLOAD_SECONDS,
        "shouldUnload": (
            not audio_generation_busy()
            and idle_seconds is not None
            and idle_seconds >= AUDIO_CPP_IDLE_UNLOAD_SECONDS
        ),
    }


def check_not_blocked_by_audio_generation() -> None:
    if audio_generation_busy():
        raise AudioGenerationInProgress()


@asynccontextmanager
async def audio_generation_exclusive():
    global _audio_generation_active
    check_not_blocked_by_audio_generation()
    try:
        from gpu_prep import ensure_gpu_headroom

        await ensure_gpu_headroom()
    except Exception as exc:
        raise AudioGenerationInProgress(f"GPU prep failed: {exc}") from exc
    async with _audio_generation_lock:
        _audio_generation_active += 1
        touch_audio_generation_activity()
        try:
            yield
        finally:
            _audio_generation_active = max(0, _audio_generation_active - 1)
            touch_audio_generation_activity()
