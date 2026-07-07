"""Web image search for sheet image import (Brave Search API)."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote_plus

import httpx

BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()


def image_search_available() -> bool:
    return bool(BRAVE_SEARCH_API_KEY)


def _normalize_image_result(item: dict[str, Any]) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    properties = item.get("properties") if isinstance(item.get("properties"), dict) else {}
    thumbnail = item.get("thumbnail") if isinstance(item.get("thumbnail"), dict) else {}
    image_url = str(properties.get("url") or properties.get("src") or "").strip()
    if not image_url:
        image_url = str(thumbnail.get("src") or "").strip()
    if not image_url.startswith("https://"):
        return None
    title = str(item.get("title") or "").strip()
    source = ""
    meta_url = item.get("meta_url") if isinstance(item.get("meta_url"), dict) else {}
    if meta_url.get("hostname"):
        source = str(meta_url.get("hostname") or "").strip()
    elif item.get("source"):
        source = str(item.get("source") or "").strip()
    thumb_url = str(thumbnail.get("src") or "").strip()
    return {
        "title": title,
        "source": source,
        "imageUrl": image_url,
        "thumbnailUrl": thumb_url or image_url,
    }


async def search_images(query: str, count: int = 24) -> dict[str, Any]:
    cleaned = str(query or "").strip()
    if not cleaned:
        raise ValueError("Search query is required")
    if not BRAVE_SEARCH_API_KEY:
        raise ValueError("Image search is not configured (set BRAVE_SEARCH_API_KEY)")

    limit = max(1, min(int(count or 24), 50))
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://api.search.brave.com/res/v1/images/search",
            params={
                "q": cleaned,
                "count": limit,
                "safesearch": "strict",
            },
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
            },
        )
        if response.status_code >= 400:
            detail = response.text.strip()[:200] or "Image search failed"
            raise RuntimeError(detail)
        payload = response.json()

    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in payload.get("results") or []:
        normalized = _normalize_image_result(item)
        if not normalized:
            continue
        key = normalized["imageUrl"]
        if key in seen:
            continue
        seen.add(key)
        results.append(normalized)

    return {
        "query": cleaned,
        "results": results,
        "googleImagesUrl": "https://www.google.com/search?tbm=isch&q=" + quote_plus(cleaned),
    }
