"""Scrape Musixmatch/Genius page meta for feed FactCandidates (no lyric trivia)."""

from __future__ import annotations

import re
from html import unescape
from typing import Any
from urllib.parse import quote_plus

import httpx

OG_DESC_RE = re.compile(
    r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
    re.I,
)
OG_DESC_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:description["\']',
    re.I,
)
USER_AGENT = "tunebook-feed-enrich/1.0 (local-resolver)"


def extract_og_description(html: str) -> str:
    text = html or ""
    m = OG_DESC_RE.search(text) or OG_DESC_RE_ALT.search(text)
    if not m:
        return ""
    return unescape(m.group(1)).strip()


def facts_from_meta(description: str, source: str, source_url: str) -> list[dict[str, Any]]:
    desc = (description or "").strip()
    if len(desc) < 20:
        return []
    # Explicitly not lyrics payload for quizzes
    return [
        {
            "predicate": "bio_snippet",
            "objectText": desc[:500],
            "rawSnippet": desc[:500],
            "source": source,
            "sourceUrl": source_url,
        }
    ]


async def enrich_feed_sources(title: str, artist: str = "") -> dict:
    title = (title or "").strip()
    artist = (artist or "").strip()
    if not title:
        return {"facts": []}
    facts: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
        # Musixmatch search page often redirects; try track page pattern via search
        mx_q = quote_plus(f"{title} {artist}".strip())
        mx_url = f"https://www.musixmatch.com/search/{mx_q}"
        try:
            resp = await client.get(mx_url)
            if resp.status_code == 200:
                desc = extract_og_description(resp.text)
                facts.extend(facts_from_meta(desc, "musixmatch", str(resp.url)))
        except Exception:
            pass

        # Genius API search (public)
        try:
            gq = quote_plus(f"{title} {artist}".strip())
            gresp = await client.get(f"https://genius.com/api/search/multi?q={gq}")
            if gresp.status_code == 200:
                data = gresp.json()
                sections = data.get("response", {}).get("sections") or []
                hit_url = ""
                for section in sections:
                    for hit in section.get("hits") or []:
                        result = hit.get("result") or {}
                        url = result.get("url") or ""
                        if url:
                            hit_url = url
                            break
                    if hit_url:
                        break
                if hit_url:
                    page = await client.get(hit_url)
                    if page.status_code == 200:
                        desc = extract_og_description(page.text)
                        facts.extend(facts_from_meta(desc, "genius", hit_url))
        except Exception:
            pass

    return {"facts": facts}
