"""Discover music genres for a tune via web snippets + LLM, constrained to a
canonical genre list used by the Tunebook SPA.
"""

from __future__ import annotations

import json
import re

from tune_background_research import LLM_TIMEOUT_SECONDS, search_web

# Keep in sync with src/musicGenreOptions.js MUSIC_GENRE_SUGGESTIONS.
CANONICAL_GENRES = [
    "Acoustic",
    "Alt-Country",
    "Americana",
    "Appalachian",
    "Balkan",
    "Baroque",
    "Bluegrass",
    "Blues",
    "Blues Rock",
    "Breton",
    "Cajun",
    "Cape Breton",
    "Celtic",
    "Chamber Music",
    "Chicago Blues",
    "Christmas",
    "Classical",
    "Contemporary Folk",
    "Country",
    "Country Blues",
    "Country Rock",
    "Dawg Music",
    "Delta Blues",
    "Dixieland",
    "Early Music",
    "Electric Blues",
    "English Folk",
    "Ethno Jazz",
    "Flamenco",
    "Folk",
    "Folk Blues",
    "Folk Rock",
    "French-Canadian",
    "Fusion",
    "Gospel",
    "Gypsy Jazz",
    "Hard Bop",
    "Hymn",
    "Indie Folk",
    "Irish Traditional",
    "Irish Folk",
    "Jamgrass",
    "Jazz",
    "Jazz Blues",
    "Jazz Fusion",
    "Klezmer",
    "Latin",
    "Latin Jazz",
    "Maritime",
    "Modal Jazz",
    "Newgrass",
    "Nordic Folk",
    "Old-Time",
    "Outlaw Country",
    "Piedmont Blues",
    "Polka",
    "Pop",
    "Progressive Bluegrass",
    "Progressive Folk",
    "Psychedelic Folk",
    "Quebecois",
    "Ragtime",
    "Renaissance",
    "Rock",
    "Sacred",
    "Scandinavian Folk",
    "Scottish Folk",
    "Scottish Traditional",
    "Singer-Songwriter",
    "Skiffle",
    "Smooth Jazz",
    "Soul",
    "Spiritual",
    "Swing",
    "Trad Jazz",
    "Traditional Bluegrass",
    "Traditional Folk",
    "Western Swing",
    "World Music",
    "Zydeco",
    "African",
    "Anti-Folk",
    "Avant-Garde Jazz",
    "Bebop",
    "Big Band",
    "Bluegrass Gospel",
    "Bossa Nova",
    "Cape Jazz",
    "Choro",
    "Cool Jazz",
    "Country Gospel",
    "Eastern European",
    "Free Jazz",
    "Galician",
    "Honky Tonk",
    "Indie Rock",
    "Irish Session",
    "Middle Eastern",
    "New Orleans Jazz",
    "Nu Jazz",
    "Old-Time Gospel",
    "Orchestral",
    "Post-Bop",
    "Punk",
    "Punk Rock",
    "R&B",
    "Roots Rock",
    "Sea Shanty",
    "Ska",
    "Soul Jazz",
    "Soundtrack",
    "Stomp and Holler",
    "Tango",
    "Techno-Folk",
    "Welsh Folk",
    "Western",
]

# Longer / more specific phrases first so "Progressive Bluegrass" wins over "Bluegrass".
_GENRE_PHRASE_PATTERNS = sorted(
    [
        (re.compile(r"\b" + re.escape(genre) + r"\b", re.IGNORECASE), genre)
        for genre in CANONICAL_GENRES
    ],
    key=lambda item: len(item[1]),
    reverse=True,
)

_RHYTHM_GENRE = {
    "strathspey": "Scottish Traditional",
    "reel": "Irish Traditional",
    "jig": "Irish Traditional",
    "slip jig": "Irish Traditional",
    "hornpipe": "Irish Traditional",
    "barndance": "Irish Traditional",
    "slide": "Irish Traditional",
    "polka": "Folk",
    "mazurka": "Folk",
    "waltz": "Folk",
    "three-two": "English Folk",
}


