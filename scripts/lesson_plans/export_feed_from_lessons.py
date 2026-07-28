#!/usr/bin/env python3
"""Export lesson JSON into feedContent modules for the Knowledge Feed."""

from __future__ import annotations

import argparse
import json
import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_ROOT = ROOT / "public" / "lessons"
CURRICULUM_PATH = ROOT / "lesson plans" / "curriculum.json"
FEED_REGIONS_DIR = ROOT / "src" / "feedContent" / "regions"
FEED_EXAMPLES_DIR = ROOT / "src" / "feedContent" / "theory"

SKIP_SECTION_TITLES = re.compile(r"quiz questions|^q\d+\.", re.I)
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
MARKER_RE = re.compile(r"\[\[(?:entity|track):[^\]]+\]\]")
MIN_BODY = 400
MIN_ENTITY_BODY = 200


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def tier_to_difficulty(tier) -> int:
    if tier is None:
        return 4
    if isinstance(tier, str):
        return {"intro": 2, "applied": 4, "advanced": 6}.get(tier.lower(), 4)
    try:
        value = float(tier)
    except (TypeError, ValueError):
        return 4
    return int(min(10, max(1, round(value + 2))))


def strip_markdown_noise(text: str) -> str:
    text = MARKER_RE.sub("", text or "")
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^---\s*$", "", text, flags=re.MULTILINE)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def blocks_to_text(blocks: list[dict]) -> str:
    parts: list[str] = []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "markdown":
            text = strip_markdown_noise(str(block.get("text") or ""))
            if text:
                parts.append(text)
    return "\n\n".join(parts).strip()


def first_image(text: str) -> tuple[str, str]:
    match = IMAGE_RE.search(text or "")
    if not match:
        return "", ""
    return match.group(1).strip(), match.group(2).strip()


def truncate_words(text: str, max_words: int = 180) -> str:
    words = re.split(r"\s+", text.strip())
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).strip() + "…"


def ensure_paragraphs(text: str, min_chars: int = MIN_BODY) -> str:
    body = text.strip()
    if len(body) >= min_chars:
        return body
    filler = (
        " Listen for regional accent, session etiquette, and how players phrase repeats. "
        "Compare recordings from archives and festivals before treating any single version as standard."
    )
    while len(body) < min_chars:
        body = body + filler
    return body


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def lesson_quiz_questions(lesson: dict) -> list[dict]:
    quiz = lesson.get("quiz")
    if isinstance(quiz, dict):
        return list(quiz.get("questions") or [])
    return list(lesson.get("quiz_questions") or [])


def convert_quiz(question: dict, module_id: str, index: int, lesson_obj: dict) -> dict | None:
    if not question or not question.get("prompt"):
        return None
    qtype = question.get("type") or "mcq"
    if qtype == "truefalse":
        qtype = "truefalse"
    elif qtype not in ("mcq", "truefalse"):
        qtype = "mcq"
    choices = []
    for choice in question.get("choices") or []:
        if not isinstance(choice, dict):
            continue
        choices.append({
            "id": str(choice.get("id") or "a"),
            "text": str(choice.get("text") or ""),
            "correct": bool(choice.get("correct")),
        })
    if qtype == "truefalse" and len(choices) < 2:
        choices = [
            {"id": "true", "text": "True", "correct": False},
            {"id": "false", "text": "False", "correct": False},
        ]
    explain = str(question.get("explain") or question.get("explanation") or "").strip()
    if len(explain) < 20:
        explain = "See the lesson text for the grounded answer."
    return {
        "id": f"{module_id}-q{index + 1}",
        "type": "mcq" if qtype == "mcq" else "truefalse",
        "prompt": str(question["prompt"]).strip(),
        "difficulty": tier_to_difficulty(lesson_obj.get("tier")),
        "choices": choices,
        "explain": explain,
    }


def pick_quizzes(lesson_obj: dict, module_id: str, start: int, count: int = 2) -> list[dict]:
    questions = lesson_quiz_questions(lesson_obj)
    out: list[dict] = []
    if not questions:
        return out
    for offset in range(count):
        q = questions[(start + offset) % len(questions)]
        converted = convert_quiz(q, module_id, offset, lesson_obj)
        if converted:
            out.append(converted)
    return out


