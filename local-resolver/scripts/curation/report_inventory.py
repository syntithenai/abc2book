#!/usr/bin/env python3
"""Inventory report for a curation phase."""

from __future__ import annotations

import sys

from _common import load_entries, parse_phase_arg, write_report
from music_collection_analytics import build_collection_stats
from music_collection_registry import load_music_collection_registry


def main():
    phase = parse_phase_arg()
    entries = load_entries(phase)
    stats = build_collection_stats(entries)
    registry = load_music_collection_registry()
    payload = {
        "phase": phase or "all",
        "trackCount": len(entries),
        "stats": stats,
        "registryPhases": list((registry.get("phases") or {}).keys()),
    }
    write_report(f"inventory-{phase or 'all'}.json", payload)
    print(f"tracks={payload['trackCount']}")


if __name__ == "__main__":
    main()
