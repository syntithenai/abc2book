"""Fetch MusicXML/PDF scores from the Choral Public Domain Library (CPDL)."""

from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx

from archive_source_config import notation_source_enabled
from chords_fetch import score_title_artist_match
from mediawiki_fetch import (
    extract_score_links_from_html,
    fetch_binary,
    fetch_mediawiki_page_html,
    mediawiki_cookies_for_base_url,
    mediawiki_page_score_file_urls,
    mediawiki_search,
    musicxml_from_binary_response,
    page_title_from_wiki_url,
    pdf_attachment_from_url,
    rank_score_file_urls,
)
from tune_background_research import search_web

CPDL_FETCH_TIMEOUT_SECONDS = 20.0
CPDL_BASE_URL = "https://www.cpdl.org"
MAX_CPDL_URL_TRIES = 5

CPDL_HOST_SUFFIXES = (
    "cpdl.org",
)


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def is_cpdl_url(url):
    try:
        host = (urlparse(url).hostname or "").lower().replace("www.", "")
    except Exception:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in CPDL_HOST_SUFFIXES)


def build_cpdl_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    quoted = '"{0}"'.format(title)
    queries = [
        "site:cpdl.org {0} musicxml".format(quoted),
        "site:cpdl.org {0} mxl".format(quoted),
        "site:cpdl.org {0}".format(quoted),
    ]
    if artist:
        queries.append("site:cpdl.org {0} {1}".format(quoted, '"{0}"'.format(artist)))
    return queries


def annotate_cpdl_candidate(
    music_xml="",
    title="",
    artist="",
    source_url="",
    pdf_attachment=None,
):
    import_format = "musicxml" if music_xml else "pdf"
    tune_meta = {
        "name": title or "",
        "composer": artist or "",
        "srcUrl": source_url or "",
        "meta": {"importFormat": import_format, "archive": "cpdl"},
    }
    out = {
        "abc": "",
        "musicXml": music_xml or "",
        "title": title or "",
        "artist": artist or "",
        "source": "cpdl.org",
        "sourceUrl": source_url or "",
        "preview": "",
        "titleOnly": not bool(title),
        "tuneMeta": tune_meta,
    }
    if pdf_attachment and not music_xml:
        out["pdfAttachment"] = pdf_attachment
        out["preview"] = "Sheet PDF (no MusicXML)"
    return out


async def _resolve_cpdl_page_files(client, page_url):
    page_title = page_title_from_wiki_url(page_url)
    urls = []
    if page_title:
        try:
            urls.extend(await mediawiki_page_score_file_urls(client, CPDL_BASE_URL, page_title))
        except Exception:
            pass
    html, final_url = await fetch_mediawiki_page_html(client, page_url)
    urls.extend(extract_score_links_from_html(html, final_url))
    return rank_score_file_urls(urls)


async def fetch_cpdl_url(url, on_progress=None, client=None):
    if not is_cpdl_url(url):
        raise ValueError("Not a supported CPDL URL")
    await _emit_progress(on_progress, "cpdl", "Fetching CPDL score page...", 0.35)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=CPDL_FETCH_TIMEOUT_SECONDS)
    try:
        page_title = page_title_from_wiki_url(url)
        title = page_title or "CPDL import"
        artist = ""
        if "(" in title:
            artist = title.split("(", 1)[0].strip()
            title = title.split("(", 1)[-1].rstrip(")").strip()

        file_urls = await _resolve_cpdl_page_files(client, url)
        if not file_urls:
            raise ValueError("No downloadable score files found on CPDL page")

        for file_url in file_urls[:8]:
            response = await fetch_binary(
                client,
                file_url,
                referer=url,
                cookies=mediawiki_cookies_for_base_url(CPDL_BASE_URL),
            )
            music_xml = await musicxml_from_binary_response(response)
            if music_xml:
                await _emit_progress(on_progress, "cpdl", "CPDL MusicXML ready", 1.0)
                return annotate_cpdl_candidate(
                    music_xml=music_xml,
                    title=title,
                    artist=artist,
                    source_url=url,
                )
            content_type = (response.headers.get("content-type") or "").lower()
            if response.status_code < 400 and (
                "pdf" in content_type or file_url.lower().endswith(".pdf")
            ):
                await _emit_progress(on_progress, "cpdl", "CPDL PDF ready", 1.0)
                return annotate_cpdl_candidate(
                    title=title,
                    artist=artist,
                    source_url=url,
                    pdf_attachment=pdf_attachment_from_url(file_url, source_url=url),
                )
        raise ValueError("Could not download MusicXML or PDF from CPDL page")
    finally:
        if owns_client:
            await client.aclose()


def cpdl_urls_from_search_results(results):
    urls = []
    seen = set()
    for item in results or []:
        url = str((item or {}).get("url") or "").strip()
        if not url or url in seen or not is_cpdl_url(url):
            continue
        if "/wiki/" not in url.lower():
            continue
        seen.add(url)
        urls.append(url)
    return urls[:MAX_CPDL_URL_TRIES]


async def collect_cpdl_candidates(client, title, artist="", on_progress=None):
    if not notation_source_enabled("cpdl"):
        return []
    await _emit_progress(on_progress, "cpdl", "Searching CPDL...", 0.2)
    queries = build_cpdl_search_queries(title, artist)
    page_urls = []
    seen = set()

    for query in queries[:3]:
        try:
            results = await search_web(query, max_results=8)
        except Exception:
            results = []
        for url in cpdl_urls_from_search_results(results):
            if url not in seen:
                seen.add(url)
                page_urls.append(url)

    try:
        wiki_hits = await mediawiki_search(client, CPDL_BASE_URL, title, limit=5)
    except Exception:
        wiki_hits = []
    for hit in wiki_hits:
        url = str((hit or {}).get("pageUrl") or "").strip()
        if url and url not in seen:
            seen.add(url)
            page_urls.append(url)

    candidates = []
    for page_url in page_urls[:MAX_CPDL_URL_TRIES]:
        try:
            candidate = await fetch_cpdl_url(page_url, on_progress=on_progress, client=client)
        except Exception:
            continue
        score = score_title_artist_match(
            candidate.get("title") or "",
            candidate.get("artist") or "",
            title,
            artist,
        )
        if score < 20:
            continue
        candidates.append(candidate)
        if len(candidates) >= 3:
            break
    return candidates
