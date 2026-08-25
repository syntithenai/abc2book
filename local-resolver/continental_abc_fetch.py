"""Direct online collectors for continental folk ABC hubs (Norbeck, JC Chambers)."""

from __future__ import annotations

import html
import re
from urllib.parse import quote, urljoin, urlparse

from chords_fetch import normalize_match_text, score_title_artist_match
from polite_fetch import BROWSER_USER_AGENT

NORBECK_BASE = "https://norbeck.nu/abc/"
NORBECK_SEARCH = "https://norbeck.nu/abc/index.asp"
JC_FIND = "https://trillian.mit.edu/~jc/cgi/abc/find.cgi"
JC_ABC_ROOT = "https://trillian.mit.edu/~jc/music/abc/"

MAX_CONTINENTAL_CANDIDATES = 6
MIN_TITLE_SCORE = 45

HREF_RE = re.compile(r'''href=["']([^"']+)["']''', re.I)
TITLE_TAG_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
ABC_HREF_RE = re.compile(r'''href=["']([^"']+\.abc(?:\.txt)?)["']''', re.I)
T_HEADER_RE = re.compile(r"^T:\s*(.+)$", re.M)


def _strip_tags(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", html.unescape(str(text or "")))


async def _emit(on_progress, stage, message, progress):
    if callable(on_progress):
        result = on_progress(stage, message, progress)
        if hasattr(result, "__await__"):
            await result


async def _get_text(client, url: str) -> str:
    response = await client.get(
        url,
        headers={"User-Agent": BROWSER_USER_AGENT},
        follow_redirects=True,
    )
    if response.status_code >= 400:
        return ""
    return response.text or ""


def _score_title(candidate_title: str, query_title: str) -> int:
    return int(score_title_artist_match(candidate_title or "", "", query_title or "", ""))


def _abc_title(abc_text: str) -> str:
    match = T_HEADER_RE.search(str(abc_text or ""))
    return match.group(1).strip() if match else ""


async def collect_norbeck_candidates(client, title, artist="", on_progress=None):
    """
    Best-effort Norbeck search.
    Prefers index/search pages; falls back to scraping linked .txt/.abc files that
    mention the title.
    """
    title = str(title or "").strip()
    if not title:
        return []

    await _emit(on_progress, "norbeck", "Searching Norbeck ABC...", 0.44)

    from notation_fetch import annotate_candidate, extract_abc_from_text, tune_meta_from_abc_headers

    candidates = []
    seen = set()

    # Norbeck index pages list tunes; try a few known entry points + query param variants.
    urls = [
        NORBECK_BASE,
        NORBECK_SEARCH + "?q=" + quote(title),
        NORBECK_BASE + "sweden.asp",
        NORBECK_BASE + "other.asp",
    ]
    linked = []
    for url in urls:
        try:
            text = await _get_text(client, url)
        except Exception:
            text = ""
        if not text:
            continue
        for match in HREF_RE.finditer(text):
            href = match.group(1).strip()
            if not href or href.startswith("#") or href.startswith("mailto:"):
                continue
            absolute = urljoin(url, href)
            host = (urlparse(absolute).hostname or "").lower()
            if "norbeck" not in host:
                continue
            path = (urlparse(absolute).path or "").lower()
            if path.endswith((".txt", ".abc", ".asp", ".html", ".htm")):
                linked.append(absolute)

    # Prefer files whose URL or surrounding context may match.
    query_key = normalize_match_text(title)
    ranked_links = []
    for link in linked:
        path_score = 10 if query_key and query_key[:6] in normalize_match_text(link) else 0
        ranked_links.append((path_score, link))
    ranked_links.sort(key=lambda row: row[0], reverse=True)

    for _score, link in ranked_links[:18]:
        try:
            page = await _get_text(client, link)
        except Exception:
            continue
        if not page:
            continue
        blocks = extract_abc_from_text(page)
        if not blocks and ("X:" in page or "K:" in page):
            blocks = [page]
        for block in blocks[:8]:
            if "K:" not in block.upper():
                continue
            tune_title = _abc_title(block) or title
            score = _score_title(tune_title, title)
            if score < MIN_TITLE_SCORE:
                continue
            key = normalize_match_text(block[:160])
            if key in seen:
                continue
            seen.add(key)
            meta = tune_meta_from_abc_headers(block, source_url=link)
            cand = annotate_candidate(
                block,
                tune_title,
                "norbeck.nu",
                link,
                artist=artist or "",
                tune_meta=meta or None,
            )
            cand["matchScore"] = score
            candidates.append(cand)
            if len(candidates) >= MAX_CONTINENTAL_CANDIDATES:
                return candidates
    return candidates


async def collect_jc_candidates(client, title, artist="", on_progress=None):
    """John Chambers ABC Tune Finder + regional directory hints."""
    title = str(title or "").strip()
    if not title:
        return []

    await _emit(on_progress, "jc", "Searching John Chambers ABC archive...", 0.45)

    from notation_fetch import annotate_candidate, extract_abc_from_text, tune_meta_from_abc_headers

    candidates = []
    seen = set()

    find_urls = [
        JC_FIND + "?P=Title&Q=" + quote(title),
        JC_FIND + "?P=Tune&Q=" + quote(title),
    ]
    # Regional browsable roots useful for EuroSession.
    region_roots = [
        JC_ABC_ROOT + "Sweden/",
        JC_ABC_ROOT + "Klezmer/",
        JC_ABC_ROOT + "Balkan/",
        JC_ABC_ROOT + "Scand/",
        JC_ABC_ROOT + "Intl/",
    ]

    abc_links = []
    for url in find_urls:
        try:
            text = await _get_text(client, url)
        except Exception:
            text = ""
        if not text:
            continue
        for match in ABC_HREF_RE.finditer(text):
            abc_links.append(urljoin(url, match.group(1)))
        for match in HREF_RE.finditer(text):
            href = match.group(1)
            if ".abc" in href.lower():
                abc_links.append(urljoin(url, href))

    # If finder is empty, try region directory index pages for a filename match.
    query_slug = re.sub(r"[^a-z0-9]+", "", normalize_match_text(title))
    if len(abc_links) < 3 and query_slug:
        for root in region_roots:
            try:
                text = await _get_text(client, root)
            except Exception:
                continue
            for match in ABC_HREF_RE.finditer(text or ""):
                href = match.group(1)
                absolute = urljoin(root, href)
                if query_slug[:6] in normalize_match_text(href):
                    abc_links.append(absolute)

    # Deduplicate preserve order.
    ordered = []
    seen_url = set()
    for link in abc_links:
        key = link.split("#")[0]
        if key in seen_url:
            continue
        seen_url.add(key)
        ordered.append(key)

    for link in ordered[:16]:
        try:
            page = await _get_text(client, link)
        except Exception:
            continue
        if not page:
            continue
        blocks = extract_abc_from_text(page)
        if not blocks and ("X:" in page or "K:" in page):
            blocks = [page]
        for block in blocks[:6]:
            if "K:" not in block.upper():
                continue
            tune_title = _abc_title(block) or title
            score = _score_title(tune_title, title)
            if score < MIN_TITLE_SCORE:
                continue
            key = normalize_match_text(block[:160])
            if key in seen:
                continue
            seen.add(key)
            meta = tune_meta_from_abc_headers(block, source_url=link)
            cand = annotate_candidate(
                block,
                tune_title,
                "trillian.mit.edu",
                link,
                artist=artist or "",
                tune_meta=meta or None,
            )
            cand["matchScore"] = score
            candidates.append(cand)
            if len(candidates) >= MAX_CONTINENTAL_CANDIDATES:
                return candidates
    return candidates


async def collect_continental_abc_candidates(client, title, artist="", on_progress=None):
    """Fan-out Norbeck + JC; return merged list (caller dedupes)."""
    import asyncio

    norbeck_task = collect_norbeck_candidates(client, title, artist, on_progress=on_progress)
    jc_task = collect_jc_candidates(client, title, artist, on_progress=on_progress)
    norbeck, jc = await asyncio.gather(norbeck_task, jc_task, return_exceptions=True)
    out = []
    for result in (norbeck, jc):
        if isinstance(result, Exception) or not isinstance(result, list):
            continue
        out.extend(result)
    return out
