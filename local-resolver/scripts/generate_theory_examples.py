#!/usr/bin/env python3
"""Generate theory lesson illustrations: plan first, then ABC or portrait label."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)

from feed_generation import _chat_json  # noqa: E402
from llm_runtime import use_llm_provider  # noqa: E402
from providers import host_embedded_providers  # noqa: E402
from theory_example_validation import (  # noqa: E402
    assemble_full_abc,
    lesson_uses_image,
    validate_abc_body,
    validate_plan,
)

EXAMPLES_JS = os.path.join(REPO, "src", "feedContent", "theory", "examples.js")
CHECKPOINT_JSON = os.path.join(REPO, "src", "feedContent", "theory", "examples.generated.json")
EXPORT_SCRIPT = os.path.join(REPO, "scripts", "exportTheoryLessons.js")
VALIDATE_SCRIPT = os.path.join(REPO, "scripts", "validateTheoryExampleAbc.cjs")
WIKI = "https://upload.wikimedia.org/wikipedia/commons"

# Curated Wikimedia Commons images for style/history lessons (suffix after WIKI).
STYLE_IMAGE_URLS: dict[str, str] = {
    "styles-baroque-01": "/1/1e/Harpsichord.jpg",
    "styles-classical-01": "/1/1e/Wolfgang-amadeus-mozart_1.jpg",
    "styles-romantic-01": "/e/e8/Frederic_Chopin_photo.jpeg",
    "styles-folk-dances-01": "/4/48/Irish_dancing.jpg",
    "styles-blues-01": "/9/9f/Robert_Johnson_-_Me_and_the_Devil_Blues.jpg",
    "styles-jazz-01": "/7/7f/Duke_Ellington_at_the_White_House.jpg",
    "styles-pop-01": "/c/c9/Vinyl_record.png",
    "styles-modes-01": "/8/8a/Guillaume_Dufay.png",
    "styles-modern-01": "/4/4f/Synthesizer_2.jpg",
}


def _load_env_file(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def _llm_config() -> dict[str, Any]:
    embedded = host_embedded_providers()
    llm = embedded.get("llm")
    if llm and llm.get("apiUrl") and llm.get("apiKey"):
        return llm
    raise RuntimeError(
        "No LLM configured. Set PROVIDER_LLM_* or RESEARCH_LLM_* in local-resolver/.env"
    )


PLAN_SYSTEM = """You write illustration plans for music theory lessons.
Return JSON only with keys: illustrationPlan, kind, rationale.

Rules:
- illustrationPlan: 1-2 user-facing sentences naming concrete musical elements
  (symbols, intervals, articulations, rhythms, voices) the example must show.
- kind: "notation" for pure music-theory concepts shown with ABC notes.
- kind: "image" for musician biographies, historical eras, or style overview lessons
  (history track, styles track, or ids starting with history-/styles-).
- For notation lessons, plan must require real notes on the staff with NO ledger lines.
- Notation examples must use bar lines (|) and a time signature so rhythms read as measure blocks.
- For triad/chord lessons, plan must mention stacked ABC chord notation like [CEG].
- For chord-progression lessons, plan should mention Roman numerals with letter names (I(C), V(G)).
- rationale: one short sentence why notation vs portrait."""

ABC_SYSTEM = """You write ABC notation bodies for theory lesson illustrations.
Return JSON only with keys: abc, metadata.

