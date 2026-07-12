import re

from recording_artists import (
    discover_recording_artists,
    discover_work_writers,
    is_generic_artist,
)
from tune_background_research import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_SECONDS, search_web

TITLE_SPLIT_RE = re.compile(r"\s*[-–—|]\s+")
WRITER_SNIPPET_RE = re.compile(
    r"(?:written\s+by|wrote|composed\s+by|composer(?:s)?|songwriter(?:s)?|"
    r"lyricist(?:s)?|penned\s+by|words\s+(?:and|&)\s+music\s+by|"
    r"music\s+(?:and|&)\s+lyrics\s+by)\s*[:\-]?\s*"
    r"([A-Z][A-Za-z0-9' .,&/-]{1,80})",
    re.IGNORECASE,
)


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _artist_key(value):
    return re.sub(r"[^a-z0-9]+", "", _normalize_space(value).lower())


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


def _add_candidate(store, artist, role="performer", source=""):
    name = _normalize_space(artist)
    if not name or is_generic_artist(name):
        return
    key = _artist_key(name)
    if not key:
        return
    existing = store.get(key)
    if existing:
        if existing["role"] != "writer" and role == "writer":
            existing["role"] = "writer"
            if source:
                existing["source"] = source
        return
    store[key] = {
        "artist": name,
        "role": role if role in ("writer", "performer") else "performer",
        "source": source or "",
    }


def _role_label(role):
    return "Writer" if role == "writer" else "Performer"


async def _discover_writer_llm(client, title, artist_hint=""):
    if not LLM_BASE_URL:
        return ""
    hint_line = f"Known artist/performer hint: {artist_hint}\n" if artist_hint else ""
    prompt = (
        f"Who wrote the song \"{title}\"?\n"
        f"{hint_line}"
        "Reply with ONLY the composer, songwriter, or lyricist name (the person or band "
        "credited with writing the song), nothing else.\n"
        "Do not name a cover artist or performer unless they also wrote the song."
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
                        "content": (
                            "You identify songwriters and composers. "
                            "Reply with one writer name only."
                        ),
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


async def _discover_writer_web(client, title):
    query = f'"{title}" song (writer OR songwriter OR composer OR "written by")'
    try:
        results = await search_web(client, query)
        writers = {}
        for item in results[:8]:
            snippet = _normalize_space(item.get("snippet") or "")
            title_text = _normalize_space(item.get("title") or "")
            for text in (title_text, snippet):
                for match in WRITER_SNIPPET_RE.finditer(text):
                    raw = match.group(1)
                    # Stop at sentence boundaries / trailing junk.
                    cleaned = re.split(r"[.;|]| - ", raw, maxsplit=1)[0].strip(" ,")
                    if cleaned:
                        _add_candidate(writers, cleaned, role="writer", source="web search")
        return [entry["artist"] for entry in writers.values()][:3]
    except Exception:
        return []


def _format_candidates(store, max_artists=8):
    writers = []
    performers = []
    for entry in store.values():
        if entry["role"] == "writer":
            writers.append(entry)
        else:
            performers.append(entry)

    ordered = (writers + performers)[:max_artists]
    cleaned = []
    for entry in ordered:
        role = entry["role"]
        source = entry["source"] or _role_label(role)
        if source and _role_label(role).lower() not in source.lower():
            source = f"{_role_label(role)} · {source}"
        elif not source:
            source = _role_label(role)
        cleaned.append({
            "artist": entry["artist"],
            "role": role,
            "source": source,
            "preview": f"{_role_label(role)} of this song",
        })

    if len(cleaned) == 0:
        raise ValueError("No artist found")
    if len(cleaned) == 1:
        return {
            "multiple": False,
            "artist": cleaned[0]["artist"],
            "role": cleaned[0]["role"],
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

    await emit("writers", "Looking up songwriters and composers...", 0.12)
    for name in await discover_work_writers(client, search_title, max_writers=max_artists):
        _add_candidate(merged, name, role="writer", source="MusicBrainz")

    writer_count = sum(1 for entry in merged.values() if entry["role"] == "writer")
    if writer_count < 1:
        await emit("llm", "Asking language model for the writer...", 0.4)
        llm_name = await _discover_writer_llm(client, search_title, parsed["artist_hint"])
        _add_candidate(merged, llm_name, role="writer", source="LLM")

    writer_count = sum(1 for entry in merged.values() if entry["role"] == "writer")
    if writer_count < 1:
        await emit("web", "Searching the web for the writer...", 0.55)
        for name in await _discover_writer_web(client, search_title):
            _add_candidate(merged, name, role="writer", source="web search")

    # Title/filename hints are usually performers, not writers.
    if parsed["artist_hint"]:
        _add_candidate(
            merged,
            parsed["artist_hint"],
            role="performer",
            source="title hint",
        )

    await emit("performers", "Finding other performers of the song...", 0.75)
    for name in await discover_recording_artists(client, search_title, max_artists=max_artists):
        _add_candidate(merged, name, role="performer", source="MusicBrainz/Genius")

    await emit("done", "Artist search complete", 1.0)
    return _format_candidates(merged, max_artists=max_artists)
