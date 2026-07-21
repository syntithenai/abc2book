"""Validation helpers for theory lesson illustration plans and ABC bodies."""

from __future__ import annotations

import re
from typing import Any


MIN_PLAN_LEN = 40
IMAGE_TRACKS = frozenset({"history", "styles"})
NOTATION_TRACKS = frozenset({"foundations", "italian", "chords", "transposition", "harmony"})
NOTE_LETTER_RE = re.compile(r"[A-Ga-g]")
VOICE_RE = re.compile(r"^V:\s*\d", re.M)
LEDGER_LINE_RE = re.compile(r"[A-Ga-g][,']")
BARE_CHORD_SYMBOL_RE = re.compile(
    r'^\s*"[A-Za-z0-9#b°+/]+"\s*\|?\s*$',
    re.M,
)
CHORD_STACK_RE = re.compile(r"\[[A-Ga-g]+\]")
ROMAN_WITH_LETTER_RE = re.compile(
    r'"[IViv]+°?\s*\([A-G][#b]?[^"]*\)"',
    re.I,
)
INLINE_KEY_CHANGE_RE = re.compile(r"\[K:[^\]]+\]", re.I)
TRIAD_LESSON_RE = re.compile(
    r"triad|inversion|diatonic|seventh",
    re.I,
)


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {w for w in words if len(w) >= 3}


def lesson_uses_image(lesson: dict[str, Any]) -> bool:
    track = str(lesson.get("track") or "")
    lesson_id = str(lesson.get("id") or "")
    if track in IMAGE_TRACKS:
        return True
    return lesson_id.startswith("history-") or lesson_id.startswith("styles-")


def lesson_uses_notation(lesson: dict[str, Any]) -> bool:
    if lesson_uses_image(lesson):
        return False
    return str(lesson.get("track") or "") in NOTATION_TRACKS


def is_chord_lesson(lesson: dict[str, Any]) -> bool:
    if str(lesson.get("track") or "") == "chords":
        return True
    lesson_id = str(lesson.get("id") or "")
    return bool(TRIAD_LESSON_RE.search(lesson_id))


def is_triad_stack_lesson(lesson: dict[str, Any]) -> bool:
    lesson_id = str(lesson.get("id") or "")
    return bool(re.search(r"triad|inversion|diatonic", lesson_id, re.I))


def is_transposition_lesson(lesson: dict[str, Any]) -> bool:
    track = str(lesson.get("track") or "")
    lesson_id = str(lesson.get("id") or "")
    return track == "transposition" or lesson_id.startswith("transpose-")


def plan_keyword_overlap(plan: str, lesson: dict[str, Any]) -> bool:
    plan_tokens = _tokens(plan)
    if not plan_tokens:
        return False
    title = str(lesson.get("title") or "")
    tags = " ".join(str(t) for t in (lesson.get("tags") or []))
    body = str(lesson.get("body") or "")[:400]
    lesson_tokens = _tokens(" ".join([title, tags, body]))
    if not lesson_tokens:
        return len(plan.strip()) >= MIN_PLAN_LEN
    return bool(plan_tokens & lesson_tokens)


def validate_plan(plan: str, lesson: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    text = str(plan or "").strip()
    if len(text) < MIN_PLAN_LEN:
        errors.append(f"illustrationPlan too short ({len(text)} < {MIN_PLAN_LEN})")
    if not plan_keyword_overlap(text, lesson):
        errors.append("illustrationPlan lacks keyword overlap with lesson")
    return errors


def validate_bar_structure(
    abc_body: str,
    metadata: dict[str, Any] | None = None,
) -> list[str]:
    body = str(abc_body or "")
    meta = metadata or {}
    if meta.get("allowBarless"):
        return []
    if "|" not in body:
        return ["abc body should use bar lines (|) to group rhythms into measures"]
    if not meta.get("meter") and not re.search(r"\[M:[^\]]+\]|^M:", body, re.M):
        return ["abc example needs a time signature (metadata.meter or inline [M:...])"]
    return []


def validate_no_ledger_lines(abc_body: str) -> list[str]:
    if LEDGER_LINE_RE.search(abc_body or ""):
        return ["abc body uses ledger lines (, or ' octave marks); keep notes on the staff"]
    return []


def validate_chord_notation(abc_body: str, lesson: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    body = str(abc_body or "")
    if is_triad_stack_lesson(lesson) and not CHORD_STACK_RE.search(body):
        errors.append("triad lesson should use ABC stacked chord notation like [CEG] or [Ace]")
    if is_chord_lesson(lesson) and not (
        CHORD_STACK_RE.search(body) or ROMAN_WITH_LETTER_RE.search(body)
    ):
        errors.append(
            "chord lesson should use stacked chords [CEG] and/or Roman numerals with letter names like \"I(C)\""
        )
    if BARE_CHORD_SYMBOL_RE.search(body):
        errors.append("abc body has chord-symbol-only lines without notes")
    return errors


def validate_transposition_consistency(
    abc_body: str,
    metadata: dict[str, Any] | None,
    lesson: dict[str, Any],
) -> list[str]:
    if not is_transposition_lesson(lesson):
        return []
    body = str(abc_body or "")
    key = str((metadata or {}).get("key") or "")
    if not key:
        return ["transposition example needs metadata.key"]
    # Multiple keys require inline [K:...] changes when more than one key area is shown.
    if body.lower().count("major") >= 2 or body.count("%---") >= 2 or body.count("transpos") >= 1:
        if not INLINE_KEY_CHANGE_RE.search(body) and body.count("|") > 4:
            return [
                "transposition example must use inline [K:NewKey] before each transposed phrase "
                "so the key signature matches the notes"
            ]
    return []


def validate_abc_body(
    abc_body: str,
    lesson: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[str]:
    errors: list[str] = []
    body = str(abc_body or "").strip()
    if not body:
        errors.append("abc body empty")
        return errors
    if not NOTE_LETTER_RE.search(body):
        errors.append("abc body has no note letters")
    if not VOICE_RE.search(body) and body.count("|") < 1:
        errors.append("abc body needs voices or bar lines")
    if re.search(r"^X:\s*|^K:\s*|^M:\s*", body, re.M):
        errors.append("abc body must not include X:/K:/M: headers")
    errors.extend(validate_no_ledger_lines(body))
    errors.extend(validate_bar_structure(body, metadata))
    if lesson:
        errors.extend(validate_chord_notation(body, lesson))
        errors.extend(validate_transposition_consistency(body, metadata, lesson))
    return errors


def assemble_full_abc(abc_body: str, metadata: dict[str, Any] | None) -> str:
    meta = metadata or {}
    lines = ["X:1"]
    if meta.get("meter"):
        lines.append(f"M:{meta['meter']}")
    if meta.get("noteLength"):
        lines.append(f"L:{meta['noteLength']}")
    if meta.get("tempo"):
        lines.append(f"Q:{meta['tempo']}")
    if meta.get("key"):
        lines.append(f"K:{meta['key']}")
    for line in str(abc_body or "").splitlines():
        if line.strip():
            lines.append(line.rstrip())
    return "\n".join(lines)
