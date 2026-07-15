import re
from urllib.parse import quote

import httpx

from notation_title_variants import notation_title_variants

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (compatible; ABC2BookResolver/1.0; +https://tunebook.net)"
)

GENERIC_ARTIST_KEYS = frozenset({
    "",
    "traditional",
    "trad",
    "anonymous",
    "unknown",
    "folk",
    "publicdomain",
    "various",
    "na",
    "composerunknown",
})


def normalize_artist_key(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def is_generic_artist(artist):
    key = normalize_artist_key(artist)
    if key in GENERIC_ARTIST_KEYS:
        return True
    return key.startswith("trad")


def _add_artist(store, artist):
    name = (artist or "").strip()
    if not name or is_generic_artist(name):
        return
    key = normalize_artist_key(name)
    if key in store:
        return
    store[key] = name


async def _discover_artists_musicbrainz(client, title, max_artists):
    counts = {}
    names = {}
    try:
        response = await client.get(
            "https://musicbrainz.org/ws/2/recording",
            params={
                "query": f'recording:"{title}"',
                "fmt": "json",
                "limit": 15,
            },
            headers={"User-Agent": BROWSER_USER_AGENT},
        )
        response.raise_for_status()
        recordings = (response.json() or {}).get("recordings") or []
        for recording in recordings:
            for credit in recording.get("artist-credit") or []:
                name = (credit.get("name") or "").strip()
                if not name or is_generic_artist(name):
                    continue
                key = normalize_artist_key(name)
                if not key:
                    continue
                if key not in names:
                    names[key] = name
                counts[key] = counts.get(key, 0) + 1
    except Exception:
        pass
    ordered = sorted(counts.keys(), key=lambda key: (-counts[key], names[key].lower()))
    return [names[key] for key in ordered[:max_artists]]


async def _discover_artists_genius(client, title, max_artists):
    artists = {}
    try:
        response = await client.get(
            "https://genius.com/api/search/multi",
            params={"per_page": 5, "q": title},
            headers={"User-Agent": BROWSER_USER_AGENT},
        )
        response.raise_for_status()
        sections = (response.json() or {}).get("response", {}).get("sections", [])
        title_key = normalize_artist_key(title)
        for section in sections:
            for hit in section.get("hits") or []:
                if hit.get("type") != "song":
                    continue
                result = hit.get("result") or {}
                song_title = result.get("title") or ""
                song_key = normalize_artist_key(song_title)
                if title_key and song_key not in (title_key,) and title_key not in song_key and song_key not in title_key:
                    continue
                artist_names = result.get("primary_artist_names") or result.get("artist_names") or ""
                for name in re.split(r",|\s*&\s*|\s+and\s+", artist_names):
                    if len(artists) >= max_artists:
                        break
                    _add_artist(artists, name)
    except Exception:
        pass
    return list(artists.values())


WRITER_RELATION_TYPES = frozenset({
    "composer",
    "lyricist",
    "writer",
    "librettist",
})


def _work_title_matches(work_title, search_title):
    work_key = normalize_artist_key(work_title)
    search_key = normalize_artist_key(search_title)
    if not work_key or not search_key:
        return False
    # Exact title only — substring matches pull in unrelated works.
    return work_key == search_key


async def _discover_writers_from_work(client, work_id):
    """Return (writer_names, recording_count_proxy) for a MusicBrainz work."""
    writers = {}
    recording_count = 0
    try:
        response = await client.get(
            f"https://musicbrainz.org/ws/2/work/{work_id}",
            params={
                "fmt": "json",
                "inc": "artist-rels",
            },
            headers={"User-Agent": BROWSER_USER_AGENT},
        )
        response.raise_for_status()
        data = response.json() or {}
        relations = data.get("relations") or []
        for relation in relations:
            rel_type = (relation.get("type") or "").strip().lower()
            if rel_type == "performance":
                recording_count += 1
                continue
            if rel_type not in WRITER_RELATION_TYPES:
                continue
            artist = relation.get("artist") or {}
            _add_artist(writers, artist.get("name"))
        for key in ("recording-count", "recording_count"):
            raw = data.get(key)
            if isinstance(raw, int) and raw > recording_count:
                recording_count = raw
                break
    except Exception:
        pass
    return list(writers.values()), recording_count


def _work_recording_count(work):
    for key in ("recording-count", "recording_count"):
        raw = (work or {}).get(key)
        if isinstance(raw, int) and raw >= 0:
            return raw
    return 0


def _update_writer_prominence(store, name, score=0, recording_count=0):
    cleaned = (name or "").strip()
    if not cleaned or is_generic_artist(cleaned):
        return
    key = normalize_artist_key(cleaned)
    if not key:
        return
    existing = store.get(key)
    if not existing:
        store[key] = {
            "artist": cleaned,
            "recording_count": int(recording_count or 0),
            "score": int(score or 0),
        }
        return
    existing["recording_count"] = max(
        existing.get("recording_count") or 0,
        int(recording_count or 0),
    )
    existing["score"] = max(existing.get("score") or 0, int(score or 0))


def pick_suggested_work_title(search_title, exact_works):
    """Return a MusicBrainz work title when it differs from the search title."""
    search_key = normalize_artist_key(search_title)
    if not search_key or not exact_works:
        return ""
    ranked = sorted(
        exact_works,
        key=lambda item: (_work_recording_count(item[1]), item[0]),
        reverse=True,
    )
    for _score, work in ranked:
        work_title = (work.get("title") or "").strip()
        if not work_title:
            continue
        if normalize_artist_key(work_title) == search_key:
            continue
        return work_title
    return ""


async def discover_work_writers_with_prominence(
    client, title, max_writers=6, max_works=8
):
    """Find work writers with MB prominence (recording-count + search score).

    Returns {"writers": [...], "suggested_title": "..."}.
    """
    title = (title or "").strip()
    if not title:
        return {"writers": [], "suggested_title": ""}

    prominence = {}
    exact_works = []
    seen_work_ids = set()

    for search_title in notation_title_variants(title):
        try:
            response = await client.get(
                "https://musicbrainz.org/ws/2/work",
                params={
                    "query": f'work:"{search_title}"',
                    "fmt": "json",
                    "limit": 15,
                },
                headers={"User-Agent": BROWSER_USER_AGENT},
            )
            response.raise_for_status()
            works = (response.json() or {}).get("works") or []
        except Exception:
            continue

        for work in works:
            work_id = work.get("id")
            if not work_id or work_id in seen_work_ids:
                continue
            work_title = work.get("title") or ""
            if not _work_title_matches(work_title, search_title):
                continue
            score = work.get("score")
            if score is None:
                score = 0
            if score < 70:
                continue
            seen_work_ids.add(work_id)
            exact_works.append((score, work))

    if not exact_works:
        return {"writers": [], "suggested_title": ""}

    exact_works.sort(key=lambda item: item[0], reverse=True)
    selected = [work for _score, work in exact_works][:max_works]
    suggested_title = pick_suggested_work_title(title, exact_works)

    for work in selected:
        if len(prominence) >= max_writers:
            break
        score = work.get("score")
        if score is None:
            score = 0
        search_rc = _work_recording_count(work)
        names, lookup_rc = await _discover_writers_from_work(client, work.get("id"))
        recording_count = max(search_rc, lookup_rc)
        for name in names:
            key = normalize_artist_key(name)
            if key not in prominence and len(prominence) >= max_writers:
                continue
            _update_writer_prominence(
                prominence,
                name,
                score=score,
                recording_count=recording_count,
            )

    return {
        "writers": list(prominence.values())[:max_writers],
        "suggested_title": suggested_title,
    }


async def discover_work_writers(client, title, max_writers=6, max_works=8):
    """Find composers/lyricists/writers for a song via MusicBrainz works.

    Tries claire/clair/clare title variants and collects writers from all
    exact-title works with score >= 70 (homonymous songs are common).
    """
    enriched = await discover_work_writers_with_prominence(
        client, title, max_writers=max_writers, max_works=max_works
    )
    return [entry["artist"] for entry in enriched.get("writers") or []]


async def discover_recording_artists(client, title, max_artists=8):
    title = (title or "").strip()
    if not title:
        return []

    merged = {}
    for name in await _discover_artists_musicbrainz(client, title, max_artists):
        _add_artist(merged, name)
    if len(merged) < max_artists:
        for name in await _discover_artists_genius(client, title, max_artists):
            _add_artist(merged, name)
            if len(merged) >= max_artists:
                break
    return list(merged.values())[:max_artists]
