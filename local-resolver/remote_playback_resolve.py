"""Shared audio resolution for Cast / Snapcast session creation."""

from __future__ import annotations

import base64
import os
from typing import Any, Awaitable, Callable

from fastapi import HTTPException

from cast_playback import write_temp_audio_file
from remote_playback_cache import build_resolve_cache_key, get_cached_input_path, store_cached_input_path
from remote_playback_render import render_midi_bytes_to_audio_bytes, remote_playback_render_enabled

ResolveAudioFn = Callable[..., Awaitable[tuple[bytes, str, str | None]]]


def decode_midi_base64(body: dict[str, Any]) -> bytes:
    raw = body.get("midiBase64") or body.get("midiData")
    if not raw:
        raise HTTPException(status_code=400, detail="Missing midiBase64 for abc-midi source")
    try:
        return base64.b64decode(str(raw))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid midiBase64 payload") from exc


async def resolve_session_audio_bytes(
    *,
    source: str,
    source_type: str,
    body: dict[str, Any],
    resolve_linked_media_audio_bytes: ResolveAudioFn,
    proxy: str | None,
) -> tuple[bytes, str]:
    source_type = str(source_type or "").strip().lower()
    if source_type in ("abc-midi", "abc", "notation-midi") or body.get("midiBase64"):
        if not remote_playback_render_enabled():
            raise HTTPException(status_code=503, detail="MIDI render is not available")
        midi_bytes = decode_midi_base64(body)
        audio_bytes, filename = render_midi_bytes_to_audio_bytes(midi_bytes)
        return audio_bytes, filename
    audio_bytes, filename, _content_type = await resolve_linked_media_audio_bytes(
        source,
        source_type,
        proxy=proxy,
    )
    return audio_bytes, filename


async def resolve_session_input_path(
    *,
    source: str,
    source_type: str,
    body: dict[str, Any],
    resolve_linked_media_audio_bytes: ResolveAudioFn,
    proxy: str | None,
) -> tuple[str, str, bool]:
    """Resolve audio to a filesystem path, using shared cache when possible."""
    cache_key = build_resolve_cache_key(source=source, source_type=source_type, body=body)
    cached = get_cached_input_path(cache_key)
    if cached:
        return cached, os.path.basename(cached), False
    audio_bytes, filename = await resolve_session_audio_bytes(
        source=source,
        source_type=source_type,
        body=body,
        resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
        proxy=proxy,
    )
    suffix = os.path.splitext(filename or "")[1] or ".audio"
    input_path = write_temp_audio_file(audio_bytes, suffix=suffix)
    store_cached_input_path(cache_key, input_path)
    return input_path, filename, True


async def resolve_queue_input_paths(
    *,
    queue: list[Any],
    body: dict[str, Any],
    resolve_linked_media_audio_bytes: ResolveAudioFn,
    proxy: str | None,
    first_item_body: dict[str, Any] | None = None,
) -> tuple[list[str], float]:
    paths: list[str] = []
    total_duration = 0.0
    for index, item in enumerate(queue):
        item_body = first_item_body if index == 0 and first_item_body else {}
        merged = dict(body)
        merged.update(item_body)
        if hasattr(item, "source"):
            source = item.source
            source_type = item.source_type
            duration = float(item.duration or 0)
        else:
            source = str(item.get("source") or item.get("sourceUrl") or "").strip()
            source_type = str(item.get("sourceType") or "").strip().lower()
            duration = float(item.get("duration") or 0)
        if not source and not merged.get("midiBase64"):
            continue
        input_path, _filename, _input_is_temp = await resolve_session_input_path(
            source=source or f"queue-item-{index}",
            source_type=source_type,
            body=merged,
            resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
            proxy=proxy,
        )
        paths.append(input_path)
        total_duration += max(0.0, duration)
    return paths, total_duration
