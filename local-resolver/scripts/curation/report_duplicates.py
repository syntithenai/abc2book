#!/usr/bin/env python3
"""Duplicate groups report keyed by songKey (artist+title)."""

from __future__ import annotations

from _common import load_entries, parse_phase_arg, write_report
from music_collection_analytics import build_duplicate_groups


def main():
    phase = parse_phase_arg()
    entries = load_entries(phase)
    groups = build_duplicate_groups(entries, group_type="songKey", limit=200)
    exact = build_duplicate_groups(entries, group_type="exact", limit=100)
    payload = {
        "phase": phase or "all",
        "songKeyGroups": groups,
        "exactGroups": exact,
        "songKeyGroupCount": len(groups),
        "exactGroupCount": len(exact),
    }
    write_report(f"duplicates-{phase or 'all'}.json", payload)
    print(f"songKeyGroups={len(groups)} exactGroups={len(exact)}")


if __name__ == "__main__":
    main()
