"""Feature flags for notation archive collectors."""

from __future__ import annotations

import os

DEFAULT_NOTATION_SOURCES = (
    "josquin",
    "cpdl",
    "imslp",
    "openscore",
    "musicalion",
    "w3c",
)

ALL_NOTATION_SOURCES = set(DEFAULT_NOTATION_SOURCES)


def enabled_notation_sources():
    raw = str(os.getenv("NOTATION_SOURCES", "") or "").strip()
    if not raw or raw.lower() in ("all", "*"):
        return set(DEFAULT_NOTATION_SOURCES)
    enabled = set()
    for part in raw.split(","):
        key = part.strip().lower()
        if key in ALL_NOTATION_SOURCES:
            enabled.add(key)
    return enabled


def notation_source_enabled(name):
    return str(name or "").strip().lower() in enabled_notation_sources()
