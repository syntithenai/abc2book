#!/usr/bin/env python3
"""Scaffold all regional tradition blocks (B–L) with lessons, meta, and curriculum slots."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from regional_blocks_config import BLOCKS
from regional_lesson_builder import (
    SLOT_FILE_SLUGS,
    comparative_lesson_md,
    diaspora_lesson_md,
    lesson_id_for,
    lesson_markdown,
    meta_for_lesson,
    slot_title,
)

ROOT = Path(__file__).resolve().parents[2]
LESSON_ROOT = ROOT / "lesson plans"
CURRICULUM_PATH = LESSON_ROOT / "curriculum.json"
REGIONS_ROOT = LESSON_ROOT / "10-regions"


def scaffold_block(block, *, skip_existing: bool) -> list[dict]:
    block_root = REGIONS_ROOT / block.folder
    block_root.mkdir(parents=True, exist_ok=True)
    anchor = next(n for n in block.nations if n.key == block.anchor_key)
    slots: list[dict] = []
    last_nation_final_id = ""

    for nation in block.nations:
        nation_dir = block_root / nation.key
        nation_dir.mkdir(parents=True, exist_ok=True)
        meta: dict[str, dict] = {}
        is_anchor = nation.key == block.anchor_key
        prev_id = f"regions-celtic-ireland-01-overview" if is_anchor else ""

        for slot_index, (file_slug, short_title, tier) in enumerate(SLOT_FILE_SLUGS):
            lesson_id = lesson_id_for(block, nation, file_slug)
            title = slot_title(nation, short_title)
            if slot_index == 0:
                prerequisites = ["regions-celtic-ireland-01-overview"] if not is_anchor else []
            else:
                prerequisites = [prev_id]
            tags = [block.id_prefix, nation.key, block.block_id] + short_title.lower().split()[:2]
            out_path = nation_dir / f"{file_slug}.md"
            if skip_existing and out_path.exists():
                prev_id = lesson_id
                if slot_index == len(SLOT_FILE_SLUGS) - 1:
                    last_nation_final_id = lesson_id
                continue

            md = lesson_markdown(
                block, nation, anchor, file_slug, slot_index, lesson_id, title,
                tier, prerequisites, tags, is_anchor,
            )
            out_path.write_text(md, encoding="utf-8")
            meta[lesson_id] = meta_for_lesson(block, nation, lesson_id, title, slot_index)
            slots.append({
                "id": lesson_id,
                "unit": f"{block.id_prefix}-{nation.key}",
                "track": "regions",
                "tier": tier,
                "region": nation.region,
                "title": title,
                "difficulty": min(10, int(tier) + 2),
                "prerequisites": prerequisites,
                "tags": tags,
                "output": f"10-regions/{block.folder}/{nation.key}/{file_slug}.md",
                "status": "manual",
            })
            prev_id = lesson_id
            if slot_index == len(SLOT_FILE_SLUGS) - 1:
                last_nation_final_id = lesson_id

        meta_path = nation_dir / "lesson-meta.json"
        if meta:
            if skip_existing and meta_path.exists():
                existing = json.loads(meta_path.read_text(encoding="utf-8"))
                existing.update(meta)
                meta = existing
            meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Diaspora
    diaspora_dir = block_root / "diaspora"
    diaspora_dir.mkdir(parents=True, exist_ok=True)
    diaspora_meta: dict[str, dict] = {}
    prev = last_nation_final_id or f"regions-{block.id_prefix}-{block.anchor_key}-08-tunes"
    for slug, title, body in block.diaspora:
        lesson_id = f"regions-{block.id_prefix}-diaspora-{slug}"
        out_path = diaspora_dir / f"{slug}.md"
        prerequisites = [prev]
        tags = [block.id_prefix, "diaspora", block.block_id]
        if not (skip_existing and out_path.exists()):
            out_path.write_text(
                diaspora_lesson_md(block, lesson_id, title, body, 4, prerequisites, tags),
                encoding="utf-8",
            )
            diaspora_meta[lesson_id] = meta_for_lesson(
                block, anchor, lesson_id, title, 0,
            )
            slots.append({
                "id": lesson_id,
                "unit": f"{block.id_prefix}-diaspora",
                "track": "regions",
                "tier": 4,
                "region": f"{block.id_prefix}-diaspora",
                "title": title,
                "difficulty": 6,
                "prerequisites": prerequisites,
                "tags": tags,
                "output": f"10-regions/{block.folder}/diaspora/{slug}.md",
                "status": "manual",
            })
        prev = lesson_id

    diaspora_meta_path = diaspora_dir / "lesson-meta.json"
    if diaspora_meta:
        if skip_existing and diaspora_meta_path.exists():
            existing = json.loads(diaspora_meta_path.read_text(encoding="utf-8"))
            existing.update(diaspora_meta)
            diaspora_meta = existing
        diaspora_meta_path.write_text(json.dumps(diaspora_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Comparative
    comp_dir = block_root / "comparative"
    comp_dir.mkdir(parents=True, exist_ok=True)
    comp_meta: dict[str, dict] = {}
    prev = f"regions-{block.id_prefix}-diaspora-05-listening-across-borders"
    for slug, title, body in block.comparative:
        lesson_id = f"regions-{block.id_prefix}-comparative-{slug}"
        out_path = comp_dir / f"{slug}.md"
        prerequisites = (
            [f"regions-{block.id_prefix}-{block.anchor_key}-01-overview"]
            if slug == "01-what-the-tradition-means"
            else [prev]
        )
        tags = [block.id_prefix, "comparative", block.block_id]
        if not (skip_existing and out_path.exists()):
            out_path.write_text(
                comparative_lesson_md(block, lesson_id, title, body, 4, prerequisites, tags),
                encoding="utf-8",
            )
            comp_meta[lesson_id] = meta_for_lesson(block, anchor, lesson_id, title, 0)
            slots.append({
                "id": lesson_id,
                "unit": f"{block.id_prefix}-comparative",
                "track": "regions",
                "tier": 4,
                "region": f"{block.id_prefix}-comparative",
                "title": title,
                "difficulty": 6,
                "prerequisites": prerequisites,
                "tags": tags,
                "output": f"10-regions/{block.folder}/comparative/{slug}.md",
                "status": "manual",
            })
        prev = lesson_id

    comp_meta_path = comp_dir / "lesson-meta.json"
    if comp_meta:
        if skip_existing and comp_meta_path.exists():
            existing = json.loads(comp_meta_path.read_text(encoding="utf-8"))
            existing.update(comp_meta)
            comp_meta = existing
        comp_meta_path.write_text(json.dumps(comp_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return slots


def update_curriculum(all_slots: list[dict], blocks) -> None:
    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))
    curriculum["tracks"]["regions"]["label"] = "Regional Traditions"
    units = curriculum.setdefault("units", {})

    for block in blocks:
        for nation in block.nations:
            uid = f"{block.id_prefix}-{nation.key}"
            units[uid] = {
                "track": "regions",
                "label": f"{block.track_label} — {nation.title_prefix}",
                "region": nation.region,
                "status": "draft",
            }
        units[f"{block.id_prefix}-diaspora"] = {
            "track": "regions",
            "label": f"{block.track_label} — Diaspora",
            "region": f"{block.id_prefix}-diaspora",
            "status": "draft",
        }
        units[f"{block.id_prefix}-comparative"] = {
            "track": "regions",
            "label": f"{block.track_label} — Comparative",
            "region": f"{block.id_prefix}-comparative",
            "status": "draft",
        }

    existing_ids = {s["id"] for s in curriculum.get("slots", [])}
    added = 0
    for slot in all_slots:
        if slot["id"] not in existing_ids:
            curriculum.setdefault("slots", []).append(slot)
            existing_ids.add(slot["id"])
            added += 1

    CURRICULUM_PATH.write_text(json.dumps(curriculum, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Curriculum: added {added} new slots ({len(curriculum['slots'])} total)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scaffold regional tradition blocks")
    parser.add_argument("--block", default="", help="Single block_id (default: all)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing lessons")
    args = parser.parse_args()

    blocks = [b for b in BLOCKS if not args.block or b.block_id == args.block]
    if not blocks:
        raise SystemExit(f"Unknown block: {args.block}")

    all_slots: list[dict] = []
    total = 0
    for block in blocks:
        slots = scaffold_block(block, skip_existing=not args.force)
        all_slots.extend(slots)
        total += len(slots)
        print(f"  {block.block_id}: {len(slots)} lessons")

    update_curriculum(all_slots, blocks)
    print(f"Scaffolded {total} lessons across {len(blocks)} block(s)")


if __name__ == "__main__":
    main()
