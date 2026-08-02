"""Upstream cost tables for resolver credit metering (billed at BILLING_MARKUP × cost)."""

from __future__ import annotations

import os

# 1 millicent = $0.00001 (100,000 millicents = $1)
MILLICENTS_PER_DOLLAR = 100_000
MILLICENTS_PER_CENT = 1_000

BILLING_MARKUP = float(os.getenv("BILLING_MARKUP", "2.0"))
TRIAL_CREDIT_CENTS = float(os.getenv("BILLING_TRIAL_CREDIT_CENTS", "30"))

# Cloud Run egress baseline USD per byte (before markup)
EGRESS_COST_PER_BYTE = float(os.getenv("BILLING_EGRESS_COST_PER_BYTE", str(0.12 / (1024 ** 3))))

# Flat scrape / outbound HTTP fees at upstream cost (millicents), before markup
SCRAPE_COST_MILLICENTS = {
    "enrich_feed_sources": int(os.getenv("BILLING_ENRICH_FEED_COST_MILLICENTS", "10")),
    "search_lyrics": int(os.getenv("BILLING_SEARCH_LYRICS_COST_MILLICENTS", "5")),
    "search_images": int(os.getenv("BILLING_SEARCH_IMAGES_COST_MILLICENTS", "8")),
}

# Per-job cloud stems (upstream millicents, before markup)
STEM_JOB_COST_MILLICENTS = int(os.getenv("BILLING_STEM_JOB_COST_MILLICENTS", "500"))
AMT_JOB_COST_MILLICENTS = int(os.getenv("BILLING_AMT_JOB_COST_MILLICENTS", "800"))

# Whisper USD per audio minute by model substring (upstream, before markup)
WHISPER_COST_PER_MINUTE_MILLICENTS = {
    "whisper-large-v3": 850,
    "whisper-large-v3-turbo": 400,
    "whisper-1": 600,
    "gpt-4o-transcribe": 1200,
    "default": 600,
}

# LLM USD per 1M tokens (input, output) in millicents — upstream, before markup
LLM_COST_PER_MILLION_TOKENS = {
    "llama-3.1-8b-instant": (50, 80),
    "gpt-4o-mini": (150, 600),
    "gpt-4o": (2500, 10000),
    "gpt-4.1-mini": (400, 1600),
    "whisper-large-v3": (50, 80),
    "default": (200, 800),
}

OCR_FLAT_COST_MILLICENTS = int(os.getenv("BILLING_OCR_FLAT_COST_MILLICENTS", "150"))

PRACTICE_TRACK_JOB_COST_MILLICENTS = int(os.getenv("BILLING_PRACTICE_TRACK_JOB_COST_MILLICENTS", "500"))
LINKED_COVER_JOB_COST_MILLICENTS = int(os.getenv("BILLING_LINKED_COVER_JOB_COST_MILLICENTS", "500"))

# TTS speech synthesis (upstream millicents flat per call, before markup)
TTS_SPEECH_FLAT_COST_MILLICENTS = int(os.getenv("BILLING_TTS_SPEECH_FLAT_COST_MILLICENTS", "20"))

# BYO API key proxy flat fees (upstream millicents, before markup)
API_PROXY_FLAT_MILLICENTS = {
    "llm": int(os.getenv("BILLING_API_PROXY_LLM_FLAT_MILLICENTS", "5")),
    "whisper": int(os.getenv("BILLING_API_PROXY_WHISPER_FLAT_MILLICENTS", "5")),
    "ocr": int(os.getenv("BILLING_API_PROXY_OCR_FLAT_MILLICENTS", "5")),
    "stems": int(os.getenv("BILLING_API_PROXY_STEMS_FLAT_MILLICENTS", "10")),
    "default": int(os.getenv("BILLING_API_PROXY_FLAT_COST_MILLICENTS", "5")),
}

MIN_USAGE_MILLICENTS = int(os.getenv("BILLING_MIN_USAGE_MILLICENTS", "1"))

