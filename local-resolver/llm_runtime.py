"""Request-scoped LLM provider selection (BYO / host / local RESEARCH_LLM_*).

Endpoints resolve X-Tunebook-Provider-llm (or host PROVIDER_LLM_*) and call
use_llm_provider() so research / feed / voice / composer use the same key the
user entered in Settings → Providers.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from providers import openai_compat_chat_url

_llm_override: ContextVar[dict | None] = ContextVar("tunebook_llm_override", default=None)
_billing_recorder: ContextVar[Any] = ContextVar("tunebook_billing_recorder", default=None)


def _strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def is_cloud_llm_config(cfg: dict | None) -> bool:
    if not cfg or not isinstance(cfg, dict):
        return False
    if _strip(cfg.get("provider")).lower() == "local":
        return False
    return bool(_strip(cfg.get("apiUrl")))


def research_env_llm_config() -> dict:
    """Default local / RESEARCH_LLM_* endpoint (also used when provider is local)."""
    import tune_background_research as tbr

    return {
        "provider": "local",
        "apiUrl": _strip(getattr(tbr, "LLM_BASE_URL", "")).rstrip("/"),
        "apiKey": _strip(getattr(tbr, "LLM_API_KEY", "")),
        "model": _strip(getattr(tbr, "LLM_MODEL", "")),
        "source": "env",
    }


def voice_env_llm_config() -> dict:
    """VOICE_COMMAND_LLM_* with fallback to RESEARCH_LLM_*."""
    base = (
        os.getenv("VOICE_COMMAND_LLM_BASE_URL")
        or os.getenv("RESEARCH_LLM_BASE_URL", "http://host.docker.internal:1234/v1")
    )
    model = os.getenv("VOICE_COMMAND_LLM_MODEL") or os.getenv(
        "RESEARCH_LLM_MODEL", "google/gemma-3-4b-it"
    )
    api_key = os.getenv("VOICE_COMMAND_LLM_API_KEY") or os.getenv(
        "RESEARCH_LLM_API_KEY", "lm-studio"
    )
    return {
        "provider": "local",
        "apiUrl": _strip(base).rstrip("/"),
        "apiKey": _strip(api_key),
        "model": _strip(model),
        "source": "env",
    }


def materialize_llm_config(resolved: dict | None, *, voice: bool = False) -> dict:
    """Turn resolve_provider() output into a concrete OpenAI-compatible endpoint."""
    if is_cloud_llm_config(resolved):
        return {
            "provider": _strip(resolved.get("provider")) or "custom",
            "apiUrl": _strip(resolved.get("apiUrl")).rstrip("/"),
            "apiKey": _strip(resolved.get("apiKey")),
            "model": _strip(resolved.get("model")),
            "source": _strip(resolved.get("source")) or "user",
        }
    return voice_env_llm_config() if voice else research_env_llm_config()


def get_active_llm_config(*, voice: bool = False) -> dict:
    override = _llm_override.get()
    if is_cloud_llm_config(override):
        return {
            "provider": _strip(override.get("provider")) or "custom",
            "apiUrl": _strip(override.get("apiUrl")).rstrip("/"),
            "apiKey": _strip(override.get("apiKey")),
            "model": _strip(override.get("model")),
            "source": _strip(override.get("source")) or "user",
        }
    if override is not None:
        # Explicit local / empty overlay — still honor env defaults.
        return voice_env_llm_config() if voice else research_env_llm_config()
    return voice_env_llm_config() if voice else research_env_llm_config()


@contextmanager
def use_llm_provider(cfg: dict | None):
    """Bind LLM config for the current async task / request."""
    token = _llm_override.set(cfg)
    try:
        yield
    finally:
        _llm_override.reset(token)


def set_billing_recorder(recorder) -> Any:
    return _billing_recorder.set(recorder)


def reset_billing_recorder(token) -> None:
    _billing_recorder.reset(token)


def note_chat_completion_usage(payload: dict | None) -> None:
    recorder = _billing_recorder.get()
    if callable(recorder) and isinstance(payload, dict):
        recorder(payload)


def llm_chat_url(cfg: dict | None = None) -> str:
    active = cfg or get_active_llm_config()
    return openai_compat_chat_url(active.get("apiUrl") or "")


def llm_auth_headers(cfg: dict | None = None) -> dict:
    active = cfg or get_active_llm_config()
    headers = {"Content-Type": "application/json"}
    key = _strip(active.get("apiKey"))
    if key:
        headers["Authorization"] = "Bearer " + key
    return headers


def llm_model(cfg: dict | None = None) -> str:
    active = cfg or get_active_llm_config()
    return _strip(active.get("model")) or "gpt-4o-mini"


def enrich_chat_completion_payload(body: dict, cfg: dict | None = None) -> dict:
    """Tune local llama.cpp / Gemma chat requests so answers land in ``content``.

    Gemma-4 with deepseek-style reasoning often spends the entire ``max_tokens``
    budget on ``reasoning_content`` and returns empty ``content``
    (``finish_reason=length``). Cloud OpenAI-compatible providers reject unknown
    fields, so only local endpoints get ``chat_template_kwargs``.
    """
    active = cfg or get_active_llm_config()
    out = dict(body or {})
    if is_cloud_llm_config(active):
        return out
    kwargs = dict(out.get("chat_template_kwargs") or {})
    if "enable_thinking" not in kwargs:
        kwargs["enable_thinking"] = False
    out["chat_template_kwargs"] = kwargs
    return out


def assistant_message_text(message: dict | None) -> str:
    """Prefer answer ``content``; fall back to ``reasoning_content`` for JSON-ish replies."""
    if not isinstance(message, dict):
        return _strip(message)
    content = _strip(message.get("content"))
    if content:
        return content
    return _strip(message.get("reasoning_content") or message.get("reasoning"))

