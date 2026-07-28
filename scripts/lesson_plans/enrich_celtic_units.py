#!/usr/bin/env python3
"""Apply incremental enrichment patches to Celtic unit lesson-meta.json and markdown."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from celtic_enrichment_data import (
    ARTIST_POOLS as ARTIST_POOLS_R1,
    EXTRA_READING as EXTRA_READING_R1,
    MARKDOWN_INSERTS as MARKDOWN_INSERTS_R1,
    META_PATCHES as META_PATCHES_R1,
)
from celtic_enrichment_round2 import (
    ARTIST_POOLS_R2,
    EXTRA_READING_R2,
    MARKDOWN_INSERTS_R2,
    META_PATCHES_R2,
)

ROOT = Path(__file__).resolve().parents[2]
CELTIC_ROOT = ROOT / "lesson plans" / "10-regions" / "celtic"

UNITS = ("scotland", "wales", "brittany", "diaspora", "comparative")


def merge_nested_dicts(base: dict, extra: dict) -> dict:
    out = dict(base)
    for key, value in extra.items():
        if key not in out:
            out[key] = value
        elif isinstance(value, dict) and isinstance(out[key], dict):
            out[key] = merge_nested_dicts(out[key], value)
        else:
            out[key] = value
    return out


def merge_lesson_patches(r1: dict, r2: dict) -> dict:
    """Merge per-lesson meta patches; round-2 tunes replace when present."""
    all_ids = set(r1) | set(r2)
    merged: dict[str, dict] = {}
    for lesson_id in all_ids:
        p1 = dict(r1.get(lesson_id) or {})
        p2 = dict(r2.get(lesson_id) or {})
        combined = {
            "add_entities": list(p1.get("add_entities") or []) + list(p2.get("add_entities") or []),
            "add_playlist": list(p1.get("add_playlist") or []) + list(p2.get("add_playlist") or []),
        }
        if p2.get("tunes"):
            combined["tunes"] = p2["tunes"]
        elif p1.get("tunes"):
            combined["tunes"] = p1["tunes"]
        merged[lesson_id] = combined
    return merged


ARTIST_POOLS = {
    unit: merge_nested_dicts(ARTIST_POOLS_R1.get(unit, {}), ARTIST_POOLS_R2.get(unit, {}))
    for unit in UNITS
}
EXTRA_READING = {
    unit: merge_nested_dicts(EXTRA_READING_R1.get(unit, {}), EXTRA_READING_R2.get(unit, {}))
    for unit in UNITS
}
META_PATCHES = {
    unit: merge_lesson_patches(META_PATCHES_R1.get(unit, {}), META_PATCHES_R2.get(unit, {}))
    for unit in UNITS
}
MARKDOWN_INSERTS = {**MARKDOWN_INSERTS_R1, **MARKDOWN_INSERTS_R2}


def dedupe_items(items: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for item in items:
        title = str(item.get("title", ""))
        url = str(item.get("url", ""))
        author = str(item.get("author", ""))
        key = f"{title}|{url}|{author}".lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def dedupe_entities(entities: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    for ent in entities:
        if not isinstance(ent, dict) or not ent.get("id"):
            continue
        eid = str(ent["id"])
        if eid in by_id:
            merged = dict(by_id[eid])
            merged.update(ent)
            by_id[eid] = merged
        else:
            by_id[eid] = dict(ent)
    return list(by_id.values())


def dedupe_playlist(tracks: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for track in tracks:
        if not isinstance(track, dict):
            continue
        key = str(track.get("id") or track.get("label") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(track)
    return out


def merge_meta_entry(entry: dict, patch: dict, artist_pool: dict) -> dict:
    merged = dict(entry)
    entities = list(merged.get("entities") or [])
    for eid in patch.get("add_entities") or []:
        if eid in artist_pool:
            entities.append(dict(artist_pool[eid]))
    merged["entities"] = dedupe_entities(entities)

    playlist = list(merged.get("playlist") or [])
    playlist.extend(patch.get("add_playlist") or [])
    merged["playlist"] = dedupe_playlist(playlist)

    if patch.get("tunes"):
        merged["tunes"] = patch["tunes"]

    return merged


def enrich_meta(unit: str) -> int:
    meta_path = CELTIC_ROOT / unit / "lesson-meta.json"
    if not meta_path.exists():
        print(f"  skip meta (missing): {meta_path}")
        return 0
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    artist_pool = ARTIST_POOLS.get(unit, {})
    patches = META_PATCHES.get(unit, {})
    reading = EXTRA_READING.get(unit, {})
    changed = 0

    for lesson_id, patch in patches.items():
        if lesson_id not in meta:
            continue
        before = json.dumps(meta[lesson_id], sort_keys=True)
        meta[lesson_id] = merge_meta_entry(meta[lesson_id], patch, artist_pool)
        after = json.dumps(meta[lesson_id], sort_keys=True)
        if before != after:
            changed += 1
            print(f"  meta patch: {lesson_id}")

    for lesson_id, extras in reading.items():
        if lesson_id not in meta:
            continue
        current = list(meta[lesson_id].get("reading_list") or [])
        merged = dedupe_items(current + extras)
        if len(merged) > len(current):
            meta[lesson_id]["reading_list"] = merged
            changed += 1
            print(f"  reading: {lesson_id} ({len(current)} -> {len(merged)})")

    if changed:
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return changed


def enrich_markdown() -> int:
    changed = 0
    for rel_path, spec in MARKDOWN_INSERTS.items():
        path = CELTIC_ROOT / rel_path
        if not path.exists():
            print(f"  skip markdown (missing): {rel_path}")
            continue
        text = path.read_text(encoding="utf-8")
        anchor = spec["anchor"]
        insert = spec["insert"]
        if anchor not in text:
            print(f"  anchor not found: {rel_path}")
            continue
        if insert.strip() in text:
            continue
        text = text.replace(anchor, insert + anchor, 1)
        path.write_text(text, encoding="utf-8")
        changed += 1
        print(f"  markdown: {rel_path}")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Incrementally enrich Celtic unit content")
    parser.add_argument(
        "--unit",
        choices=list(UNITS) + ["all"],
        default="all",
        help="Which unit to enrich (default: all non-Ireland Celtic units)",
    )
    args = parser.parse_args()
    units = list(UNITS) if args.unit == "all" else [args.unit]

    total = 0
    for unit in units:
        print(f"Enriching {unit}...")
        total += enrich_meta(unit)
    total += enrich_markdown()
    print(f"Done — {total} enrichment operations applied.")


if __name__ == "__main__":
    main()
