import os
import re

import httpx

from recording_artists import discover_recording_artists, is_generic_artist
from tune_background_research import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_SECONDS, search_web

TITLE_SPLIT_RE = re.compile(r"\s*[-–—|]\s+")


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_title_composer_hint(title, title_hint="", artist=""):
    artist = _normalize_space(artist)
    title = _normalize_space(title)
    title_hint = _normalize_space(title_hint)

    if artist and not is_generic_artist(artist):
        return {
            "title": title or title_hint,
            "artist_hint": artist,
            "title_hint": title_hint or title,
        }

    for candidate in (title_hint, title):
        if not candidate:
            continue
        parts = TITLE_SPLIT_RE.split(candidate, maxsplit=1)
        if len(parts) >= 2 and parts[0].strip() and parts[1].strip():
            return {
                "title": parts[1].strip(),
                "artist_hint": parts[0].strip(),
                "title_hint": candidate,
            }

    return {
        "title": title or title_hint,
        "artist_hint": "",
        "title_hint": title_hint or title,
    }


def _add_artist(store, artist):
    name = _normalize_space(artist)
    if not name or is_generic_artist(name):
        return
    key = re.sub(r"[^a-z0-9]+", "", name.lower())
    if key in store:
        return
    store[key] = name


async def _discover_artist_llm(client, title, artist_hint=""):
    if not LLM_BASE_URL:
        return ""
    hint_line = f"Known artist hint: {artist_hint}\n" if artist_hint else ""
    prompt = (
        f"What is the primary recording artist or best-known performer for the song \"{title}\"?\n"
        f"{hint_line}"
        "Reply with ONLY the artist or band name, nothing else."
    )
    try:
        response = await client.post(
            f"{LLM_BASE_URL.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {LLM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": LLM_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You identify recording artists for songs. Reply with one artist name only.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 64,
            },
            timeout=LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        content = (choices[0].get("message") or {}).get("content") or ""
        content = _normalize_space(content.strip('"\' '))
        if content and not is_generic_artist(content):
            return content
    except Exception:
        pass
    return ""


async def _discover_artist_web(client, title):
    query = f"{title} song recording artist performer"
    try:
        results = await search_web(client, query)
        artists = {}
        for item in results[:8]:
            snippet = _normalize_space(item.get("snippet") or item.get("title") or "")
            title_text = _normalize_space(item.get("title") or "")
            for text in (title_text, snippet):
                match = re.search(r"by\s+([A-Z][A-Za-z0-9' .,&-]{1,60})", text)
                if match:
                    _add_artist(artists, match.group(1))
        return list(artists.values())[:3]
    except Exception:
        return []


def _format_candidates(artists, source):
    cleaned = []
    seen = set()
    for name in artists:
        key = re.sub(r"[^a-z0-9]+", "", name.lower())
        if not key or key in seen or is_generic_artist(name):
            continue
        seen.add(key)
        cleaned.append({
            "artist": name,
            "source": source,
            "preview": name,
        })
    if len(cleaned) == 0:
        raise ValueError("No composer or recording artist found")
    if len(cleaned) == 1:
        return {
            "multiple": False,
            "artist": cleaned[0]["artist"],
            "source": cleaned[0]["source"],
            "preview": cleaned[0]["preview"],
        }
    return {
        "multiple": True,
        "candidates": cleaned,
    }


async def discover_composer(
    client,
    title,
    artist="",
    title_hint="",
    max_artists=8,
    on_progress=None,
):
    parsed = parse_title_composer_hint(title, title_hint, artist)
    search_title = parsed["title"]
    if not search_title:
        raise ValueError("Song title is required")

    async def emit(stage, message, progress):
        if on_progress:
            await on_progress(stage, message, progress)

    merged = {}
    if parsed["artist_hint"]:
        _add_artist(merged, parsed["artist_hint"])

    await emit("recording-artists", "Searching MusicBrainz and Genius...", 0.15)
    for name in await discover_recording_artists(client, search_title, max_artists=max_artists):
        _add_artist(merged, name)

    if len(merged) < 2:
        await emit("llm", "Consulting language model...", 0.55)
        llm_name = await _discover_artist_llm(client, search_title, parsed["artist_hint"])
        _add_artist(merged, llm_name)

    if len(merged) < 1:
        await emit("web", "Searching the web...", 0.75)
        for name in await _discover_artist_web(client, search_title):
            _add_artist(merged, name)

    await emit("done", "Composer search complete", 1.0)
    sources = []
    if parsed["artist_hint"]:
        sources.append("title hint")
    sources.append("MusicBrainz/Genius")
    if LLM_BASE_URL:
        sources.append("LLM")
    sources.append("web search")
    return _format_candidates(list(merged.values())[:max_artists], ", ".join(sources))
