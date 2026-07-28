#!/usr/bin/env python3
"""Enrich regional unit lesson-meta.json (all blocks B–L + optional Celtic)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from enrich_celtic_units import dedupe_entities, dedupe_items, dedupe_playlist, merge_meta_entry
from regional_blocks_config import BLOCKS
from regional_lesson_builder import SLOT_FILE_SLUGS, YT_POOL, meta_for_lesson, slugify_entity

ROOT = Path(__file__).resolve().parents[2]
REGIONS_ROOT = ROOT / "lesson plans" / "10-regions"

EXTRA_READING = [
    {"type": "link", "title": "Folkways Smithsonian", "url": "https://folkways.si.edu/", "note": "Archive recordings"},
    {"type": "book", "title": "World Music: A Global Journey", "author": "Andrew Shahriari", "note": "Survey reference"},
    {"type": "link", "title": "Ethnomusicology overview", "url": "https://en.wikipedia.org/wiki/Ethnomusicology", "note": "Study methods"},
]


def lesson_id_for(block, nation_key: str, file_slug: str) -> str:
    from regional_lesson_builder import SLOT_ID_SUFFIX

    return f"regions-{block.id_prefix}-{nation_key}-{SLOT_ID_SUFFIX[file_slug]}"


def enrich_meta_file(meta_path: Path, block, nation) -> int:
    if not meta_path.exists():
        return 0
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    changed = 0
    for slot_index, (file_slug, short_title, tier) in enumerate(SLOT_FILE_SLUGS):
        lesson_id = lesson_id_for(block, nation.key, file_slug)
        if lesson_id not in meta:
            continue
        title = f"{nation.title_prefix} — {short_title}"
        target = meta_for_lesson(block, nation, lesson_id, title, slot_index)
        before = json.dumps(meta[lesson_id], sort_keys=True)

        entry = meta[lesson_id]
        if len(entry.get("entities") or []) < 2:
            entry["entities"] = target["entities"]
        if len(entry.get("playlist") or []) < 4:
            entry["playlist"] = target["playlist"]
        if len(entry.get("reading_list") or []) < 6:
            entry["reading_list"] = dedupe_items(list(entry.get("reading_list") or []) + target["reading_list"] + EXTRA_READING)
        if len(entry.get("key_points") or []) < 5:
            entry["key_points"] = target["key_points"]
        if slot_index == 7 and not entry.get("tunes"):
            entry["tunes"] = target.get("tunes") or []

        entry["entities"] = dedupe_entities(entry.get("entities") or [])
        entry["playlist"] = dedupe_playlist(entry.get("playlist") or [])
        entry["reading_list"] = dedupe_items(entry.get("reading_list") or [])[:10]

        after = json.dumps(entry, sort_keys=True)
        if before != after:
            changed += 1
            meta[lesson_id] = entry

    if changed:
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return changed


def enrich_diaspora_comp(meta_path: Path, block, anchor) -> int:
    if not meta_path.exists():
        return 0
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    changed = 0
    for lesson_id in meta:
        entry = meta[lesson_id]
        before = json.dumps(entry, sort_keys=True)
        if len(entry.get("entities") or []) < 2:
            entry["entities"] = [
                {
                    "id": f"{block.id_prefix}-archive",
                    "type": "organization",
                    "name": f"{block.track_label} Archive",
                    "summary": "Regional archive and festival network",
                    "blurb": "Use archives alongside lesson playlists.",
                    "url": f"https://en.wikipedia.org/wiki/Folk_music",
                    "image": "https://en.wikipedia.org/wiki/Special:FilePath/Folk_music.jpg?width=320",
                },
                {
                    "id": f"{block.id_prefix}-festival",
                    "type": "organization",
                    "name": f"{block.track_label} Festival",
                    "summary": "Festival context for trad musicians",
                    "blurb": "Festivals transmit repertoire across borders.",
                    "url": "https://en.wikipedia.org/wiki/Folk_festival",
                    "image": "https://en.wikipedia.org/wiki/Special:FilePath/Music_festival.jpg?width=320",
                },
            ]
        if len(entry.get("playlist") or []) < 4:
            entry["playlist"] = [
                {"id": f"{lesson_id}-pl{i}", "label": f"Recording {i + 1}", "youtube": YT_POOL[i % len(YT_POOL)]}
                for i in range(4)
            ]
        if len(entry.get("reading_list") or []) < 6:
            entry["reading_list"] = dedupe_items(list(entry.get("reading_list") or []) + EXTRA_READING + [
                {"type": "link", "title": block.track_label, "url": f"https://en.wikipedia.org/wiki/Folk_music", "note": "Block orientation"},
            ] * 4)
        if len(entry.get("key_points") or []) < 5:
            entry["key_points"] = [
                f"{block.track_label} rewards comparative listening.",
                f"Anchor: {anchor.title_prefix}.",
                "Diaspora remixes roots with local context.",
                "Festivals and archives link communities.",
                "Avoid generic world-music labels.",
            ]
        after = json.dumps(entry, sort_keys=True)
        if before != after:
            changed += 1
    if changed:
        meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return changed


def enrich_block(block) -> int:
    block_root = REGIONS_ROOT / block.folder
    if not block_root.exists():
        return 0
    anchor = next(n for n in block.nations if n.key == block.anchor_key)
    total = 0
    for nation in block.nations:
        total += enrich_meta_file(block_root / nation.key / "lesson-meta.json", block, nation)
    total += enrich_diaspora_comp(block_root / "diaspora" / "lesson-meta.json", block, anchor)
    total += enrich_diaspora_comp(block_root / "comparative" / "lesson-meta.json", block, anchor)
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich regional unit metadata")
    parser.add_argument("--block", default="", help="Single block_id")
    parser.add_argument("--celtic", action="store_true", help="Also run Celtic enrichment")
    args = parser.parse_args()

    if args.celtic:
        import enrich_celtic_units
        enrich_celtic_units.main()

    blocks = [b for b in BLOCKS if not args.block or b.block_id == args.block]
    grand = 0
    for block in blocks:
        n = enrich_block(block)
        if n:
            print(f"  {block.block_id}: {n} meta entries updated")
        grand += n
    print(f"Done — {grand} enrichment operations.")


if __name__ == "__main__":
    main()
