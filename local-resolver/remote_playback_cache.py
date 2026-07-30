"""Disk cache for resolved remote playback audio (Cast / Snapcast)."""

from __future__ import annotations

import hashlib
import os
import threading
import time
from typing import Any

_CACHE: dict[str, tuple[str, float]] = {}
_LOCK = threading.Lock()


def cache_ttl_seconds() -> int:
    try:
        return max(60, int(os.getenv("REMOTE_PLAYBACK_CACHE_TTL_SECONDS", "3600")))
    except ValueError:
        return 3600


def build_resolve_cache_key(
    *,
    source: str,
    source_type: str,
    body: dict[str, Any],
) -> str:
    midi_hint = str(body.get("midiBase64") or "")[:64]
    parts = [
        source,
        source_type,
        str(body.get("pitch") or 0),
        str(body.get("fineTune") or body.get("fineTuneCents") or 0),
        str(body.get("tempo") or 1),
        midi_hint,
    ]
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return digest


def get_cached_input_path(key: str) -> str | None:
    now = time.time()
    ttl = cache_ttl_seconds()
    with _LOCK:
        entry = _CACHE.get(key)
        if not entry:
            return None
        path, created_at = entry
        if now - created_at > ttl:
            _CACHE.pop(key, None)
            try:
                os.unlink(path)
            except OSError:
                pass
            return None
        if not os.path.isfile(path):
            _CACHE.pop(key, None)
            return None
        return path


def store_cached_input_path(key: str, path: str) -> None:
    with _LOCK:
        old = _CACHE.pop(key, None)
        if old and old[0] != path:
            try:
                os.unlink(old[0])
            except OSError:
                pass
        _CACHE[key] = (path, time.time())


def cache_stats() -> dict[str, int]:
    with _LOCK:
        return {"entries": len(_CACHE)}
