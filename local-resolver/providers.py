"""Shared LLM / Whisper / OCR / Stems provider resolution for home + Cloud Run.

Precedence for a capability:
  1. Request overlay (user Settings → Providers)
  2. Host-embedded env provider (when caller is on EMBEDDED_CREDS)
  3. Local backend (home only; whisper.cpp / research LLM / PaddleOCR / Demucs)
  4. Unavailable
"""

from __future__ import annotations

import json
import os
from typing import Any


CAPABILITIES = ("llm", "whisper", "ocr", "stems")

# OpenAI-compatible STT path used by Groq, OpenAI, Together, etc.
OPENAI_COMPAT_TRANSCRIPTIONS = "/audio/transcriptions"
OPENAI_COMPAT_CHAT = "/chat/completions"

# Default API bases for stems cloud presets when overlay omits apiUrl.
STEMS_PROVIDER_DEFAULTS = {
    "fal": "https://fal.run",
    "replicate": "https://api.replicate.com/v1",
}


def _strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_provider_set(raw: dict | None) -> dict | None:
    if not raw or not isinstance(raw, dict):
        return None
    provider = _strip(raw.get("provider") or raw.get("id")).lower()
    api_url = _strip(raw.get("apiUrl") or raw.get("base_url") or raw.get("baseUrl")).rstrip("/")
    api_key = _strip(raw.get("apiKey") or raw.get("api_key"))
    model = _strip(raw.get("model"))
    if provider == "local":
        return {
            "provider": "local",
            "apiUrl": "",
            "apiKey": "",
            "model": model,
            "source": raw.get("source") or "user",
        }
    if provider in STEMS_PROVIDER_DEFAULTS and not api_url:
        api_url = STEMS_PROVIDER_DEFAULTS[provider]
    if not provider and not api_url:
        return None
    return {
        "provider": provider or "custom",
        "apiUrl": api_url,
        "apiKey": api_key,
        "model": model,
        "source": raw.get("source") or "user",
    }


def parse_overlay_header(header_value: str | None) -> dict | None:
    """Parse X-Tunebook-Provider JSON object for one capability overlay."""
    if not header_value or not str(header_value).strip():
        return None
    try:
        data = json.loads(header_value)
    except Exception:
        return None
    return normalize_provider_set(data if isinstance(data, dict) else None)


def parse_providers_body(body: dict | None) -> dict[str, dict]:
    """Extract providers.llm / whisper / ocr / stems from a JSON body."""
    out: dict[str, dict] = {}
    if not body or not isinstance(body, dict):
        return out
    providers = body.get("providers")
    if not isinstance(providers, dict):
        # Also accept top-level capability keys
        providers = body
    for cap in CAPABILITIES:
        raw = providers.get(cap)
        if isinstance(raw, dict):
            normalized = normalize_provider_set(raw)
            if normalized:
                out[cap] = normalized
        elif isinstance(raw, list) and raw:
            # Prefer entry marked active, else first
            active = None
            for item in raw:
                if isinstance(item, dict) and item.get("active"):
                    active = item
                    break
            pick = active or (raw[0] if isinstance(raw[0], dict) else None)
            normalized = normalize_provider_set(pick)
            if normalized:
                out[cap] = normalized
    return out


def _env_provider(prefix: str) -> dict | None:
    """Read PROVIDER_<CAP>_PROVIDER / _BASE_URL / _API_KEY / _MODEL."""
    provider = _strip(os.getenv(f"{prefix}_PROVIDER", "")).lower()
    api_url = _strip(os.getenv(f"{prefix}_BASE_URL", "") or os.getenv(f"{prefix}_API_URL", "")).rstrip("/")
    api_key = _strip(os.getenv(f"{prefix}_API_KEY", ""))
    model = _strip(os.getenv(f"{prefix}_MODEL", ""))
    if provider == "local":
        return {
            "provider": "local",
            "apiUrl": "",
            "apiKey": "",
            "model": model,
            "source": "host",
        }
    if not provider and not api_url and not api_key:
        return None
    if not provider:
        provider = "custom"
    if provider in STEMS_PROVIDER_DEFAULTS and not api_url:
        api_url = STEMS_PROVIDER_DEFAULTS[provider]
    return {
        "provider": provider,
        "apiUrl": api_url,
        "apiKey": api_key,
        "model": model,
        "source": "host",
    }


