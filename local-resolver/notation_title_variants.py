"""Shared title query variants for notation / MuseScore / MIDI web search."""

from __future__ import annotations

import re

# Word-boundary classical / common misspellings that hurt ABC+folk search.
TITLE_VARIANT_SWAPS = (
    ("clare", "clair"),
    ("clair", "clare"),
    ("claire", "clair"),
    ("clair", "claire"),
)


def notation_title_variants(title):
    """Return unique title strings to try in web search (original first)."""
    text = str(title or "").strip()
    if not text:
        return []

    ordered = [text]
    seen = {text.lower()}

    def add(candidate):
        candidate = str(candidate or "").strip()
        if not candidate:
            return
        key = candidate.lower()
        if key in seen:
            return
        seen.add(key)
        ordered.append(candidate)

    lower = text.lower()
    for left, right in TITLE_VARIANT_SWAPS:
        if re.search(r"\b" + re.escape(left) + r"\b", lower):
            pattern = re.compile(r"\b" + re.escape(left) + r"\b", re.I)

            def repl(match, replacement=right):
                word = match.group(0)
                if word.isupper():
                    return replacement.upper()
                if word[0].isupper():
                    return replacement.capitalize()
                return replacement

            add(pattern.sub(repl, text))

    return ordered
