"""Search allowlisted MIDI sites and convert public .mid files to MusicXML candidates."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

import httpx

from browser_fetch import fetch_html_with_fallback
from midi_convert import MAX_MIDI_IMPORT_BYTES, convert_midi_to_musicxml
from midi_resources import (
    MAX_LOCAL_MIDI_CANDIDATES,
    annotate_local_midi_candidate,
    midi_resources_enabled,
    read_midi_resource_bytes,
    search_midi_resources,
)
from notation_title_variants import notation_title_variants
from polite_fetch import browser_headers
from tune_background_research import search_web

MIDI_FETCH_TIMEOUT_SECONDS = 20.0
MAX_MIDI_FILE_DOWNLOADS = 5
MAX_MIDI_URL_TRIES = 12

MIDI_SEARCH_SITE_HOSTS = (
    "archive.org",
    "mutopiaproject.org",
    "midi.music.arizona.edu",
    "midkar.com",
    "bitmidi.com",
    "midiworld.com",
    "freemidi.org",
    "freemidi.net",
    "mididb.com",
    "vgmusic.com",
    "midi.show",
    "midis101.com",
)

MIDI_PAGE_HOST_SUFFIXES = MIDI_SEARCH_SITE_HOSTS

HTTP_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
HREF_RE = re.compile(r'''(?:href|src|data-url|data-href)=["']([^"']+)["']''', re.I)
MIDI_MAGIC = b"MThd"


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def _strip_www(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        return host[4:]
    return host


def is_allowed_midi_host(hostname):
    host = _strip_www(hostname)
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in MIDI_PAGE_HOST_SUFFIXES)


def is_direct_midi_file_url(raw_url):
    url = str(raw_url or "").strip().rstrip(".,;:!?)\"'>]")
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    path = (parsed.path or "").lower()
    return path.endswith(".mid") or path.endswith(".midi")


def normalize_midi_url(raw_url, base_url=""):
    url = str(raw_url or "").strip().rstrip(".,;:!?)\"'>]")
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    if base_url and url.startswith("/"):
        url = urljoin(base_url, url)
    if not url.startswith("http"):
        return ""
    return url.split("#")[0]


def title_from_midi_url(url, fallback=""):
    try:
        path = urlparse(url).path or ""
    except Exception:
        path = ""
    name = path.rsplit("/", 1)[-1]
    name = re.sub(r"\.(mid|midi)$", "", name, flags=re.I)
    name = re.sub(r"[_\-+]+", " ", name).strip()
    if name:
        return name
    return str(fallback or "").strip() or "MIDI import"


def build_midi_broad_queries(title, artist=""):
    """High-recall queries run first when site-specific hits are sparse."""
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []

    queries = []
    seen = set()
    priority_hosts = (
        "mutopiaproject.org",
        "archive.org",
        "freemidi.net",
        "midiworld.com",
        "bitmidi.com",
    )

    def add(query):
        key = str(query or "").strip().lower()
        if not key or key in seen:
            return
        seen.add(key)
        queries.append(str(query).strip())

    for variant in notation_title_variants(title)[:5]:
        quoted = '"{0}"'.format(variant)
        add("{0} filetype:mid".format(quoted))
        add("{0} midi download".format(quoted))
        if artist:
            add("{0} {1} midi".format(quoted, '"{0}"'.format(artist)))
        for host in priority_hosts:
            add("site:{0} {1} midi".format(host, quoted))
            add("site:{0} {1} filetype:mid".format(host, quoted))
    return queries


def build_midi_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []

    queries = []
    seen = set()

    def add(query):
        key = str(query or "").strip().lower()
        if not key or key in seen:
            return
        seen.add(key)
        queries.append(str(query).strip())

    for query in build_midi_broad_queries(title, artist):
        add(query)

    for variant in notation_title_variants(title):
        quoted = '"{0}"'.format(variant)
        for host in MIDI_SEARCH_SITE_HOSTS:
            batch = [
                "site:{0} {1} midi".format(host, quoted),
                "site:{0} {1} filetype:mid".format(host, quoted),
            ]
            if artist:
                batch.insert(
                    0,
                    "site:{0} {1} {2} midi".format(host, quoted, '"{0}"'.format(artist)),
                )
            for query in batch:
                add(query)
    return queries


def midi_urls_from_search_results(results, *, allow_any_direct_midi=False):
    """Collect MIDI file URLs and allowlisted HTML page URLs from search hits."""
    file_urls = []
    page_urls = []
    seen_files = set()
    seen_pages = set()

    def consider(raw):
        url = normalize_midi_url(raw)
        if not url:
            return
        try:
            host = urlparse(url).hostname
        except Exception:
            return
        if is_direct_midi_file_url(url):
            if allow_any_direct_midi or is_allowed_midi_host(host):
                if url not in seen_files:
                    seen_files.add(url)
                    file_urls.append(url)
            return
        if not is_allowed_midi_host(host):
            return
        if url not in seen_pages:
            seen_pages.add(url)
            page_urls.append(url)

    for item in results or []:
        if not isinstance(item, dict):
            continue
        for key in ("url", "href", "link"):
            if item.get(key):
                consider(item.get(key))
        snippet = " ".join(
            str(item.get(key) or "")
            for key in ("snippet", "body", "title", "description")
        )
        for match in HTTP_URL_RE.findall(snippet):
            consider(match)

    return file_urls, page_urls


def extract_midi_file_urls_from_html(html, page_url=""):
    ordered = []
    seen = set()

    def add(raw):
        url = normalize_midi_url(raw, page_url)
        if not url or not is_direct_midi_file_url(url):
            return
        try:
            host = urlparse(url).hostname
        except Exception:
            return
        # Only follow MIDI file links on allowlisted hosts (including CDNs on the list).
        if not is_allowed_midi_host(host):
            return
        if url in seen:
            return
        seen.add(url)
        ordered.append(url)

    text = str(html or "")
    for match in HTTP_URL_RE.finditer(text):
        add(match.group(0))
    for match in HREF_RE.finditer(text):
        add(match.group(1))
    return ordered


def annotate_midi_candidate(music_xml, title="", artist="", source_url=""):
    host = ""
    try:
        host = _strip_www(urlparse(source_url).hostname)
    except Exception:
        host = "midi"
    tune_meta = {
        "srcUrl": source_url or "",
        "meta": {"importFormat": "midi"},
    }
    if title:
        tune_meta["name"] = title
    if artist:
        tune_meta["composer"] = artist
    return {
        "abc": "",
        "musicXml": music_xml,
        "title": title or "",
        "artist": artist or "",
        "source": host or "midi",
        "sourceUrl": source_url or "",
        "preview": "",
        "titleOnly": not bool(title),
        "tuneMeta": tune_meta,
    }


def looks_like_midi_bytes(data):
    if not data or len(data) < 4:
        return False
    return data[:4] == MIDI_MAGIC


async def fetch_midi_bytes(client, url, referer=None):
    headers = browser_headers(referer=referer)
    headers["Accept"] = "*/*"
    response = await client.get(
        url,
        headers=headers,
        follow_redirects=True,
        timeout=MIDI_FETCH_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        return None
    data = response.content or b""
    if not data:
        return None
    if len(data) > MAX_MIDI_IMPORT_BYTES:
        return None
    content_type = (response.headers.get("content-type") or "").lower()
    if "text/html" in content_type and not looks_like_midi_bytes(data):
        return None
    if not looks_like_midi_bytes(data):
        if not is_direct_midi_file_url(url):
            return None
    return data


async def convert_and_annotate_midi(midi_bytes, source_url, query_title="", artist=""):
    music_xml, _diagnostics = await convert_midi_to_musicxml(midi_bytes, filename=source_url or "import.mid")
    title = title_from_midi_url(source_url, fallback=query_title)
    return annotate_midi_candidate(
        music_xml,
        title=title,
        artist=artist or "",
        source_url=source_url,
    )


async def fetch_midi_url(url, on_progress=None, client=None, title="", artist=""):
    """Download a direct .mid/.midi URL (any host) and convert to a notation candidate."""
    page_url = str(url or "").strip()
    if page_url.startswith("/midi-resources/") or "/midi-resources/" in page_url:
        rel_path = page_url.split("/midi-resources/", 1)[-1].split("?", 1)[0]
        await _emit_progress(on_progress, "midi", "Loading local MIDI file...", 0.3)
        try:
            midi_bytes = read_midi_resource_bytes(rel_path)
        except Exception as exc:
            raise ValueError(str(exc) or "Could not load local MIDI file") from exc
        await _emit_progress(on_progress, "midi", "Converting MIDI to MusicXML...", 0.7)
        music_xml, _diagnostics = await convert_midi_to_musicxml(midi_bytes, filename=rel_path)
        candidate = annotate_local_midi_candidate(
            music_xml,
            title=title_from_midi_url(page_url, fallback=title),
            path=rel_path,
            query_title=title,
            artist=artist,
        )
        await _emit_progress(on_progress, "midi", "MIDI notation ready", 1.0)
        return candidate

    if not is_direct_midi_file_url(page_url):
        raise ValueError("Not a MIDI file URL")

    await _emit_progress(on_progress, "midi", "Downloading MIDI file...", 0.3)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=MIDI_FETCH_TIMEOUT_SECONDS)
    try:
        midi_bytes = await fetch_midi_bytes(client, page_url)
        if not midi_bytes:
            raise ValueError("Could not download MIDI file from that URL")
        await _emit_progress(on_progress, "midi", "Converting MIDI to MusicXML...", 0.7)
        candidate = await convert_and_annotate_midi(
            midi_bytes,
            page_url,
            query_title=title,
            artist=artist,
        )
        await _emit_progress(on_progress, "midi", "MIDI notation ready", 1.0)
        return candidate
    finally:
        if owns_client:
            await client.aclose()


async def fetch_midi_from_allowlisted_page(url, on_progress=None, client=None, title="", artist=""):
    """Open an allowlisted MIDI catalog page, extract .mid links, convert the first success."""
    page_url = str(url or "").strip()
    try:
        host = urlparse(page_url).hostname
    except Exception:
        host = ""
    if not is_allowed_midi_host(host):
        raise ValueError("MIDI page host is not on the allowlist")

    await _emit_progress(on_progress, "midi", "Fetching MIDI catalog page...", 0.25)
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=MIDI_FETCH_TIMEOUT_SECONDS)
    try:
        page = await fetch_html_with_fallback(client, page_url, allow_playwright=True)
        html = page.text or ""
        final_url = page.final_url or page_url
        if page.status >= 400 or not html.strip():
            raise ValueError("Could not load MIDI catalog page")
        midi_urls = extract_midi_file_urls_from_html(html, final_url)
        if not midi_urls:
            raise ValueError("No MIDI file links found on that page")
        last_error = None
        for midi_url in midi_urls[:MAX_MIDI_URL_TRIES]:
            try:
                return await fetch_midi_url(
                    midi_url,
                    on_progress=on_progress,
                    client=client,
                    title=title,
                    artist=artist,
                )
            except Exception as exc:
                last_error = exc
                continue
        raise ValueError(str(last_error) if last_error else "Could not convert MIDI from that page")
    finally:
        if owns_client:
            await client.aclose()


async def collect_local_midi_candidates(title, artist="", on_progress=None):
    """Search the mounted local MIDI library and convert top matches."""
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title or not midi_resources_enabled():
        return []

    await _emit_progress(on_progress, "midi", "Searching local MIDI library...", 0.52)
    matches = search_midi_resources(title, artist=artist)
    if not matches:
        await _emit_progress(on_progress, "midi", "No local MIDI matches", 0.58)
        return []

    candidates = []
    for index, match in enumerate(matches[:MAX_LOCAL_MIDI_CANDIDATES]):
        rel_path = str(match.get("path") or "").strip()
        if not rel_path:
            continue
        await _emit_progress(
            on_progress,
            "midi",
            "Converting local MIDI {0}/{1}...".format(index + 1, min(len(matches), MAX_LOCAL_MIDI_CANDIDATES)),
            0.55 + (0.25 * (index + 1) / max(min(len(matches), MAX_LOCAL_MIDI_CANDIDATES), 1)),
        )
        try:
            midi_bytes = read_midi_resource_bytes(rel_path)
            music_xml, _diagnostics = await convert_midi_to_musicxml(
                midi_bytes,
                filename=rel_path,
            )
            candidate = annotate_local_midi_candidate(
                music_xml,
                title=str(match.get("title") or ""),
                path=rel_path,
                query_title=title,
                artist=artist,
            )
            candidate["matchScore"] = int(match.get("matchScore") or 0)
            candidates.append(candidate)
        except Exception:
            continue

    if candidates:
        await _emit_progress(on_progress, "midi", "Local MIDI candidates ready", 0.78)
    else:
        await _emit_progress(on_progress, "midi", "Local MIDI matches could not be converted", 0.78)
    return candidates


async def collect_midi_candidates(client, title, artist="", on_progress=None, relaxed=False):
    """Prefer the local MIDI library, then search the web."""
    local_candidates = await collect_local_midi_candidates(title, artist=artist, on_progress=on_progress)
    if local_candidates:
        return local_candidates
    return await collect_web_midi_candidates(
        client,
        title,
        artist=artist,
        on_progress=on_progress,
        relaxed=relaxed,
    )


async def collect_web_midi_candidates(client, title, artist="", on_progress=None, relaxed=False):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []

    await _emit_progress(
        on_progress,
        "midi",
        "Searching MIDI sites..." if not relaxed else "Searching the web for MIDI files...",
        0.55,
    )
    queries = build_midi_search_queries(title, artist)
    if relaxed:
        broad = build_midi_broad_queries(title, artist)
        broad_set = set(broad)
        queries = broad + [query for query in queries if query not in broad_set]
    file_urls = []
    page_urls = []
    seen_files = set()
    seen_pages = set()
    max_url_tries = MAX_MIDI_URL_TRIES * 2 if relaxed else MAX_MIDI_URL_TRIES
    max_file_downloads = MAX_MIDI_FILE_DOWNLOADS * 2 if relaxed else MAX_MIDI_FILE_DOWNLOADS

    for query in queries:
        try:
            results = await search_web(client, query)
        except Exception:
            results = []
        files, pages = midi_urls_from_search_results(
            results,
            allow_any_direct_midi=relaxed,
        )
        for url in files:
            if url not in seen_files:
                seen_files.add(url)
                file_urls.append(url)
        for url in pages:
            if url not in seen_pages:
                seen_pages.add(url)
                page_urls.append(url)
        if len(file_urls) >= max_url_tries:
            break

    for page_url in page_urls[:8]:
        if len(file_urls) >= max_url_tries:
            break
        try:
            page = await fetch_html_with_fallback(client, page_url, allow_playwright=True)
            if page.status >= 400 or not (page.text or "").strip():
                continue
            for midi_url in extract_midi_file_urls_from_html(page.text, page.final_url or page_url):
                if midi_url not in seen_files:
                    seen_files.add(midi_url)
                    file_urls.append(midi_url)
        except Exception:
            continue

    file_urls = file_urls[:max_url_tries]
    if not file_urls:
        await _emit_progress(on_progress, "midi", "No MIDI files found", 0.8)
        return []

    candidates = []
    for index, midi_url in enumerate(file_urls):
        if len(candidates) >= max_file_downloads:
            break
        await _emit_progress(
            on_progress,
            "midi",
            "Trying MIDI file {0}/{1}...".format(index + 1, len(file_urls)),
            0.6 + (0.3 * (index + 1) / max(len(file_urls), 1)),
        )
        try:
            midi_bytes = await fetch_midi_bytes(client, midi_url)
            if not midi_bytes:
                continue
            candidate = await convert_and_annotate_midi(
                midi_bytes,
                midi_url,
                query_title=title,
                artist=artist,
            )
            candidates.append(candidate)
        except Exception:
            continue

    if candidates:
        await _emit_progress(on_progress, "midi", "MIDI candidates ready", 0.9)
    else:
        await _emit_progress(on_progress, "midi", "No convertible MIDI downloads", 0.9)
    return candidates
