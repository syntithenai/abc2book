"""Chromecast HLS session configuration."""

from __future__ import annotations

import os

DEFAULT_RESOLVER_DOMAIN = "peppertrees.syntithenai.com"


def resolver_domain() -> str:
    return os.getenv("RESOLVER_DOMAIN", DEFAULT_RESOLVER_DOMAIN).strip() or DEFAULT_RESOLVER_DOMAIN


def default_resolver_public_base() -> str:
    domain = resolver_domain()
    if domain.startswith("http://") or domain.startswith("https://"):
        return domain.rstrip("/")
    return f"https://{domain}"


def cast_public_url() -> str | None:
    """Public resolver base Chromecast devices can fetch HLS from (optional override)."""
    explicit = os.getenv("CAST_PUBLIC_URL", "").strip()
    if explicit:
        return explicit
    return default_resolver_public_base()
