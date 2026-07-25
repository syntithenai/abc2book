"""Region tagging heuristics for wiki articles."""

from __future__ import annotations

import re

REGION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("ireland", re.compile(r"\b(irish|ireland|uilleann|bodhrán|sean-nós|gaelic ireland)\b", re.I)),
    ("scotland", re.compile(r"\b(scottish|scotland|highland|gaelic scotland|scots)\b", re.I)),
    ("wales", re.compile(r"\b(welsh|wales|cymru)\b", re.I)),
    ("brittany", re.compile(r"\b(breton|brittany)\b", re.I)),
    ("celtic", re.compile(r"\b(celtic|pan-celtic|celtic nations)\b", re.I)),
    ("england", re.compile(r"\b(english music|england|cornish)\b", re.I)),
    ("usa", re.compile(r"\b(american music|united states music|appalachian)\b", re.I)),
    ("middle_east", re.compile(r"\b(middle east|arab|persian|turkish music|maqam|makam|kurd)\b", re.I)),
    ("india", re.compile(r"\b(indian music|hindustani|carnatic|raga)\b", re.I)),
    ("africa", re.compile(r"\b(african music|west africa|mbira|kora)\b", re.I)),
    ("latin_america", re.compile(r"\b(latin american|salsa|bossa|samba|tango)\b", re.I)),
    ("east_asia", re.compile(r"\b(chinese music|japanese music|korean music|gagaku)\b", re.I)),
    ("europe_classical", re.compile(r"\b(western classical|european classical|common practice)\b", re.I)),
]

TITLE_REGION_RE = re.compile(
    r"^(Music of |Folk music of |Traditional music of |Dance of )(.+)$",
    re.I,
)


def tag_regions(title: str, text_sample: str = "", categories: list[str] | None = None) -> list[str]:
    """Return sorted region tag slugs."""
    tags: set[str] = set()
    haystack = f"{title}\n{text_sample}\n{' '.join(categories or [])}"

    m = TITLE_REGION_RE.match(title)
    if m:
        place = m.group(2).lower()
        if "ireland" in place:
            tags.add("ireland")
        if "scotland" in place:
            tags.add("scotland")
        if "wales" in place:
            tags.add("wales")
        if "celtic" in place:
            tags.add("celtic")

    for slug, pattern in REGION_PATTERNS:
        if pattern.search(haystack):
            tags.add(slug)

    if title in {"Music of Ireland", "Irish dance", "Irish fiddle", "Uilleann pipes", "Bodhrán"}:
        tags.add("ireland")
    if title in {"Scottish folk music", "Scottish country dance", "Cape Breton fiddling"}:
        tags.add("scotland")
        tags.add("celtic")

    if "celtic" in tags or "ireland" in tags or "scotland" in tags or "wales" in tags or "brittany" in tags:
        tags.add("celtic")

    return sorted(tags)
