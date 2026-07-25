#!/usr/bin/env python3
"""Parse lesson quiz markdown into structured question objects."""

from __future__ import annotations

import re
from typing import Any

QUESTION_HEADER_RE = re.compile(r"^###\s+Q(\d+)\.\s*(.+)$", re.MULTILINE)
CHOICE_RE = re.compile(r"^-\s*([A-D])\)\s*(.+)$", re.MULTILINE)
ANSWER_RE = re.compile(r"^\*\*Answer:\*\*\s*(.+)$", re.MULTILINE)

WEAK_DISTRACTOR_RE = re.compile(
    r"Antarctic|fictional|electric guitar|Riverdance licensing|recipes from medieval|"
    r"opera houses|electronic dance|stock exchange|inner-city electronic|"
    r"martial arts|synthesizers only|never been held|jazz trumpeter|baroque vienna|"
    r"hip-hop|gregorian chant|new orleans|dj mixing|ballet on pointe|keyboard instrument|"
    r"brass horn|eurovision song contest|extinct medieval|inventor of the bodhr|banning all|"
    r"mandatory classical piano|only harp is permitted|only b-flat|atonal collections|"
    r"f-sharp major exclusively|only chart-topping|conductor assigns",
    re.IGNORECASE,
)

TRAD_FALLBACK_POOL = [
    "6/8 with a two-beat feel per bar",
    "9/8 slip-jig time",
    "4/4 reel time with a steady drive",
    "Sligo fiddle style",
    "Donegal highland repertoire",
    "Sliabh Luachra polkas and slides",
    "Mouth blowing only, like Highland pipes",
    "Elbow bellows strapped to the player",
    "D, G, A, and E minor",
    "Francis O'Neill",
    "Brendan Breathnach",
    "Mullingar, 1951",
    "Intangible cultural heritage of humanity",
    "Regions where Irish remains a community language",
    "Highly ornamented, often unaccompanied traditional song",
    "Group social choreography for multiple dancers",
    "Tips and heels striking the floor",
    "Four-string tenor banjo with a plectrum",
    "Modal Irish and Celtic accompaniment",
    "Single-headed Irish frame drum",
]


def _is_weak_distractor(text: str) -> bool:
    if not text or not str(text).strip():
        return True
    if WEAK_DISTRACTOR_RE.search(str(text)):
        return True
    return False


