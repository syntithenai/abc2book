"""Proxy score conversion to the internal MuseScore sidecar (or inline fallback)."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, Request

SCORE_CONVERT_URL = (os.getenv("SCORE_CONVERT_URL") or "").strip().rstrip("/")
SCORE_CONVERT_SECRET = (os.getenv("SCORE_CONVERT_SECRET") or "").strip()
SCORE_CONVERT_TIMEOUT_SECONDS = float(os.getenv("SCORE_CONVERT_TIMEOUT_SECONDS", "100"))
SCORE_CONVERT_USE_ID_TOKEN = os.getenv("SCORE_CONVERT_USE_ID_TOKEN", "").strip().lower() in (
    "1",
    "true",
    "yes",
)

_health_cache: dict[str, Any] = {"checked_at": 0.0, "reachable": False, "musescore_cli": False}
_HEALTH_CACHE_SECONDS = 30.0


def score_convert_configured() -> bool:
    return bool(SCORE_CONVERT_URL and SCORE_CONVERT_SECRET)


def _fetch_gcp_id_token(audience: str) -> str:
    import google.auth.transport.requests
    import google.oauth2.id_token

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, audience)


async def _internal_headers() -> dict[str, str]:
    headers = {"X-Tunebook-Internal-Token": SCORE_CONVERT_SECRET}
    if SCORE_CONVERT_USE_ID_TOKEN and SCORE_CONVERT_URL:
        token = await asyncio.to_thread(_fetch_gcp_id_token, SCORE_CONVERT_URL)
        headers["Authorization"] = "Bearer " + token
    return headers


async def refresh_score_convert_health(*, force: bool = False) -> dict[str, Any]:
    import time

    now = time.monotonic()
    if (
        not force
        and _health_cache.get("checked_at")
        and (now - float(_health_cache["checked_at"])) < _HEALTH_CACHE_SECONDS
    ):
        return dict(_health_cache)

    reachable = False
    musescore_cli = False
    if score_convert_configured():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    SCORE_CONVERT_URL + "/health",
                    headers=await _internal_headers(),
                )
            if response.status_code == 200:
                body = response.json()
                reachable = bool(body.get("ok"))
                musescore_cli = bool(body.get("musescoreCli"))
        except Exception:
            reachable = False

    _health_cache.update(
        {
            "checked_at": now,
            "reachable": reachable,
            "musescore_cli": musescore_cli,
        }
    )
    return dict(_health_cache)


def score_convert_features() -> dict[str, bool]:
    health = _health_cache
    reachable = bool(health.get("reachable")) if score_convert_configured() else False
    return {
        "midiImport": reachable,
        "scoreConvert": reachable,
    }


def _raise_unavailable() -> None:
    raise HTTPException(
        status_code=503,
        detail={
            "error": "score_convert_unavailable",
            "hint": (
                "Hosted MuseScore conversion is temporarily unavailable. "
                "Try again later or use a home resolver."
            ),
        },
    )


async def proxy_score2xml(file_bytes: bytes, filename: str) -> tuple[str, dict[str, Any]]:
    if not score_convert_configured():
        return await _inline_score2xml(file_bytes, filename)

    headers = await _internal_headers()
    files = {"file": (filename or "score.mscx", file_bytes, "application/octet-stream")}
    async with httpx.AsyncClient(timeout=SCORE_CONVERT_TIMEOUT_SECONDS) as client:
        response = await client.post(SCORE_CONVERT_URL + "/score2xml", headers=headers, files=files)
    if response.status_code >= 500:
        _raise_unavailable()
    if response.status_code >= 400:
        detail = response.text[:500]
        try:
            payload = response.json()
            detail = payload.get("error") or payload.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=response.status_code, detail=str(detail))
    meta = {
        "duration_ms": int(response.headers.get("X-Tunebook-Convert-Duration-Ms") or 0),
        "file_bytes": len(file_bytes),
        "response_bytes": len(response.content or b""),
    }
    return response.text, meta


async def proxy_midi2abc(
    request: Request,
    file_bytes: bytes,
    filename: str,
    *,
    mode: str | None = None,
    strategy: str = "auto",
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not score_convert_configured():
        return await _inline_midi2abc(request, file_bytes, filename, mode=mode, strategy=strategy)

    query = urlencode(list(request.query_params.multi_items()))
    path = "/midi2abc"
    if query:
        path += "?" + query
    if mode and "mode=" not in query:
        path += ("&" if query else "?") + urlencode({"mode": mode})
    if strategy and "strategy=" not in query:
        path += ("&" if "?" in path else "?") + urlencode({"strategy": strategy})

    headers = await _internal_headers()
    headers["Accept"] = "application/json"
    files = {"file": (filename or "import.mid", file_bytes, "audio/midi")}
    async with httpx.AsyncClient(timeout=SCORE_CONVERT_TIMEOUT_SECONDS) as client:
        response = await client.post(SCORE_CONVERT_URL + path, headers=headers, files=files)
    if response.status_code >= 500:
        _raise_unavailable()
    if response.status_code >= 400:
        detail = response.text[:500]
        try:
            payload = response.json()
            detail = payload.get("error") or payload.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=response.status_code, detail=str(detail))
    body = response.json()
    meta = {
        "duration_ms": int((body or {}).get("durationMs") or 0),
        "file_bytes": len(file_bytes),
        "response_bytes": len(response.content or b""),
        "strategy": str((body or {}).get("strategy") or ""),
    }
    return body, meta


async def _inline_score2xml(file_bytes: bytes, filename: str) -> tuple[str, dict[str, Any]]:
    import tempfile

    from musescore_convert import convert_score_file_to_musicxml

    suffix = os.path.splitext(filename or "")[1].lower() or ".mscx"
    with tempfile.TemporaryDirectory() as temp_dir:
        in_path = os.path.join(temp_dir, "upload" + suffix)
        with open(in_path, "wb") as handle:
            handle.write(file_bytes)
        xml = await asyncio.to_thread(
            convert_score_file_to_musicxml,
            in_path,
            temp_dir,
            output_stem="score_import",
        )
    return xml, {"file_bytes": len(file_bytes), "response_bytes": len(xml.encode("utf-8"))}


async def _inline_midi2abc(
    request: Request,
    file_bytes: bytes,
    filename: str,
    *,
    mode: str | None = None,
    strategy: str = "auto",
) -> tuple[dict[str, Any], dict[str, Any]]:
    from midi_import_orchestrator import import_midi_bytes
    from score_convert_midi import midi_import_kwargs_from_request

    kwargs = midi_import_kwargs_from_request(request, mode=mode, strategy=strategy)
    result = await asyncio.to_thread(import_midi_bytes, file_bytes, filename or "import.mid", **kwargs)
    payload = json.dumps(result).encode("utf-8")
    meta = {
        "file_bytes": len(file_bytes),
        "response_bytes": len(payload),
        "strategy": str((result or {}).get("strategy") or ""),
    }
    return result, meta
