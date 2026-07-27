#!/usr/bin/env python3
"""Detect/write BPM tags for files missing TBPM (checkpointed, optional librosa)."""

from __future__ import annotations

import json
import os
import sys

from _common import load_entries, parse_phase_arg, reports_dir, write_report
from music_collection import music_collection_root, resolve_music_collection_file
from music_collection_analytics import parse_bpm_value


def detect_bpm_librosa(abs_path):
    try:
        import librosa
        import numpy as np
    except ImportError:
        return None, "librosa_not_installed"
    try:
        y, sr = librosa.load(abs_path, sr=None, mono=True, duration=90)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        value = float(np.asarray(tempo).reshape(-1)[0])
        if value <= 0 or value > 400:
            return None, "out_of_range"
        return round(value, 1), None
    except Exception as exc:
        return None, type(exc).__name__


def write_bpm_tag(abs_path, bpm):
    from mutagen import File as MutagenFile
    from mutagen.id3 import ID3, TBPM
    from mutagen.mp4 import MP4FreeForm

    audio = MutagenFile(abs_path)
    if audio is None:
        return False
    if hasattr(audio, "tags") and audio.tags is not None:
        if audio.tags.__class__.__name__ == "ID3" or abs_path.lower().endswith(".mp3"):
            try:
                tags = ID3(abs_path)
            except Exception:
                tags = ID3()
            tags.add(TBPM(encoding=3, text=str(int(round(bpm)))))
            tags.save(abs_path)
            return True
        if abs_path.lower().endswith((".m4a", ".mp4")):
            audio.tags["tmpo"] = [int(round(bpm))]
            audio.save()
            return True
        try:
            audio["bpm"] = str(int(round(bpm)))
            audio.save()
            return True
        except Exception:
            pass
    return False


def main():
    phase = parse_phase_arg()
    apply = "--apply" in sys.argv
    batch_limit = 100
    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            batch_limit = int(arg.split("=", 1)[1])
    checkpoint_path = os.path.join(reports_dir(), f"bpm-checkpoint-{phase or 'all'}.json")
    done = set()
    if os.path.isfile(checkpoint_path):
        with open(checkpoint_path, "r", encoding="utf-8") as handle:
            done = set(json.load(handle).get("done") or [])
    entries = load_entries(phase)
    results = []
    for entry_id, entry in entries.items():
        if entry_id in done:
            continue
        if entry.get("bpm"):
            done.add(entry_id)
            continue
        path = str(entry.get("path") or "")
        if not path:
            continue
        try:
            abs_path = resolve_music_collection_file(path)
        except Exception:
            continue
        bpm = parse_bpm_value(entry.get("bpm"))
        source = "tag"
        err = None
        if not bpm:
            bpm, err = detect_bpm_librosa(abs_path)
            source = "librosa"
        wrote = False
        if bpm and apply:
            wrote = write_bpm_tag(abs_path, bpm)
        results.append({
            "entryId": entry_id,
            "path": path,
            "bpm": bpm,
            "source": source,
            "error": err,
            "written": wrote,
        })
        done.add(entry_id)
        if len(results) >= batch_limit:
            break
    with open(checkpoint_path, "w", encoding="utf-8") as handle:
        json.dump({"done": sorted(done)}, handle)
    payload = {"phase": phase or "all", "apply": apply, "results": results}
    write_report(f"detect-bpm-{phase or 'all'}.json", payload)
    print(f"processed={len(results)} apply={apply}")


if __name__ == "__main__":
    main()
