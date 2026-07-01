import html
import re
from urllib.parse import quote, urlparse

import httpx

from recording_artists import discover_recording_artists, is_generic_artist

LYRICS_FETCH_TIMEOUT_SECONDS = 20.0
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

LYRICS_HOST_SUFFIXES = (
    "genius.com",
    "azlyrics.com",
    "lyrics.com",
    "songlyrics.com",
    "metrolyrics.com",
    "musixmatch.com",
)

NOISE_LINE_RE = re.compile(
    r"^(?:"
    r"\d+\s+contributors?|contributors?|translations?|embed|share|"
    r"writer(?:\(s\))?:.*|thanks to .*|"
    r"submit corrections?|correct these lyrics|"
    r"you might also like|advertisement|recommended|"
    r"if\s*\(\s*/android|document\.write|navigator\.useragent"
    r")$",
    re.I,
)

TRANSLATION_LANGUAGE_RE = re.compile(
    r"^(?:türkçe|español|português|deutsch|polski|українська|srpski|italiano|"
    r"česky|français|nederlands|русский|日本語|中文|한국어|العربية|"
    r"english|translation[s]?)$",
    re.I,
)

AZLYRICS_BODY_RE = re.compile(
    r"<!-- Usage of azlyrics\.com content.*?-->\s*(.*?)</div>",
    re.S | re.I,
)
GENIUS_CONTAINER_OPEN_RE = re.compile(
    r'<div[^>]*data-lyrics-container="true"[^>]*>',
    re.I,
)
DIV_TAG_RE = re.compile(r"<(/?)div\b[^>]*>", re.I)
LYRICS_COM_BODY_RE = re.compile(
    r'id="lyric-body-text"[^>]*>(.*?)</(?:p|div)>',
    re.S | re.I,
)


def is_allowed_lyrics_host(hostname):
    host = (hostname or "").lower()
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in LYRICS_HOST_SUFFIXES)


def validate_lyrics_page_url(raw_url):
    try:
        parsed = urlparse(raw_url)
    except Exception:
        return None, "Invalid URL"
    if parsed.scheme != "https":
        return None, "Only https URLs are allowed"
    if not is_allowed_lyrics_host(parsed.hostname):
        return None, "Lyrics URL host is not supported"
    return raw_url, None


