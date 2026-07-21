"""Search OpenScore-hosted scores (MuseScore + openscore.org)."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from archive_source_config import notation_source_enabled
from chords_fetch import score_title_artist_match
from musescore_fetch import (
    MuseScoreDownloadUnavailable,
    annotate_musescore_candidate,
    build_musescore_manual_candidate,
    fetch_musescore_url,
    is_musescore_url,
    parse_musescore_score_url,
)
from tune_background_research import search_web

MAX_OPENSCORE_URL_TRIES = 5
HTTP_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
MUSESCORE_SCORE_RE = re.compile(
    r"https?://(?:www\.)?musescore\.com/(?:openscore/)?scores/\d+",
    re.I,
)


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def is_openscore_url(url):
    text = str(url or "").strip().lower()
    if not text:
        return False
    if "openscore" in text and is_musescore_url(text):
        return True
    try:
        host = (urlparse(text).hostname or "").lower().replace("www.", "")
    except Exception:
        return False
    return host == "openscore.org" or host.endswith(".openscore.org")


def build_openscore_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    quoted = '"{0}"'.format(title)
    queries = [
        "site:musescore.com/openscore {0}".format(quoted),
        "site:openscore.org {0}".format(quoted),
    ]
    if artist:
        queries.append("site:musescore.com/openscore {0} {1}".format(quoted, '"{0}"'.format(artist)))
    return queries


def annotate_openscore_candidate(candidate):
    out = dict(candidate or {})
    tune_meta = dict(out.get("tuneMeta") or {})
    meta = dict(tune_meta.get("meta") or {})
    meta["archive"] = "openscore"
    meta["importFormat"] = meta.get("importFormat") or "musicxml"
    tune_meta["meta"] = meta
    out["tuneMeta"] = tune_meta
    out["source"] = "openscore.org"
    return out


def openscore_urls_from_search_results(results):
    urls = []
    seen = set()
    for item in results or []:
        url = str((item or {}).get("url") or "").strip()
        if not url:
            continue
        if is_openscore_url(url) and url not in seen:
            seen.add(url)
            urls.append(url)
        for match in MUSESCORE_SCORE_RE.finditer(url):
            hit = match.group(0)
            if hit not in seen:
                seen.add(hit)
                urls.append(hit)
    return urls[:MAX_OPENSCORE_URL_TRIES]


def extract_musescore_links_from_html(html):
    urls = []
    seen = set()
    for match in HTTP_URL_RE.finditer(html or ""):
        url = match.group(0).strip().rstrip(".,;:!?)\"'>]")
        if not is_musescore_url(url) or "openscore" not in url.lower():
            continue
        if url not in seen:
            seen.add(url)
            urls.append(url)
    for match in MUSESCORE_SCORE_RE.finditer(html or ""):
        url = match.group(0)
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


async def fetch_openscore_url(url, on_progress=None, client=None):
    if is_musescore_url(url):
        try:
            candidate = await fetch_musescore_url(url, on_progress=on_progress, client=client)
            return annotate_openscore_candidate(candidate)
        except MuseScoreDownloadUnavailable as exc:
            parsed = parse_musescore_score_url(url)
            clean_url = (parsed or {}).get("url") or url
            manual = build_musescore_manual_candidate(
                clean_url,
                title="",
                access_tier=getattr(exc, "access_tier", "unknown"),
            )
            return {
                "empty": True,
                "found": False,
                "manualCandidates": [manual],
            }

    await _emit_progress(on_progress, "openscore", "Looking for MuseScore links...", 0.5)
    from browser_fetch import fetch_html_with_fallback
    import httpx

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=20.0)
    try:
        page = await fetch_html_with_fallback(client, url, allow_playwright=False)
        links = extract_musescore_links_from_html(page.text or "")
        if not links:
            raise ValueError("No OpenScore MuseScore links found on page")
        return await fetch_openscore_url(links[0], on_progress=on_progress, client=client)
    finally:
        if owns_client:
            await client.aclose()


async def collect_openscore_candidates(client, title, artist="", on_progress=None):
    if not notation_source_enabled("openscore"):
        return []
    await _emit_progress(on_progress, "openscore", "Searching OpenScore...", 0.2)
    queries = build_openscore_search_queries(title, artist)
    candidates = []
    manual_candidates = []

    for query in queries[:3]:
        try:
            results = await search_web(query, max_results=8)
        except Exception:
            continue
        for page_url in openscore_urls_from_search_results(results):
            try:
                result = await fetch_openscore_url(page_url, on_progress=on_progress, client=client)
            except Exception:
                continue
            if isinstance(result, dict) and result.get("empty"):
                manual_candidates.extend(result.get("manualCandidates") or [])
                continue
            score = score_title_artist_match(
                result.get("title") or "",
                result.get("artist") or "",
                title,
                artist,
            )
            if score < 20:
                continue
            candidates.append(result)
            if len(candidates) >= 3:
                return candidates

    if candidates:
        return candidates
    if manual_candidates:
        return {"candidates": [], "manualCandidates": manual_candidates}
    return []
