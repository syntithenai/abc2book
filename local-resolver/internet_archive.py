"""Internet Archive (archive.org) search and audio URL resolution."""

from __future__ import annotations

import os
import re
from urllib.parse import quote, urlparse

import httpx

from chords_fetch import score_title_artist_match

ARCHIVE_SEARCH_URL = "https://archive.org/advancedsearch.php"
ARCHIVE_METADATA_URL = "https://archive.org/metadata/{identifier}"
MAX_INTERNET_ARCHIVE_SEARCH_RESULTS = 50
INTERNET_ARCHIVE_SEARCH_TIMEOUT_SECONDS = 15.0

_AUDIO_FORMAT_PRIORITY = (
    "vbr mp3",
    "mp3",
    "ogg vorbis",
    "ogg",
    "flac",
    "wave",
    "wav",
)
_SKIP_FORMAT_MARKERS = (
    "metadata",
    "torrent",
    "json",
    "xml",
    "png",
    "jpeg",
    "jpg",
    "gif",
    "checksum",
    "sqlite",
    "cue",
    "log",
    "txt",
    "html",
)


def internet_archive_enabled() -> bool:
    raw = os.getenv("INTERNET_ARCHIVE_ENABLED", "true").strip().lower()
    return raw not in ("0", "false", "no")


def is_archive_org_url(raw_url: str) -> bool:
    try:
        parsed = urlparse(str(raw_url or "").strip())
    except Exception:
        return False
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host == "archive.org"


def is_archive_org_direct_download_url(raw_url: str) -> bool:
    if not is_archive_org_url(raw_url):
        return False
    path = (urlparse(raw_url).path or "").lower()
    return path.startswith("/download/")


def extract_archive_identifier(raw_url: str) -> str:
    parsed = urlparse(str(raw_url or "").strip())
    parts = [part for part in (parsed.path or "").split("/") if part]
    if not parts:
        return ""
    if parts[0] in ("details", "download", "metadata"):
        return parts[1] if len(parts) > 1 else ""
    return parts[0]


def _escape_lucene(value: str) -> str:
    return re.sub(r'([\\"])', r"\\\1", str(value or "").strip())


_ARCHIVE_TITLE_STOP_WORDS = frozenset({
    "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to",
    "after", "before", "with", "without",
})


def _title_search_clause(title: str) -> str:
    clean = str(title or "").strip()
    if not clean:
        return ""
    words = [
        word
        for word in re.sub(r"[^a-z0-9 ]+", " ", clean.lower()).split()
        if len(word) >= 4 and word not in _ARCHIVE_TITLE_STOP_WORDS
    ]
    if len(words) >= 2:
        return " AND ".join(f"title:{_escape_lucene(word)}" for word in words[:6])
    return f'title:"{_escape_lucene(clean)}"'


def build_archive_search_query(
    query: str = "",
    *,
    title: str = "",
    artist: str = "",
) -> str:
    terms: list[str] = []
    clean_title = str(title or "").strip()
    clean_artist = str(artist or "").strip()
    clean_query = str(query or "").strip()
    if clean_title:
        clause = _title_search_clause(clean_title)
        if clause:
            terms.append(clause)
    if clean_artist:
        terms.append(f'creator:"{_escape_lucene(clean_artist)}"')
    if not terms and clean_query:
        clause = _title_search_clause(clean_query)
        if clause:
            terms.append(clause)
        else:
            escaped = _escape_lucene(clean_query)
            terms.append(f'(title:"{escaped}" OR creator:"{escaped}")')
    inner = " AND ".join(terms) if terms else "folk"
    return f"mediatype:audio AND ({inner})"


def _normalize_creator(creator) -> str:
    if isinstance(creator, list):
        return ", ".join(str(item).strip() for item in creator if str(item).strip())
    return str(creator or "").strip()


def _format_priority(fmt: str) -> int:
    lowered = str(fmt or "").strip().lower()
    for index, marker in enumerate(_AUDIO_FORMAT_PRIORITY):
        if marker in lowered:
            return index
    return len(_AUDIO_FORMAT_PRIORITY) + 1


def pick_best_audio_file(files: list[dict]) -> dict | None:
    candidates: list[dict] = []
    for entry in files or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        fmt = str(entry.get("format") or "").strip()
        lowered_fmt = fmt.lower()
        if any(marker in lowered_fmt for marker in _SKIP_FORMAT_MARKERS):
            continue
        if not lowered_fmt and not name.lower().endswith((".mp3", ".ogg", ".flac", ".wav")):
            continue
        if name.lower().endswith((".xml", ".json", ".png", ".jpg", ".jpeg", ".gif", ".torrent")):
            continue
        candidates.append(entry)
    if not candidates:
        return None
    candidates.sort(
        key=lambda item: (
            _format_priority(str(item.get("format") or "")),
            int(item.get("size") or 0) if str(item.get("size") or "").isdigit() else 0,
            str(item.get("name") or ""),
        )
    )
    return candidates[0]


