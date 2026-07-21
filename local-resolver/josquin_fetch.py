"""Fetch MusicXML from the Josquin Research Project (data.josqu.in)."""

from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx

from archive_source_config import notation_source_enabled
from chords_fetch import score_title_artist_match
from mediawiki_fetch import fetch_binary, musicxml_from_binary_response
from tune_background_research import search_web

JOSQUIN_FETCH_TIMEOUT_SECONDS = 20.0
MAX_JOSQUIN_URL_TRIES = 5
JOSQUIN_DATA_BASE = "https://data.josqu.in"
JOSQUIN_CATALOG_RE = re.compile(r"\b([A-Z][a-z]{2}\d{3,5})\b")

JOSQUIN_HOST_SUFFIXES = (
    "josquin.stanford.edu",
    "data.josqu.in",
)


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def is_josquin_url(url):
    try:
        host = (urlparse(url).hostname or "").lower().replace("www.", "")
    except Exception:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in JOSQUIN_HOST_SUFFIXES)


def parse_josquin_catalog_id(url):
    text = str(url or "").strip()
    if not text:
        return ""
    try:
        path = urlparse(text).path or ""
    except Exception:
        path = text
    base = path.rsplit("/", 1)[-1]
    base = re.sub(r"\.(musicxml|xml|krn|mei)$", "", base, flags=re.I)
    match = JOSQUIN_CATALOG_RE.search(base)
    return match.group(1) if match else ""


def josquin_musicxml_url(catalog_id):
    catalog = str(catalog_id or "").strip()
    if not catalog:
        return ""
    return JOSQUIN_DATA_BASE + "/" + catalog + ".musicxml"


def build_josquin_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    queries = []
    quoted = '"{0}"'.format(title)
    queries.append("site:josquin.stanford.edu {0}".format(quoted))
    queries.append("site:data.josqu.in {0}".format(quoted))
    if artist:
        queries.append("site:josquin.stanford.edu {0} {1}".format(quoted, '"{0}"'.format(artist)))
    return queries


def annotate_josquin_candidate(music_xml, title="", artist="", source_url="", catalog_id=""):
    tune_meta = {
        "name": title or "",
        "composer": artist or "",
        "srcUrl": source_url or "",
        "meta": {"importFormat": "musicxml", "archive": "josquin"},
    }
    if catalog_id:
        tune_meta["meta"]["josquin_catalog_id"] = catalog_id
    return {
        "abc": "",
        "musicXml": music_xml,
        "title": title or "",
        "artist": artist or "",
        "source": "josquin.stanford.edu",
        "sourceUrl": source_url or "",
        "preview": "",
        "titleOnly": not bool(title),
        "tuneMeta": tune_meta,
    }


async def fetch_josquin_url(url, on_progress=None, client=None):
    catalog_id = parse_josquin_catalog_id(url)
    if not catalog_id:
        raise ValueError("Could not parse Josquin catalog ID from URL")
    musicxml_url = josquin_musicxml_url(catalog_id)
    await _emit_progress(on_progress, "josquin", "Fetching Josquin MusicXML...", 0.5)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=JOSQUIN_FETCH_TIMEOUT_SECONDS)
    try:
        response = await fetch_binary(client, musicxml_url, referer=url)
        music_xml = await musicxml_from_binary_response(response)
        if not music_xml:
            raise ValueError("Could not download MusicXML for {0}".format(catalog_id))
        await _emit_progress(on_progress, "josquin", "Josquin MusicXML ready", 1.0)
        return annotate_josquin_candidate(
            music_xml,
            title=catalog_id,
            source_url=url or musicxml_url,
            catalog_id=catalog_id,
        )
    finally:
        if owns_client:
            await client.aclose()


def josquin_urls_from_search_results(results):
    urls = []
    seen = set()
    for item in results or []:
        url = str((item or {}).get("url") or "").strip()
        if not url or url in seen:
            continue
        if is_josquin_url(url) or JOSQUIN_CATALOG_RE.search(url):
            seen.add(url)
            urls.append(url)
    return urls[:MAX_JOSQUIN_URL_TRIES]


async def collect_josquin_candidates(client, title, artist="", on_progress=None):
    if not notation_source_enabled("josquin"):
        return []
    await _emit_progress(on_progress, "josquin", "Searching Josquin Research Project...", 0.2)
    queries = build_josquin_search_queries(title, artist)
    if not queries:
        return []

    candidates = []
    for query in queries[:3]:
        try:
            results = await search_web(query, max_results=8)
        except Exception:
            continue
        for page_url in josquin_urls_from_search_results(results):
            catalog_id = parse_josquin_catalog_id(page_url)
            if not catalog_id:
                continue
            try:
                candidate = await fetch_josquin_url(page_url, on_progress=on_progress, client=client)
            except Exception:
                continue
            score = score_title_artist_match(
                candidate.get("title") or catalog_id,
                candidate.get("artist") or "",
                title,
                artist,
            )
            if score < 25:
                continue
            candidates.append(candidate)
            if len(candidates) >= 3:
                return candidates
    return candidates
