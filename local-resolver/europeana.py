"""Europeana Sounds search for folk/trad recordings."""

from __future__ import annotations

import os
from urllib.parse import quote

import httpx

from chords_fetch import score_title_artist_match

EUROPEANA_SEARCH_URL = "https://api.europeana.eu/record/v2/search.json"
MAX_EUROPEANA_SEARCH_RESULTS = 20
EUROPEANA_SEARCH_TIMEOUT_SECONDS = 15.0


def europeana_enabled() -> bool:
    return bool(os.getenv("EUROPEANA_API_KEY", "").strip())


def _first_string(value) -> str:
    if isinstance(value, list):
        for item in value:
            text = str(item or "").strip()
            if text:
                return text
        return ""
    return str(value or "").strip()


def _pick_media_url(item: dict) -> str:
    for key in ("edmIsShownBy", "edmIsShownAt"):
        values = item.get(key)
        if isinstance(values, list):
            for value in values:
                text = str(value or "").strip()
                if text.startswith("https://"):
                    return text
        elif isinstance(values, str) and values.startswith("https://"):
            return values
    return ""


def build_europeana_candidate(entry: dict, *, title: str = "", artist: str = "") -> dict:
    track_title = str(entry.get("title") or "").strip()
    creator = str(entry.get("artist") or "").strip()
    link = str(entry.get("link") or "").strip()
    image = str(entry.get("image") or "").strip()
    match_score = int(entry.get("matchScore") or 0)
    description_parts = [part for part in [creator] if part]
    return {
        "title": track_title,
        "artist": creator,
        "description": " · ".join(description_parts),
        "image": image,
        "link": link,
        "source": "europeana",
        "matchScore": match_score,
    }


async def search_europeana(
    query: str = "",
    *,
    title: str = "",
    artist: str = "",
    limit: int = MAX_EUROPEANA_SEARCH_RESULTS,
) -> list[dict]:
    api_key = os.getenv("EUROPEANA_API_KEY", "").strip()
    if not api_key:
        return []

    clean_title = str(title or "").strip()
    clean_artist = str(artist or "").strip()
    clean_query = str(query or "").strip()
    query_parts = [part for part in [clean_title, clean_artist] if part]
    if not query_parts and clean_query:
        query_parts = [clean_query]
    if not query_parts:
        return []

    search_text = " AND ".join(f'"{part.replace(chr(34), " ")}"' for part in query_parts)
    params = {
        "wskey": api_key,
        "query": search_text,
        "qf": "TYPE:SOUND",
        "theme": "music",
        "reusability": "open",
        "media": "true",
        "rows": max(1, min(int(limit or MAX_EUROPEANA_SEARCH_RESULTS), MAX_EUROPEANA_SEARCH_RESULTS)),
        "profile": "rich",
    }
    headers = {"Accept": "application/json"}
    timeout = httpx.Timeout(EUROPEANA_SEARCH_TIMEOUT_SECONDS, connect=6.0)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.get(EUROPEANA_SEARCH_URL, params=params, headers=headers)
        response.raise_for_status()
        body = response.json()

    items = body.get("items") if isinstance(body, dict) else []
    if not isinstance(items, list):
        return []

    scored: list[dict] = []
    seen_links: set[str] = set()
    query_title = clean_title or clean_query
    query_artist = clean_artist

    for raw in items:
        if not isinstance(raw, dict):
            continue
        track_title = _first_string(raw.get("title") or raw.get("dcTitle"))
        creator = _first_string(raw.get("dcCreator"))
        media_url = _pick_media_url(raw)
        item_id = str(raw.get("id") or "").strip()
        if media_url:
            link = media_url
        elif item_id:
            link = f"https://www.europeana.eu/item/{item_id.lstrip('/')}"
        else:
            continue
        link_key = link.lower()
        if link_key in seen_links:
            continue
        seen_links.add(link_key)
        image = _first_string(raw.get("edmPreview"))
        match_score = score_title_artist_match(track_title, creator, query_title, query_artist)
        if match_score <= 0 and query_title:
            match_score = 20
        scored.append({
            "title": track_title or "Recording",
            "artist": creator,
            "image": image,
            "link": link,
            "matchScore": match_score,
        })

    scored.sort(
        key=lambda item: (item.get("matchScore") or 0, item.get("title") or ""),
        reverse=True,
    )
    return scored
