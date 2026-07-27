#!/usr/bin/env python3
"""Report missing tags including BPM."""

from __future__ import annotations

from collections import Counter

from _common import load_entries, parse_phase_arg, write_report


def main():
    phase = parse_phase_arg()
    entries = load_entries(phase)
    missing = Counter()
    samples = []
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        gaps = []
        for field in ("title", "artist", "genre", "year", "bpm"):
            value = entry.get(field)
            if field == "bpm":
                if value in (None, "", 0):
                    gaps.append(field)
            elif not str(value or "").strip():
                gaps.append(field)
        for gap in gaps:
            missing[gap] += 1
        if gaps and len(samples) < 50:
            samples.append({
                "id": entry_id,
                "path": entry.get("path"),
                "title": entry.get("title"),
                "artist": entry.get("artist"),
                "missing": gaps,
            })
    payload = {
        "phase": phase or "all",
        "trackCount": len(entries),
        "missingCounts": dict(missing),
        "samples": samples,
    }
    write_report(f"tag-gaps-{phase or 'all'}.json", payload)
    print(dict(missing))


if __name__ == "__main__":
    main()