def slugify_lyrics_path(value):
    text = (value or "").lower()
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def normalize_match_text(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def score_title_artist_match(candidate_title, candidate_artist, title, artist):
    title_key = normalize_match_text(title)
    artist_key = normalize_match_text(artist)
    candidate_title_key = normalize_match_text(candidate_title)
    candidate_artist_key = normalize_match_text(candidate_artist)
    score = 0

    if title_key and candidate_title_key:
        if candidate_title_key == title_key:
            score += 80
        elif title_key in candidate_title_key or candidate_title_key in title_key:
            score += 45

    if artist_key and candidate_artist_key:
        if candidate_artist_key == artist_key:
            score += 60
        elif artist_key in candidate_artist_key or candidate_artist_key in artist_key:
            score += 30

    return score


def html_to_text(fragment):
    text = re.sub(r"<br\s*/?>", "\n", fragment or "", flags=re.I)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = text.replace("\r", "")
    return text


def clean_lyrics_line(line):
    cleaned = (line or "").replace("\u00a0", " ").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def is_noise_line(line):
    if not line:
        return True
    if NOISE_LINE_RE.match(line):
        return True
    if TRANSLATION_LANGUAGE_RE.match(line):
        return True
    if len(line) > 180 and " " not in line:
        return True
    if "document.write" in line.lower() or "navigator.useragent" in line.lower():
        return True
    return False


def lines_to_stanzas(lines):
    stanzas = []
    current = []
    for line in lines:
        if not line:
            if current:
                stanzas.append(current)
                current = []
            continue
        current.append(line)
    if current:
        stanzas.append(current)
    return stanzas


def finalize_lyrics_lines(raw_lines):
    lines = []
    for raw_line in raw_lines:
        line = clean_lyrics_line(raw_line)
        if not line:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if is_noise_line(line):
            continue
        lines.append(line)

    while lines and lines[-1] == "":
        lines.pop()

    stanzas = lines_to_stanzas(lines)
    if not stanzas:
        return [], [], ""

    flat_lines = []
    for index, stanza in enumerate(stanzas):
        if index > 0:
            flat_lines.append("")
        flat_lines.extend(stanza)

    return stanzas, flat_lines, "\n".join(flat_lines)


def parse_plain_lyrics_text(text):
    raw_lines = (text or "").replace("\r", "").split("\n")
    return finalize_lyrics_lines(raw_lines)


def extract_azlyrics(html_text):
    match = AZLYRICS_BODY_RE.search(html_text or "")
    if not match:
        return None
    return html_to_text(match.group(1))


def balanced_div_inner(html_text, content_start):
    """Return the inner HTML of a <div> whose content begins at content_start,
    correctly skipping nested <div> elements (Genius wraps lyrics in a container
    that contains nested divs/spans, so a naive ``.*?</div>`` truncates them)."""
    depth = 1
    pos = content_start
    while True:
        match = DIV_TAG_RE.search(html_text, pos)
        if not match:
            return html_text[content_start:]
        if match.group(1) == "/":
            depth -= 1
            if depth == 0:
                return html_text[content_start:match.start()]
        else:
            depth += 1
        pos = match.end()


GENIUS_HEADER_PREFIX_RE = re.compile(r"^\s*[\d,]+\s+Contributors?", re.I)
GENIUS_HEADER_LYRICS_RE = re.compile(r"^\s*[\d,]+\s+Contributors?.*?\bLyrics\b", re.S | re.I)
GENIUS_FOOTER_RE = re.compile(r"\s*\d*\s*Embed\s*$", re.I)


def strip_genius_chrome(text):
    """Remove Genius page chrome that gets merged into the lyrics text:
    a leading "<n> Contributors ... <Title> Lyrics [Read More]" header and a
    trailing "<n>Embed" footer."""
    if GENIUS_HEADER_PREFIX_RE.match(text):
        head_window = text[:4000]
        read_more = head_window.rfind("Read More")
        if read_more != -1:
            text = text[read_more + len("Read More"):]
        else:
            header = GENIUS_HEADER_LYRICS_RE.match(text)
            if header:
                text = text[header.end():]
    text = GENIUS_FOOTER_RE.sub("", text)
    return text.lstrip()


def extract_genius(html_text):
    opens = list(GENIUS_CONTAINER_OPEN_RE.finditer(html_text or ""))
    if not opens:
        return None
    parts = []
    for match in opens:
        inner = balanced_div_inner(html_text, match.end())
        text = html_to_text(inner).strip()
        if text:
            parts.append(text)
    if not parts:
        return None
    return strip_genius_chrome("\n".join(parts))


def extract_lyrics_com(html_text):
    match = LYRICS_COM_BODY_RE.search(html_text or "")
    if not match:
        return None
    return html_to_text(match.group(1))


def extract_lyrics_from_html(html_text, page_url):
    host = (urlparse(page_url).hostname or "").lower()
    extracted = None
    if "azlyrics.com" in host:
        extracted = extract_azlyrics(html_text)
    elif "genius.com" in host:
        extracted = extract_genius(html_text)
    elif "lyrics.com" in host or "songlyrics.com" in host or "metrolyrics.com" in host:
        extracted = extract_lyrics_com(html_text)
    else:
        extracted = (
            extract_genius(html_text)
            or extract_azlyrics(html_text)
            or extract_lyrics_com(html_text)
        )
    if not extracted:
        return None
    _, _, text = parse_plain_lyrics_text(extracted)
    return text or None


def build_azlyrics_url(artist, title):
    artist_slug = slugify_lyrics_path(artist)
    title_slug = slugify_lyrics_path(title)
    if not artist_slug or not title_slug:
        return None
    return "https://www.azlyrics.com/lyrics/" + artist_slug + "/" + title_slug + ".html"


def build_lyrics_com_url(artist, title):
    artist_slug = re.sub(r"[^a-z0-9]+", "-", (artist or "").lower()).strip("-")
    title_slug = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    if not artist_slug or not title_slug:
        return None
    return "https://www.lyrics.com/lyrics/" + artist_slug + "/" + title_slug


def genius_song_candidates(search_payload, title, artist):
    candidates = []
    sections = (search_payload or {}).get("response", {}).get("sections", [])
    for section in sections:
        for hit in section.get("hits", []):
            if hit.get("type") != "song":
                continue
            result = hit.get("result") or {}
            song_title = result.get("title") or ""
            song_artist = result.get("primary_artist_names") or result.get("artist_names") or ""
            song_url = result.get("url") or ""
            if not song_url or "lyrics" not in song_url:
                continue
            score = score_title_artist_match(song_title, song_artist, title, artist)
            if score <= 0:
                continue
            candidates.append(
                {
                    "title": song_title,
                    "artist": song_artist,
                    "url": song_url,
                    "score": score,
                    "source": "genius.com",
                }
            )
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


async def fetch_text(client, url, headers=None):
    merged_headers = {"User-Agent": BROWSER_USER_AGENT}
    if headers:
        merged_headers.update(headers)
    response = await client.get(url, headers=merged_headers, follow_redirects=True)
    response.raise_for_status()
    return response.text


async def fetch_lyrics_ovh(client, artist, title):
    if not artist or not title:
        return None
    url = "https://api.lyrics.ovh/v1/" + quote(artist) + "/" + quote(title)
    response = await client.get(url, headers={"User-Agent": BROWSER_USER_AGENT})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    lyrics = payload.get("lyrics") if isinstance(payload, dict) else None
    if not isinstance(lyrics, str) or not lyrics.strip():
        return None
    _, _, text = parse_plain_lyrics_text(lyrics)
    if not text:
        return None
    return {
        "text": text,
        "source": "lyrics.ovh",
        "sourceUrl": url,
    }


async def fetch_genius_candidates(client, artist, title):
    query = " ".join(part for part in (artist, title) if part).strip()
    if not query:
        return []
    # Genius search/multi rejects per_page > 5 with HTTP 422.
    url = "https://genius.com/api/search/multi?per_page=5&q=" + quote(query)
    response = await client.get(url, headers={"User-Agent": BROWSER_USER_AGENT})
    response.raise_for_status()
    payload = response.json()
    return genius_song_candidates(payload, title, artist)


async def fetch_lyrics_from_page(client, page_url):
    validated, error = validate_lyrics_page_url(page_url)
    if error:
        raise ValueError(error)
    html_text = await fetch_text(client, validated)
    text = extract_lyrics_from_html(html_text, validated)
    if not text:
        return None
    host = urlparse(validated).hostname or ""
    return {
        "text": text,
        "source": host.replace("www.", ""),
        "sourceUrl": validated,
    }


async def _emit_progress(on_progress, stage, message, progress):
    if callable(on_progress):
        await on_progress(stage, message, progress)


def _build_lyrics_result(best, title, artist):
    stanzas, lines, text = parse_plain_lyrics_text(best["text"])
    if not text:
        raise ValueError("Lyrics page did not contain usable text")
    return {
        "text": text,
        "lines": lines,
        "stanzas": stanzas,
        "source": best.get("source") or "",
        "sourceUrl": best.get("sourceUrl") or "",
        "title": best.get("title") or title,
        "artist": best.get("artist") or artist,
    }


def _lyrics_preview(lines, max_lines=3):
    meaningful = [line for line in (lines or []) if str(line or "").strip()]
    return "\n".join(meaningful[:max_lines])


def _annotate_lyrics_candidate(result, title_only=False):
    annotated = dict(result)
    annotated["titleOnly"] = bool(title_only)
    annotated["preview"] = _lyrics_preview(result.get("lines") or [])
    return annotated


def _candidate_key(result):
    source_url = (result.get("sourceUrl") or "").strip().lower()
    if source_url:
        return source_url
    artist = normalize_match_text(result.get("artist"))
    text = normalize_match_text(result.get("text"))
    return artist + ":" + text[:120]


async def _search_lyrics_for_artist(client, title, artist):
    attempts = []

    ovh_result = None
    try:
        ovh_result = await fetch_lyrics_ovh(client, artist, title)
    except Exception:
        ovh_result = None
    if ovh_result:
        ovh_result["title"] = title
        ovh_result["artist"] = artist
        return _build_lyrics_result(ovh_result, title, artist)

    genius_candidates = []
    try:
        genius_candidates = await fetch_genius_candidates(client, artist, title)
    except Exception:
        genius_candidates = []
    for candidate in genius_candidates[:3]:
        try:
            page_result = await fetch_lyrics_from_page(client, candidate["url"])
        except Exception:
            page_result = None
        if page_result:
            page_result["title"] = candidate.get("title") or title
            page_result["artist"] = candidate.get("artist") or artist
            attempts.append(page_result)

    url_builders = (build_azlyrics_url, build_lyrics_com_url)
    for builder in url_builders:
        page_url = builder(artist, title)
        if not page_url:
            continue
        try:
            page_result = await fetch_lyrics_from_page(client, page_url)
        except Exception:
            page_result = None
        if page_result:
            page_result["title"] = title
            page_result["artist"] = artist
            attempts.append(page_result)

    if not attempts:
        return None
    return _build_lyrics_result(attempts[0], title, artist)


async def search_lyrics_with_candidates(title, on_progress=None):
    title = (title or "").strip()
    if not title:
        raise ValueError("Song title is required")

    await _emit_progress(on_progress, "start", "Starting lyrics search...", 0.05)

    async with httpx.AsyncClient(timeout=LYRICS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(
            on_progress,
            "search",
            "Discovering artists who recorded this song...",
            0.12,
        )
        artists = await discover_recording_artists(client, title)

        candidates = []
        seen = set()
        total_steps = max(len(artists), 1) + 1

        for index, search_artist in enumerate(artists):
            await _emit_progress(
                on_progress,
                "search",
                "Searching lyrics for {0}...".format(search_artist),
                0.15 + (0.55 * (index + 1) / total_steps),
            )
            result = await _search_lyrics_for_artist(client, title, search_artist)
            if not result:
                continue
            key = _candidate_key(result)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(_annotate_lyrics_candidate(result, title_only=False))

        await _emit_progress(
            on_progress,
            "search",
            "Searching lyrics by title...",
            0.78,
        )
        title_result = await _search_lyrics_for_artist(client, title, "")
        if title_result:
            key = _candidate_key(title_result)
            if key not in seen:
                candidates.append(_annotate_lyrics_candidate(title_result, title_only=True))

        if not candidates:
            await _emit_progress(on_progress, "done", "No lyrics found for this song", 1.0)
            raise ValueError("No lyrics found for this song")

        await _emit_progress(on_progress, "done", "Lyrics candidates ready", 1.0)
        return {
            "multiple": True,
            "candidates": candidates,
        }


async def search_lyrics(title, artist, on_progress=None):
    title = (title or "").strip()
    artist = (artist or "").strip()
    if not title:
        raise ValueError("Song title is required")

    if is_generic_artist(artist):
        return await search_lyrics_with_candidates(title, on_progress=on_progress)

    await _emit_progress(on_progress, "start", "Starting lyrics search...", 0.05)

    async with httpx.AsyncClient(timeout=LYRICS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "search", "Checking lyrics.ovh...", 0.15)
        result = await _search_lyrics_for_artist(client, title, artist)
        if not result:
            await _emit_progress(on_progress, "done", "No lyrics found for this song", 1.0)
            raise ValueError("No lyrics found for this song")
        await _emit_progress(on_progress, "done", "Lyrics found", 1.0)
        return result


async def fetch_lyrics_url(url, on_progress=None):
    await _emit_progress(on_progress, "fetch", "Fetching lyrics page...", 0.15)
    async with httpx.AsyncClient(timeout=LYRICS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "extract", "Extracting lyrics...", 0.55)
        page_result = await fetch_lyrics_from_page(client, url)
        if not page_result:
            await _emit_progress(on_progress, "done", "Could not extract lyrics from that page", 1.0)
            raise ValueError("Could not extract lyrics from that page")
        result = _build_lyrics_result(page_result, "", "")
        await _emit_progress(on_progress, "done", "Lyrics found", 1.0)
        return result
