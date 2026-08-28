import html
import re
import time
import unicodedata
from urllib.parse import quote, urlparse

import httpx

from browser_fetch import fetch_html_with_fallback, is_manual_only_host, is_playwright_eligible_host
from polite_fetch import BROWSER_USER_AGENT
from recording_artists import discover_recording_artists, is_generic_artist
from chord_sheet_utils import normalize_lyric_blocks

LYRICS_FETCH_TIMEOUT_SECONDS = 20.0
# Cap page scrapes so a blocked Genius/AZLyrics cascade cannot hang the client.
LYRICS_SCRAPE_BUDGET_SECONDS = 35.0
LRCLIB_USER_AGENT = "ABC2BookResolver/1.0 (+https://tunebook.net)"

LYRICS_HOST_SUFFIXES = (
    "genius.com",
    "azlyrics.com",
    "lyrics.com",
    "songlyrics.com",
    "metrolyrics.com",
    "musixmatch.com",
    "letras.mus.br",
    "letras.com",
    "lyricsmode.com",
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

TAB_STAFF_LINE_RE = re.compile(r"^[eadgbEADGB]\s*\|[-0-9hpbrx/\\~().=*sS\s|]+$")
NNTP_HEADER_RE = re.compile(
    r"^(?:Path|Newsgroups|Message-ID|Xref|NNTP-Posting-Host|Organization|"
    r"Reply-To|Followup-To|References|X-Newsreader)\s*:",
    re.I,
)
USENET_ARTICLE_RE = re.compile(r"^Article:\s*\d+", re.I)
TAB_SUBJECT_RE = re.compile(r"\bTAB\s*:", re.I)
GUITAR_TECH_RE = re.compile(
    r"\b(?:pull-?offs?|hammer-?ons?|slide|bends?|tremolo|barre|barres|"
    r"fingering|adagio\s+sostenuto)\b",
    re.I,
)
FINGER_ONLY_RE = re.compile(r"^(?:[1-4]\s*){2,}$")
ROMAN_BARRE_RE = re.compile(r"^(?:I{1,3}|IV|VI{0,3}|IX|X{0,3})\.{2,}")
MOSTLY_SYMBOL_RE = re.compile(r"^[\d\s|./\\~\-=*hpbrxX()]+$")


def _strip_accents(text):
    normalized = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def is_no_lyrics_placeholder_line(line):
    """Site placeholders like letras.mus.br instrumental notices — not lyrics."""
    collapsed = re.sub(r"\s+", " ", _strip_accents(str(line or "").strip())).lower()
    if not collapsed:
        return False
    if re.match(r"^musica instrumental$", collapsed):
        return True
    if re.match(r"^esta (musica|cancion) (nao possui|no tiene) letra$", collapsed):
        return True
    if re.match(
        r"^musica instrumental esta (musica|cancion) (nao possui|no tiene) letra$",
        collapsed,
    ):
        return True
    if re.match(r"^this (song|track) (has no|does not have) lyrics?$", collapsed):
        return True
    if re.match(r"^(no lyrics?( available| found| yet)?|lyrics? not available)$", collapsed):
        return True
    if re.match(r"^there are no lyrics", collapsed):
        return True
    if collapsed == "instrumental":
        return True
    flat = re.sub(r"\s+", "", collapsed)
    if re.search(r"musicainstrumental(estamusica|estacancion)", flat):
        return True
    if "musicainstrumental" in flat and re.search(r"naopossuiletra|notieneletra|semletra", flat):
        return True
    return False


def looks_like_no_lyrics_placeholder(lines_or_text):
    if isinstance(lines_or_text, str):
        lines = [ln.strip() for ln in lines_or_text.replace("\r", "").split("\n") if ln.strip()]
    else:
        lines = [str(ln or "").strip() for ln in (lines_or_text or []) if str(ln or "").strip()]
    if not lines:
        return True
    if all(is_no_lyrics_placeholder_line(line) for line in lines):
        return True
    if len(lines) <= 2:
        content = [line for line in lines if not is_no_lyrics_placeholder_line(line)]
        if not content:
            return True
    return False


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
SONGLYRICS_OPEN_RE = re.compile(
    r'<(?P<tag>p|div)[^>]*\bid=["\']songLyricsDiv["\'][^>]*>',
    re.I,
)
METROLYRICS_OPEN_RE = re.compile(
    r'<div[^>]*(?:\bid=["\']lyrics-body-text["\']|class=["\'][^"\']*lyrics-body[^"\']*["\'])[^>]*>',
    re.I,
)
MUSIXMATCH_OPEN_RE = re.compile(
    r'<(?P<tag>span|div)[^>]*class=["\'][^"\']*(?:lyrics__content|mxm-lyrics)[^"\']*["\'][^>]*>',
    re.I,
)
LETRAS_OPEN_RE = re.compile(
    r'<div[^>]*class=["\'][^"\']*(?:lyric-original|cnt-letra)[^"\']*["\'][^>]*>',
    re.I,
)
LYRICSMODE_OPEN_RE = re.compile(
    r'<(?P<tag>p|div|pre)[^>]*(?:\bid=["\']lyrics_text["\']|class=["\'][^"\']*ui-annotatable[^"\']*["\'])[^>]*>',
    re.I,
)
LRC_TIMESTAMP_RE = re.compile(r"\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]")
OPEN_TAG_NAME_RE = re.compile(r"^<(?P<tag>[a-z0-9]+)\b", re.I)


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


def slugify_hyphen_path(value):
    return re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")


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
    if is_no_lyrics_placeholder_line(line):
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


def is_tab_staff_line(line):
    return bool(TAB_STAFF_LINE_RE.match(str(line or "").strip()))


def is_usenet_or_tab_meta_line(line):
    text = str(line or "").strip()
    if not text:
        return False
    if NNTP_HEADER_RE.match(text):
        return True
    if USENET_ARTICLE_RE.match(text):
        return True
    if TAB_SUBJECT_RE.search(text):
        return True
    if FINGER_ONLY_RE.match(text):
        return True
    if ROMAN_BARRE_RE.match(text):
        return True
    return False


def looks_like_non_lyric_dump(lines_or_text):
    if isinstance(lines_or_text, str):
        lines = [ln.strip() for ln in lines_or_text.replace("\r", "").split("\n") if ln.strip()]
    else:
        lines = [str(ln or "").strip() for ln in (lines_or_text or []) if str(ln or "").strip()]
    if len(lines) < 4:
        return False

    tab_staff = 0
    meta = 0
    tech = 0
    symbol_heavy = 0
    for line in lines:
        if is_tab_staff_line(line):
            tab_staff += 1
        elif is_usenet_or_tab_meta_line(line):
            meta += 1
        elif GUITAR_TECH_RE.search(line):
            tech += 1
        elif len(line) >= 8 and MOSTLY_SYMBOL_RE.match(line):
            symbol_heavy += 1

    if tab_staff >= 2:
        return True
    if meta >= 2:
        return True
    if tab_staff >= 1 and (meta >= 1 or tech >= 2):
        return True
    if tech >= 3 and symbol_heavy >= 3:
        return True
    dumpish = tab_staff + meta + tech + symbol_heavy
    if len(lines) >= 20 and dumpish / float(len(lines)) >= 0.35:
        return True
    joined = "\n".join(lines)
    if re.search(r"Newsgroups\s*:", joined, re.I) and re.search(r"Message-ID\s*:", joined, re.I):
        return True
    if re.search(r"\bTAB\s*:", joined, re.I) and tab_staff + tech >= 2:
        return True
    return False


def is_usable_lyric_content(lines_or_text):
    if isinstance(lines_or_text, str):
        raw = lines_or_text.replace("\r", "").split("\n")
    else:
        raw = list(lines_or_text or [])
    kept = []
    for line in raw:
        text = str(line or "")
        trimmed = text.strip()
        if not trimmed:
            if kept and kept[-1] != "":
                kept.append("")
            continue
        if is_tab_staff_line(trimmed) or is_usenet_or_tab_meta_line(trimmed):
            continue
        kept.append(re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip())
    while kept and kept[-1] == "":
        kept.pop()
    if not any(str(line or "").strip() for line in kept):
        return False, []
    if looks_like_no_lyrics_placeholder(kept) or looks_like_no_lyrics_placeholder(raw):
        return False, []
    if looks_like_non_lyric_dump(kept) or looks_like_non_lyric_dump(raw):
        return False, []
    return True, kept


def blocks_to_stanzas(lines):
    return [block for block in normalize_lyric_blocks(lines) if block]


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
        if is_tab_staff_line(line) or is_usenet_or_tab_meta_line(line):
            continue
        lines.append(line)

    while lines and lines[-1] == "":
        lines.pop()

    ok, usable = is_usable_lyric_content(raw_lines)
    if not ok:
        return [], [], ""
    ok2, usable2 = is_usable_lyric_content(lines)
    if not ok2:
        return [], [], ""
    lines = usable2 or usable or lines

    stanzas = blocks_to_stanzas(lines)
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


def strip_lrc_tags(text):
    cleaned = LRC_TIMESTAMP_RE.sub("", text or "")
    return "\n".join(line.rstrip() for line in cleaned.split("\n"))


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


def _tag_name_from_open(match):
    if "tag" in match.groupdict() and match.group("tag"):
        return match.group("tag").lower()
    named = OPEN_TAG_NAME_RE.match(match.group(0) or "")
    if named:
        return named.group("tag").lower()
    return "div"


def _extract_open_matches(html_text, open_re):
    opens = list(open_re.finditer(html_text or ""))
    if not opens:
        return None
    parts = []
    for match in opens:
        tag = _tag_name_from_open(match)
        if tag == "div":
            inner = balanced_div_inner(html_text, match.end())
        else:
            close = re.search(r"</" + re.escape(tag) + r"\s*>", html_text[match.end():], re.I)
            if close:
                inner = html_text[match.end():match.end() + close.start()]
            else:
                inner = html_text[match.end():]
        text = html_to_text(inner).strip()
        if text:
            parts.append(text)
    if not parts:
        return None
    return "\n".join(parts)


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


def extract_songlyrics(html_text):
    return _extract_open_matches(html_text, SONGLYRICS_OPEN_RE)


def extract_metrolyrics(html_text):
    return _extract_open_matches(html_text, METROLYRICS_OPEN_RE)


def extract_musixmatch(html_text):
    return _extract_open_matches(html_text, MUSIXMATCH_OPEN_RE)


def extract_letras(html_text):
    return _extract_open_matches(html_text, LETRAS_OPEN_RE)


def extract_lyricsmode(html_text):
    return _extract_open_matches(html_text, LYRICSMODE_OPEN_RE)


def extract_lyrics_from_html(html_text, page_url):
    host = (urlparse(page_url).hostname or "").lower()
    extracted = None
    if "azlyrics.com" in host:
        extracted = extract_azlyrics(html_text)
    elif "genius.com" in host:
        extracted = extract_genius(html_text)
    elif "songlyrics.com" in host:
        extracted = extract_songlyrics(html_text) or extract_lyrics_com(html_text)
    elif "metrolyrics.com" in host:
        extracted = extract_metrolyrics(html_text) or extract_lyrics_com(html_text)
    elif "musixmatch.com" in host:
        extracted = extract_musixmatch(html_text)
    elif "letras.mus.br" in host or "letras.com" in host:
        extracted = extract_letras(html_text)
    elif "lyricsmode.com" in host:
        extracted = extract_lyricsmode(html_text)
    elif "lyrics.com" in host:
        extracted = extract_lyrics_com(html_text)
    else:
        extracted = (
            extract_genius(html_text)
            or extract_azlyrics(html_text)
            or extract_letras(html_text)
            or extract_lyricsmode(html_text)
            or extract_songlyrics(html_text)
            or extract_metrolyrics(html_text)
            or extract_musixmatch(html_text)
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
    artist_slug = slugify_hyphen_path(artist)
    title_slug = slugify_hyphen_path(title)
    if not artist_slug or not title_slug:
        return None
    return "https://www.lyrics.com/lyrics/" + artist_slug + "/" + title_slug


def build_letras_url(artist, title):
    artist_slug = slugify_hyphen_path(artist)
    title_slug = slugify_hyphen_path(title)
    if not artist_slug or not title_slug:
        return None
    return "https://www.letras.mus.br/" + artist_slug + "/" + title_slug + "/"


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


def _host_label(url):
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host


def _manual_candidate(url, title="", artist="", reason="blocked"):
    host = _host_label(url)
    return {
        "url": url,
        "title": title or "",
        "artist": artist or "",
        "source": host,
        "host": host,
        "reason": reason,
        "contentType": "lyrics",
    }


def _append_manual_candidate(manual_candidates, url, title="", artist="", reason="blocked"):
    if not url or manual_candidates is None:
        return
    key = (url or "").strip().lower()
    for existing in manual_candidates:
        if (existing.get("url") or "").strip().lower() == key:
            return
    manual_candidates.append(_manual_candidate(url, title=title, artist=artist, reason=reason))


def _empty_lyrics_payload(manual_candidates):
    return {
        "empty": True,
        "found": False,
        "manualCandidates": list(manual_candidates or []),
    }


async def _emit_progress(on_progress, stage, message, progress):
    if callable(on_progress):
        await on_progress(stage, message, progress)


async def fetch_text(client, url, headers=None, on_progress=None, allow_playwright=True):
    host = urlparse(url).hostname or ""
    if is_manual_only_host(host):
        raise ValueError("Host requires manual paste: {0}".format(_host_label(url)))

    referer = None
    if headers and headers.get("Referer"):
        referer = headers.get("Referer")

    # Prefer a single fallback call; emit browser stage only when Playwright may run.
    if allow_playwright and is_playwright_eligible_host(host):
        result = await fetch_html_with_fallback(client, url, referer=referer, allow_playwright=False)
        if not (
            result.blocked_reason == "none" and (result.text or "").strip()
        ) and result.blocked_reason in {"http_status", "challenge_html", "empty"}:
            await _emit_progress(
                on_progress,
                "browser",
                "Opening browser fallback...",
                None,
            )
            result = await fetch_html_with_fallback(client, url, referer=referer, allow_playwright=True)
    else:
        result = await fetch_html_with_fallback(
            client,
            url,
            referer=referer,
            allow_playwright=allow_playwright,
        )

    if result.blocked_reason in {"challenge_html", "empty", "http_status"} and not (result.text or "").strip():
        raise ValueError("Blocked or empty response from {0}".format(url))
    return result.text


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


async def fetch_lrclib(client, artist, title):
    if not title:
        return None
    url = "https://lrclib.net/api/search?track_name=" + quote(title)
    if artist:
        url += "&artist_name=" + quote(artist)
    response = await client.get(url, headers={"User-Agent": LRCLIB_USER_AGENT})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return None
    for hit in payload:
        if not isinstance(hit, dict) or hit.get("instrumental"):
            continue
        lyrics = hit.get("plainLyrics")
        if not isinstance(lyrics, str) or not lyrics.strip():
            synced = hit.get("syncedLyrics")
            if isinstance(synced, str) and synced.strip():
                lyrics = strip_lrc_tags(synced)
            else:
                continue
        else:
            lyrics = strip_lrc_tags(lyrics) if LRC_TIMESTAMP_RE.search(lyrics) else lyrics
        _, _, text = parse_plain_lyrics_text(lyrics)
        if not text:
            continue
        source_url = "https://lrclib.net/api/search?track_name=" + quote(title)
        if artist:
            source_url += "&artist_name=" + quote(artist)
        return {
            "text": text,
            "source": "lrclib.net",
            "sourceUrl": source_url,
        }
    return None


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


async def fetch_lyrics_from_page(client, page_url, on_progress=None, manual_candidates=None, title="", artist=""):
    host = urlparse(page_url).hostname or ""
    if is_manual_only_host(host):
        _append_manual_candidate(
            manual_candidates,
            page_url,
            title=title,
            artist=artist,
            reason="blocked",
        )
        return None

    validated, error = validate_lyrics_page_url(page_url)
    if error:
        raise ValueError(error)

    await _emit_progress(on_progress, "fetch", "Fetching lyrics page...", None)
    try:
        html_text = await fetch_text(client, validated, on_progress=on_progress)
    except ValueError:
        _append_manual_candidate(
            manual_candidates,
            validated,
            title=title,
            artist=artist,
            reason="challenge",
        )
        raise

    text = extract_lyrics_from_html(html_text, validated)
    if not text:
        return None
    host_label = _host_label(validated)
    page_title = title
    try:
        from page_title_meta import conservative_page_title

        page_title = conservative_page_title(html_text, title, fallback=title) or title
    except Exception:
        page_title = title
    return {
        "text": text,
        "source": host_label,
        "sourceUrl": validated,
        "title": page_title,
        "artist": artist,
    }


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


async def _search_lyrics_for_artist(client, title, artist, on_progress=None):
    attempts = []
    manual_candidates = []
    scrape_deadline = time.monotonic() + LYRICS_SCRAPE_BUDGET_SECONDS

    await _emit_progress(on_progress, "apis", "Trying lyrics APIs...", None)

    lrclib_result = None
    try:
        lrclib_result = await fetch_lrclib(client, artist, title)
    except Exception:
        lrclib_result = None
    if lrclib_result:
        lrclib_result["title"] = title
        lrclib_result["artist"] = artist
        return _build_lyrics_result(lrclib_result, title, artist), manual_candidates

    ovh_result = None
    try:
        ovh_result = await fetch_lyrics_ovh(client, artist, title)
    except Exception:
        ovh_result = None
    if ovh_result:
        ovh_result["title"] = title
        ovh_result["artist"] = artist
        return _build_lyrics_result(ovh_result, title, artist), manual_candidates

    genius_candidates = []
    try:
        genius_candidates = await fetch_genius_candidates(client, artist, title)
    except Exception:
        genius_candidates = []
    for candidate in genius_candidates[:3]:
        if time.monotonic() > scrape_deadline:
            break
        page_url = candidate.get("url") or ""
        if is_manual_only_host(urlparse(page_url).hostname or ""):
            _append_manual_candidate(
                manual_candidates,
                page_url,
                title=candidate.get("title") or title,
                artist=candidate.get("artist") or artist,
                reason="blocked",
            )
            continue
        try:
            page_result = await fetch_lyrics_from_page(
                client,
                page_url,
                on_progress=on_progress,
                manual_candidates=manual_candidates,
                title=candidate.get("title") or title,
                artist=candidate.get("artist") or artist,
            )
        except Exception:
            page_result = None
        if page_result:
            page_result["title"] = candidate.get("title") or title
            page_result["artist"] = candidate.get("artist") or artist
            attempts.append(page_result)

    url_builders = (build_azlyrics_url, build_lyrics_com_url, build_letras_url)
    for builder in url_builders:
        if time.monotonic() > scrape_deadline:
            break
        page_url = builder(artist, title)
        if not page_url:
            continue
        try:
            page_result = await fetch_lyrics_from_page(
                client,
                page_url,
                on_progress=on_progress,
                manual_candidates=manual_candidates,
                title=title,
                artist=artist,
            )
        except Exception:
            page_result = None
        if page_result:
            page_result["title"] = title
            page_result["artist"] = artist
            attempts.append(page_result)

    if attempts:
        return _build_lyrics_result(attempts[0], title, artist), manual_candidates
    return None, manual_candidates


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
        all_manual = []
        total_steps = max(len(artists), 1) + 1

        for index, search_artist in enumerate(artists):
            await _emit_progress(
                on_progress,
                "search",
                "Searching lyrics for {0}...".format(search_artist),
                0.15 + (0.55 * (index + 1) / total_steps),
            )
            result, manuals = await _search_lyrics_for_artist(
                client,
                title,
                search_artist,
                on_progress=on_progress,
            )
            for item in manuals:
                _append_manual_candidate(
                    all_manual,
                    item.get("url"),
                    title=item.get("title") or title,
                    artist=item.get("artist") or search_artist,
                    reason=item.get("reason") or "blocked",
                )
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
        title_result, title_manuals = await _search_lyrics_for_artist(
            client,
            title,
            "",
            on_progress=on_progress,
        )
        for item in title_manuals:
            _append_manual_candidate(
                all_manual,
                item.get("url"),
                title=item.get("title") or title,
                artist=item.get("artist") or "",
                reason=item.get("reason") or "blocked",
            )
        if title_result:
            key = _candidate_key(title_result)
            if key not in seen:
                candidates.append(_annotate_lyrics_candidate(title_result, title_only=True))

        if not candidates:
            await _emit_progress(on_progress, "done", "No lyrics found for this song", 1.0)
            if all_manual:
                return _empty_lyrics_payload(all_manual)
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
        await _emit_progress(on_progress, "apis", "Checking lyrics APIs...", 0.15)
        result, manuals = await _search_lyrics_for_artist(
            client,
            title,
            artist,
            on_progress=on_progress,
        )
        if not result:
            await _emit_progress(on_progress, "done", "No lyrics found for this song", 1.0)
            if manuals:
                return _empty_lyrics_payload(manuals)
            raise ValueError("No lyrics found for this song")
        await _emit_progress(on_progress, "done", "Lyrics found", 1.0)
        return result


async def fetch_lyrics_url(url, on_progress=None):
    await _emit_progress(on_progress, "fetch", "Fetching lyrics page...", 0.15)
    async with httpx.AsyncClient(timeout=LYRICS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "extract", "Extracting lyrics...", 0.55)
        page_result = await fetch_lyrics_from_page(client, url, on_progress=on_progress)
        if not page_result:
            await _emit_progress(on_progress, "done", "Could not extract lyrics from that page", 1.0)
            raise ValueError("Could not extract lyrics from that page")
        result = _build_lyrics_result(page_result, "", "")
        await _emit_progress(on_progress, "done", "Lyrics found", 1.0)
        return result