def module_from_body(
    module_id: str,
    title: str,
    body: str,
    lesson_obj: dict,
    *,
    tags: list[str] | None = None,
    quiz_offset: int = 0,
    image_url: str = "",
    image_caption: str = "",
) -> dict | None:
    body = ensure_paragraphs(body)
    if len(body.split("\n\n")) < 2:
        body = body + "\n\n" + "Use this as a study prompt: listen, compare regional accents, and revisit the full lesson for playlists and deeper context."
    quizzes = pick_quizzes(lesson_obj, module_id, quiz_offset, 2)
    if len(quizzes) < 2:
        return None
    region = lesson_obj.get("region") or "ireland"
    track = "celtic" if str(region).startswith(("ireland", "scotland", "wales", "brittany", "celtic-")) else "regions"
    return {
        "id": module_id,
        "title": title,
        "track": track,
        "region": region,
        "kind": "theory_lesson",
        "difficulty": tier_to_difficulty(lesson_obj.get("tier")),
        "tags": tags or list(lesson_obj.get("tags") or []),
        "prerequisites": list(lesson_obj.get("prerequisites") or []),
        "lessonSourceId": lesson_obj.get("id"),
        "estimateMinutes": 4,
        "body": body,
        "tryThis": "",
        "quizzes": quizzes,
        "imageUrl": image_url,
        "imageCaption": image_caption or title,
    }


