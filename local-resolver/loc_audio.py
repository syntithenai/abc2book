"""Library of Congress audio search and playback URL resolution."""

from __future__ import annotations

import json
import os
from urllib.parse import urlencode, urlparse

import httpx

from chords_fetch import score_title_artist_match
from polite_fetch import polite_get

LOC_SEARCH_URL = "https://www.loc.gov/search/"
MAX_LOC_AUDIO_SEARCH_RESULTS = 20
LOC_AUDIO_SEARCH_TIMEOUT_SECONDS = 15.0


async def _polite_get_json(url: str) -> dict | None:
    timeout = httpx.Timeout(LOC_AUDIO_SEARCH_TIMEOUT_SECONDS, connect=6.0)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        result = await polite_get(client, url, referer="https://www.loc.gov/")
    if result.status < 200 or result.status >= 300 or not result.text:
        return None
    try:
        payload = json.loads(result.text)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def loc_audio_enabled() -> bool:
    raw = os.getenv("LOC_AUDIO_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no")


def is_loc_gov_url(raw_url: str) -> bool:
    try:
        parsed = urlparse(str(raw_url or "").strip())
    except Exception:
        return False
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host == "loc.gov"


def _normalize_search_result(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title") or "").strip()
    link = str(raw.get("url") or "").strip()
    if not link:
        item = raw.get("item")
        if isinstance(item, dict):
            link = str(item.get("url") or "").strip()
    if not link:
        link = str(raw.get("id") or "").strip()
    if link and not link.startswith("http"):
        link = "https://www.loc.gov" + (link if link.startswith("/") else "/" + link)
    if not title or not link:
        return None
    image = str(raw.get("image_url") or raw.get("image") or "").strip()
    return {
        "title": title,
        "link": link,
        "image": image,
    }


def _extract_audio_urls(payload: dict) -> list[str]:
    urls: list[str] = []
    if not isinstance(payload, dict):
        return urls

    def add_url(value) -> None:
        text = str(value or "").strip()
        if text.startswith("https://") and text not in urls:
            urls.append(text)

    resources = payload.get("resources")
    if isinstance(resources, list):
        for resource in resources:
            if not isinstance(resource, dict):
                continue
            mime = str(resource.get("mime_type") or resource.get("mimetype") or "").lower()
            url = resource.get("url") or resource.get("image") or resource.get("file")
            if mime.startswith("audio/") or str(url or "").lower().endswith((".mp3", ".wav", ".m4a", ".ogg", ".flac")):
                add_url(url)

    item = payload.get("item")
    if isinstance(item, dict):
        audio = item.get("audio")
        if isinstance(audio, list):
            for entry in audio:
                if isinstance(entry, dict):
                    add_url(entry.get("url") or entry.get("download"))
                else:
                    add_url(entry)
        resources = item.get("resources")
        if isinstance(resources, list):
            for resource in resources:
                if not isinstance(resource, dict):
                    continue
                mime = str(resource.get("mime_type") or "").lower()
                if mime.startswith("audio/"):
                    add_url(resource.get("url") or resource.get("image"))

    return urls


async def resolve_loc_playback_url(source_url: str) -> str | None:
    source_url = str(source_url or "").strip()
    if not source_url or not is_loc_gov_url(source_url):
        return None
    if source_url.lower().endswith((".mp3", ".wav", ".m4a", ".ogg", ".flac")):
        return source_url

    item_url = source_url.split("?")[0].rstrip("/")
    if not item_url.endswith("/"):
        item_url += "/"
    json_url = item_url + "?fo=json"

    response = await _polite_get_json(json_url)
    if response is None:
        return None
    payload = response
    audio_urls = _extract_audio_urls(payload)
    return audio_urls[0] if audio_urls else None


def build_loc_audio_candidate(entry: dict, *, title: str = "", artist: str = "") -> dict:
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
        "source": "loc",
        "matchScore": match_score,
    }


async def search_loc_audio(
    query: str = "",
    *,
    title: str = "",
    artist: str = "",
    limit: int = MAX_LOC_AUDIO_SEARCH_RESULTS,
) -> list[dict]:
    clean_title = str(title or "").strip()
    clean_artist = str(artist or "").strip()
    clean_query = str(query or "").strip()
    search_text = " ".join(part for part in [clean_title, clean_artist, clean_query] if part).strip()
    if not search_text:
        return []

    params = {
        "q": search_text,
        "fa": "original-format:sound recording",
        "fo": "json",
        "sp": max(1, min(int(limit or MAX_LOC_AUDIO_SEARCH_RESULTS), MAX_LOC_AUDIO_SEARCH_RESULTS)),
    }
    search_url = LOC_SEARCH_URL + "?" + urlencode(params)
    body = await _polite_get_json(search_url)
    if body is None:
        return []

    results = body.get("results") if isinstance(body, dict) else []
    if not isinstance(results, list):
        return []

    scored: list[dict] = []
    seen_links: set[str] = set()
    query_title = clean_title or clean_query
    query_artist = clean_artist

    for raw in results:
        normalized = _normalize_search_result(raw)
        if not normalized:
            continue
        link_key = normalized["link"].lower()
        if link_key in seen_links:
            continue
        seen_links.add(link_key)
        match_score = score_title_artist_match(
            normalized["title"],
            "",
            query_title,
            query_artist,
        )
        if match_score <= 0 and query_title:
            match_score = 15
        scored.append({
            **normalized,
            "artist": "",
            "matchScore": match_score,
        })

    scored.sort(
        key=lambda item: (item.get("matchScore") or 0, item.get("title") or ""),
        reverse=True,
    )
    return scored
