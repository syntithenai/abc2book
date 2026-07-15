"""Fetch public MuseScore.com scores as MusicXML (no login / LibreScore)."""

from __future__ import annotations

import io
import os
import re
import subprocess
import tempfile
import zipfile
from urllib.parse import urljoin, urlparse

import httpx

from browser_fetch import fetch_html_with_fallback
from polite_fetch import browser_headers
from tune_background_research import search_web

MUSESCORE_FETCH_TIMEOUT_SECONDS = 20.0
MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS = 60.0
MAX_MUSESCORE_SEARCH_URLS = 5
MUSESCORE_HOST_SUFFIXES = ("musescore.com",)

SCORE_PATH_RE = re.compile(
    r"(?:/user/(?P<user>[^/]+))?/scores/(?P<score_id>\d+)",
    re.I,
)
SCORE_ID_ALT_RE = re.compile(r"/score/(?P<score_id>\d+)\b", re.I)
OG_TITLE_RE = re.compile(
    r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
    re.I,
)
OG_TITLE_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
    re.I,
)
TITLE_TAG_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
HTTP_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
MUSICXML_EXT_RE = re.compile(r"\.(?:musicxml|mxl|xml)(?:\?|$)", re.I)
DOWNLOAD_HINT_RE = re.compile(
    r"(?:type=mxl|type=musicxml|type=xml|/download/mxl|/download/musicxml|"
    r"format=mxl|format=musicxml)",
    re.I,
)
PAYWALL_MARKERS = (
    "musescore pro",
    "pro subscription",
    "start free trial",
    "subscribe to download",
    "login to download",
    "sign in to download",
    "create an account to download",
    "download requires",
    "upgrade to pro",
)
MUSICXML_MARKERS = (
    "<?xml",
    "<score-partwise",
    "<score-timewise",
)


class MuseScoreDownloadUnavailable(ValueError):
    """Raised when a MuseScore score cannot be downloaded without auth/Pro."""

    def __init__(self, message=None, source=None):
        super().__init__(
            message
            or (
                "This MuseScore.com score is not available for public download. "
                "On MuseScore.com use Download → MusicXML or .mxl, then Import → "
                "Select a file in ABC Tune Book."
            )
        )
        self.source = source or "unknown"


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


async def fetch_musescore_url_with_librescore(score_id, on_progress=None, client=None, page_url=""):
    """
    Attempt to fetch a MuseScore score using LibreScore's dl-librescore CLI.
    This is a fallback when the direct method fails.
    """
    await _emit_progress(on_progress, "librescore", "Attempting download via LibreScore...", 0.3)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = os.path.join(temp_dir, "librescore_output")
            os.makedirs(output_dir, exist_ok=True)

            score_url = f"https://musescore.com/score/{score_id}"
            cmd = [
                "npx",
                "dl-librescore@latest",
                score_url,
                "-o", output_dir
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS)

            if result.returncode != 0:
                raise MuseScoreDownloadUnavailable(
                    f"LibreScore CLI failed: {result.stderr}",
                    source="librescore"
                )

            downloaded_files = os.listdir(output_dir)
            mscz_file = None
            for f in downloaded_files:
                if f.endswith('.mscz'):
                    mscz_file = os.path.join(output_dir, f)
                    break

            if not mscz_file:
                raise MuseScoreDownloadUnavailable(
                    "LibreScore downloaded a file, but it was not a .mscz file.",
                    source="librescore"
                )

            # Convert .mscz to MXL via MuseScore CLI (Docker extracts AppImage as mscore).
            mxl_output = os.path.join(temp_dir, "output.mxl")
            convert_attempts = (
                ("xvfb-run", "-a", "mscore", "-o", mxl_output, mscz_file),
                ("xvfb-run", "-a", "musescore", "-o", mxl_output, mscz_file),
                ("mscore", "-o", mxl_output, mscz_file),
                ("musescore", "-o", mxl_output, mscz_file),
            )
            convert_result = None
            last_error = ""
            for convert_cmd in convert_attempts:
                try:
                    convert_result = subprocess.run(
                        list(convert_cmd),
                        capture_output=True,
                        text=True,
                        timeout=MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS,
                    )
                except FileNotFoundError:
                    last_error = "Command not found: {0}".format(convert_cmd[0])
                    continue
                if convert_result.returncode == 0:
                    break
                last_error = (convert_result.stderr or convert_result.stdout or "").strip()
            else:
                raise MuseScoreDownloadUnavailable(
                    "MuseScore conversion failed: {0}".format(last_error or "unknown error"),
                    source="librescore",
                )

            # Read the converted MXL file
            with open(mxl_output, 'rb') as f:
                mxl_data = f.read()
                
            return extract_musicxml_from_mxl_bytes(mxl_data)

    except MuseScoreDownloadUnavailable:
        raise
    except FileNotFoundError:
        raise MuseScoreDownloadUnavailable(
            "The 'npx' command was not found. Node.js is required for the LibreScore fallback.",
            source="librescore"
        )
    except subprocess.TimeoutExpired:
        raise MuseScoreDownloadUnavailable(
            "LibreScore download timed out.",
            source="librescore"
        )
    except Exception as e:
        raise MuseScoreDownloadUnavailable(
            f"LibreScore fallback failed: {str(e)}",
            source="librescore"
        )


