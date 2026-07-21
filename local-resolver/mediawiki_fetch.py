"""Shared MediaWiki helpers for IMSLP and CPDL score discovery."""

from __future__ import annotations

import re
from urllib.parse import quote, unquote, urljoin, urlparse

import httpx

from browser_fetch import fetch_html_with_fallback
from musescore_fetch import (
    extract_musicxml_from_mxl_bytes,
    is_mxl_bytes,
    is_musicxml_text,
)
from polite_fetch import browser_headers

MEDIAWIKI_FETCH_TIMEOUT_SECONDS = 20.0
MAX_MEDIAWIKI_SEARCH_RESULTS = 5

MUSICXML_EXT_RE = re.compile(r"\.(?:mxl|musicxml|xml)(?:\?|$)", re.I)
PDF_EXT_RE = re.compile(r"\.pdf(?:\?|$)", re.I)
HTTP_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
HREF_RE = re.compile(r'''(?:href|src)=["']([^"']+)["']''', re.I)
FILE_LINK_RE = re.compile(
    r'href=["\']([^"\']*/(?:wiki/)?File:[^"\']+)["\']',
    re.I,
)


def strip_www(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        return host[4:]
    return host


def mediawiki_cookies_for_base_url(base_url):
    host = strip_www(urlparse(base_url).hostname or "")
    if host == "imslp.org" or host.endswith(".imslp.org"):
        return {"imslpdisclaimeraccepted": "yes"}
    return {}


def api_endpoint(base_url):
    parsed = urlparse(base_url)
    scheme = parsed.scheme or "https"
    host = parsed.netloc or parsed.path.split("/")[0]
    path = parsed.path or ""
    if "/wiki" in path:
        prefix = path.split("/wiki")[0]
    else:
        prefix = path.rstrip("/")
    return "{0}://{1}{2}/api.php".format(scheme, host, prefix)


def score_file_rank(url):
    path = (urlparse(url).path or "").lower()
    for ext, rank in (
        (".mxl", 0),
        (".musicxml", 1),
        (".xml", 2),
        (".pdf", 3),
        (".mid", 4),
        (".midi", 5),
    ):
        if path.endswith(ext):
            return rank
    if MUSICXML_EXT_RE.search(path):
        return 1
    if PDF_EXT_RE.search(path):
        return 3
    return 99


def rank_score_file_urls(urls):
    unique = []
    seen = set()
    for raw in urls or []:
        url = str(raw or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        unique.append(url)
    unique.sort(key=score_file_rank)
    return unique


def extract_score_links_from_html(html, page_url=""):
    links = []
    for match in HREF_RE.finditer(html or ""):
        href = match.group(1).strip()
        if href.startswith("//"):
            href = "https:" + href
        if href.startswith("/"):
            href = urljoin(page_url, href)
        if not href.startswith("http"):
            continue
        path = (urlparse(href).path or "").lower()
        if (
            MUSICXML_EXT_RE.search(path)
            or PDF_EXT_RE.search(path)
            or "/file:" in path
            or "/wiki/file:" in path
        ):
            links.append(href)
    for match in HTTP_URL_RE.finditer(html or ""):
        url = match.group(0).strip().rstrip(".,;:!?)\"'>]")
        path = (urlparse(url).path or "").lower()
        if MUSICXML_EXT_RE.search(path) or PDF_EXT_RE.search(path):
            links.append(url)
    return rank_score_file_urls(links)


async def mediawiki_search(client, base_url, query, limit=MAX_MEDIAWIKI_SEARCH_RESULTS):
    endpoint = api_endpoint(base_url)
    response = await client.get(
        endpoint,
        params={
            "action": "query",
            "list": "search",
            "srsearch": query,
            "srlimit": max(1, min(int(limit or 5), 20)),
            "format": "json",
        },
        headers=browser_headers(referer=base_url),
        cookies=mediawiki_cookies_for_base_url(base_url),
        follow_redirects=True,
        timeout=MEDIAWIKI_FETCH_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        return []
    data = response.json()
    search = (((data or {}).get("query") or {}).get("search")) or []
    if not isinstance(search, list):
        return []
    results = []
    for item in search:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        page_url = urljoin(base_url.rstrip("/") + "/", "wiki/" + quote(title.replace(" ", "_")))
        results.append({
            "title": title,
            "pageUrl": page_url,
            "snippet": str(item.get("snippet") or ""),
        })
    return results


async def mediawiki_page_file_titles(client, base_url, page_title):
    endpoint = api_endpoint(base_url)
    response = await client.get(
        endpoint,
        params={
            "action": "query",
            "titles": page_title,
            "prop": "images",
            "imlimit": 50,
            "format": "json",
        },
        headers=browser_headers(referer=base_url),
        cookies=mediawiki_cookies_for_base_url(base_url),
        follow_redirects=True,
        timeout=MEDIAWIKI_FETCH_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        return []
    data = response.json()
    pages = (((data or {}).get("query") or {}).get("pages")) or {}
    if not isinstance(pages, dict):
        return []
    titles = []
    for page in pages.values():
        if not isinstance(page, dict):
            continue
        images = page.get("images") or []
        if not isinstance(images, list):
            continue
        for image in images:
            if isinstance(image, dict) and image.get("title"):
                titles.append(str(image.get("title")))
    return titles


async def mediawiki_file_url(client, base_url, file_title):
    endpoint = api_endpoint(base_url)
    response = await client.get(
        endpoint,
        params={
            "action": "query",
            "titles": file_title,
            "prop": "imageinfo",
            "iiprop": "url|mime",
            "format": "json",
        },
        headers=browser_headers(referer=base_url),
        cookies=mediawiki_cookies_for_base_url(base_url),
        follow_redirects=True,
        timeout=MEDIAWIKI_FETCH_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        return ""
    data = response.json()
    pages = (((data or {}).get("query") or {}).get("pages")) or {}
    for page in pages.values():
        if not isinstance(page, dict):
            continue
        imageinfo = page.get("imageinfo") or []
        if not imageinfo:
            continue
        first = imageinfo[0] if isinstance(imageinfo[0], dict) else {}
        return str(first.get("url") or "").strip()
    return ""


async def mediawiki_page_score_file_urls(client, base_url, page_title):
    file_titles = await mediawiki_page_file_titles(client, base_url, page_title)
    urls = []
    for file_title in file_titles[:20]:
        url = await mediawiki_file_url(client, base_url, file_title)
        if url:
            urls.append(url)
    return rank_score_file_urls(urls)


async def fetch_mediawiki_page_html(client, page_url):
    page = await fetch_html_with_fallback(
        client,
        page_url,
        allow_playwright=False,
        cookies=mediawiki_cookies_for_base_url(page_url),
    )
    return page.text or "", page.final_url or page_url


async def fetch_binary(client, url, referer=None, cookies=None):
    headers = browser_headers(referer=referer)
    headers["Accept"] = "*/*"
    response = await client.get(
        url,
        headers=headers,
        cookies=cookies or mediawiki_cookies_for_base_url(url),
        follow_redirects=True,
        timeout=MEDIAWIKI_FETCH_TIMEOUT_SECONDS,
    )
    return response


async def musicxml_from_binary_response(response):
    content_type = (response.headers.get("content-type") or "").lower()
    data = response.content or b""
    if response.status_code >= 400 or not data:
        return None
    text_head = data[:800].decode("utf-8", errors="replace")
    if "<html" in text_head.lower() or "text/html" in content_type:
        return None
    if is_mxl_bytes(data) or "mxl" in content_type or "zip" in content_type:
        return extract_musicxml_from_mxl_bytes(data)
    text = data.decode("utf-8", errors="replace")
    if is_musicxml_text(text):
        return text
    return None


def pdf_attachment_from_url(download_url, filename="", source_url=""):
    path = urlparse(download_url).path or ""
    name = filename or unquote(path.rsplit("/", 1)[-1]) or "score.pdf"
    return {
        "downloadUrl": download_url,
        "filename": name,
        "contentType": "application/pdf",
        "sourceUrl": source_url or download_url,
    }


def page_title_from_wiki_url(url):
    try:
        path = urlparse(url).path or ""
    except Exception:
        return ""
    if "/wiki/" not in path:
        return ""
    title = unquote(path.split("/wiki/", 1)[-1]).replace("_", " ").strip()
    return title


def composer_from_page_title(page_title):
    text = str(page_title or "").strip()
    if not text:
        return ""
    if "(" in text:
        return text.split("(", 1)[0].strip()
    return ""
