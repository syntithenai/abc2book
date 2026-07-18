"""Optional Replicate AMT: ByteDance Kong piano transcription and Magenta MT3."""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx

REPLICATE_API = "https://api.replicate.com/v1"
KONG_MODEL = os.getenv("REPLICATE_AMT_KONG_MODEL", "bytedance/piano-transcription")
MT3_MODEL = os.getenv("REPLICATE_AMT_MT3_MODEL", "turian/multi-task-music-transcription")


def _strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _auth_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
        "Prefer": "wait",
    }


async def _upload_file(client: httpx.AsyncClient, api_key: str, audio_bytes: bytes, filename: str) -> str:
    # Prefer data URI for smaller clips; Replicate also accepts https URLs.
    import base64

    lower = (filename or "audio.wav").lower()
    mime = "audio/wav"
    if lower.endswith(".mp3"):
        mime = "audio/mpeg"
    elif lower.endswith(".flac"):
        mime = "audio/flac"
    encoded = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:{mime};base64,{encoded}"


async def _wait_prediction(client: httpx.AsyncClient, api_key: str, prediction: dict, timeout_s: float = 900) -> dict:
    status = prediction.get("status")
    if status in ("succeeded", "failed", "canceled"):
        return prediction
    get_url = prediction.get("urls", {}).get("get") or (REPLICATE_API + "/predictions/" + prediction.get("id", ""))
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        response = await client.get(get_url, headers=_auth_headers(api_key))
        response.raise_for_status()
        body = response.json()
        if body.get("status") in ("succeeded", "failed", "canceled"):
            return body
        await asyncio.sleep(2.0)
    raise TimeoutError("Replicate AMT prediction timed out")


async def _download_bytes(client: httpx.AsyncClient, url: str) -> bytes:
    response = await client.get(url, follow_redirects=True)
    response.raise_for_status()
    return response.content


async def transcribe_kong_replicate(audio_bytes: bytes, filename: str, api_key: str) -> bytes:
    """Return MIDI bytes from bytedance/piano-transcription."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        audio_uri = await _upload_file(client, api_key, audio_bytes, filename)
        create = await client.post(
            REPLICATE_API + "/models/" + KONG_MODEL + "/predictions",
            headers=_auth_headers(api_key),
            json={"input": {"audio_input": audio_uri}},
        )
        if create.status_code >= 400:
            # Older schema may use "audio" instead of "audio_input".
            create = await client.post(
                REPLICATE_API + "/models/" + KONG_MODEL + "/predictions",
                headers=_auth_headers(api_key),
                json={"input": {"audio": audio_uri}},
            )
        create.raise_for_status()
        prediction = await _wait_prediction(client, api_key, create.json())
        if prediction.get("status") != "succeeded":
            raise RuntimeError(prediction.get("error") or "Kong Replicate prediction failed")
        output = prediction.get("output")
        midi_url = ""
        if isinstance(output, str):
            midi_url = output
        elif isinstance(output, dict):
            midi_url = _strip(output.get("midi") or output.get("midi_file") or output.get("output"))
        elif isinstance(output, list) and output:
            midi_url = _strip(output[0])
        if not midi_url:
            raise RuntimeError("Kong Replicate returned no MIDI URL")
        return await _download_bytes(client, midi_url)


async def transcribe_mt3_replicate(audio_bytes: bytes, filename: str, api_key: str, model_type: str = "mt3") -> bytes:
    """Return MIDI bytes from turian/multi-task-music-transcription."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        audio_uri = await _upload_file(client, api_key, audio_bytes, filename)
        create = await client.post(
            REPLICATE_API + "/models/" + MT3_MODEL + "/predictions",
            headers=_auth_headers(api_key),
            json={"input": {"audio_file": audio_uri, "model_type": model_type or "mt3"}},
        )
        create.raise_for_status()
        prediction = await _wait_prediction(client, api_key, create.json())
        if prediction.get("status") != "succeeded":
            raise RuntimeError(prediction.get("error") or "MT3 Replicate prediction failed")
        output = prediction.get("output")
        midi_url = _strip(output) if isinstance(output, str) else ""
        if isinstance(output, dict):
            midi_url = _strip(output.get("midi") or output.get("output") or "")
        if not midi_url:
            raise RuntimeError("MT3 Replicate returned no MIDI URL")
        return await _download_bytes(client, midi_url)


def transcribe_kong_replicate_sync(audio_bytes: bytes, filename: str, api_key: str) -> bytes:
    return asyncio.run(transcribe_kong_replicate(audio_bytes, filename, api_key))


def transcribe_mt3_replicate_sync(audio_bytes: bytes, filename: str, api_key: str, model_type: str = "mt3") -> bytes:
    return asyncio.run(transcribe_mt3_replicate(audio_bytes, filename, api_key, model_type=model_type))