async def fetch_archive_metadata(identifier: str) -> dict | None:
    ident = str(identifier or "").strip()
    if not ident:
        return None
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; abc2book-resolver/1.0; +https://github.com/)"
        ),
        "Accept": "application/json",
    }
    timeout = httpx.Timeout(INTERNET_ARCHIVE_SEARCH_TIMEOUT_SECONDS, connect=6.0)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.get(ARCHIVE_METADATA_URL.format(identifier=quote(ident)), headers=headers)
        response.raise_for_status()
        body = response.json()
    return body if isinstance(body, dict) else None


async def resolve_archive_playback_url(source_url: str) -> str | None:
    source_url = str(source_url or "").strip()
    if not source_url:
        return None
    if is_archive_org_direct_download_url(source_url):
        return source_url
    identifier = extract_archive_identifier(source_url)
    if not identifier:
        return None
    metadata = await fetch_archive_metadata(identifier)
    if not metadata:
        return None
    files = metadata.get("files")
    if not isinstance(files, list):
        return None
    best = pick_best_audio_file(files)
    if not best:
        return None
    filename = str(best.get("name") or "").strip()
    if not filename:
        return None
    return f"https://archive.org/download/{quote(identifier)}/{quote(filename)}"


def build_internet_archive_candidate(entry: dict, *, title: str = "", artist: str = "") -> dict:
    identifier = str(entry.get("identifier") or "").strip()
    track_title = str(entry.get("title") or "").strip()
    if isinstance(track_title, list):
        track_title = track_title[0] if track_title else ""
    creator = _normalize_creator(entry.get("creator") or entry.get("artist") or "")
    image = str(entry.get("image") or "").strip()
    if not image and identifier:
        image = f"https://archive.org/services/img/{identifier}"
    link = str(entry.get("link") or "").strip()
    if not link and identifier:
        link = f"https://archive.org/details/{identifier}"
    match_score = int(entry.get("matchScore") or 0)
    description_parts = [part for part in [creator] if part]
    return {
        "title": track_title,
        "artist": creator,
        "description": " · ".join(description_parts),
        "image": image,
        "link": link,
        "source": "internet-archive",
        "matchScore": match_score,
    }


async def search_internet_archive(
    query: str = "",
    *,
    title: str = "",
    artist: str = "",
    limit: int = MAX_INTERNET_ARCHIVE_SEARCH_RESULTS,
) -> list[dict]:
    search_query = build_archive_search_query(query, title=title, artist=artist)
    params = {
        "q": search_query,
        "fl": "identifier,title,creator",
        "rows": max(1, min(int(limit or MAX_INTERNET_ARCHIVE_SEARCH_RESULTS), MAX_INTERNET_ARCHIVE_SEARCH_RESULTS)),
        "output": "json",
        "sort": "downloads desc",
    }
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; abc2book-resolver/1.0; +https://github.com/)"
        ),
        "Accept": "application/json",
    }
    timeout = httpx.Timeout(INTERNET_ARCHIVE_SEARCH_TIMEOUT_SECONDS, connect=6.0)
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        response = await client.get(ARCHIVE_SEARCH_URL, params=params, headers=headers)
        response.raise_for_status()
        body = response.json()

    docs = []
    if isinstance(body, dict):
        response_body = body.get("response")
        if isinstance(response_body, dict) and isinstance(response_body.get("docs"), list):
            docs = response_body["docs"]

    scored: list[dict] = []
    seen_ids: set[str] = set()
    query_title = str(title or query or "").strip()
    query_artist = str(artist or "").strip()

    for raw in docs:
        if not isinstance(raw, dict):
            continue
        identifier = str(raw.get("identifier") or "").strip()
        if not identifier or identifier in seen_ids:
            continue
        seen_ids.add(identifier)
        track_title = raw.get("title")
        if isinstance(track_title, list):
            track_title = track_title[0] if track_title else ""
        track_title = str(track_title or identifier).strip()
        creator = _normalize_creator(raw.get("creator"))
        match_score = score_title_artist_match(track_title, creator, query_title, query_artist)
        if match_score <= 0 and query_title:
            match_score = 20
        scored.append({
            "identifier": identifier,
            "title": track_title,
            "creator": creator,
            "artist": creator,
            "image": f"https://archive.org/services/img/{identifier}",
            "link": f"https://archive.org/details/{identifier}",
            "matchScore": match_score,
        })

    scored.sort(
        key=lambda item: (item.get("matchScore") or 0, item.get("title") or ""),
        reverse=True,
    )
    return scored
