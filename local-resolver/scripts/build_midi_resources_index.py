#!/usr/bin/env python3
"""Build a searchable index for the local MIDI resources library."""

from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from midi_resources import (  # noqa: E402
    MIDI_RESOURCES_INDEX_NAME,
    _tokenize_index_text,
    title_from_midi_relative_path,
)


def iter_midi_files(root_dir):
    for dirpath, _dirnames, filenames in os.walk(root_dir):
        for filename in filenames:
            lower = filename.lower()
            if lower.endswith(".mid") or lower.endswith(".midi"):
                abs_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(abs_path, root_dir).replace("\\", "/")
                yield rel_path


def build_index(root_dir):
    entries = {}
    tokens = {}
    next_id = 0

    for rel_path in sorted(iter_midi_files(root_dir)):
        entry_id = str(next_id)
        next_id += 1
        title = title_from_midi_relative_path(rel_path)
        category = ""
        parts = rel_path.split("/")
        if len(parts) > 1:
            category = parts[0]
        entries[entry_id] = {
            "title": title,
            "path": rel_path,
            "category": category,
        }

        token_source = " ".join([title, rel_path.replace("/", " "), category])
        for token in _tokenize_index_text(token_source):
            bucket = tokens.setdefault(token, [])
            bucket.append(entry_id)

    return {
        "version": 1,
        "root": os.path.abspath(root_dir),
        "count": len(entries),
        "entries": entries,
        "tokens": tokens,
        "indexName": MIDI_RESOURCES_INDEX_NAME,
    }


def main():
    parser = argparse.ArgumentParser(description="Build midi_resources_index.json")
    parser.add_argument(
        "root",
        nargs="?",
        default=os.getenv(
            "MIDI_RESOURCES_DIR",
            os.path.abspath(os.path.join(ROOT, "..", "..", "abc2book_midi_resources")),
        ),
        help="MIDI resources root directory",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output index path (default: <root>/midi_resources_index.json)",
    )
    args = parser.parse_args()

    root_dir = os.path.abspath(args.root)
    if not os.path.isdir(root_dir):
        print("MIDI resources directory not found:", root_dir, file=sys.stderr)
        return 1

    index = build_index(root_dir)
    output_path = os.path.abspath(args.output or os.path.join(root_dir, MIDI_RESOURCES_INDEX_NAME))
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(index, handle, separators=(",", ":"))

    print("Wrote", output_path)
    print("Entries:", index.get("count", 0))
    print("Tokens:", len(index.get("tokens") or {}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
