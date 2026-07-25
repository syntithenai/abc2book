#!/usr/bin/env python3
"""Quality-pass Ireland lesson quizzes into lesson-meta.json quiz_questions."""

from __future__ import annotations

import json
from pathlib import Path

from lesson_quiz_parse import (
    extract_quiz_markdown,
    parse_lesson_quiz_markdown_with_fallback,
    quality_pass_questions,
)

ROOT = Path(__file__).resolve().parents[2]
LESSON_ROOT = ROOT / "lesson plans" / "10-regions" / "celtic" / "ireland"
META_PATH = LESSON_ROOT / "lesson-meta.json"


def main() -> None:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    updated = 0
    for path in sorted(LESSON_ROOT.glob("*.md")):
        if path.name in {"README.md"}:
            continue
        body = path.read_text(encoding="utf-8")
        quiz_md = extract_quiz_markdown(body)
        if not quiz_md:
            continue
        lesson_id = None
        for key in meta:
            if key.endswith(path.stem.replace("_", "-")) or path.stem in key:
                lesson_id = key
                break
        if not lesson_id:
            # match by numeric prefix in filename
            for key in meta:
                if path.stem.split("-", 1)[0] in key and "ireland" in key:
                    pass
        # derive from frontmatter id in file is unreliable; map by filename order
        slot_map = {
            "01-overview": "regions-celtic-ireland-01-overview",
            "02-instruments-traditional-voices-i": "regions-celtic-ireland-02-instruments-voices-i",
            "03-instruments-session-voices-ii": "regions-celtic-ireland-03-instruments-voices-ii",
            "04-genres-forms": "regions-celtic-ireland-04-genres-forms",
            "05-dance": "regions-celtic-ireland-05-dance",
            "06-history-transmission": "regions-celtic-ireland-06-history",
            "07-representative-depth": "regions-celtic-ireland-07-representative-depth",
            "08-tunes": "regions-celtic-ireland-08-tunes",
        }
        lesson_id = slot_map.get(path.stem)
        if not lesson_id or lesson_id not in meta:
            print(f"Skip {path.name}: no lesson id mapping")
            continue
        raw = parse_lesson_quiz_markdown_with_fallback(quiz_md)
        passed = quality_pass_questions(raw, lesson_id)
        meta[lesson_id]["quiz_questions"] = passed
        updated += 1
        print(f"{lesson_id}: {len(passed)} questions")
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated quiz_questions for {updated} lessons in {META_PATH}")


if __name__ == "__main__":
    main()