CREDIT_PACKS = [
    {"id": "pack_5", "label": "$5", "amount_cents": 500},
    {"id": "pack_10", "label": "$10", "amount_cents": 1000},
    {"id": "pack_25", "label": "$25", "amount_cents": 2500},
]


def apply_markup(millicents: int) -> int:
    if millicents <= 0:
        return 0
    billed = int(round(millicents * BILLING_MARKUP))
    return max(MIN_USAGE_MILLICENTS, billed)


def cents_to_millicents(cents: float) -> int:
    return int(round(float(cents) * MILLICENTS_PER_CENT))


def millicents_to_cents(millicents: int) -> float:
    return round(millicents / MILLICENTS_PER_CENT, 2)


def egress_cost_millicents(bytes_served: int) -> int:
    if bytes_served <= 0:
        return 0
    upstream = int(bytes_served * EGRESS_COST_PER_BYTE * MILLICENTS_PER_DOLLAR)
    return apply_markup(upstream)


def scrape_cost_millicents(usage_type: str) -> int:
    upstream = SCRAPE_COST_MILLICENTS.get(usage_type, 5)
    return apply_markup(upstream)


def stem_job_cost_millicents() -> int:
    return apply_markup(STEM_JOB_COST_MILLICENTS)


def amt_job_cost_millicents() -> int:
    return apply_markup(AMT_JOB_COST_MILLICENTS)


def ocr_flat_cost_millicents() -> int:
    return apply_markup(OCR_FLAT_COST_MILLICENTS)


def practice_track_job_cost_millicents() -> int:
    return apply_markup(PRACTICE_TRACK_JOB_COST_MILLICENTS)


def linked_cover_job_cost_millicents() -> int:
    return apply_markup(LINKED_COVER_JOB_COST_MILLICENTS)


def tts_speech_cost_millicents(
    *,
    request_bytes: int = 0,
    response_bytes: int = 0,
) -> int:
    flat = apply_markup(TTS_SPEECH_FLAT_COST_MILLICENTS)
    egress = egress_cost_millicents(max(0, int(request_bytes)) + max(0, int(response_bytes)))
    return flat + egress


def api_proxy_flat_cost_millicents(capability: str = "") -> int:
    key = (capability or "").strip().lower()
    upstream = API_PROXY_FLAT_MILLICENTS.get(key, API_PROXY_FLAT_MILLICENTS["default"])
    return apply_markup(upstream)


def api_proxy_cost_millicents(
    capability: str,
    *,
    request_bytes: int = 0,
    response_bytes: int = 0,
) -> int:
    flat = api_proxy_flat_cost_millicents(capability)
    egress = egress_cost_millicents(max(0, int(request_bytes)) + max(0, int(response_bytes)))
    return max(flat, egress)


def whisper_cost_millicents(duration_seconds: float, model: str = "") -> int:
    if duration_seconds <= 0:
        return 0
    name = (model or "").lower()
    per_min = WHISPER_COST_PER_MINUTE_MILLICENTS["default"]
    for key, rate in WHISPER_COST_PER_MINUTE_MILLICENTS.items():
        if key != "default" and key in name:
            per_min = rate
            break
    minutes = duration_seconds / 60.0
    upstream = int(round(minutes * per_min))
    return apply_markup(upstream)


def _llm_rates_for_model(model: str) -> tuple[int, int]:
    name = (model or "").lower()
    for key, rates in LLM_COST_PER_MILLION_TOKENS.items():
        if key != "default" and key in name:
            return rates
    return LLM_COST_PER_MILLION_TOKENS["default"]


def llm_token_cost_millicents(
    prompt_tokens: int,
    completion_tokens: int,
    model: str = "",
) -> int:
    in_rate, out_rate = _llm_rates_for_model(model)
    upstream = int(
        round((max(0, prompt_tokens) * in_rate + max(0, completion_tokens) * out_rate) / 1_000_000)
    )
    if upstream <= 0 and (prompt_tokens > 0 or completion_tokens > 0):
        upstream = MIN_USAGE_MILLICENTS
    return apply_markup(upstream)