Rules:
- abc: body only — V: voices, melody + optional bass, 2-4 bars. No X:, K:, M:, L:, Q: headers.
- NO LEDGER LINES: never use octave commas or apostrophes on notes (no C, or c' or A,).
  Keep pitches on the treble staff using DEFGABcdefga only (no , or ' markers).
- BAR LINES AND METER: group notes into measures with | bar lines. metadata.meter is required
  (e.g. 4/4, 6/8). Use one rhythmic idea per bar so students read rhythm as block patterns.
  Rare barless examples are allowed only when metadata.allowBarless is true.
- Use V:1 clef=treble for melody; optional V:2 clef=bass for bass roots (still no ledger marks).
- Triad/chord lessons: use stacked ABC chord notation [CEG] [Ace] [GBd] for triads and inversions.
- Chord-progression lessons: label chords with Roman numerals AND letter names together,
  e.g. "I(C)" "V(G)" "ii(Dm)" "IV(F)" placed before the notes or chord stacks.
- Transposition lessons: when showing two keys, put inline [K:C] before the first phrase and
  [K:D] (or other target key) before the transposed phrase so key signatures match the notes.
  Never transpose notes without updating the key for that section.
- metadata: { meter, noteLength, key } — key is the starting key; use inline [K:...] for changes.
- Follow the illustrationPlan exactly; highlight the concept named in the plan.
- Use | for bar lines. Keep examples compact but clear."""

REVIEW_SYSTEM = """You review theory lesson ABC examples for musical accuracy and usefulness.
Return JSON only with keys: ok (boolean), issues (array of short strings).

Reject when:
- Key signature does not match spelled notes (especially transposition examples)
- Chord tones or Roman numerals are wrong for the stated key
- Example does not illustrate the illustrationPlan
- Notes use ledger lines (comma/apostrophe octave marks like c' or C,)
- Triad lesson lacks stacked chord notation [CEG]
- Chord lesson lacks Roman numerals with letter names
- Example would confuse a student

Accept when musically correct and clearly teaches the lesson point."""


def _run_node(script: str, *args: str) -> str:
    cmd = ["node", script] + list(args)
    result = subprocess.run(
        cmd,
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"node {script} failed:\n{result.stderr or result.stdout}"
        )
    return result.stdout


def load_lessons(lesson_id: str | None) -> list[dict[str, Any]]:
    args = ["--id", lesson_id] if lesson_id else []
    raw = _run_node(EXPORT_SCRIPT, *args)
    data = json.loads(raw)
    return data if isinstance(data, list) else []


def load_existing_image_urls() -> dict[str, str]:
    script = """
import { THEORY_LESSON_EXAMPLES } from './src/feedContent/theory/examples.js';
const out = {};
for (const [id, ex] of Object.entries(THEORY_LESSON_EXAMPLES)) {
  if (ex && ex.kind === 'image' && ex.imageUrl) out[id] = ex.imageUrl;
}
console.log(JSON.stringify(out));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    urls: dict[str, str] = {}
    if result.returncode == 0:
        try:
            data = json.loads(result.stdout)
            if isinstance(data, dict):
                urls.update(data)
        except json.JSONDecodeError:
            pass
    for lesson_id, suffix in STYLE_IMAGE_URLS.items():
        if lesson_id not in urls and suffix:
            urls[lesson_id] = WIKI + suffix
    return urls


def _js_string(value: str) -> str:
    return json.dumps(str(value or ""), ensure_ascii=False)


def _js_metadata(meta: dict[str, Any]) -> str:
    parts = []
    defaults = {"meter": "4/4", "noteLength": "1/8", "key": "C"}
    merged = {**defaults, **(meta or {})}
    for key in ("meter", "noteLength", "key", "tempo"):
        if key in merged and merged[key]:
            parts.append(f"{key}: {_js_string(str(merged[key]))}")
    return "{ " + ", ".join(parts) + " }"


def _format_abc_lines(abc: str) -> str:
    lines = [ln.rstrip() for ln in str(abc or "").splitlines() if ln.strip()]
    if len(lines) == 1:
        return _js_string(lines[0])
    inner = ",\n      ".join(_js_string(ln) for ln in lines)
    return "[\n      " + inner + ",\n    ].join('\\n')"


def render_examples_js(examples: dict[str, dict[str, Any]]) -> str:
    blocks = [
        "/**",
        " * Illustrations for theory lessons.",
        " * Generated by local-resolver/scripts/generate_theory_examples.py",
        " *",
        " * - kind: 'image' for musician/history portraits",
        " * - kind: 'notation' for concepts shown with abcjs (notes, not chord symbols alone)",
        " */",
        "",
        f"const WIKI = {_js_string(WIKI)}",
        "",
        "function notation(illustrationPlan, abc, metadata) {",
        "  return {",
        "    kind: 'notation',",
        "    illustrationPlan: illustrationPlan,",
        "    abc: abc,",
        "    full: true,",
        "    metadata: Object.assign({ meter: '4/4', noteLength: '1/8', key: 'C' }, metadata || {}),",
        "  }",
        "}",
        "",
        "function portrait(illustrationPlan, imageUrl) {",
        "  return {",
        "    kind: 'image',",
        "    illustrationPlan: illustrationPlan,",
        "    imageUrl: imageUrl,",
        "    abc: '',",
        "  }",
        "}",
        "",
        "export const THEORY_LESSON_EXAMPLES = {",
    ]
    for lesson_id in sorted(examples.keys()):
        ex = examples[lesson_id]
        plan = _js_string(ex["illustrationPlan"])
        if ex.get("kind") == "image":
            url = ex.get("imageUrl") or ""
            if url.startswith(WIKI):
                suffix = url[len(WIKI):]
                url_expr = f"WIKI + {_js_string(suffix)}"
            else:
                url_expr = _js_string(url)
            blocks.append(f"  {_js_string(lesson_id)}: portrait(\n    {plan},\n    {url_expr}\n  ),")
        else:
            abc_expr = _format_abc_lines(ex.get("abc") or "")
            meta_expr = _js_metadata(ex.get("metadata") or {})
            blocks.append(
                f"  {_js_string(lesson_id)}: notation(\n"
                f"    {plan},\n"
                f"    {abc_expr},\n"
                f"    {meta_expr}\n"
                f"  ),"
            )
    blocks.append("}")
    blocks.append("")
    blocks.append("export default THEORY_LESSON_EXAMPLES")
    blocks.append("")
    return "\n".join(blocks)


def validate_abc_render(full_abc: str) -> list[str]:
    result = subprocess.run(
        ["node", VALIDATE_SCRIPT, full_abc],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        msg = (result.stderr or result.stdout or "abcjs validation failed").strip()
        return [msg]
    return []


async def generate_plan(lesson: dict[str, Any]) -> dict[str, Any]:
    quiz_text = "\n".join(
        f"- {q.get('prompt', '')}" for q in (lesson.get("quizzes") or [])[:3]
    )
    user = (
        f"Lesson id: {lesson.get('id')}\n"
        f"Track: {lesson.get('track')}\n"
        f"Title: {lesson.get('title')}\n"
        f"Tags: {', '.join(lesson.get('tags') or [])}\n\n"
        f"Body:\n{lesson.get('body', '')}\n\n"
        f"Quiz prompts:\n{quiz_text}"
    )
    return await _chat_json(PLAN_SYSTEM, user)


async def review_example_accuracy(
    lesson: dict[str, Any],
    illustration_plan: str,
    abc_body: str,
    metadata: dict[str, Any],
) -> list[str]:
    user = (
        f"Lesson id: {lesson.get('id')}\n"
        f"Title: {lesson.get('title')}\n"
        f"Track: {lesson.get('track')}\n"
        f"Illustration plan: {illustration_plan}\n"
        f"Metadata: {json.dumps(metadata)}\n\n"
        f"ABC body:\n{abc_body}\n\n"
        f"Lesson excerpt:\n{str(lesson.get('body', ''))[:600]}"
    )
    result = await _chat_json(REVIEW_SYSTEM, user)
    if not isinstance(result, dict):
        return ["accuracy review returned invalid JSON"]
    if result.get("ok") is True:
        return []
    issues = result.get("issues") or []
    if not issues:
        return ["accuracy review rejected example without specific issues"]
    return [str(item) for item in issues if str(item).strip()]


async def generate_abc(
    lesson: dict[str, Any],
    illustration_plan: str,
    feedback: str = "",
) -> dict[str, Any]:
    user = (
        f"Lesson: {lesson.get('title')}\n"
        f"Illustration plan: {illustration_plan}\n\n"
        f"Lesson excerpt:\n{str(lesson.get('body', ''))[:800]}"
    )
    if feedback:
        user += f"\n\nPrevious attempt failed validation:\n{feedback}\nFix and try again."
    return await _chat_json(ABC_SYSTEM, user)


async def build_example(
    lesson: dict[str, Any],
    image_urls: dict[str, str],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    lesson_id = str(lesson.get("id") or "")
    print(f"  planning {lesson_id}...", flush=True)
    plan_result = await generate_plan(lesson)
    plan = str(plan_result.get("illustrationPlan") or "").strip()
    kind = str(plan_result.get("kind") or "").strip().lower()
    if lesson_uses_image(lesson):
        kind = "image"
    elif kind not in ("notation", "image"):
        kind = "notation"

    plan_errors = validate_plan(plan, lesson)
    if plan_errors:
        raise ValueError(f"{lesson_id} plan invalid: {'; '.join(plan_errors)}")

    if kind == "image":
        image_url = image_urls.get(lesson_id, "")
        if not image_url:
            raise ValueError(f"{lesson_id} missing preserved imageUrl for portrait lesson")
        return {
            "illustrationPlan": plan,
            "kind": "image",
            "imageUrl": image_url,
        }

    feedback = ""
    last_errors: list[str] = []
    for attempt in range(3):
        print(f"  abc {lesson_id} (attempt {attempt + 1})...", flush=True)
        abc_result = await generate_abc(lesson, plan, feedback=feedback)
        abc_body = str(abc_result.get("abc") or "").strip()
        metadata = abc_result.get("metadata") if isinstance(abc_result.get("metadata"), dict) else {}
        body_errors = validate_abc_body(abc_body, lesson, metadata)
        full_abc = assemble_full_abc(abc_body, metadata)
        render_errors = [] if dry_run else validate_abc_render(full_abc)
        review_errors = [] if dry_run else await review_example_accuracy(
            lesson, plan, abc_body, metadata
        )
        last_errors = body_errors + render_errors + review_errors
        if not last_errors:
            return {
                "illustrationPlan": plan,
                "kind": "notation",
                "abc": abc_body,
                "metadata": metadata,
            }
        feedback = "; ".join(last_errors)
    raise ValueError(f"{lesson_id} abc invalid after retries: {'; '.join(last_errors)}")


async def main_async(args: argparse.Namespace) -> int:
    _load_env_file(os.path.join(ROOT, ".env"))
    lessons = load_lessons(args.id)
    if not lessons:
        print("No theory lessons found", file=sys.stderr)
        return 1

    image_urls = load_existing_image_urls()
    generated: dict[str, dict[str, Any]] = {}
    if args.resume and not args.id:
        generated.update(_load_checkpoint())
        if generated:
            print(f"Resuming from checkpoint ({len(generated)} examples)", flush=True)
    failures: list[str] = []

    with use_llm_provider(_llm_config()):
        for lesson in lessons:
            lesson_id = str(lesson.get("id") or "")
            if args.resume and not args.id and lesson_id in generated:
                print(f"  skip {lesson_id} (checkpoint)", flush=True)
                continue
            try:
                generated[lesson_id] = await build_example(
                    lesson,
                    image_urls,
                    dry_run=args.dry_run,
                )
                if not args.dry_run and not args.id:
                    _save_checkpoint(generated)
                print(f"  ok {lesson_id}", flush=True)
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{lesson_id}: {exc}")
                print(f"  FAIL {lesson_id}: {exc}", file=sys.stderr, flush=True)

    if args.dry_run:
        print(json.dumps(generated, indent=2, ensure_ascii=False))
        return 1 if failures else 0

    if failures and not args.id:
        print(f"{len(failures)} lesson(s) failed; merging preserved examples for failures", file=sys.stderr)
        preserved = _load_existing_examples_from_js()
        for lesson in lessons:
            lesson_id = str(lesson.get("id") or "")
            if lesson_id in generated:
                continue
            if lesson_id in preserved:
                generated[lesson_id] = _normalize_preserved_example(preserved[lesson_id])
                print(f"  preserved {lesson_id}", flush=True)
            else:
                print(f"  still missing {lesson_id}", file=sys.stderr)
        still_missing = [l["id"] for l in lessons if l["id"] not in generated]
        if still_missing:
            print(f"Missing examples for: {still_missing}", file=sys.stderr)
            return 1

    # When regenerating a single id, merge with existing file contents
    if args.id and os.path.isfile(EXAMPLES_JS):
        merged = _load_existing_examples_from_js()
        merged.update(generated)
        generated = merged

    if not args.id:
        # full regen: require all lessons
        all_lessons = load_lessons(None)
        missing = [l["id"] for l in all_lessons if l["id"] not in generated]
        if missing:
            print(f"Missing examples for: {missing}", file=sys.stderr)
            return 1

    output = render_examples_js(generated)
    with open(EXAMPLES_JS, "w", encoding="utf-8") as handle:
        handle.write(output)
    print(f"Wrote {EXAMPLES_JS} ({len(generated)} examples)")
    if failures:
        for item in failures:
            print(f"  warning: {item}", file=sys.stderr)
    return 0


def _normalize_preserved_example(raw: dict[str, Any]) -> dict[str, Any]:
    plan = str(raw.get("illustrationPlan") or raw.get("caption") or "").strip()
    kind = str(raw.get("kind") or ("image" if raw.get("imageUrl") else "notation"))
    out: dict[str, Any] = {
        "illustrationPlan": plan,
        "kind": kind,
    }
    if kind == "image":
        out["imageUrl"] = str(raw.get("imageUrl") or "")
    else:
        out["abc"] = str(raw.get("abc") or "")
        out["metadata"] = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
    return out


def _load_existing_examples_from_js() -> dict[str, dict[str, Any]]:
    """Load current examples by running node."""
    script = """
import { THEORY_LESSON_EXAMPLES } from './src/feedContent/theory/examples.js';
console.log(JSON.stringify(THEORY_LESSON_EXAMPLES));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return {}
    try:
        data = json.loads(result.stdout)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _save_checkpoint(examples: dict[str, dict[str, Any]]) -> None:
    with open(CHECKPOINT_JSON, "w", encoding="utf-8") as handle:
        json.dump(examples, handle, indent=2, ensure_ascii=False)


def _load_checkpoint() -> dict[str, dict[str, Any]]:
    if not os.path.isfile(CHECKPOINT_JSON):
        return {}
    with open(CHECKPOINT_JSON, encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", help="Generate for a single lesson id")
    parser.add_argument("--dry-run", action="store_true", help="Print JSON, do not write file")
    parser.add_argument("--force", action="store_true", help="Overwrite even when partial failures")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip lessons already present in examples.generated.json checkpoint",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
