"""Bandcamp search (fuzzysearch API) and URL helpers."""

from __future__ import annotations

import os
import re
from urllib.parse import urlparse

import httpx

from chords_fetch import score_title_artist_match

BANDCAMP_FUZZYSEARCH_URL = "https://bandcamp.com/api/fuzzysearch/2/app_autocomplete"
MAX_BANDCAMP_SEARCH_RESULTS = 50
BANDCAMP_SEARCH_TIMEOUT_SECONDS = 12.0


def bandcamp_enabled() -> bool:
    raw = os.getenv("BANDCAMP_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no")


_DOUBLED_BANDCAMP_URL_RE = re.compile(
    r"^https://[^/]+\.bandcamp\.comhttps://",
    re.IGNORECASE,
)


def repair_bandcamp_url(raw_url: str) -> str:
    """Fix Bandcamp fuzzysearch URLs that duplicate the origin prefix."""
    url = str(raw_url or "").strip()
    if not url:
        return ""
    match = _DOUBLED_BANDCAMP_URL_RE.match(url)
    if match:
        url = "https://" + url[match.end() :]
    return url


def is_bandcamp_url(raw_url: str) -> bool:
    try:
        parsed = urlparse(repair_bandcamp_url(raw_url))
    except Exception:
        return False
    if parsed.scheme not in ("https", "http"):
        return False
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host == "bandcamp.com" or host.endswith(".bandcamp.com")


def _normalize_fuzzysearch_item(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None
    item_type = str(item.get("type") or item.get("itemtype") or "").strip().lower()
    if item_type and item_type not in ("t", "track"):
        return None
    url = repair_bandcamp_url(str(item.get("url") or "").strip())
    if not url or not is_bandcamp_url(url):
        return None
    title = str(item.get("name") or item.get("title") or "").strip()
    if not title:
        return None
    artist = str(item.get("band_name") or item.get("bandname") or "").strip()
    image = str(item.get("img") or item.get("image") or "").strip()
    return {
        "title": title,
        "artist": artist,
        "url": url,
        "image": image,
    }


def build_bandcamp_candidate(entry: dict, *, title: str = "", artist: str = "") -> dict:
    track_title = str(entry.get("title") or "").strip()
    band_name = str(entry.get("artist") or "").strip()
    url = str(entry.get("url") or "").strip()
    image = str(entry.get("image") or "").strip()
    match_score = int(entry.get("matchScore") or 0)
    description_parts = [part for part in [band_name] if part]
    return {
        "title": track_title,
        "artist": band_name,
        "description": " · ".join(description_parts),
        "image": image,
        "link": url,
        "source": "bandcamp",
        "matchScore": match_score,
    }


async def search_bandcamp(
    query: str = "",
    *,
    title: str = "",
    artist: str = "",
    limit: int = MAX_BANDCAMP_SEARCH_RESULTS,
) -> list[dict]:
    search_text = str(query or "").strip()
    if not search_text:
        search_text = " ".join(
            part for part in [str(title or "").strip(), str(artist or "").strip()] if part
        ).strip()
    if not search_text:
        return []

    params = {
        "q": search_text,
        "item_type": "t",
        "param_with_locations": "true",
    }
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }
    timeout = httpx.Timeout(BANDCAMP_SEARCH_TIMEOUT_SECONDS, connect=6.0)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.get(BANDCAMP_FUZZYSEARCH_URL, params=params, headers=headers)
        response.raise_for_status()
        body = response.json()

    results = body.get("results") if isinstance(body, dict) else []
    if not isinstance(results, list):
        return []

    scored: list[dict] = []
    seen_urls: set[str] = set()
    query_title = str(title or query or "").strip()
    query_artist = str(artist or "").strip()

    for raw in results:
        normalized = _normalize_fuzzysearch_item(raw)
        if not normalized:
            continue
        url_key = normalized["url"].lower()
        if url_key in seen_urls:
            continue
        seen_urls.add(url_key)
        match_score = score_title_artist_match(
            normalized["title"],
            normalized["artist"],
            query_title,
            query_artist,
        )
        if match_score <= 0 and query_title:
            # Fuzzysearch already ranked by relevance; keep a baseline score.
            match_score = 25
        scored.append({
            **normalized,
            "matchScore": match_score,
        })

    scored.sort(
        key=lambda item: (item.get("matchScore") or 0, item.get("title") or ""),
        reverse=True,
    )
    max_results = max(1, min(int(limit or MAX_BANDCAMP_SEARCH_RESULTS), MAX_BANDCAMP_SEARCH_RESULTS))
    return scored[:max_results]
