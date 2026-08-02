"""Conservative operation cost estimates for credit reservations and affordance checks."""

from __future__ import annotations

import os
from typing import Any

from billing_rates import (
    api_proxy_cost_millicents,
    egress_cost_millicents,
    linked_cover_job_cost_millicents,
    llm_token_cost_millicents,
    millicents_to_cents,
    ocr_flat_cost_millicents,
    practice_track_job_cost_millicents,
    scrape_cost_millicents,
    stem_job_cost_millicents,
    whisper_cost_millicents,
)

# Background research token ceilings (match tune_background_research defaults)
_RESEARCH_SUPPLEMENTAL_OUT = int(os.getenv("RESEARCH_SUPPLEMENTAL_QUERY_LLM_MAX_TOKENS", "600"))
_RESEARCH_SUMMARIZE_OUT = int(os.getenv("RESEARCH_LLM_MAX_TOKENS", "2800"))
_RESEARCH_CRITIQUE_OUT = int(os.getenv("RESEARCH_CRITIQUE_LLM_MAX_TOKENS", str(_RESEARCH_SUMMARIZE_OUT)))
_RESEARCH_PROMPT_BUDGET = 4000

_FEED_LLM_OUT = 2000
_FEED_PROMPT_BUDGET = 3000
_COMPOSER_LLM_OUT = 64
_COMPOSER_PROMPT_BUDGET = 1500
_GENRE_LLM_OUT = 128
_GENRE_PROMPT_BUDGET = 2000
_HELP_LLM_OUT = 800
_HELP_PROMPT_BUDGET = 2000
_VOICE_LLM_OUT = 400
_CHORD_LLM_OUT = 128

OPERATION_CATALOG: dict[str, dict[str, str]] = {
    "background_research": {
        "label": "Background research",
        "description": "Web search plus up to four LLM stages (supplemental, summarize, critique).",
    },
    "composer_discovery": {
        "label": "Composer discovery",
        "description": "Writer lookup and ranking with optional LLM calls.",
    },
    "genre_discovery": {
        "label": "Genre discovery",
        "description": "Web search plus genre classification LLM.",
    },
    "feed_article": {
        "label": "Feed article generation",
        "description": "One grounded LLM JSON call per tune.",
    },
    "feed_quiz": {
        "label": "Feed quiz generation",
        "description": "One grounded LLM JSON call per tune.",
    },
    "help_query": {
        "label": "Help query",
        "description": "LLM help answer.",
    },
    "voice_command": {
        "label": "Voice command",
        "description": "Whisper transcription plus intent LLM.",
    },
    "chord_search_llm": {
        "label": "Chord search (LLM)",
        "description": "Optional CifraClub label translation.",
    },
    "sheet_ocr_host": {
        "label": "Sheet OCR (hosted)",
        "description": "Cloud vision OCR on chord sheet image.",
    },
    "sheet_ocr_user": {
        "label": "Sheet OCR (BYO key)",
        "description": "Proxy BYO vision OCR plus egress.",
    },
    "practice_track": {
        "label": "Practice track generation",
        "description": "Generate practice track audio job.",
    },
    "linked_cover": {
        "label": "Linked cover generation",
        "description": "Regenerate linked cover audio.",
    },
    "stem_job": {
        "label": "Stem separation",
        "description": "Cloud stem separation job.",
    },
    "whisper_transcribe": {
        "label": "Whisper transcription",
        "description": "Speech-to-text on audio.",
    },
}


def _llm_stage_estimate(model: str, prompt_tokens: int, completion_tokens: int) -> int:
    return llm_token_cost_millicents(prompt_tokens, completion_tokens, model)


def _provider_source(params: dict[str, Any] | None) -> str:
    if not params:
        return "host"
    source = str(params.get("providerSource") or params.get("provider_source") or "host").strip().lower()
    if source in ("user", "host", "local"):
        return source
    return "host"


