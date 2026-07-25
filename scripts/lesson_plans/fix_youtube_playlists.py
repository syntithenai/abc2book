#!/usr/bin/env python3
"""Replace broken placeholder YouTube IDs in ireland lesson-meta.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
META_PATH = ROOT / "lesson plans" / "10-regions" / "celtic" / "ireland" / "lesson-meta.json"

# Broken video id -> verified replacement (Irish trad / lesson-appropriate)
ID_REPLACEMENTS: dict[str, str] = {
    "8Qn_spdM5Zg": "8J4FZqknpjg",  # was Star Wars trailer
    "1y6smkh6c-0": "O9a8pVGa1Mo",  # was Swedish House Mafia
    "OqHp03RRTDs": "rfwJgcwE5PY",  # was cartoon
    "u7n8j7Q6BfM": "5K6FwA7uAfw",
    "0qanF-91aEs": "s11BuatTuXk",
    "6x0c3R6Lz5Y": "L__TrWhq4Uk",
    "H1QldbqXh8I": "1XgcXJzojxM",
    "5gVj1k0qJZQ": "AQiZ5nsZ1Bo",
    "0n3aXvZgY2c": "JyP407UnUWw",
    "0J0MeiLtEEQ": "ocxyqLfHFqk",
    "3a4sW8W3-_0": "ZIqr1Ge8Z5w",
    "4Q0qYiYwJPM": "zt-qn7KwnFo",
    "H0M5kR7k6lw": "N0K8bww7rtQ",
    "6BODyMuK6uY": "Hwb8C2TijYE",
    "6nXy8p8m7hY": "WvQH-jcAAEg",
    "i6mV7y95vGQ": "WvQH-jcAAEg",
    "OVRafYXf0nM": "Ypxk7bTNGWc",
    "sbb3xx70GN8": "wb67_Dv0gXM",
    "wq6wOu9vV9E": "Lt-BUD37SwA",
    "0Y5a2vS8V8Y": "JyP407UnUWw",
    "4vQvr3iiZOY": "JyP407UnUWw",
    "oXL-gFTtgaI": "1XgcXJzojxM",
    "9fuNXOdCn94": "f5Q1zQr3pBk",
    "dH-t9wjsu1g": "JyP407UnUWw",
    "1y6smkh6cNg": "Lt-BUD37SwA",
    "G0LHTmKfNp4": "x3BkUknxAk8",
}

# Tracks missing youtube entirely
MISSING_YOUTUBE: dict[str, str] = {
    "coleman-sally-gardens": "https://www.youtube.com/watch?v=WvQH-jcAAEg",
    "hayes-tullycrine": "https://www.youtube.com/watch?v=Lt-BUD37SwA",
    "carroll-loosening-belt": "https://www.youtube.com/watch?v=ZVoB5Gx-uqc",
    "carroll-fruit-snoot": "https://www.youtube.com/watch?v=1XgcXJzojxM",
}

TRACK_OVERRIDES: dict[str, str] = {
    "planxty-irwin": "https://www.youtube.com/watch?v=f5Q1zQr3pBk",
    "clancy-wild-rover": "https://www.youtube.com/watch?v=qdl-yB0MapI",
    "sean-nos-sample": "https://www.youtube.com/watch?v=VqrUm7Qn8tc",
    "session-ennis": "https://www.youtube.com/watch?v=1XgcXJzojxM",
    "fleadh-stage": "https://www.youtube.com/watch?v=rfwJgcwE5PY",
}

YOUTUBE_ID_RE = re.compile(r"(?:youtu\.be/|v=|/embed/)([A-Za-z0-9_-]{11})")


def extract_id(url: str) -> str | None:
    m = YOUTUBE_ID_RE.search(url or "")
    return m.group(1) if m else None


def replace_id_in_url(url: str, new_id: str) -> str:
    old = extract_id(url)
    if not old:
        return "https://www.youtube.com/watch?v=" + new_id
    return url.replace(old, new_id)


def patch_playlist(tracks: list) -> int:
    changed = 0
    for track in tracks or []:
        if not isinstance(track, dict):
            continue
        tid = track.get("id") or ""
        if tid in TRACK_OVERRIDES:
            track["youtube"] = TRACK_OVERRIDES[tid]
            changed += 1
            continue
        url = track.get("youtube") or track.get("youtubeId") or ""
        if not url and tid in MISSING_YOUTUBE:
            track["youtube"] = MISSING_YOUTUBE[tid]
            changed += 1
            continue
        vid = extract_id(url)
        if vid and vid in ID_REPLACEMENTS:
            track["youtube"] = replace_id_in_url(url, ID_REPLACEMENTS[vid])
            changed += 1
    return changed


def main() -> None:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    total = 0
    for lesson_id, data in meta.items():
        if not isinstance(data, dict):
            continue
        total += patch_playlist(data.get("playlist"))
        for tune in data.get("tunes") or []:
            if isinstance(tune, dict):
                total += patch_playlist(tune.get("playlist"))
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Patched {total} playlist entries in {META_PATH}")


if __name__ == "__main__":
    main()
