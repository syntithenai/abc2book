#!/usr/bin/env python3
"""Verify generated lessons: grounded quizzes and manifest prerequisites."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "lesson plans" / "curriculum.json"
IRELAND_META_PATH = ROOT / "lesson plans" / "10-regions" / "celtic" / "ireland" / "lesson-meta.json"
YOUTUBE_ID_RE = re.compile(r"(?:youtu\.be/|v=|/embed/)([A-Za-z0-9_-]{11})")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def answer_grounded(answer: str, corpus: str) -> bool:
    a = _normalize(answer)
    c = _normalize(corpus)
    if not a:
        return False
    if a in c:
        return True
    if len(a) >= 3 and re.search(r"\b" + re.escape(a) + r"\b", c):
        return True
    return False


def parse_lesson(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    fm = {}
    m = re.match(r"^---\s*\n(.*?)\n---", raw, re.DOTALL)
    body = raw
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip()
        body = raw[m.end() :]
    return {"frontmatter": fm, "body": body, "path": str(path)}


def load_ireland_meta() -> dict:
    if not IRELAND_META_PATH.exists():
        return {}
    return json.loads(IRELAND_META_PATH.read_text(encoding="utf-8"))


def verify_ireland_extras(lesson_id: str, meta: dict) -> list[str]:
    issues: list[str] = []
    overlay = load_ireland_meta().get(lesson_id, {})
    entities = overlay.get("entities") or []
    playlist = overlay.get("playlist") or []
    key_points = overlay.get("key_points") or []
    reading_list = overlay.get("reading_list") or []

    if len(key_points) < 5:
        issues.append(f"Only {len(key_points)} key_points (expected ≥ 5)")
    if len(reading_list) < 3:
        issues.append(f"Only {len(reading_list)} reading_list items (expected ≥ 3)")

    seen_playlist_ids: set[str] = set()
    for track in playlist:
        if not isinstance(track, dict):
            continue
        pid = track.get("id")
        if pid:
            if pid in seen_playlist_ids:
                issues.append(f"Duplicate playlist id: {pid}")
            seen_playlist_ids.add(pid)
        yt = track.get("youtube") or ""
        if yt and not YOUTUBE_ID_RE.search(yt):
            issues.append(f"Invalid YouTube URL: {yt[:60]}")

    for ent in entities:
        if not isinstance(ent, dict):
            continue
        etype = ent.get("type")
        if etype in ("artist", "band", "organization"):
            if not ent.get("url"):
                issues.append(f"Missing url on entity {ent.get('id')}")
            if not ent.get("image"):
                issues.append(f"Missing image on entity {ent.get('id')}")
    return issues


def verify_lesson(path: Path, manifest_ids: set[str], ireland: bool = False) -> list[str]:
    issues: list[str] = []
    lesson = parse_lesson(path)
    fm = lesson["frontmatter"]
    body = lesson["body"]
    lid = fm.get("id", path.stem)
    prereqs = json.loads(fm.get("prerequisites", "[]") or "[]")
    for p in prereqs:
        if p and p not in manifest_ids:
            issues.append(f"Unknown prerequisite: {p}")

    # Split quiz section
    quiz_part = body.split("## Quiz Questions", 1)
    corpus_for_quiz = body
    if len(quiz_part) > 1:
        corpus_for_quiz = quiz_part[0]

    answers = re.findall(r"\*\*Answer:\*\*\s*(.+)", body)
    for ans in answers:
        ans = ans.split("**")[0].strip()
        if re.match(r"^(True|False)\b", ans):
            continue
        if not answer_grounded(ans, corpus_for_quiz):
            issues.append(f"Ungrounded answer: {ans[:80]}")

    if not re.search(r"## Quiz Questions", body):
        issues.append("Missing quiz section")
    if len(answers) < 8:
        issues.append(f"Only {len(answers)} quiz answers (expected ≥ 8)")

    sources = json.loads(fm.get("sources", "[]") or "[]")
    if not sources:
        issues.append("No sources listed in frontmatter")

    if ireland:
        issues.extend(verify_ireland_extras(str(lid), fm))

    return issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify generated lessons")
    parser.add_argument("paths", nargs="*", help="Lesson markdown files")
    parser.add_argument("--unit", help="Verify all lessons under unit output dir")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest_ids = {s["id"] for s in manifest.get("slots", [])}

    paths: list[Path] = [Path(p) for p in args.paths]
    if args.unit:
        unit_dir = ROOT / "lesson plans" / "10-regions" / "celtic" / "ireland"
        if unit_dir.is_dir():
            paths.extend(sorted(unit_dir.glob("*.md")))

    if not paths:
        print("No lesson files to verify.", file=sys.stderr)
        sys.exit(1)

    failed = 0
    for path in paths:
        is_ireland = "celtic/ireland" in path.as_posix()
        issues = verify_lesson(path, manifest_ids, ireland=is_ireland)
        if issues:
            failed += 1
            print(f"FAIL {path}")
            for issue in issues:
                print(f"  - {issue}")
        else:
            print(f"OK   {path}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
