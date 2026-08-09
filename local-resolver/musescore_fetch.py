"""Fetch public MuseScore.com scores as MusicXML (direct download + LibreScore)."""

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
from musescore_convert import (
    MuseScoreDownloadUnavailable,
    _convert_score_file_to_musicxml,
    convert_midi_bytes_to_musicxml_via_musescore,
    extract_musicxml_from_mxl_bytes,
    is_musicxml_text,
    is_mxl_bytes,
)
from polite_fetch import browser_headers
from tune_background_research import search_web

MUSESCORE_FETCH_TIMEOUT_SECONDS = 20.0
MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS = 90.0
MAX_MUSESCORE_SEARCH_URLS = 5
MUSESCORE_HOST_SUFFIXES = ("musescore.com",)
# LibreScore URL downloads currently allow midi/mp3/pdf only; MIDI converts well to ABC.
LIBRESCORE_TYPE_ATTEMPTS = (("midi",),)
LIBRESCORE_URL_TYPE_BLOCKED_RE = re.compile(
    r"only\s+midi,\s*mp3,\s*and\s*pdf\s+are\s+downloadable\s+from\s+a\s+url",
    re.I,
)

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
    "get pro",
    "try pro",
)
OFFICIAL_PAYWALL_MARKERS = (
    "official score",
    "licensed from",
    "musescore credits",
    "purchase this score",
    "buy this score",
    "pay to download",
)
OFFICIAL_JSON_MARKERS = (
    '"isofficial":true',
    '"is_official":true',
    '"officialscore":true',
    '"scoretype":"official"',
    '"type":"official"',
)
PRO_JSON_MARKERS = (
    '"ispro":true',
    '"is_pro":true',
    '"requirepro":true',
    '"proonly":true',
    '"needspro":true',
    '"downloadrequirespro":true',
)
FREE_ACCOUNT_MARKERS = (
    "public domain",
    "creative commons",
    '"isdownloadable":true',
    '"can_download":true',
    '"allowdownload":true',
)
MUSESCORE_PAYWALLED_ACCESS_TIERS = frozenset(("pro_required", "paid_official"))


async def _emit_progress(on_progress, stage, message, progress):
    if on_progress:
        await on_progress(stage, message, progress)


def librescore_input_urls(score_id, page_url=""):
    """Candidate MuseScore URLs for dl-librescore -i."""
    urls = []
    page = str(page_url or "").strip()
    if page:
        urls.append(page.split("?")[0].rstrip("/"))
    sid = str(score_id or "").strip()
    if sid:
        urls.append("https://musescore.com/score/{0}".format(sid))
    ordered = []
    seen = set()
    for url in urls:
        key = url.lower()
        if not url or key in seen:
            continue
        seen.add(key)
        ordered.append(url)
    return ordered


def build_librescore_cli_command(input_url, output_dir, types):
    """Build npx dl-librescore argv using current -i/-t/-o flags."""
    type_list = [str(t) for t in (types or ()) if str(t).strip()]
    if not type_list:
        type_list = ["midi"]
    return [
        "npx",
        "--yes",
        "dl-librescore@latest",
        "-i",
        str(input_url),
        "-t",
        *type_list,
        "-o",
        str(output_dir),
    ]


def _find_downloaded_score_files(output_dir):
    """Return downloaded score paths (musicxml/mxl/mscz/midi), deepest files first."""
    found = []
    for root, _dirs, files in os.walk(output_dir):
        for name in files:
            lower = name.lower()
            if lower.endswith((
                ".musicxml", ".mxl", ".xml", ".mscz", ".mscx", ".mid", ".midi",
            )):
                found.append(os.path.join(root, name))
    # Prefer notation formats over midi when both exist.
    def rank(path):
        lower = path.lower()
        if lower.endswith((".musicxml", ".xml")):
            return 0
        if lower.endswith(".mxl"):
            return 1
        if lower.endswith((".mscz", ".mscx")):
            return 2
        return 3
    found.sort(key=rank)
    return found


def _convert_mscz_to_musicxml(mscz_file, temp_dir):
    return _convert_score_file_to_musicxml(mscz_file, temp_dir, output_stem="output")


def _musicxml_from_librescore_file(path, temp_dir):
    lower = path.lower()
    if lower.endswith((".musicxml", ".xml", ".mscx")):
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            text = handle.read()
        if is_musicxml_text(text):
            return text
        raise MuseScoreDownloadUnavailable(
            "LibreScore downloaded XML that is not valid MusicXML.",
            source="librescore",
        )
    if lower.endswith(".mxl"):
        with open(path, "rb") as handle:
            return extract_musicxml_from_mxl_bytes(handle.read())
    if lower.endswith(".mscz"):
        return _convert_mscz_to_musicxml(path, temp_dir)
    if lower.endswith((".mid", ".midi")):
        from midi_convert import convert_midi_bytes_to_musicxml_sync
        with open(path, "rb") as handle:
            midi_bytes = handle.read()
        return convert_midi_bytes_to_musicxml_sync(midi_bytes)[0]
    raise MuseScoreDownloadUnavailable(
        "LibreScore downloaded an unsupported file type.",
        source="librescore",
    )


