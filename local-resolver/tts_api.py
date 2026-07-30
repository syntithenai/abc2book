"""HTTP helpers for TTS gateway proxy."""

from __future__ import annotations

import os
import time

import httpx

_tts_available_cache: bool | None = None
_tts_checked_at: float = 0.0
TTS_HEALTH_CACHE_SECONDS = float(os.getenv("TTS_HEALTH_CACHE_SECONDS", "15"))

TTS_URL = os.getenv("TTS_URL", "").strip().rstrip("/")
TTS_VOICE = os.getenv("TTS_VOICE", "af_bella").strip() or "af_bella"
TTS_ENABLED = os.getenv("TTS_ENABLED", "true").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)


def tts_feature_enabled() -> bool:
    return bool(TTS_ENABLED and TTS_URL)


async def _probe_tts_available() -> bool:
    global _tts_available_cache, _tts_checked_at
    if not tts_feature_enabled():
        _tts_available_cache = False
        _tts_checked_at = time.time()
        return False

    available = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(TTS_URL + "/health")
            if response.status_code < 500:
                body = response.json()
                available = bool(body.get("ok"))
    except Exception:
        available = False

    _tts_available_cache = available
    _tts_checked_at = time.time()
    return available


async def refresh_tts_health_if_stale() -> bool:
    if time.time() - _tts_checked_at < TTS_HEALTH_CACHE_SECONDS:
        return bool(_tts_available_cache)
    return await _probe_tts_available()


def tts_runtime_available() -> bool:
    if not tts_feature_enabled():
        return False
    if _tts_available_cache is None:
        return False
    return bool(_tts_available_cache)


async def tts_health() -> dict:
    if not tts_feature_enabled():
        return {"ok": False, "enabled": False, "message": "TTS not configured"}
    ok = await refresh_tts_health_if_stale()
    return {
        "ok": ok,
        "enabled": True,
        "url": TTS_URL,
        "voice": TTS_VOICE,
    }


async def synthesize_speech(text: str) -> bytes:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("Missing speech text")

    if not await refresh_tts_health_if_stale():
        raise RuntimeError("TTS service is not available")

    payload = {
        "model": "kokoro",
        "input": cleaned,
        "voice": TTS_VOICE,
        "response_format": "wav",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            TTS_URL + "/v1/audio/speech",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if response.status_code >= 400:
            detail = response.text[:200] if response.text else response.status_code
            raise RuntimeError("TTS synthesis failed: " + str(detail))
        return response.content
