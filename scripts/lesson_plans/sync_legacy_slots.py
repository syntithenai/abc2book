#!/usr/bin/env python3
"""Add legacy README corpus lessons as curriculum slots for app manifest export."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README_PATH = ROOT / "lesson plans" / "README.md"
CURRICULUM_PATH = ROOT / "lesson plans" / "curriculum.json"

ROW_RE = re.compile(
    r"^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*$"
)
PART_RE = re.compile(r"^### Part [^—]+ — (.+)$")

UNIT_BY_PART = {
    "Foundations (start here)": ("legacy-foundations", "Foundations"),
    "Performance vocabulary": ("legacy-italian-terms", "Italian terms"),
    "Chords and harmony": ("legacy-chords-harmony", "Chords & harmony"),
    "Transposition": ("legacy-transposition", "Transposition"),
    "Musical form and analysis": ("legacy-form-analysis", "Form & analysis"),
    "Ear training": ("legacy-ear-training", "Ear training"),
    "Music history: periods": ("legacy-music-periods", "Music periods"),
    "Composer profiles": ("legacy-composers", "Composer profiles"),
    "Styles and genres": ("legacy-styles", "Styles & genres"),
    "Instruments": ("legacy-instruments", "Instruments"),
    "Singing technique": ("legacy-singing", "Singing technique"),
}

TRACK_BY_UNIT = {
    "legacy-foundations": "foundations",
    "legacy-italian-terms": "italian",
    "legacy-chords-harmony": "chords",
    "legacy-transposition": "transposition",
    "legacy-form-analysis": "theory",
    "legacy-ear-training": "theory",
    "legacy-music-periods": "history",
    "legacy-composers": "history",
    "legacy-styles": "styles",
    "legacy-instruments": "instruments",
    "legacy-singing": "singing",
}


def parse_readme_rows() -> list[tuple[str, str, str, str]]:
    text = README_PATH.read_text(encoding="utf-8")
    current_part = ""
    rows: list[tuple[str, str, str, str]] = []
    for line in text.splitlines():
        part_match = PART_RE.match(line.strip())
        if part_match:
            current_part = part_match.group(1).strip()
            continue
        row_match = ROW_RE.match(line)
        if not row_match or not current_part:
            continue
        title, _label, rel_path = row_match.group(1).strip(), row_match.group(2), row_match.group(3).strip()
        rows.append((current_part, title, rel_path, rel_path.rsplit("/", 1)[-1].replace(".md", "")))
    return rows


def slot_id_for(unit_id: str, stem: str) -> str:
    slug = re.sub(r"^\d+-", "", stem)
    return f"{unit_id}-{slug}"


def main() -> None:
    curriculum = json.loads(CURRICULUM_PATH.read_text(encoding="utf-8"))
    units = curriculum.setdefault("units", {})
    slots = curriculum.setdefault("slots", [])
    existing_ids = {slot["id"] for slot in slots}
    added = 0

    for part_name, title, output, stem in parse_readme_rows():
        unit_id, unit_label = UNIT_BY_PART[part_name]
        units.setdefault(
            unit_id,
            {
                "track": TRACK_BY_UNIT.get(unit_id, "theory"),
                "label": unit_label,
                "status": "legacy",
            },
        )
        lesson_id = slot_id_for(unit_id, stem)
        if lesson_id in existing_ids:
            continue
        track = TRACK_BY_UNIT.get(unit_id, "theory")
        slots.append(
            {
                "id": lesson_id,
                "unit": unit_id,
                "track": track,
                "tier": 1,
                "title": title,
                "difficulty": 2,
                "prerequisites": [],
                "tags": [track, "legacy"],
                "output": output,
                "status": "legacy",
            }
        )
        existing_ids.add(lesson_id)
        added += 1

    CURRICULUM_PATH.write_text(json.dumps(curriculum, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added {added} legacy lesson slots ({len(existing_ids)} total slot ids)")


if __name__ == "__main__":
    main()
