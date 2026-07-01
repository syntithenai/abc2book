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
    artists = {}
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
            if len(artists) >= max_artists:
                break
            for credit in recording.get("artist-credit") or []:
                if len(artists) >= max_artists:
                    break
                _add_artist(artists, credit.get("name"))
    except Exception:
        pass
    return list(artists.values())


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
