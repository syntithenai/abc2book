import re

from recording_artists import (
    discover_recording_artists,
    discover_work_writers_with_prominence,
    is_generic_artist,
)
from tune_background_research import LLM_TIMEOUT_SECONDS, search_web

TITLE_SPLIT_RE = re.compile(r"\s*[-–—|]\s+")
# Name capture uses (?-i:[A-Z]) so re.IGNORECASE does not let "composer who…"
# match as if "who" were a proper name.
WRITER_SNIPPET_RE = re.compile(
    r"(?:written\s+by|(?<!\bwho\s)wrote|composed\s+by|"
    r"composers?\s*[:\-]|songwriters?\s*[:\-]|lyricists?\s*[:\-]|"
    r"penned\s+by|words\s+(?:and|&)\s+music\s+by|"
    r"music\s+(?:and|&)\s+lyrics\s+by)\s*"
    r"(?-i:([A-Z][A-Za-z0-9' .,&/-]{0,50}))",
    re.IGNORECASE,
)
# Also accept "composer Claude Debussy" / "songwriter Noel Gallagher"
# when the next token is clearly capitalized (not "composer who…").
WRITER_LABEL_NAME_RE = re.compile(
    r"\b(?:composers?|songwriters?|lyricists?)\s+"
    r"(?-i:([A-Z][A-Za-z][A-Za-z0-9' .,&/-]{0,48}))",
    re.IGNORECASE,
)
NARRATIVE_WRITER_RE = re.compile(
    r"\b(?:who|whom|whose|which|that|wrote|written|died|born|height|"
    r"nocturnes?|composed|composer|songwriter|lyricist|march\s+\d|"
    r"at\s+the|and\s+then)\b",
    re.IGNORECASE,
)


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _artist_key(value):
    return re.sub(r"[^a-z0-9]+", "", _normalize_space(value).lower())


def is_plausible_writer_name(value):
    """Reject web/LLM snippet debris mistaken for a person or band name."""
    name = _normalize_space(value)
    if not name or is_generic_artist(name):
        return False
    if len(name) < 2 or len(name) > 60:
        return False
    words = name.split()
    if not words or len(words) > 6:
        return False
    # Must start with an uppercase letter (person/band), not "who wrote…".
    if not words[0][0].isupper():
        return False
    if NARRATIVE_WRITER_RE.search(name):
        return False
    # Drop trailing clause fragments left after weak splits.
    if name.endswith((" of", " the", " a", " an", " and", " or")):
        return False
    return True


def extract_writers_from_text(text):
    """Pull plausible writer names from a search title or snippet."""
    text = _normalize_space(text)
    if not text:
        return []
    found = []
    seen = set()
    for pattern in (WRITER_SNIPPET_RE, WRITER_LABEL_NAME_RE):
        for match in pattern.finditer(text):
            raw = match.group(1)
            cleaned = re.split(
                r"[.;|]| - |,|\s+who\s+|\s+wrote\b|\s+died\b|\s+born\b",
                raw,
                maxsplit=1,
                flags=re.IGNORECASE,
            )[0].strip(" ,")
            cleaned = _normalize_space(cleaned)
            if not is_plausible_writer_name(cleaned):
                continue
            key = _artist_key(cleaned)
            if not key or key in seen:
                continue
            seen.add(key)
            found.append(cleaned)
    return found


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
    # Web/LLM often emit sentence fragments; MusicBrainz names are trusted unless
    # they are obvious narrative debris.
    source_key = (source or "").lower()
    if role == "writer" and ("web" in source_key or source_key == "llm"):
        if not is_plausible_writer_name(name):
            return
    elif role == "writer" and (
        NARRATIVE_WRITER_RE.search(name) or len(name) > 60
    ):
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


def _promote_candidate(store, artist):
    """Move artist to the front of store (dict insertion order)."""
    key = _artist_key(artist)
    entry = store.get(key)
    if not entry:
        return False
    rebuilt = {key: entry}
    for existing_key, existing_entry in store.items():
        if existing_key != key:
            rebuilt[existing_key] = existing_entry
    store.clear()
    store.update(rebuilt)
    return True


def _role_label(role):
    return "Writer" if role == "writer" else "Performer"


def _match_writer_in_list(reply, writer_names):
    """Map an LLM/web reply to an exact writer name from writer_names."""
    reply_key = _artist_key(reply)
    if not reply_key:
        return ""
    by_key = {_artist_key(name): name for name in writer_names if name}
    if reply_key in by_key:
        return by_key[reply_key]
    # Tolerate replies that include extra words around a listed name.
    for key, name in by_key.items():
        if key and (key in reply_key or reply_key in key):
            return name
    return ""


def pick_prominent_writer(writers_with_prominence):
    """Return the clear prominence winner, or '' if tied / inconclusive."""
    if not writers_with_prominence:
        return ""
    ranked = sorted(
        writers_with_prominence,
        key=lambda entry: (
            -(int(entry.get("recording_count") or 0)),
            -(int(entry.get("score") or 0)),
            _normalize_space(entry.get("artist")).lower(),
        ),
    )
    best = ranked[0]
    best_rc = int(best.get("recording_count") or 0)
    best_score = int(best.get("score") or 0)
    if len(ranked) == 1:
        return _normalize_space(best.get("artist"))
    second = ranked[1]
    second_rc = int(second.get("recording_count") or 0)
    second_score = int(second.get("score") or 0)
    if (best_rc, best_score) == (second_rc, second_score):
        return ""
    if best_rc == 0 and second_rc == 0 and best_score == second_score:
        return ""
    return _normalize_space(best.get("artist"))


