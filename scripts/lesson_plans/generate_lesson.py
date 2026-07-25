#!/usr/bin/env python3
"""Generate extractive lessons from wiki index + curriculum manifest."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "lesson_plans"))

from wiki_index.search import search_chunks, search_chunks_breadth
from wiki_index.text_clean import clean_wiki_chunk, is_substantive, trim_to_words

MANIFEST_PATH = ROOT / "lesson plans" / "curriculum.json"
DEFAULT_OUT = ROOT / "lesson plans"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.replace("\n", " "))
    return [s.strip() for s in parts if len(s.strip()) > 40]


def _quizzes_from_sections(sections: list[tuple[str, str, str]], min_q: int = 12, max_q: int = 20) -> list[dict]:
    """Build quizzes only from text that appears in the lesson body."""
    quizzes: list[dict] = []
    for article_title, section, text in sections:
        for sent in _sentences(text):
            if len(quizzes) >= max_q:
                break
            m = re.match(
                r"^(.{10,120}?)\s+(is|are|was|were|means|refers to)\s+(.{5,100})\.?$",
                sent,
                re.I,
            )
            if m and len(quizzes) < max_q:
                quizzes.append(
                    {
                        "type": "true_false",
                        "question": sent.rstrip(".") + "?",
                        "answer": "True",
                        "explanation": f"From {article_title} ({section}).",
                        "source_chunk": "",
                    }
                )
                continue
            m2 = re.match(r"^([A-Z][A-Za-z\- ]{2,40})\s+is\s+(.{10,120})\.?$", sent)
            if m2 and len(quizzes) < max_q:
                term, desc = m2.group(1).strip(), m2.group(2).strip()
                quizzes.append(
                    {
                        "type": "multiple_choice",
                        "question": f"What is {term}?",
                        "options": [desc[:120], "A unrelated genre", "A tuning system only", "A dance step only"],
                        "answer": desc[:120],
                        "explanation": sent,
                        "source_chunk": "",
                    }
                )
        if len(quizzes) >= max_q:
            break

    for article_title, section, text in sections:
        if len(quizzes) >= min_q:
            break
        first = _sentences(text)
        if first:
            quizzes.append(
                {
                    "type": "true_false",
                    "question": f"The source article '{article_title}' discusses {section}.",
                    "answer": "True",
                    "explanation": "Section heading match in indexed corpus.",
                    "source_chunk": "",
                }
            )
    return quizzes[:max_q]


def _clean_chunk_text(text: str) -> str:
    return clean_wiki_chunk(text)


def assemble_lesson(slot: dict, chunks: list) -> str:
    meta = slot
    sources = sorted({c.article_title for c in chunks})
    chunk_ids = [c.chunk_id for c in chunks]
    word_target = meta.get("word_target", 2500)
    lines = [
        "---",
        f"id: {meta['id']}",
        f"title: {meta['title']}",
        f"track: {meta.get('track', 'theory')}",
        f"region: {meta.get('region', '')}",
        f"tier: {meta.get('tier', 1)}",
        f"difficulty: {meta.get('difficulty', 3)}",
        f"prerequisites: {json.dumps(meta.get('prerequisites', []))}",
        f"sources: {json.dumps(sources)}",
        f"source_chunks: {json.dumps(chunk_ids)}",
        f"generated_at: {datetime.now(timezone.utc).date().isoformat()}",
        f"status: generated",
        "---",
        "",
        f"# {meta['title']}",
        "",
        f"**Track:** {meta.get('track', 'theory')} | **Tier:** {meta.get('tier', 1)} | "
        f"**Difficulty:** {meta.get('difficulty', 3)}/10",
        f"**Prerequisites:** {', '.join(meta.get('prerequisites', [])) or 'none'}",
        f"**Tags:** {', '.join(meta.get('tags', []))}",
        "",
        "## Overview",
        "",
        meta.get("overview", "Condensed from indexed Wikipedia sources below."),
        "",
    ]

    seen_sections: set[str] = set()
    included: list[tuple[str, str, str]] = []
    words = 0
    max_section_words = meta.get("max_section_words", 900)
    for ch in chunks:
        body_text = _clean_chunk_text(ch.text)
        body_text = trim_to_words(body_text, max_section_words)
        if not is_substantive(body_text, min_words=40):
            continue
        key = (ch.article_title, ch.section)
        if key in seen_sections:
            continue
        seen_sections.add(key)
        if ch.section == "Overview" and any(l == "## Overview" for l in lines):
            section_title = ch.article_title
        else:
            section_title = ch.section
        included.append((ch.article_title, section_title, body_text))
        lines.extend([f"## {section_title}", "", f"*Source: {ch.article_title}*", "", body_text, ""])
        words += len(body_text.split())
        if words >= word_target:
            break

    lines.extend(["## Sources", ""])
    for title in sources:
        lines.append(f"- {title}")
    lines.extend(["", "## Quiz Questions", ""])

    quizzes = _quizzes_from_sections(included, meta.get("quiz_min", 12), meta.get("quiz_max", 20))
    for i, q in enumerate(quizzes, 1):
        lines.append(f"### Q{i}. {q['question']}")
        lines.append("")
        if q["type"] == "multiple_choice":
            for j, opt in enumerate(q.get("options", [])):
                label = chr(ord("A") + j)
                lines.append(f"- {label}) {opt}")
            lines.append("")
        lines.append(f"**Answer:** {q['answer']}")
        if q.get("explanation"):
            lines.append(f"**Explanation:** {q['explanation']}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def generate_slot(slot: dict, out_root: Path) -> Path:
    min_imp = slot.get("min_importance", 0.5)
    if slot.get("breadth_retrieval") and slot.get("source_articles"):
        hits = search_chunks_breadth(
            slot["source_articles"],
            limit=slot.get("chunk_limit", 14),
            chunks_per_article=slot.get("chunks_per_article", 2),
            min_importance=min_imp,
            topic_folder=slot.get("topic_folder"),
            region=slot.get("region"),
        )
    else:
        hits = search_chunks(
            slot.get("query", slot["title"]),
            limit=slot.get("chunk_limit", 14),
            min_importance=min_imp,
            topic_folder=slot.get("topic_folder"),
            region=slot.get("region"),
            article_titles=slot.get("source_articles"),
        )
    if not hits and slot.get("source_articles"):
        hits = search_chunks(
            " ".join(slot["source_articles"]),
            limit=slot.get("chunk_limit", 14),
            min_importance=0.25,
            article_titles=slot["source_articles"],
        )
    if not hits:
        raise RuntimeError(f"No chunks retrieved for slot {slot['id']}")

    rel = slot.get("output", f"{slot['id']}.md")
    out_path = out_root / rel
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(assemble_lesson(slot, hits), encoding="utf-8")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate lesson from curriculum manifest")
    parser.add_argument("--slot", help="Slot id from curriculum.json")
    parser.add_argument("--unit", help="Generate all slots in a unit (e.g. celtic-ireland)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    manifest = load_manifest()
    slots = manifest.get("slots", [])
    if args.slot:
        slots = [s for s in slots if s["id"] == args.slot]
    elif args.unit:
        slots = [s for s in slots if s.get("unit") == args.unit]
    if not slots:
        print("No matching slots.", file=sys.stderr)
        sys.exit(1)
    for slot in slots:
        path = generate_slot(slot, args.out)
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
