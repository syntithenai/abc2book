"""Optional LLM cleanup for low-confidence chord-sheet OCR."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from chord_sheet_utils import estimate_chord_sheet_confidence, lines_to_chord_sheet_text, reconstruct_chords_over_words
from chords_fetch import finalize_sheet_lines

LLM_BASE_URL = os.getenv("RESEARCH_LLM_BASE_URL", "http://host.docker.internal:12340/v1").rstrip("/")
LLM_MODEL = os.getenv("RESEARCH_LLM_MODEL", "qwen3.8-off")
LLM_API_KEY = os.getenv("RESEARCH_LLM_API_KEY", "local")
LLM_TIMEOUT_SECONDS = float(os.getenv("SHEET_IMAGE_VLM_TIMEOUT_SECONDS", "120"))
VLM_CONFIDENCE_THRESHOLD = float(os.getenv("SHEET_IMAGE_VLM_CONFIDENCE_THRESHOLD", "0.55"))


def vlm_fallback_enabled() -> bool:
    return os.getenv("SHEET_IMAGE_VLM_ENABLED", "true").strip().lower() not in {"0", "false", "no"}


def should_try_vlm_fallback(confidence: float) -> bool:
    return vlm_fallback_enabled() and confidence < VLM_CONFIDENCE_THRESHOLD


def _extract_json_object(text: str) -> dict[str, Any] | None:
    raw = str(text or "").strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None


async def cleanup_chord_sheet_with_llm(lines: list[str], ocr_boxes: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    prompt_lines = "\n".join(f"- {line}" for line in lines)
    ocr_hint = ""
    if ocr_boxes:
        ocr_hint = "\n\nOCR boxes:\n" + "\n".join(
            f"{box.get('text')} @ ({box.get('x')}, {box.get('y')})"
            for box in ocr_boxes[:80]
            if box.get("text")
        )
    system_prompt = (
        "You clean noisy OCR output from chord charts. Return JSON only with keys: "
        "title, artist, lines (array of strings). Preserve section headers like Verse or Chorus. "
        "Put chord-only lines above lyric lines. Do not invent chords."
    )
    user_prompt = (
        "Fix this OCR chord sheet. Keep chords and lyrics faithful to the OCR text.\n"
        f"{prompt_lines}{ocr_hint}"
    )
    headers = {"Authorization": f"Bearer {LLM_API_KEY}"}
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT_SECONDS) as client:
        response = await client.post(f"{LLM_BASE_URL}/chat/completions", headers=headers, json=payload)
        response.raise_for_status()
        body = response.json()
    content = body["choices"][0]["message"]["content"]
    parsed = _extract_json_object(content) or {}
    cleaned_lines = finalize_sheet_lines([str(line) for line in parsed.get("lines") or []])
    confidence = estimate_chord_sheet_confidence(cleaned_lines, ocr_boxes)
    return {
        "title": str(parsed.get("title") or "").strip(),
        "artist": str(parsed.get("artist") or "").strip(),
        "lines": cleaned_lines,
        "text": lines_to_chord_sheet_text(cleaned_lines),
        "confidence": confidence,
        "source": "llm_cleanup",
    }


async def maybe_apply_vlm_fallback(
    lines: list[str],
    ocr_boxes: list[dict[str, Any]] | None,
    confidence: float,
) -> dict[str, Any] | None:
    if not should_try_vlm_fallback(confidence):
        return None
    try:
        return await cleanup_chord_sheet_with_llm(lines, ocr_boxes)
    except Exception:
        return None