def host_embedded_providers() -> dict[str, dict]:
    """Operator-configured cloud providers from env (no secrets in response)."""
    mapping = {
        "llm": "PROVIDER_LLM",
        "whisper": "PROVIDER_WHISPER",
        "ocr": "PROVIDER_OCR",
        "stems": "PROVIDER_STEMS",
    }
    # Backward-compatible RESEARCH_LLM_* as host LLM when PROVIDER_LLM_* unset
    out: dict[str, dict] = {}
    for cap, prefix in mapping.items():
        cfg = _env_provider(prefix)
        if cfg:
            out[cap] = cfg
    if "llm" not in out:
        legacy_url = _strip(os.getenv("RESEARCH_LLM_BASE_URL", "")).rstrip("/")
        legacy_key = _strip(os.getenv("RESEARCH_LLM_API_KEY", ""))
        legacy_model = _strip(os.getenv("RESEARCH_LLM_MODEL", ""))
        # Only treat as embedded cloud if it looks like an external HTTPS API
        if legacy_url.startswith("https://") and legacy_key and legacy_key not in ("lm-studio", "local", "ollama"):
            out["llm"] = {
                "provider": "custom",
                "apiUrl": legacy_url,
                "apiKey": legacy_key,
                "model": legacy_model,
                "source": "host",
            }
    return out


def public_provider_summary(cfg: dict | None) -> dict | None:
    """Strip secrets for health / Settings indicators."""
    if not cfg:
        return None
    return {
        "provider": cfg.get("provider") or "",
        "apiUrl": cfg.get("apiUrl") or "",
        "model": cfg.get("model") or "",
        "source": cfg.get("source") or "",
        "hasApiKey": bool(cfg.get("apiKey")),
    }


def is_cloud_stems_provider(cfg: dict | None) -> bool:
    """True when cfg points at a cloud stems API (not local Demucs)."""
    if not cfg:
        return False
    provider = _strip(cfg.get("provider")).lower()
    if provider == "local":
        return False
    return bool(cfg.get("apiKey") or cfg.get("apiUrl"))


def resolve_provider(
    capability: str,
    *,
    overlay: dict | None = None,
    allow_embedded: bool = False,
    local_available: bool = False,
) -> dict | None:
    """Pick the active provider config for a capability."""
    normalized_overlay = normalize_provider_set(overlay)
    if normalized_overlay:
        if normalized_overlay.get("provider") == "local":
            if local_available:
                return dict(normalized_overlay, source="user")
            # fall through if local unavailable
        elif normalized_overlay.get("apiUrl") or normalized_overlay.get("apiKey"):
            return dict(normalized_overlay, source="user")

    if allow_embedded:
        host = host_embedded_providers().get(capability)
        if host:
            if host.get("provider") == "local":
                if local_available:
                    return host
            else:
                return host

    if local_available:
        return {
            "provider": "local",
            "apiUrl": "",
            "apiKey": "",
            "model": "",
            "source": "local",
        }
    return None


def openai_compat_chat_url(api_url: str) -> str:
    base = api_url.rstrip("/")
    if base.endswith("/v1"):
        return base + OPENAI_COMPAT_CHAT
    if base.endswith("/chat/completions"):
        return base
    return base + "/v1" + OPENAI_COMPAT_CHAT


def openai_compat_transcriptions_url(api_url: str) -> str:
    base = api_url.rstrip("/")
    if base.endswith("/v1"):
        return base + OPENAI_COMPAT_TRANSCRIPTIONS
    if base.endswith("/audio/transcriptions"):
        return base
    return base + "/v1" + OPENAI_COMPAT_TRANSCRIPTIONS


def providers_health_payload(
    *,
    allow_embedded: bool,
    local_backends: dict[str, bool],
) -> dict[str, Any]:
    """Describe provider backends for /health without exposing secrets."""
    host = host_embedded_providers()
    caps = {}
    for cap in CAPABILITIES:
        local_ok = bool(local_backends.get(cap))
        # For anonymous health, advertise whether host *has* embedded (not keys)
        has_host = cap in host
        resolved = resolve_provider(
            cap,
            overlay=None,
            allow_embedded=allow_embedded and has_host,
            local_available=local_ok,
        )
        caps[cap] = {
            "localAvailable": local_ok,
            "hostEmbeddedConfigured": has_host,
            "hostEmbeddedUsable": bool(allow_embedded and has_host),
            "active": public_provider_summary(resolved),
        }
    return {
        "capabilities": caps,
        "hostEmbeddedConfigured": {cap: (cap in host) for cap in CAPABILITIES},
    }