async def fetch_musescore_url_with_librescore(score_id, on_progress=None, client=None, page_url=""):
    """
    Attempt to fetch a MuseScore score using LibreScore's dl-librescore CLI.
    Uses -i/-t/-o flags. Tries MIDI first (currently the only reliable URL type),
    then MusicXML / MSCZ when available.
    """
    del client  # reserved for future authenticated fetches
    await _emit_progress(on_progress, "librescore", "Attempting download via LibreScore...", 0.3)
    input_urls = librescore_input_urls(score_id, page_url)
    if not input_urls:
        raise MuseScoreDownloadUnavailable(
            "No MuseScore score URL available for LibreScore.",
            source="librescore",
        )

    last_error = ""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            for input_url in input_urls:
                for types in LIBRESCORE_TYPE_ATTEMPTS:
                    output_dir = os.path.join(
                        temp_dir,
                        "out_{0}_{1}".format(
                            abs(hash(input_url)) % 100000,
                            "_".join(types),
                        ),
                    )
                    os.makedirs(output_dir, exist_ok=True)
                    cmd = build_librescore_cli_command(input_url, output_dir, types)
                    await _emit_progress(
                        on_progress,
                        "librescore",
                        "LibreScore downloading {0}...".format(", ".join(types)),
                        0.4,
                    )
                    try:
                        result = subprocess.run(
                            cmd,
                            capture_output=True,
                            text=True,
                            timeout=MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS,
                        )
                    except FileNotFoundError:
                        raise MuseScoreDownloadUnavailable(
                            "The 'npx' command was not found. Node.js is required for the LibreScore fallback.",
                            source="librescore",
                        )
                    except subprocess.TimeoutExpired:
                        last_error = "LibreScore download timed out."
                        continue

                    combined = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()
                    files = _find_downloaded_score_files(output_dir)
                    if not files:
                        last_error = combined or "LibreScore produced no score files."
                        # URL downloads currently reject musicxml/mscz — skip those types.
                        if LIBRESCORE_URL_TYPE_BLOCKED_RE.search(combined):
                            break
                        continue

                    for path in files:
                        try:
                            music_xml = _musicxml_from_librescore_file(path, temp_dir)
                            if music_xml and is_musicxml_text(music_xml):
                                return music_xml
                        except MuseScoreDownloadUnavailable as exc:
                            last_error = str(exc)
                            continue
                        except Exception as exc:
                            last_error = str(exc)
                            continue

                    if result.returncode != 0 and combined:
                        last_error = combined
                        if LIBRESCORE_URL_TYPE_BLOCKED_RE.search(combined):
                            break

            raise MuseScoreDownloadUnavailable(
                last_error or "LibreScore could not download this MuseScore score.",
                source="librescore",
            )
    except MuseScoreDownloadUnavailable:
        raise
    except Exception as e:
        raise MuseScoreDownloadUnavailable(
            "LibreScore fallback failed: {0}".format(str(e)),
            source="librescore",
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


def _clean_html_text(value):
    text = TAG_RE.sub(" ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text


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


def classify_musescore_download_access(html):
    """
    Best-effort classification of MuseScore download access from public page HTML.

    Returns one of: paid_official, pro_required, account_free, unknown.
    """
    text = str(html or "")
    if not text.strip():
        return "unknown"
    lower = text[:50000].lower()

    if any(marker in lower for marker in OFFICIAL_PAYWALL_MARKERS):
        return "paid_official"
    if any(marker in lower for marker in OFFICIAL_JSON_MARKERS):
        return "paid_official"
    if re.search(r"official\s+score", lower):
        return "paid_official"
    if re.search(r"(purchase|buy).{0,40}(score|download)", lower):
        return "paid_official"
    if re.search(r"(credits?).{0,40}(download|score)", lower) and "musescore" in lower:
        return "paid_official"

    if page_looks_paywalled(html):
        return "pro_required"
    if any(marker in lower for marker in PRO_JSON_MARKERS):
        return "pro_required"

    if any(marker in lower for marker in FREE_ACCOUNT_MARKERS):
        return "account_free"
    if extract_musicxml_download_urls(html):
        return "account_free"

    return "unknown"


def is_paywalled_access_tier(access_tier):
    return str(access_tier or "").strip().lower() in MUSESCORE_PAYWALLED_ACCESS_TIERS


def manual_reason_for_access_tier(access_tier):
    if is_paywalled_access_tier(access_tier):
        return "paywall"
    return "blocked"


def build_musescore_manual_candidate(page_url, title="", access_tier="unknown"):
    tier = str(access_tier or "unknown").strip().lower() or "unknown"
    return {
        "url": str(page_url or "").strip(),
        "title": str(title or "").strip(),
        "source": "musescore.com",
        "host": "musescore.com",
        "reason": manual_reason_for_access_tier(tier),
        "accessTier": tier,
        "contentType": "notation",
    }


def actionable_musescore_manual_candidates(manual_candidates):
    """Manual MuseScore imports that may work with a basic free account."""
    ordered = []
    for item in manual_candidates or []:
        if not isinstance(item, dict) or not item.get("url"):
            continue
        tier = item.get("accessTier") or "unknown"
        if is_paywalled_access_tier(tier):
            continue
        ordered.append(item)
    return ordered


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
    Always falls back to LibreScore when direct download is missing, gated, or blocked.
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

    title = ""
    artist = ""
    html = ""
    last_error = None
    page_error = None

    try:
        try:
            page = await fetch_html_with_fallback(client, page_url, allow_playwright=True)
            html = page.text or ""
            final_url = page.final_url or page_url

            if page.blocked_reason == "challenge_html" or page.blocked_reason == "http_status":
                page_error = MuseScoreDownloadUnavailable(
                    "MuseScore.com blocked automated access ({0}). "
                    "Trying LibreScore fallback...".format(page.blocked_reason),
                    source="musescore.com",
                )
            elif page.status >= 400 or not html.strip():
                page_error = MuseScoreDownloadUnavailable(
                    "Could not load this MuseScore.com score page for download.",
                    source="musescore.com",
                )
            else:
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
                                source="musescore.com",
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
                                source="musescore.com",
                            )
                    except MuseScoreDownloadUnavailable as exc:
                        last_error = exc
                    except Exception:
                        continue
        except MuseScoreDownloadUnavailable as exc:
            page_error = exc
        except Exception as exc:
            page_error = MuseScoreDownloadUnavailable(str(exc), source="musescore.com")

        # Always try LibreScore when direct download did not produce MusicXML
        # (empty downloads, paywall, 403/bot block, or download errors).
        await _emit_progress(
            on_progress,
            "librescore",
            "Direct download unavailable. Attempting LibreScore fallback...",
            0.7,
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
                    source="librescore",
                )
        except MuseScoreDownloadUnavailable as librescore_exc:
            last_error = librescore_exc

        access_tier = classify_musescore_download_access(html) if html else "unknown"

        def _with_tier(exc):
            if not isinstance(exc, MuseScoreDownloadUnavailable):
                return exc
            if exc.access_tier != "unknown" or access_tier == "unknown":
                return exc
            return MuseScoreDownloadUnavailable(
                str(exc),
                source=exc.source,
                access_tier=access_tier,
            )

        if isinstance(last_error, MuseScoreDownloadUnavailable):
            raise _with_tier(last_error)
        if isinstance(page_error, MuseScoreDownloadUnavailable):
            raise _with_tier(page_error)
        raise MuseScoreDownloadUnavailable(
            "No public MusicXML/.mxl download was found on this MuseScore.com page, "
            "and the LibreScore fallback was also unsuccessful. "
            "Export MusicXML from MuseScore.com and use Score file import.",
            source="musescore.com",
            access_tier=access_tier,
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
    """Search the web for MuseScore.com scores and fetch publicly downloadable MusicXML.

    Returns ``{"candidates": [...], "manualCandidates": [...]}``.
    Gated scores (no public download / LibreScore miss) are listed as
    ``manualCandidates`` so the client can prompt open-link + paste / .mscz import.
    """
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return {"candidates": [], "manualCandidates": []}

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
        return {"candidates": [], "manualCandidates": []}

    candidates = []
    manual_candidates = []
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
                on_progress=on_progress,
                client=client,
            )
        except MuseScoreDownloadUnavailable as exc:
            await _emit_progress(
                on_progress,
                "musescore",
                "MuseScore score needs manual download...",
                0.5 + (0.35 * (index + 1) / max(total, 1)),
            )
            parsed = parse_musescore_score_url(score_url)
            page_url = (parsed or {}).get("url") or score_url
            manual_candidates.append(build_musescore_manual_candidate(
                page_url,
                title=title,
                access_tier=getattr(exc, "access_tier", "unknown"),
            ))
            continue
        except Exception:
            continue
        if candidate:
            candidates.append(candidate)

    if candidates:
        await _emit_progress(on_progress, "musescore", "MuseScore candidates ready", 0.85)
    elif manual_candidates:
        await _emit_progress(
            on_progress,
            "musescore",
            "MuseScore scores found (manual download required)",
            0.85,
        )
    else:
        await _emit_progress(on_progress, "musescore", "No public MuseScore downloads", 0.85)
    return {"candidates": candidates, "manualCandidates": manual_candidates}