def _normalize_space(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _genre_key(value):
    return re.sub(r"[^a-z0-9&]+", "", _normalize_space(value).lower())


def _canonical_lookup():
    return {_genre_key(genre): genre for genre in CANONICAL_GENRES}


def normalize_genre_label(value, lookup=None):
    label = _normalize_space(value)
    if not label:
        return ""
    table = lookup if lookup is not None else _canonical_lookup()
    return table.get(_genre_key(label), "")


def extract_genres_from_text(text, limit=8):
    haystack = _normalize_space(text)
    if not haystack:
        return []
    found = []
    seen = set()
    for pattern, genre in _GENRE_PHRASE_PATTERNS:
        if len(found) >= limit:
            break
        if not pattern.search(haystack):
            continue
        key = _genre_key(genre)
        if key in seen:
            continue
        seen.add(key)
        found.append(genre)
    return found


def genre_from_rhythm(rhythm):
    key = _normalize_space(rhythm).lower()
    return _RHYTHM_GENRE.get(key, "")


def _format_result(candidates):
    cleaned = []
    seen = set()
    for entry in candidates:
        genre = normalize_genre_label(entry.get("genre") if isinstance(entry, dict) else entry)
        if not genre:
            continue
        key = _genre_key(genre)
        if key in seen:
            continue
        seen.add(key)
        reason = ""
        source = "inference"
        if isinstance(entry, dict):
            reason = _normalize_space(entry.get("reason") or "")
            source = _normalize_space(entry.get("source") or "") or "inference"
        cleaned.append({
            "genre": genre,
            "preview": genre,
            "source": source,
            "reason": reason,
        })
        if len(cleaned) >= 8:
            break
    if not cleaned:
        return {"empty": True, "candidates": []}
    if len(cleaned) == 1:
        return {
            "empty": False,
            "multiple": False,
            "genre": cleaned[0]["genre"],
            "preview": cleaned[0]["preview"],
            "source": cleaned[0]["source"],
            "reason": cleaned[0]["reason"],
        }
    return {"empty": False, "multiple": True, "candidates": cleaned}


def _parse_llm_genres(content, lookup):
    text = _normalize_space(content)
    if not text:
        return []
    # Prefer JSON object/array in the reply.
    match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
    blob = match.group(0) if match else text
    try:
        data = json.loads(blob)
    except Exception:
        data = None
    raw_items = []
    if isinstance(data, dict):
        raw_items = data.get("genres") or data.get("candidates") or []
        if not raw_items and data.get("genre"):
            raw_items = [data]
    elif isinstance(data, list):
        raw_items = data
    else:
        # Comma / newline separated labels as a last resort.
        raw_items = re.split(r"[\n,;|/]+", text)

    out = []
    for item in raw_items:
        if isinstance(item, dict):
            genre = normalize_genre_label(item.get("genre") or item.get("name") or "", lookup)
            if not genre:
                continue
            out.append({
                "genre": genre,
                "reason": _normalize_space(item.get("reason") or ""),
                "source": "LLM",
            })
        else:
            genre = normalize_genre_label(item, lookup)
            if genre:
                out.append({"genre": genre, "reason": "", "source": "LLM"})
    return out


async def _emit(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


async def _discover_genre_web(client, title, artist=""):
    artist_bit = f' "{artist}"' if artist else ""
    query = f'"{title}"{artist_bit} (genre OR style OR "music genre" OR traditional OR folk OR jazz OR bluegrass)'
    try:
        results = await search_web(client, query)
    except Exception:
        return [], []
    snippets = []
    genres = []
    seen = set()
    for item in results[:10]:
        title_text = _normalize_space(item.get("title") or "")
        snippet = _normalize_space(item.get("snippet") or "")
        combined = (title_text + " " + snippet).strip()
        if combined:
            snippets.append(combined[:400])
        for genre in extract_genres_from_text(combined):
            key = _genre_key(genre)
            if key in seen:
                continue
            seen.add(key)
            genres.append({
                "genre": genre,
                "reason": "matched web snippet",
                "source": "web search",
            })
    return genres, snippets


async def _discover_genre_llm(client, title, artist, rhythm, background, web_genres, snippets):
    from llm_runtime import (
        enrich_chat_completion_payload,
        get_active_llm_config,
        llm_auth_headers,
        llm_chat_url,
        llm_model,
    )

    cfg = get_active_llm_config()
    if not cfg.get("apiUrl"):
        return []

    lookup = _canonical_lookup()
    allowed = "\n".join(f"- {genre}" for genre in CANONICAL_GENRES)
    hint_lines = []
    if artist:
        hint_lines.append(f"Artist/composer: {artist}")
    if rhythm:
        hint_lines.append(f"Tune type / rhythm: {rhythm}")
    if background:
        hint_lines.append(f"Background notes: {background[:1200]}")
    if web_genres:
        hint_lines.append(
            "Genres already seen in web results: "
            + ", ".join(entry["genre"] for entry in web_genres[:8])
        )
    if snippets:
        hint_lines.append(
            "Web snippets:\n" + "\n".join(f"- {s}" for s in snippets[:6])
        )
    hints = "\n".join(hint_lines)

    prompt = (
        f'Suggest up to 5 music genres for the song/tune "{title}".\n'
        f"{hints}\n\n"
        "Pick ONLY from this allowed list (exact spelling):\n"
        f"{allowed}\n\n"
        'Reply with JSON only: {"genres":[{"genre":"<exact list label>","reason":"<short reason>"}]}'
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
                            "You classify songs into music genres for a folk/trad/"
                            "jazz/bluegrass tunebook. Reply with JSON only. Use only "
                            "genre labels from the provided list."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 256,
            }, cfg),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        from llm_runtime import note_chat_completion_usage

        note_chat_completion_usage(data)
        choices = data.get("choices") or []
        if not choices:
            return []
        content = (choices[0].get("message") or {}).get("content") or ""
        return _parse_llm_genres(content, lookup)
    except Exception:
        return []


async def discover_genre(
    client,
    title,
    artist="",
    rhythm="",
    background_info="",
    current_genre="",
    on_progress=None,
):
    title = _normalize_space(title)
    artist = _normalize_space(artist)
    rhythm = _normalize_space(rhythm)
    background_info = _normalize_space(background_info)
    current_genre = _normalize_space(current_genre)
    if not title:
        raise ValueError("Song title is required")

    await _emit(on_progress, "start", "Starting genre search…", 0.05)

    candidates = []
    current_key = _genre_key(current_genre) if current_genre else ""

    def push(genre, source, reason):
        label = normalize_genre_label(genre)
        if not label:
            return
        if current_key and _genre_key(label) == current_key:
            return
        candidates.append({"genre": label, "source": source, "reason": reason})

    rhythm_genre = genre_from_rhythm(rhythm)
    if rhythm_genre:
        push(rhythm_genre, "rhythm", f"{rhythm} tune type")

    for genre in extract_genres_from_text(
        " ".join([title, artist, rhythm, background_info])
    ):
        push(genre, "local text", "matched title or background")

    await _emit(on_progress, "web", "Searching the web…", 0.25)
    web_genres, snippets = await _discover_genre_web(client, title, artist)
    for entry in web_genres:
        push(entry["genre"], entry["source"], entry["reason"])

    await _emit(on_progress, "llm", "Asking the model…", 0.55)
    llm_genres = await _discover_genre_llm(
        client,
        title,
        artist,
        rhythm,
        background_info,
        web_genres,
        snippets,
    )
    # Prefer LLM order when present: put those first.
    ordered = []
    seen = set()
    for entry in llm_genres + candidates:
        genre = normalize_genre_label(entry.get("genre"))
        if not genre:
            continue
        if current_key and _genre_key(genre) == current_key:
            continue
        key = _genre_key(genre)
        if key in seen:
            continue
        seen.add(key)
        ordered.append({
            "genre": genre,
            "source": entry.get("source") or "inference",
            "reason": entry.get("reason") or "",
        })

    await _emit(on_progress, "done", "Finished genre search", 1.0)
    return _format_result(ordered)
