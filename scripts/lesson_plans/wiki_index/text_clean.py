"""Normalize wikimusic markdown (one phrase per line) for indexing and lessons."""

from __future__ import annotations

import re

_NAV_TAIL_RE = re.compile(
    r"\n(?:See also|References|Bibliography|External links|Retrieved from|"
    r"v t e ).*",
    re.I | re.DOTALL,
)
_BOILERPLATE_RE = re.compile(
    r"This article (?:includes a list of )?general references.*?remove this message\s*\)?\s*",
    re.I | re.DOTALL,
)
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
_CAPTION_RE = re.compile(r"^\*[^*]+\*\s*$", re.M)
_WHO_RE = re.compile(r"\[\s*who\?\s*\]", re.I)
_BRACKET_NOTE_RE = re.compile(r"\(\s*(?:citation needed|clarification needed)[^)]*\)", re.I)


def reflow_wiki_lines(text: str) -> str:
    """Join phrase-per-line wiki scrape into readable paragraphs."""
    lines = [ln.strip() for ln in text.splitlines()]
    paras: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            paras.append(" ".join(buf))
            buf.clear()

    for line in lines:
        if not line:
            flush()
            continue
        if line.startswith("#") or line.startswith("!["):
            flush()
            if line.startswith("#"):
                paras.append(line)
            continue
        if _CAPTION_RE.match(line):
            flush()
            continue
        buf.append(line)
    flush()
    return "\n\n".join(paras)


def strip_wiki_boilerplate(text: str) -> str:
    text = _BOILERPLATE_RE.sub("", text)
    text = _NAV_TAIL_RE.sub("", text)
    text = _IMAGE_RE.sub("", text)
    text = _WHO_RE.sub("", text)
    text = _BRACKET_NOTE_RE.sub("", text)
    text = re.sub(r"\[\s*citation needed\s*\]", "", text, flags=re.I)
    text = re.sub(r"\.\s*Please help\s+by introducing\s*\.\s*\(\s*\)", ".", text, flags=re.I)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def trim_to_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    clipped = " ".join(words[:max_words])
    m = re.search(r"^(.*[.!?])\s+[^.!?]*$", clipped, re.DOTALL)
    return (m.group(1) if m else clipped).strip()


def clean_wiki_chunk(text: str) -> str:
    text = reflow_wiki_lines(text)
    text = strip_wiki_boilerplate(text)
    return text.strip()


def is_substantive(text: str, min_words: int = 40) -> bool:
    words = text.split()
    if len(words) < min_words:
        return False
    low = text.lower()
    if "inline citations" in low and len(words) < 120:
        return False
    return True
