import re
from urllib.parse import quote

import httpx

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
    writers = {}
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
        relations = (response.json() or {}).get("relations") or []
        for relation in relations:
            rel_type = (relation.get("type") or "").strip().lower()
            if rel_type not in WRITER_RELATION_TYPES:
                continue
            artist = relation.get("artist") or {}
            _add_artist(writers, artist.get("name"))
    except Exception:
        pass
    return list(writers.values())


async def discover_work_writers(client, title, max_writers=6, max_works=3):
    """Find composers/lyricists/writers for a song via MusicBrainz works."""
    title = (title or "").strip()
    if not title:
        return []

    writers = {}
    try:
        response = await client.get(
            "https://musicbrainz.org/ws/2/work",
            params={
                "query": f'work:"{title}"',
                "fmt": "json",
                "limit": 8,
            },
            headers={"User-Agent": BROWSER_USER_AGENT},
        )
        response.raise_for_status()
        works = (response.json() or {}).get("works") or []
    except Exception:
        return []

    exact_works = []
    for work in works:
        work_title = work.get("title") or ""
        if not _work_title_matches(work_title, title):
            continue
        score = work.get("score")
        if score is None:
            score = 0
        if score < 70:
            continue
        if not work.get("id"):
            continue
        exact_works.append((score, work))

    if not exact_works:
        return []

    exact_works.sort(key=lambda item: item[0], reverse=True)
    best_score = exact_works[0][0]
    # Prefer the best-matching work(s); ignore lower-scoring same-title works
    # (e.g. unrelated songs that share a common title).
    exact_works = [work for score, work in exact_works if score >= best_score - 5][:max_works]

    for work in exact_works:
        if len(writers) >= max_writers:
            break
        for name in await _discover_writers_from_work(client, work.get("id")):
            _add_artist(writers, name)
            if len(writers) >= max_writers:
                break
        # Once the top-scoring work yields writers, stop — lower-score
        # same-title works are usually different compositions.
        if writers:
            break

    return list(writers.values())[:max_writers]


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