def _strip_www(hostname):
    host = (hostname or "").lower()
    if host.startswith("www."):
        return host[4:]
    return host


def is_musescore_host(hostname):
    host = _strip_www(hostname)
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in MUSESCORE_HOST_SUFFIXES)


def is_musescore_url(url):
    try:
        parsed = urlparse(str(url or "").strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    return is_musescore_host(parsed.hostname)


def parse_musescore_score_url(url):
    """Return {url, scoreId, user} or None if not a MuseScore score page."""
    raw = str(url or "").strip()
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
    except Exception:
        return None
    if parsed.scheme not in ("http", "https"):
        return None
    if not is_musescore_host(parsed.hostname):
        return None

    path = parsed.path or ""
    match = SCORE_PATH_RE.search(path) or SCORE_ID_ALT_RE.search(path)
    if not match:
        return None

    score_id = match.group("score_id")
    user = ""
    if "user" in match.groupdict() and match.group("user"):
        user = match.group("user")

    host = _strip_www(parsed.hostname)
    clean = "{scheme}://{host}{path}".format(
        scheme=parsed.scheme,
        host=host,
        path=path.rstrip("/") or "/",
    )

    return {
        "url": clean.rstrip("/"),
        "scoreId": str(score_id),
        "user": user or "",
    }


def is_musicxml_text(text):
    head = (text or "")[:400].lower()
    return any(marker in head for marker in MUSICXML_MARKERS)


def is_mxl_bytes(data):
    if not data or len(data) < 4:
        return False
    return data[:2] == b"PK"


def extract_musicxml_from_mxl_bytes(data):
    """Unzip MXL and return MusicXML text using META-INF/container.xml when present."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        root_path = None
        container_name = next(
            (name for name in names if name.replace("\\", "/").endswith("META-INF/container.xml")),
            None,
        )
        if container_name:
            container_xml = archive.read(container_name).decode("utf-8", errors="replace")
            root_match = re.search(
                r'full-path\s*=\s*["\']([^"\']+)["\']',
                container_xml,
                re.I,
            )
            if root_match:
                root_path = root_match.group(1).lstrip("./")
        if not root_path:
            for name in names:
                lower = name.lower()
                if lower.endswith("score.xml") or lower.endswith(".musicxml") or lower.endswith(".xml"):
                    if "meta-inf" in lower:
                        continue
                    root_path = name
                    break
        if not root_path:
            raise ValueError("MXL archive has no MusicXML root file")
        # container paths are relative to archive root
        try:
            raw = archive.read(root_path)
        except KeyError:
            match = next(
                (name for name in names if name.replace("\\", "/").endswith(root_path.replace("\\", "/"))),
                None,
            )
            if not match:
                raise ValueError('Could not find MusicXML file "{0}" inside MXL archive'.format(root_path))
            raw = archive.read(match)
        text = raw.decode("utf-8", errors="replace")
        if not is_musicxml_text(text):
            raise ValueError("MXL archive does not contain valid MusicXML")
        return text


def _clean_html_text(value):
    text = TAG_RE.sub(" ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text


MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS = 60.0


def extract_musescore_page_meta(html, page_url=""):
    """Pull title/artist/score id from score page HTML."""
    text = str(html or "")
    title = ""
    for pattern in (OG_TITLE_RE, OG_TITLE_RE_ALT):
        match = pattern.search(text)
        if match:
            title = _clean_html_text(match.group(1))
            break
    if not title:
        match = TITLE_TAG_RE.search(text)
        if match:
            title = _clean_html_text(match.group(1))
            for noise in (" | MuseScore", " - MuseScore", " | musescore.com"):
                if noise.lower() in title.lower():
                    title = re.sub(re.escape(noise), "", title, flags=re.I).strip()

    artist = ""
    composer_match = re.search(
        r'"(?:composer|artist|author)"\s*:\s*"([^"]{1,200})"',
        text,
        re.I,
    )
    if composer_match:
        artist = _clean_html_text(composer_match.group(1))

    score_id = ""
    parsed = parse_musescore_score_url(page_url) if page_url else None
    if parsed:
        score_id = parsed["scoreId"]
    if not score_id:
        id_match = re.search(r'"scoreId"\s*:\s*(\d+)', text) or re.search(
            r'"id"\s*:\s*(\d{4,})',
            text,
        )
        if id_match:
            score_id = id_match.group(1)

    # Prefer structured title from embedded JSON when og:title is noisy.
    for key in ("title", "scoreTitle", "name"):
        json_match = re.search(
            r'"{0}"\s*:\s*"([^"]{{1,300}})"'.format(key),
            text,
        )
        if json_match:
            candidate = _clean_html_text(json_match.group(1))
            if candidate and len(candidate) < 200:
                title = candidate
                break

    return {
        "title": title,
        "artist": artist,
        "scoreId": score_id,
    }


def page_looks_paywalled(html):
    lower = (html or "")[:20000].lower()
    return any(marker in lower for marker in PAYWALL_MARKERS)


def _normalize_candidate_url(raw_url, base_url=""):
    url = str(raw_url or "").strip().rstrip(".,;:!?)\"'>]")
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    if base_url and url.startswith("/"):
        url = urljoin(base_url, url)
    if not url.startswith("http"):
        return ""
    return url


def extract_musicxml_download_urls(html, page_url=""):
    """Collect URLs that look like MusicXML/MXL downloads from page HTML."""
    text = str(html or "")
    ordered = []
    seen = set()

    def add(raw):
        url = _normalize_candidate_url(raw, page_url)
        if not url:
            return
        key = url.split("#")[0]
        if key in seen:
            return
        lower = key.lower()
        looks_musicxml = bool(MUSICXML_EXT_RE.search(lower) or DOWNLOAD_HINT_RE.search(lower))
        if not looks_musicxml:
            return
        # Never chase native MuseScore packages.
        if ".mscz" in lower or "type=mscz" in lower:
            return
        seen.add(key)
        ordered.append(key)

    for match in HTTP_URL_RE.finditer(text):
        add(match.group(0))

    for match in re.finditer(r'''(?:href|src|data-url|data-href)=["']([^"']+)["']''', text, re.I):
        add(match.group(1))

    # Embedded JSON string values that look like download links.
    for match in re.finditer(r'"(https?://[^"]+)"', text):
        add(match.group(1))
    for match in re.finditer(r'"(/[^"]+/download[^"]*)"', text, re.I):
        add(match.group(1))

    return ordered


def annotate_musescore_candidate(music_xml, title="", artist="", source_url="", score_id="", source="musescore.com"):
    tune_meta = {
        "srcUrl": source_url or "",
    }
    if title:
        tune_meta["name"] = title
    if artist:
        tune_meta["composer"] = artist
    if score_id:
        tune_meta["meta"] = {"musescore_score_id": str(score_id)}
    return {
        "abc": "",
        "musicXml": music_xml,
        "title": title or "",
        "artist": artist or "",
        "source": source if source in ("musescore.com", "librescore") else "musescore.com",
        "sourceUrl": source_url or "",
        "preview": "",
        "titleOnly": not bool(title),
        "tuneMeta": tune_meta,
    }


async def fetch_binary(client, url, referer=None):
    headers = browser_headers(referer=referer)
    headers["Accept"] = "*/*"
    response = await client.get(
        url,
        headers=headers,
        follow_redirects=True,
        timeout=MUSESCORE_FETCH_TIMEOUT_SECONDS,
    )
    return response


async def _musicxml_from_download_response(response):
    content_type = (response.headers.get("content-type") or "").lower()
    data = response.content or b""
    if response.status_code >= 400:
        return None
    if not data:
        return None

    # Auth redirects often land on HTML login/paywall pages.
    text_head = ""
    try:
        text_head = data[:800].decode("utf-8", errors="replace")
    except Exception:
        text_head = ""
    if "<html" in text_head.lower() or "text/html" in content_type:
        if page_looks_paywalled(text_head) or "log in" in text_head.lower() or "sign in" in text_head.lower():
            raise MuseScoreDownloadUnavailable()
        if is_musicxml_text(text_head):
            return data.decode("utf-8", errors="replace")
        return None

    if is_mxl_bytes(data) or "mxl" in content_type or "zip" in content_type:
        return extract_musicxml_from_mxl_bytes(data)

    text = data.decode("utf-8", errors="replace")
    if is_musicxml_text(text):
        return text
    return None


async def fetch_musescore_url(url, on_progress=None, client=None):
    """
    Load a MuseScore.com score page and attempt an unauthenticated MusicXML/MXL download.
    Falls back to LibreScore if direct download fails.
    Returns a notation-style candidate with musicXml (abc empty for client conversion).
    """
    parsed = parse_musescore_score_url(url)
    if not parsed:
        raise ValueError("Not a supported MuseScore.com score URL")

    page_url = parsed["url"]
    score_id = parsed["scoreId"]
    await _emit_progress(on_progress, "musescore", "Fetching MuseScore score page...", 0.2)

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=MUSESCORE_FETCH_TIMEOUT_SECONDS)

    try:
        page = await fetch_html_with_fallback(client, page_url, allow_playwright=True)
        html = page.text or ""
        final_url = page.final_url or page_url

        if page.blocked_reason == "challenge_html":
            raise MuseScoreDownloadUnavailable(
                "MuseScore.com blocked automated access (bot challenge). "
                "Export MusicXML/.mxl from the site and import the file instead.",
                source="musescore.com"
            )
        if page.status >= 400 or not html.strip():
            raise MuseScoreDownloadUnavailable(
                "Could not load this MuseScore.com score page for download.",
                source="musescore.com"
            )

        meta = extract_musescore_page_meta(html, final_url)
        title = meta.get("title") or ""
        artist = meta.get("artist") or ""

        download_urls = extract_musicxml_download_urls(html, final_url)
        await _emit_progress(
            on_progress,
            "musescore",
            "Looking for a public MusicXML download...",
            0.55,
        )

        last_error = None
        for download_url in download_urls[:8]:
            try:
                response = await fetch_binary(client, download_url, referer=final_url)
                music_xml = await _musicxml_from_download_response(response)
                if music_xml:
                    await _emit_progress(on_progress, "musescore", "MuseScore MusicXML ready", 1.0)
                    return annotate_musescore_candidate(
                        music_xml,
                        title=title,
                        artist=artist,
                        source_url=page_url,
                        score_id=score_id,
                        source="musescore.com"
                    )
            except MuseScoreDownloadUnavailable as exc:
                last_error = exc
            except Exception as exc:
                last_error = exc
                continue

        # Direct .musicxml/.mxl on the score URL is rare but cheap to try.
        for ext in (".musicxml", ".mxl", ".xml"):
            guess = page_url.rstrip("/") + "/download" + ext
            try:
                response = await fetch_binary(client, guess, referer=final_url)
                music_xml = await _musicxml_from_download_response(response)
                if music_xml:
                    await _emit_progress(on_progress, "musescore", "MuseScore MusicXML ready", 1.0)
                    return annotate_musescore_candidate(
                        music_xml,
                        title=title,
                        artist=artist,
                        source_url=page_url,
                        score_id=score_id,
                        source="musescore.com"
                    )
            except MuseScoreDownloadUnavailable:
                raise
            except Exception:
                continue

        # If direct download fails, attempt LibreScore fallback
        if page_looks_paywalled(html) or last_error is not None:
            await _emit_progress(
                on_progress,
                "librescore",
                "Direct download failed. Attempting LibreScore fallback...",
                0.7
            )
            try:
                librescore_xml = await fetch_musescore_url_with_librescore(
                    score_id=score_id,
                    on_progress=on_progress,
                    client=client,
                    page_url=page_url,
                )
                if librescore_xml:
                    await _emit_progress(on_progress, "librescore", "LibreScore MusicXML ready", 1.0)
                    return annotate_musescore_candidate(
                        librescore_xml,
                        title=title,
                        artist=artist,
                        source_url=page_url,
                        score_id=score_id,
                        source="librescore"
                    )
            except MuseScoreDownloadUnavailable as librescore_exc:
                # LibreScore also failed, but we don't want to abort the search
                # The caller will handle this exception
                pass

        # All attempts failed
        if last_error is not None:
            raise last_error
        raise MuseScoreDownloadUnavailable(
            "No public MusicXML/.mxl download was found on this MuseScore.com page, "
            "and the LibreScore fallback was also unsuccessful. "
            "Export MusicXML from MuseScore.com and use Score file import.",
            source="musescore.com"
        )
    finally:
        if owns_client:
            await client.aclose()


def build_musescore_search_queries(title, artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    from notation_title_variants import notation_title_variants

    queries = []
    seen = set()
    for variant in notation_title_variants(title):
        quoted = '"{0}"'.format(variant)
        batch = [
            "site:musescore.com {0}".format(quoted),
            "site:musescore.com/scores {0}".format(quoted),
        ]
        if artist:
            batch.insert(0, "site:musescore.com {0} {1}".format(quoted, '"{0}"'.format(artist)))
        for query in batch:
            key = query.lower()
            if key in seen:
                continue
            seen.add(key)
            queries.append(query)
    return queries


def musescore_urls_from_search_results(results):
    ordered = []
    seen = set()
    for item in results or []:
        if not isinstance(item, dict):
            continue
        candidates = []
        for key in ("url", "href", "link"):
            if item.get(key):
                candidates.append(item.get(key))
        snippet = " ".join(
            str(item.get(key) or "")
            for key in ("snippet", "body", "title", "description")
        )
        candidates.extend(HTTP_URL_RE.findall(snippet))
        for raw in candidates:
            parsed = parse_musescore_score_url(raw)
            if not parsed:
                continue
            key = parsed["url"]
            if key in seen:
                continue
            seen.add(key)
            ordered.append(parsed["url"])
    return ordered


async def collect_musescore_candidates(client, title, artist="", on_progress=None):
    """Search the web for MuseScore.com scores and fetch publicly downloadable MusicXML."""
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []

    await _emit_progress(on_progress, "musescore", "Searching MuseScore.com...", 0.45)
    queries = build_musescore_search_queries(title, artist)
    score_urls = []
    tried = set()

    for query in queries:
        try:
            results = await search_web(client, query)
        except Exception:
            results = []
        for url in musescore_urls_from_search_results(results):
            if url in tried:
                continue
            tried.add(url)
            score_urls.append(url)
        if len(score_urls) >= MAX_MUSESCORE_SEARCH_URLS:
            break

    score_urls = score_urls[:MAX_MUSESCORE_SEARCH_URLS]
    if not score_urls:
        await _emit_progress(on_progress, "musescore", "No MuseScore.com results", 0.7)
        return []

    candidates = []
    total = len(score_urls)
    for index, score_url in enumerate(score_urls):
        await _emit_progress(
            on_progress,
            "musescore",
            "Trying MuseScore score {0}/{1}...".format(index + 1, total),
            0.5 + (0.35 * (index + 1) / max(total, 1)),
        )
        try:
            candidate = await fetch_musescore_url(
                score_url,
                on_progress=None,
                client=client,
            )
        except MuseScoreDownloadUnavailable:
            # LibreScore also failed or direct download was unavailable
            # This is not an error - we'll fall back to ABC/MIDI sources
            await _emit_progress(
                on_progress,
                "musescore",
                "Skipping gated MuseScore score...",
                0.5 + (0.35 * (index + 1) / max(total, 1)),
            )
            continue
        except Exception:
            # Unexpected error - skip this score but continue search
            continue
        if candidate:
            candidates.append(candidate)

    if candidates:
        await _emit_progress(on_progress, "musescore", "MuseScore candidates ready", 0.85)
    else:
        await _emit_progress(on_progress, "musescore", "No public MuseScore downloads", 0.85)
    return candidates