def _collect_answer_pool(questions: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    pool: list[str] = []
    for q in questions:
        if q.get("type") == "mcq":
            for choice in q.get("choices", []):
                if not choice.get("correct"):
                    continue
                text = str(choice.get("text", "")).strip()
                if text and not _is_weak_distractor(text):
                    key = text.lower()
                    if key not in seen:
                        seen.add(key)
                        pool.append(text)
        elif q.get("type") == "short":
            text = str(q.get("answer", "")).strip()
            if text:
                key = text.lower()
                if key not in seen:
                    seen.add(key)
                    pool.append(text)
    for text in TRAD_FALLBACK_POOL:
        key = text.lower()
        if key not in seen:
            seen.add(key)
            pool.append(text)
    return pool


def _pick_plausible_wrong(correct_text: str, pool: list[str], seed: str, count: int = 3) -> list[str]:
    correct_key = correct_text.lower()
    candidates = [t for t in pool if t.lower() != correct_key]
    if not candidates:
        candidates = [t for t in TRAD_FALLBACK_POOL if t.lower() != correct_key]
    offset = _stable_offset(seed, max(len(candidates), 1))
    picked: list[str] = []
    for i in range(len(candidates)):
        text = candidates[(offset + i) % len(candidates)]
        if text not in picked:
            picked.append(text)
        if len(picked) >= count:
            break
    return picked[:count]


def _parse_answer(raw: str) -> dict[str, Any]:
    text = raw.strip()
    tf = re.match(r"^(True|False)\b", text, re.IGNORECASE)
    if tf:
        correct = tf.group(1).lower() == "true"
        explain = re.sub(r"^(True|False)\s*[—–-]?\s*", "", text, flags=re.IGNORECASE).strip()
        return {"type": "truefalse", "letter": None, "correct": correct, "explain": explain}
    letter = re.match(r"^([A-D])\b", text, re.IGNORECASE)
    if letter:
        explain = re.sub(r"^[A-D]\s*[—–-]?\s*", "", text, flags=re.IGNORECASE).strip()
        return {"type": "mcq", "letter": letter.group(1).upper(), "explain": explain}
    return {"type": "text", "letter": None, "correct": None, "explain": text}


ANSWER_INLINE_RE = re.compile(r"^\s*\*\*Answer:\*\*\s*(.+)$", re.MULTILINE)
NUMBERED_QUESTION_RE = re.compile(r"^\d+\.\s+\*\*(.+?)\*\*\s*$", re.MULTILINE)


def parse_numbered_quiz_markdown(markdown: str) -> list[dict[str, Any]]:
    source = (markdown or "").strip()
    if not source:
        return []
    questions: list[dict[str, Any]] = []
    matches = list(NUMBERED_QUESTION_RE.finditer(source))
    for i, match in enumerate(matches):
        prompt = re.sub(r"\s+", " ", match.group(1)).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(source)
        block = source[start:end]
        answer_match = ANSWER_INLINE_RE.search(block)
        if not prompt or not answer_match:
            continue
        answer = answer_match.group(1).strip()
        questions.append({
            "id": f"q{i + 1}",
            "type": "short",
            "prompt": prompt,
            "answer": answer,
            "choices": [],
            "explain": answer,
        })
    return questions


def _short_answer_to_mcq(question: dict[str, Any], seed: str, pool: list[str]) -> dict[str, Any]:
    answer = str(question.get("answer", "")).strip()
    prompt = str(question.get("prompt", "")).strip()
    if not answer or not prompt:
        return question
    wrong = _pick_plausible_wrong(answer, pool, seed, 3)
    choices = [{"id": "a", "text": answer, "correct": True}]
    for j, text in enumerate(wrong):
        choices.append({"id": chr(98 + j), "text": text, "correct": False})
    rotated = _rotate_choices(choices, seed + ":rot")
    return {
        "id": question.get("id"),
        "type": "mcq",
        "prompt": prompt,
        "choices": rotated,
        "explain": f"The lesson gives: {answer}",
    }


def parse_lesson_quiz_markdown(markdown: str) -> list[dict[str, Any]]:
    source = (markdown or "").strip()
    if not source:
        return []

    chunks = re.split(r"\n(?=###\s+Q\d+\.)", source)
    questions: list[dict[str, Any]] = []

    for chunk in chunks:
        header = QUESTION_HEADER_RE.search(chunk)
        if not header:
            continue
        q_num = header.group(1)
        prompt_from_header = header.group(2).strip()
        rest = chunk[header.end() :].strip()
        answer_match = ANSWER_RE.search(rest)
        if not answer_match:
            continue
        parsed_answer = _parse_answer(answer_match.group(1))
        before_answer = rest[: answer_match.start()].strip()
        choice_lines = CHOICE_RE.findall(before_answer)
        prompt = before_answer
        if choice_lines:
            first_line = CHOICE_RE.search(before_answer)
            if first_line:
                prompt = before_answer[: first_line.start()].strip()
        if not prompt:
            prompt = prompt_from_header
        prompt = re.sub(r"\s+", " ", prompt).strip()
        if not prompt:
            continue

        qid = f"q{q_num}"
        if len(choice_lines) >= 2:
            choices = []
            for letter, text in choice_lines:
                choices.append({
                    "id": letter.lower(),
                    "text": text.strip(),
                    "correct": parsed_answer["letter"] == letter.upper() if parsed_answer["letter"] else False,
                })
            questions.append({
                "id": qid,
                "type": "mcq",
                "prompt": prompt,
                "choices": choices,
                "explain": parsed_answer["explain"] or "",
            })
            continue

        questions.append({
            "id": qid,
            "type": "truefalse",
            "prompt": prompt,
            "choices": [
                {"id": "a", "text": "True", "correct": parsed_answer["correct"] is True},
                {"id": "b", "text": "False", "correct": parsed_answer["correct"] is False},
            ],
            "explain": parsed_answer["explain"] or "",
        })

    return questions


def parse_lesson_quiz_markdown_with_fallback(markdown: str) -> list[dict[str, Any]]:
    parsed = parse_lesson_quiz_markdown(markdown)
    if parsed:
        return parsed
    return parse_numbered_quiz_markdown(markdown)


def _stable_offset(seed: str, modulo: int) -> int:
    total = 0
    for ch in seed:
        total = (total * 31 + ord(ch)) % modulo
    return total


def _improve_mcq_choices(
    choices: list[dict[str, Any]],
    pool: list[str],
    seed: str,
) -> list[dict[str, Any]]:
    correct = next((c for c in choices if c.get("correct")), None)
    if not correct:
        return choices
    correct_text = str(correct.get("text", "")).strip()
    wrong = _pick_plausible_wrong(correct_text, pool, seed, 3)
    rebuilt = [{"text": correct_text, "correct": True}] + [
        {"text": text, "correct": False} for text in wrong[:3]
    ]
    return _rotate_choices(rebuilt, seed + ":rot")


def _improve_distractors(choices: list[dict[str, Any]], seed: str, pool: list[str]) -> list[dict[str, Any]]:
    return _improve_mcq_choices(choices, pool, seed)


def _rotate_choices(choices: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    if len(choices) < 2:
        return choices
    offset = _stable_offset(seed, len(choices))
    rotated = choices[offset:] + choices[:offset]
    letters = "abcd"
    return [
        {
            "id": letters[i],
            "text": c.get("text", ""),
            "correct": bool(c.get("correct")),
        }
        for i, c in enumerate(rotated)
    ]


def quality_pass_questions(questions: list[dict[str, Any]], lesson_id: str) -> list[dict[str, Any]]:
    pool = _collect_answer_pool(questions)
    out: list[dict[str, Any]] = []
    for q in questions:
        item = dict(q)
        seed = f"{lesson_id}:{item.get('id', '')}"
        if item.get("type") == "short":
            item = _short_answer_to_mcq(item, seed, pool)
        if item.get("type") == "mcq" and isinstance(item.get("choices"), list):
            choices = _improve_mcq_choices(item["choices"], pool, seed)
            item["choices"] = choices
            if not str(item.get("explain", "")).strip():
                correct = next((c for c in choices if c.get("correct")), None)
                if correct:
                    item["explain"] = f"The lesson identifies this as: {correct.get('text', '')}"
        elif not str(item.get("explain", "")).strip():
            correct = next((c for c in item.get("choices", []) if c.get("correct")), None)
            if correct:
                item["explain"] = f"Correct answer: {correct.get('text', '')}"
        out.append(item)
    return out


def extract_quiz_markdown(body: str) -> str:
    match = re.search(r"^##\s+Quiz Questions\s*$", body, re.MULTILINE | re.IGNORECASE)
    if not match:
        return ""
    rest = body[match.end() :]
    next_h = re.search(r"^##\s+", rest, re.MULTILINE)
    return rest[: next_h.start()].strip() if next_h else rest.strip()


def strip_quiz_from_body(body: str) -> str:
    """Remove the Quiz Questions section so ### Q headings are not exported as lesson sections."""
    match = re.search(r"^##\s+Quiz Questions\s*$", body, re.MULTILINE | re.IGNORECASE)
    if not match:
        return body
    rest = body[match.end() :]
    next_h = re.search(r"^##\s+", rest, re.MULTILINE)
    tail = rest[next_h.start() :] if next_h else ""
    return (body[: match.start()].rstrip() + ("\n\n" + tail if tail else "")).strip() + "\n"
