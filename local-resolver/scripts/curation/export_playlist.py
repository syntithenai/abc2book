#!/usr/bin/env python3
"""Export M3U playlist from unplayed / exploration report."""

from __future__ import annotations

import json
import os
import sys

from _common import load_entries, parse_phase_arg, reports_dir


def main():
    phase = parse_phase_arg()
    limit = 100
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=", 1)[1])
    entries = load_entries(phase)
    root = os.environ.get("MUSIC_COLLECTION_DIR", "/home/stever/Music")
    tracks = []
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        play_count = entry.get("playCount")
        if isinstance(play_count, int) and play_count > 0:
            continue
        genre = str(entry.get("genre") or "").strip()
        path = str(entry.get("path") or "")
        if not path:
            continue
        tracks.append({
            "entryId": entry_id,
            "title": entry.get("title") or "",
            "artist": entry.get("artist") or "",
            "genre": genre,
            "path": path,
        })
    tracks.sort(key=lambda row: (str(row.get("genre") or ""), str(row.get("artist") or "")))
    tracks = tracks[:limit]
    lines = ["#EXTM3U"]
    for row in tracks:
        title = row["title"] or "Track"
        artist = row["artist"] or "Unknown"
        lines.append(f"#EXTINF:-1,{artist} - {title}")
        lines.append(os.path.join(root, row["path"]))
    out_name = f"exploration-{phase or 'all'}.m3u"
    out_path = os.path.join(reports_dir(), out_name)
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    print(out_path)
    print(f"tracks={len(tracks)}")


if __name__ == "__main__":
    main()
