"""Chromecast HLS session configuration."""

from __future__ import annotations

import os


def cast_public_url() -> str | None:
    """Public resolver base Chromecast devices can fetch HLS from (optional override)."""
    value = os.getenv("CAST_PUBLIC_URL", "").strip()
    return value or None
