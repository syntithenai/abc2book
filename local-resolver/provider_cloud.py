"""Cloud provider HTTP adapters (OpenAI-compatible Whisper + chat + vision OCR)."""

from __future__ import annotations

import base64
import json
import re

import httpx

from providers import openai_compat_chat_url, openai_compat_transcriptions_url


async def transcribe_openai_compat(audio_bytes, filename, content_type, provider_cfg, timeout=600.0):
    """POST multipart to /v1/audio/transcriptions. Returns SPA-shaped whisper JSON."""
    if not provider_cfg or not provider_cfg.get("apiUrl"):
        raise ValueError("Missing provider apiUrl")
    url = openai_compat_transcriptions_url(provider_cfg["apiUrl"])
    headers = {}
    if provider_cfg.get("apiKey"):
        headers["Authorization"] = "Bearer " + provider_cfg["apiKey"]
    data = {}
    if provider_cfg.get("model"):
        data["model"] = provider_cfg["model"]
    data["response_format"] = "verbose_json"
    files = {
        "file": (filename or "audio.wav", audio_bytes, content_type or "application/octet-stream"),
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, data=data, files=files)
        if resp.status_code >= 400:
            detail = (resp.text or "")[:500]
            raise RuntimeError(f"Cloud transcription failed ({resp.status_code}): {detail}")
        payload = resp.json()

    text = (payload.get("text") or "").strip()
    segments = []
    for seg in payload.get("segments") or []:
        if not isinstance(seg, dict):
            continue
        segments.append({
            "start": float(seg.get("start") or 0),
            "end": float(seg.get("end") or 0),
            "text": (seg.get("text") or "").strip(),
        })
    return {
        "text": text,
        "segments": segments,
        "language": payload.get("language") or "",
        "backend": "provider:" + (provider_cfg.get("provider") or "cloud"),
    }


async def chat_openai_compat(messages, provider_cfg, timeout=120.0, temperature=0.2):
    """OpenAI-compatible chat completions."""
    if not provider_cfg or not provider_cfg.get("apiUrl"):
        raise ValueError("Missing provider apiUrl")
    url = openai_compat_chat_url(provider_cfg["apiUrl"])
    headers = {"Content-Type": "application/json"}
    if provider_cfg.get("apiKey"):
        headers["Authorization"] = "Bearer " + provider_cfg["apiKey"]
    body = {
        "model": provider_cfg.get("model") or "gpt-4o-mini",
        "messages": messages,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code >= 400:
            detail = (resp.text or "")[:500]
            raise RuntimeError(f"Cloud LLM failed ({resp.status_code}): {detail}")
        payload = resp.json()
    choices = payload.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return (msg.get("content") or "").strip()


def _guess_image_mime(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


async def ocr_openai_vision(image_bytes, filename, provider_cfg, timeout=180.0):
    """Vision/OCR via chat completions with an image. Returns chord-sheet-ish payload."""
    if not provider_cfg or not provider_cfg.get("apiUrl"):
        raise ValueError("Missing provider apiUrl")
    mime = _guess_image_mime(filename)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = "data:" + mime + ";base64," + b64
    prompt = (
        "Extract chords and lyrics from this chord sheet / lead sheet image. "
        "Return ONLY JSON with keys: title (string), artist (string), text (string: "
        "chords-over-words style lines), lines (array of strings). "
        "Preserve chord positions above lyrics where possible."
    )
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]
    raw = await chat_openai_compat(messages, provider_cfg, timeout=timeout, temperature=0.1)
    text_out = raw
    title = ""
    artist = ""
    lines = []
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            title = str(parsed.get("title") or "")
            artist = str(parsed.get("artist") or "")
            text_out = str(parsed.get("text") or "")
            raw_lines = parsed.get("lines") or []
            if isinstance(raw_lines, list):
                lines = [str(x) for x in raw_lines if str(x).strip()]
            if not text_out and lines:
                text_out = "\n".join(lines)
    except Exception:
        lines = [ln for ln in raw.splitlines() if ln.strip()]
        text_out = raw

    if not lines and text_out:
        lines = [ln for ln in text_out.splitlines() if ln.strip()]

    return {
        "format": "chords-over-words",
        "text": text_out,
        "lines": [{"text": ln, "kind": "mixed"} for ln in lines],
        "sections": [],
        "confidence": 0.75 if text_out else 0.0,
        "warnings": ["cloud_ocr"],
        "title": title,
        "artist": artist,
        "source": "provider:" + (provider_cfg.get("provider") or "cloud"),
        "melody": None,
        "backend": "provider:" + (provider_cfg.get("provider") or "cloud"),
    }
