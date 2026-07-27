#!/usr/bin/env python3
"""Batch tag audit and optional MusicBrainz-assisted tag suggestions (dry-run by default)."""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request

from _common import load_entries, parse_phase_arg, write_report
from music_collection import music_collection_root, resolve_music_collection_file


def musicbrainz_lookup(title, artist):
    query = f'recording:"{title}" AND artist:"{artist}"'
    url = "https://musicbrainz.org/ws/2/recording/?" + urllib.parse.urlencode({
        "query": query,
        "fmt": "json",
        "limit": 3,
    })
    req = urllib.request.Request(url, headers={"User-Agent": "abc2book-curation/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)
    recordings = data.get("recordings") or []
    out = []
    for rec in recordings[:3]:
        out.append({
            "id": rec.get("id"),
            "title": rec.get("title"),
            "score": rec.get("score"),
            "artist": ((rec.get("artist-credit") or [{}])[0]).get("name"),
        })
    return out


def main():
    phase = parse_phase_arg()
    apply = "--apply" in sys.argv
    limit = 50
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=", 1)[1])
    entries = load_entries(phase)
    suggestions = []
    for entry_id, entry in list(entries.items())[:limit]:
        title = str(entry.get("title") or "").strip()
        artist = str(entry.get("artist") or "").strip()
        if not title or not artist:
            continue
        missing = []
        if not str(entry.get("genre") or "").strip():
            missing.append("genre")
        if entry.get("bpm") in (None, "", 0):
            missing.append("bpm")
        if not missing:
            continue
        try:
            matches = musicbrainz_lookup(title, artist)
        except Exception as exc:
            matches = [{"error": str(exc)}]
        suggestions.append({
            "entryId": entry_id,
            "path": entry.get("path"),
            "title": title,
            "artist": artist,
            "missing": missing,
            "musicbrainz": matches,
        })
    payload = {"phase": phase or "all", "apply": apply, "suggestions": suggestions}
    write_report(f"batch-tag-{phase or 'all'}.json", payload)
    print(f"suggestions={len(suggestions)} apply={apply}")


if __name__ == "__main__":
    main()