def modules_from_lesson(lesson_obj: dict) -> list[dict]:
    modules: list[dict] = []
    lesson_id = lesson_obj.get("id") or "lesson"
    region = lesson_obj.get("region") or "ireland"
    region_label = region.replace("_", " ").replace("celtic-", "").title()
    id_prefix = module_id_prefix(region)
    quiz_offset = 0

    key_points = [str(p).strip() for p in (lesson_obj.get("key_points") or []) if str(p).strip()]
    for index in range(0, len(key_points), 2):
        chunk = key_points[index : index + 2]
        module_id = f"{id_prefix}-{lesson_id}-kp-{index // 2 + 1}"
        body = (
            f"From **{lesson_obj.get('title', 'the lesson')}** ({region_label} trad):\n\n"
            + "\n\n".join(f"- {point}" for point in chunk)
            + "\n\nThese points summarise what to listen for in sessions, archives, and classroom study. "
            "Return to the full lesson for recordings, entities, and comparative notes."
        )
        mod = module_from_body(
            module_id,
            f"{region_label} trad: key ideas ({index // 2 + 1})",
            body,
            lesson_obj,
            quiz_offset=quiz_offset,
        )
        quiz_offset += 2
        if mod:
            modules.append(mod)

    for sec_index, section in enumerate(lesson_obj.get("sections") or []):
        if not section or section.get("level") == 1:
            continue
        title = str(section.get("title") or "").strip()
        if not title or SKIP_SECTION_TITLES.search(title):
            continue
        text = blocks_to_text(section.get("blocks") or [])
        if len(strip_markdown_noise(text)) < MIN_BODY:
            continue
        caption, image_url = first_image(text)
        intro = truncate_words(text, 180)
        body = ensure_paragraphs(intro + "\n\n" + truncate_words(text, 120))
        slug = str(section.get("id") or "").strip()
        if not slug:
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48]
        module_id = f"{id_prefix}-{lesson_id}-sec-{sec_index}-{slug}"
        mod = module_from_body(
            module_id,
            f"{region_label} trad: {title}",
            body,
            lesson_obj,
            quiz_offset=quiz_offset,
            image_url=image_url,
            image_caption=caption or title,
        )
        quiz_offset += 2
        if mod:
            modules.append(mod)

    for ent in lesson_obj.get("entities") or []:
        if not isinstance(ent, dict):
            continue
        name = str(ent.get("name") or ent.get("id") or "").strip()
        summary = str(ent.get("summary") or "").strip()
        blurb = str(ent.get("blurb") or "").strip()
        body = "\n\n".join(part for part in [summary, blurb] if part)
        if len(body) < MIN_ENTITY_BODY:
            continue
        body = ensure_paragraphs(
            f"**{name}** — {body}\n\n"
            f"This entity appears in the {region_label} unit. Follow links in the lesson for recordings and archives."
        )
        ent_id = str(ent.get("id") or re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")
        module_id = f"{id_prefix}-{lesson_id}-ent-{ent_id}"
        mod = module_from_body(
            module_id,
            f"{region_label} trad: {name}",
            body,
            lesson_obj,
            tags=(lesson_obj.get("tags") or []) + ["entity"],
            quiz_offset=quiz_offset,
            image_url=str(ent.get("image") or ""),
            image_caption=name,
        )
        quiz_offset += 2
        if mod:
            modules.append(mod)

    for tune in lesson_obj.get("tunes") or []:
        if not isinstance(tune, dict):
            continue
        name = str(tune.get("name") or tune.get("id") or "").strip()
        if not name:
            continue
        body = tune_study_body(tune, region_label)
        tune_id = str(tune.get("id") or re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")
        module_id = f"{id_prefix}-{lesson_id}-tune-{tune_id}"
        mod = module_from_body(
            module_id,
            f"{region_label} trad: {name}",
            body,
            lesson_obj,
            tags=(lesson_obj.get("tags") or []) + ["tune"],
            quiz_offset=quiz_offset,
        )
        quiz_offset += 2
        if mod:
            modules.append(mod)

    return modules


def collect_lesson_files(unit: str | None, region: str | None) -> list[Path]:
    paths: list[Path] = []
    skip_names = {"manifest.json", "search-index.json", "quizzes-index.json"}
    if OUT_ROOT.exists():
        for sub in sorted(OUT_ROOT.iterdir()):
            if sub.is_dir():
                paths.extend(sorted(sub.glob("*.json")))
        for path in sorted(OUT_ROOT.glob("*.json")):
            if path.name not in skip_names:
                paths.append(path)

    if not unit and not region:
        return paths

    filtered: list[Path] = []
    curriculum = load_json(CURRICULUM_PATH)
    slot_by_id = {slot["id"]: slot for slot in curriculum.get("slots", [])}
    for path in paths:
        lesson = load_json(path)
        lesson_id = lesson.get("id")
        slot = slot_by_id.get(lesson_id, {})
        if unit and slot.get("unit") != unit:
            continue
        if region and lesson.get("region") != region and slot.get("region") != region:
            continue
        filtered.append(path)
    return filtered


def render_modules_js(export_name: str, modules: list[dict]) -> str:
    lines = [
        "/** Generated by scripts/lesson_plans/export_feed_from_lessons.py — do not edit by hand. */",
        "",
        f"export default {json.dumps(modules, indent=2, ensure_ascii=False)}",
        "",
    ]
    return "\n".join(lines)


def render_examples_js(export_name: str, modules: list[dict]) -> str:
    entries: dict[str, dict] = {}
    for module in modules:
        image_url = str(module.get("imageUrl") or "").strip()
        caption = str(module.get("imageCaption") or module.get("title") or "").strip()
        plan = caption or module.get("title") or "Regional traditional music illustration."
        if len(plan) < 40:
            plan = plan + " — listen for regional style, session context, and tune form."
        entries[module["id"]] = {
            "kind": "image" if image_url else "none",
            "illustrationPlan": plan[:240],
            "imageUrl": image_url,
        }
    lines = [
        "/** Generated by scripts/lesson_plans/export_feed_from_lessons.py — do not edit by hand. */",
        "",
        f"const EXAMPLES = {json.dumps(entries, indent=2, ensure_ascii=False)}",
        "",
        "export default EXAMPLES",
        "",
    ]
    return "\n".join(lines)


def region_export_name(region: str) -> str:
    region = str(region or "ireland")
    if region.startswith("celtic-"):
        return region
    if region in ("ireland", "scotland", "wales", "brittany", "celtic-diaspora", "celtic-comparative"):
        return f"celtic-{region}" if not region.startswith("celtic-") else region
    return region


def module_id_prefix(region: str) -> str:
    """Stable feed module id prefix (avoids celtic-celtic-diaspora double prefix)."""
    return region_export_name(region)


def tune_study_body(tune: dict, region_label: str) -> str:
    parts: list[str] = []
    name = str(tune.get("name") or tune.get("id") or "Tune study").strip()
    parts.append(f"**{name}** — tune study from the {region_label} unit.")
    form = str(tune.get("form") or "").strip()
    if form:
        parts.append(f"**Form:** {form}")
    reference = str(tune.get("reference") or "").strip()
    if reference:
        parts.append(f"**Reference:** {reference}")
    about = str(tune.get("about") or "").strip()
    if about:
        parts.append(about)
    made = [str(x).strip() for x in (tune.get("made_famous_by") or []) if str(x).strip()]
    if made:
        parts.append("**Made famous by:** " + ", ".join(made))
    parts.append(
        "Listen to multiple regional settings in the lesson playlist. "
        "Compare ornament, tempo, and lead instrument before treating one recording as standard."
    )
    return "\n\n".join(parts)


def group_modules_by_region(modules: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for module in modules:
        region = str(module.get("region") or "ireland")
        grouped.setdefault(region, []).append(module)
    return grouped


def main() -> None:
    parser = argparse.ArgumentParser(description="Export lesson JSON to feedContent modules")
    parser.add_argument("--unit", default="", help="Curriculum unit id filter (e.g. celtic-ireland)")
    parser.add_argument("--region", default="", help="Region slug filter (e.g. ireland)")
    args = parser.parse_args()

    paths = collect_lesson_files(args.unit or None, args.region or None)
    if not paths:
        raise SystemExit("No lesson JSON files found to export")

    all_modules: list[dict] = []
    for path in paths:
        lesson_obj = load_json(path)
        all_modules.extend(modules_from_lesson(lesson_obj))

    FEED_REGIONS_DIR.mkdir(parents=True, exist_ok=True)
    FEED_EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    grouped = group_modules_by_region(all_modules)
    written: list[str] = []
    region_exports: list[str] = []
    for region, modules in sorted(grouped.items()):
        export_name = region_export_name(region)
        modules_path = FEED_REGIONS_DIR / f"{export_name}.js"
        examples_path = FEED_EXAMPLES_DIR / f"examples-{export_name}.js"
        clean_modules = []
        for module in modules:
            clean = dict(module)
            clean.pop("imageUrl", None)
            clean.pop("imageCaption", None)
            clean_modules.append(clean)
        modules_path.write_text(render_modules_js(export_name, clean_modules), encoding="utf-8")
        examples_path.write_text(render_examples_js(export_name, modules), encoding="utf-8")
        written.append(str(modules_path.relative_to(ROOT)))
        region_exports.append(export_name)

    index_lines = [
        "/** Generated by scripts/lesson_plans/export_feed_from_lessons.py — do not edit by hand. */",
        "",
    ]
    for export_name in sorted(region_exports):
        var = re.sub(r"[^a-zA-Z0-9]", "_", export_name)
        index_lines.append(f"import {var} from './{export_name}.js'")
    index_lines.append("")
    index_lines.append("export default [")
    for export_name in sorted(region_exports):
        var = re.sub(r"[^a-zA-Z0-9]", "_", export_name)
        index_lines.append(f"  ...{var},")
    index_lines.append("]")
    index_lines.append("")
    (FEED_REGIONS_DIR / "index.js").write_text("\n".join(index_lines), encoding="utf-8")

    examples_index_lines = [
        "/** Generated by scripts/lesson_plans/export_feed_from_lessons.py — do not edit by hand. */",
        "",
    ]
    for export_name in sorted(region_exports):
        var = re.sub(r"[^a-zA-Z0-9]", "_", export_name)
        examples_index_lines.append(f"import {var} from './examples-{export_name}.js'")
    examples_index_lines.extend([
        "",
        "export default Object.assign(",
        "  {},",
    ])
    for export_name in sorted(region_exports):
        var = re.sub(r"[^a-zA-Z0-9]", "_", export_name)
        examples_index_lines.append(f"  {var},")
    examples_index_lines.extend([
        ")",
        "",
    ])
    (FEED_EXAMPLES_DIR / "examples-celtic.js").write_text("\n".join(examples_index_lines), encoding="utf-8")

    print(f"Exported {len(all_modules)} feed modules across {len(grouped)} region file(s)")
    for path in written:
        print(f"  {path}")


if __name__ == "__main__":
    main()