def estimate_operation_millicents(
    operation_id: str,
    params: dict[str, Any] | None = None,
    *,
    model: str = "",
) -> int:
    op = (operation_id or "").strip()
    p = params or {}
    source = _provider_source(p)
    if source == "local":
        return 0

    duration = float(p.get("duration_seconds") or p.get("durationSeconds") or 0)
    audio_bytes = int(p.get("audio_bytes") or p.get("audioBytes") or 0)
    image_bytes = int(p.get("image_bytes") or p.get("imageBytes") or 0)

    if op == "background_research":
        if source == "user":
            stages = 4
            egress_per = egress_cost_millicents(8192)
            return stages * (api_proxy_cost_millicents("llm", request_bytes=4096, response_bytes=4096) + egress_per)
        supplemental = _llm_stage_estimate(model, _RESEARCH_PROMPT_BUDGET, _RESEARCH_SUPPLEMENTAL_OUT)
        summarize = _llm_stage_estimate(model, _RESEARCH_PROMPT_BUDGET * 2, _RESEARCH_SUMMARIZE_OUT)
        critique = _llm_stage_estimate(model, _RESEARCH_PROMPT_BUDGET, _RESEARCH_CRITIQUE_OUT)
        scrape = scrape_cost_millicents("enrich_feed_sources")
        return supplemental + summarize + critique + scrape * 2

    if op == "composer_discovery":
        scrape = scrape_cost_millicents("search_lyrics")
        if source == "user":
            llm_proxy = 2 * api_proxy_cost_millicents("llm", request_bytes=2048, response_bytes=256)
            return scrape + llm_proxy
        llm = 2 * _llm_stage_estimate(model, _COMPOSER_PROMPT_BUDGET, _COMPOSER_LLM_OUT)
        return scrape + llm

    if op == "genre_discovery":
        scrape = scrape_cost_millicents("search_lyrics")
        if source == "user":
            return scrape + api_proxy_cost_millicents("llm", request_bytes=2048, response_bytes=256)
        return scrape + _llm_stage_estimate(model, _GENRE_PROMPT_BUDGET, _GENRE_LLM_OUT)

    if op in ("feed_article", "feed_quiz"):
        if source == "user":
            return api_proxy_cost_millicents("llm", request_bytes=4096, response_bytes=4096)
        return _llm_stage_estimate(model, _FEED_PROMPT_BUDGET, _FEED_LLM_OUT)

    if op == "help_query":
        if source == "user":
            return api_proxy_cost_millicents("llm", request_bytes=2048, response_bytes=2048)
        return _llm_stage_estimate(model, _HELP_PROMPT_BUDGET, _HELP_LLM_OUT)

    if op == "voice_command":
        whisper_model = str(p.get("whisper_model") or p.get("whisperModel") or model or "")
        if source == "user":
            whisper_part = api_proxy_cost_millicents(
                "whisper",
                request_bytes=audio_bytes or 5_000_000,
                response_bytes=4096,
            )
            llm_part = api_proxy_cost_millicents("llm", request_bytes=2048, response_bytes=512)
            return whisper_part + llm_part
        whisper_part = whisper_cost_millicents(duration or 30.0, whisper_model)
        llm_part = _llm_stage_estimate(model, 1500, _VOICE_LLM_OUT)
        return whisper_part + llm_part

    if op == "chord_search_llm":
        if source == "user":
            return api_proxy_cost_millicents("llm", request_bytes=1024, response_bytes=256)
        return _llm_stage_estimate(model, 800, _CHORD_LLM_OUT)

    if op == "sheet_ocr_host":
        return ocr_flat_cost_millicents()

    if op == "sheet_ocr_user":
        return api_proxy_cost_millicents("ocr", request_bytes=image_bytes or 2_000_000, response_bytes=8192)

    if op == "practice_track":
        return practice_track_job_cost_millicents()

    if op == "linked_cover":
        return linked_cover_job_cost_millicents()

    if op == "stem_job":
        if source == "user":
            return api_proxy_cost_millicents("stems", request_bytes=audio_bytes or 5_000_000, response_bytes=1_000_000)
        return stem_job_cost_millicents()

    if op == "whisper_transcribe":
        whisper_model = str(p.get("whisper_model") or p.get("whisperModel") or model or "")
        if source == "user":
            return api_proxy_cost_millicents(
                "whisper",
                request_bytes=audio_bytes or max(1_000_000, int(duration * 32000)),
                response_bytes=4096,
            )
        return whisper_cost_millicents(duration or 60.0, whisper_model)

    if op.startswith("api_proxy_"):
        cap = op.replace("api_proxy_", "")
        return api_proxy_cost_millicents(cap, request_bytes=4096, response_bytes=4096)

    return api_proxy_cost_millicents("default", request_bytes=4096, response_bytes=4096)


def estimate_single_llm_call_millicents(model: str = "", *, provider_source: str = "host") -> int:
    if provider_source == "local":
        return 0
    if provider_source == "user":
        return api_proxy_cost_millicents("llm", request_bytes=4096, response_bytes=2048)
    return _llm_stage_estimate(model, _RESEARCH_PROMPT_BUDGET, _RESEARCH_SUPPLEMENTAL_OUT)


def catalog_for_api() -> list[dict[str, Any]]:
    out = []
    for op_id, meta in OPERATION_CATALOG.items():
        est = estimate_operation_millicents(op_id)
        out.append(
            {
                "id": op_id,
                "label": meta.get("label") or op_id,
                "description": meta.get("description") or "",
                "defaultEstimateCents": millicents_to_cents(est),
                "defaultEstimateMillicents": est,
            }
        )
    return out


def affordance_payload(
    email: str,
    operation_id: str,
    params: dict[str, Any] | None = None,
    *,
    model: str = "",
    available_millicents: int,
    balance_millicents: int,
) -> dict[str, Any]:
    estimate = estimate_operation_millicents(operation_id, params, model=model)
    affordable = available_millicents >= estimate
    shortfall = max(0, estimate - available_millicents)
    return {
        "id": operation_id,
        "affordable": affordable,
        "estimateCents": millicents_to_cents(estimate),
        "estimateMillicents": estimate,
        "availableCents": millicents_to_cents(available_millicents),
        "availableMillicents": available_millicents,
        "balanceCents": millicents_to_cents(balance_millicents),
        "balanceMillicents": balance_millicents,
        "shortfallCents": millicents_to_cents(shortfall),
        "shortfallMillicents": shortfall,
    }
