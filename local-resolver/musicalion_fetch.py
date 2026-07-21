"""Discover Musicalion scores (manual import only — subscription required)."""

from __future__ import annotations

from urllib.parse import urlparse

from archive_source_config import notation_source_enabled
from chords_fetch import score_title_artist_match
from tune_background_research import search_web

MAX_MUSICALION_URL_TRIES = 5

MUSICALION_HOST_SUFFIXES = (
    "musicalion.com",
)


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def is_musicalion_url(url):
    try:
        host = (urlparse(url).hostname or "").lower().replace("www.", "")
    except Exception:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in MUSICALION_HOST_SUFFIXES)


def build_musicalion_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    quoted = '"{0}"'.format(title)
    queries = ["site:musicalion.com {0}".format(quoted)]
    if artist:
        queries.append("site:musicalion.com {0} {1}".format(quoted, '"{0}"'.format(artist)))
    return queries


def build_musicalion_manual_candidate(url, title="", artist=""):
    label = title or "Musicalion score"
    if artist:
        label = "{0} — {1}".format(label, artist)
    return {
        "url": url,
        "title": label,
        "source": "musicalion.com",
        "host": "musicalion.com",
        "reason": "Musicalion requires a subscription; export MusicXML from the site and use Score import",
        "accessTier": "subscription_required",
        "contentType": "notation",
    }


def musicalion_urls_from_search_results(results):
    urls = []
    seen = set()
    for item in results or []:
        url = str((item or {}).get("url") or "").strip()
        if not url or url in seen or not is_musicalion_url(url):
            continue
        seen.add(url)
        urls.append(url)
    return urls[:MAX_MUSICALION_URL_TRIES]


async def fetch_musicalion_url(url, on_progress=None, client=None):
    if not is_musicalion_url(url):
        raise ValueError("Not a supported Musicalion URL")
    await _emit_progress(on_progress, "musicalion", "Musicalion requires manual import", 1.0)
    manual = build_musicalion_manual_candidate(url, title="")
    return {
        "empty": True,
        "found": False,
        "manualCandidates": [manual],
    }


async def collect_musicalion_candidates(client, title, artist="", on_progress=None):
    if not notation_source_enabled("musicalion"):
        return []
    await _emit_progress(on_progress, "musicalion", "Searching Musicalion...", 0.2)
    queries = build_musicalion_search_queries(title, artist)
    manual_candidates = []

    for query in queries[:2]:
        try:
            results = await search_web(query, max_results=8)
        except Exception:
            continue
        for page_url in musicalion_urls_from_search_results(results):
            score = score_title_artist_match(page_url, "", title, artist)
            if score < 10:
                continue
            manual_candidates.append(
                build_musicalion_manual_candidate(page_url, title=title, artist=artist)
            )
            if len(manual_candidates) >= 3:
                break
        if manual_candidates:
            break

    if not manual_candidates:
        return []
    return {"candidates": [], "manualCandidates": manual_candidates}
