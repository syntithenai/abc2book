#!/usr/bin/env python3
"""Report unplayed / low-play tracks for cull review."""

from __future__ import annotations

from _common import load_entries, parse_phase_arg, write_report


def main():
    phase = parse_phase_arg()
    entries = load_entries(phase)
    unplayed = []
    low_play = []
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        play_count = entry.get("playCount")
        item = {
            "id": entry_id,
            "title": entry.get("title"),
            "artist": entry.get("artist"),
            "path": entry.get("path"),
            "playCount": play_count or 0,
            "genre": entry.get("genre"),
        }
        if not play_count:
            unplayed.append(item)
        elif isinstance(play_count, int) and play_count <= 2:
            low_play.append(item)
    unplayed.sort(key=lambda row: (str(row.get("artist") or ""), str(row.get("title") or "")))
    low_play.sort(key=lambda row: row.get("playCount") or 0)
    payload = {
        "phase": phase or "all",
        "unplayedCount": len(unplayed),
        "lowPlayCount": len(low_play),
        "unplayed": unplayed[:500],
        "lowPlay": low_play[:500],
    }
    write_report(f"unplayed-{phase or 'all'}.json", payload)
    print(f"unplayed={len(unplayed)} lowPlay={len(low_play)}")


if __name__ == "__main__":
    main()
