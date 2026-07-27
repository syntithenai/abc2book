"""Shared helpers for music collection curation CLI scripts."""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from music_collection import load_music_collection_index, music_collection_metadata_dir, music_collection_root
from music_collection_moves import filter_entries_for_phase
from music_collection_registry import load_music_collection_registry


def reports_dir():
    path = os.path.join(music_collection_root(), "_reports")
    os.makedirs(path, exist_ok=True)
    return path


def write_report(name, payload):
    path = os.path.join(reports_dir(), name)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(path)
    return path


def load_entries(phase=""):
    index = load_music_collection_index() or {}
    entries = index.get("entries") or {}
    return filter_entries_for_phase(entries, phase)


def parse_phase_arg(default=""):
    for arg in sys.argv[1:]:
        if arg.startswith("--phase="):
            return arg.split("=", 1)[1]
    return default