async def _rank_writers_llm(client, title, writer_names):
    """Ask the LLM which listed writer is the best-known composer for title."""
    from llm_runtime import (
        enrich_chat_completion_payload,
        get_active_llm_config,
        llm_auth_headers,
        llm_chat_url,
        llm_model,
    )

    cfg = get_active_llm_config()
    if not cfg.get("apiUrl"):
        return ""
    names = [_normalize_space(name) for name in writer_names if _normalize_space(name)]
    if len(names) < 2:
        return ""
    listed = "\n".join(f"- {name}" for name in names)
    prompt = (
        f"For the song, classical piece, or melody \"{title}\", which of these "
        f"people is the best-known / most likely composer or songwriter?\n"
        f"{listed}\n"
        "Reply with ONLY the exact name from the list, nothing else."
    )
    try:
        response = await client.post(
            llm_chat_url(cfg),
            headers=llm_auth_headers(cfg),
            json=enrich_chat_completion_payload({
                "model": llm_model(cfg),
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You pick the best-known composer or songwriter from a "
                            "short list. Reply with one listed name only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 64,
            }, cfg),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        content = (choices[0].get("message") or {}).get("content") or ""
        content = _normalize_space(content.strip('"\' '))
        if not content:
            return ""
        return _match_writer_in_list(content, names)
    except Exception:
        return ""


async def _rank_writers_best_effort(client, title, writers_with_prominence):
    """Rank without LLM: MB prominence, then web name intersecting the list."""
    prominent = pick_prominent_writer(writers_with_prominence)
    if prominent:
        return prominent
    writer_names = [
        _normalize_space(entry.get("artist"))
        for entry in writers_with_prominence
        if _normalize_space(entry.get("artist"))
    ]
    if not writer_names:
        return ""
    for web_name in await _discover_writer_web(client, title):
        matched = _match_writer_in_list(web_name, writer_names)
        if matched:
            return matched
    return ""


async def _discover_writer_llm(client, title, artist_hint=""):
    from llm_runtime import (
        enrich_chat_completion_payload,
        get_active_llm_config,
        llm_auth_headers,
        llm_chat_url,
        llm_model,
    )

    cfg = get_active_llm_config()
    if not cfg.get("apiUrl"):
        return ""
    hint_line = f"Known artist/performer hint: {artist_hint}\n" if artist_hint else ""
    prompt = (
        f"Who wrote the song, classical piece, or melody \"{title}\"?\n"
        f"{hint_line}"
        "Reply with ONLY the composer, songwriter, or lyricist name (the person or band "
        "credited with writing it), nothing else.\n"
        "Do not name a cover artist or performer unless they also wrote it."
    )
    try:
        response = await client.post(
            llm_chat_url(cfg),
            headers=llm_auth_headers(cfg),
            json=enrich_chat_completion_payload({
                "model": llm_model(cfg),
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You identify songwriters and composers for songs, "
                            "classical pieces, and melodies. "
                            "Reply with one writer name only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 64,
            }, cfg),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        content = (choices[0].get("message") or {}).get("content") or ""
        content = _normalize_space(content.strip('"\' '))
        if content and is_plausible_writer_name(content):
            return content
    except Exception:
        pass
    return ""


async def _discover_writer_web(client, title):
    query = (
        f'"{title}" (song OR piece OR melody) '
        f'(writer OR songwriter OR composer OR "written by" OR "composed by")'
    )
    try:
        results = await search_web(client, query)
        writers = {}
        for item in results[:8]:
            snippet = _normalize_space(item.get("snippet") or "")
            title_text = _normalize_space(item.get("title") or "")
            for text in (title_text, snippet):
                for name in extract_writers_from_text(text):
                    _add_candidate(writers, name, role="writer", source="web search")
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

    # Keep performer suggestions even when many writers fill the cap — the UI
    # shows writers for composer choice and performers for a follow-up artists picker.
    writers = writers[:max_artists]
    performers = performers[:max_artists]
    ordered = writers + performers
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
    writers_with_prominence = []
    suggested_title = ""

    await emit("writers", "Looking up songwriters and composers...", 0.12)
    work_result = await discover_work_writers_with_prominence(
        client, search_title, max_writers=max_artists
    )
    writers_with_prominence = work_result.get("writers") or []
    suggested_title = (work_result.get("suggested_title") or "").strip()
    for entry in writers_with_prominence:
        _add_candidate(merged, entry.get("artist"), role="writer", source="MusicBrainz")

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
    elif writer_count >= 2:
        await emit("rank", "Ranking composers...", 0.45)
        writer_names = [
            entry["artist"] for entry in merged.values() if entry["role"] == "writer"
        ]
        ranked_name = await _rank_writers_llm(client, search_title, writer_names)
        if not ranked_name:
            ranked_name = await _rank_writers_best_effort(
                client, search_title, writers_with_prominence
            )
        if ranked_name:
            _promote_candidate(merged, ranked_name)

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
    result = _format_candidates(merged, max_artists=max_artists)
    if suggested_title:
        result["suggestedTitle"] = suggested_title
    return result
