"""Fetch MusicXML/PDF scores from IMSLP."""

from __future__ import annotations

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

IMSLP_FETCH_TIMEOUT_SECONDS = 20.0
IMSLP_BASE_URL = "https://imslp.org"
MAX_IMSLP_URL_TRIES = 5

IMSLP_HOST_SUFFIXES = (
    "imslp.org",
)


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def is_imslp_url(url):
    try:
        host = (urlparse(url).hostname or "").lower().replace("www.", "")
    except Exception:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in IMSLP_HOST_SUFFIXES)


def build_imslp_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    quoted = '"{0}"'.format(title)
    queries = [
        "site:imslp.org {0} musicxml".format(quoted),
        "site:imslp.org {0} mxl".format(quoted),
        "site:imslp.org {0}".format(quoted),
    ]
    if artist:
        queries.append("site:imslp.org {0} {1}".format(quoted, '"{0}"'.format(artist)))
    return queries


def build_imslp_manual_candidate(url, title="", reason=""):
    return {
        "url": url,
        "title": title or "IMSLP score",
        "source": "imslp.org",
        "host": "imslp.org",
        "reason": reason or "Download MusicXML or PDF from IMSLP and use Score import",
        "contentType": "notation",
    }


def annotate_imslp_candidate(
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
        "meta": {"importFormat": import_format, "archive": "imslp"},
    }
    out = {
        "abc": "",
        "musicXml": music_xml or "",
        "title": title or "",
        "artist": artist or "",
        "source": "imslp.org",
        "sourceUrl": source_url or "",
        "preview": "",
        "titleOnly": not bool(title),
        "tuneMeta": tune_meta,
    }
    if pdf_attachment and not music_xml:
        out["pdfAttachment"] = pdf_attachment
        out["preview"] = "Sheet PDF (no MusicXML)"
    return out


async def _resolve_imslp_page_files(client, page_url):
    page_title = page_title_from_wiki_url(page_url)
    urls = []
    if page_title:
        try:
            urls.extend(await mediawiki_page_score_file_urls(client, IMSLP_BASE_URL, page_title))
        except Exception:
            pass
    html, final_url = await fetch_mediawiki_page_html(client, page_url)
    urls.extend(extract_score_links_from_html(html, final_url))
    return rank_score_file_urls(urls)


async def fetch_imslp_url(url, on_progress=None, client=None):
    if not is_imslp_url(url):
        raise ValueError("Not a supported IMSLP URL")
    await _emit_progress(on_progress, "imslp", "Fetching IMSLP work page...", 0.35)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=IMSLP_FETCH_TIMEOUT_SECONDS)
    try:
        page_title = page_title_from_wiki_url(url)
        title = page_title or "IMSLP import"
        artist = ""
        if "(" in title:
            parts = title.split("(", 1)
            artist = parts[0].strip()
            title = parts[1].rstrip(")").strip()

        file_urls = await _resolve_imslp_page_files(client, url)
        if not file_urls:
            manual = build_imslp_manual_candidate(url, title=title)
            return {
                "empty": True,
                "found": False,
                "manualCandidates": [manual],
            }

        cookies = mediawiki_cookies_for_base_url(IMSLP_BASE_URL)
        for file_url in file_urls[:10]:
            try:
                response = await fetch_binary(client, file_url, referer=url, cookies=cookies)
            except Exception:
                continue
            music_xml = await musicxml_from_binary_response(response)
            if music_xml:
                await _emit_progress(on_progress, "imslp", "IMSLP MusicXML ready", 1.0)
                return annotate_imslp_candidate(
                    music_xml=music_xml,
                    title=title,
                    artist=artist,
                    source_url=url,
                )
            content_type = (response.headers.get("content-type") or "").lower()
            if response.status_code < 400 and (
                "pdf" in content_type or file_url.lower().endswith(".pdf")
            ):
                await _emit_progress(on_progress, "imslp", "IMSLP PDF ready", 1.0)
                return annotate_imslp_candidate(
                    title=title,
                    artist=artist,
                    source_url=url,
                    pdf_attachment=pdf_attachment_from_url(file_url, source_url=url),
                )

        manual = build_imslp_manual_candidate(
            url,
            title=title,
            reason="IMSLP blocked automated download; open the page and import MusicXML or PDF manually",
        )
        return {
            "empty": True,
            "found": False,
            "manualCandidates": [manual],
        }
    finally:
        if owns_client:
            await client.aclose()


def imslp_urls_from_search_results(results):
    urls = []
    seen = set()
    for item in results or []:
        url = str((item or {}).get("url") or "").strip()
        if not url or url in seen or not is_imslp_url(url):
            continue
        if "/wiki/" not in url.lower():
            continue
        seen.add(url)
        urls.append(url)
    return urls[:MAX_IMSLP_URL_TRIES]


async def collect_imslp_candidates(client, title, artist="", on_progress=None):
    if not notation_source_enabled("imslp"):
        return []
    await _emit_progress(on_progress, "imslp", "Searching IMSLP...", 0.2)
    queries = build_imslp_search_queries(title, artist)
    page_urls = []
    seen = set()

    for query in queries[:3]:
        try:
            results = await search_web(query, max_results=8)
        except Exception:
            results = []
        for url in imslp_urls_from_search_results(results):
            if url not in seen:
                seen.add(url)
                page_urls.append(url)

    try:
        wiki_hits = await mediawiki_search(client, IMSLP_BASE_URL, title, limit=5)
    except Exception:
        wiki_hits = []
    for hit in wiki_hits:
        url = str((hit or {}).get("pageUrl") or "").strip()
        if url and url not in seen:
            seen.add(url)
            page_urls.append(url)

    candidates = []
    manual_candidates = []
    for page_url in page_urls[:MAX_IMSLP_URL_TRIES]:
        try:
            result = await fetch_imslp_url(page_url, on_progress=on_progress, client=client)
        except Exception:
            continue
        if isinstance(result, dict) and result.get("empty"):
            manual_candidates.extend(result.get("manualCandidates") or [])
            continue
        score = score_title_artist_match(
            result.get("title") or "",
            result.get("artist") or "",
            title,
            artist,
        )
        if score < 20:
            continue
        candidates.append(result)
        if len(candidates) >= 3:
            break

    if candidates:
        return candidates
    if manual_candidates:
        return {"candidates": [], "manualCandidates": manual_candidates}
    return []
