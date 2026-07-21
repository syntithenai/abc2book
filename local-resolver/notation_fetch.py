import asyncio
import html
import re
from urllib.parse import quote, urlparse

import httpx

from browser_fetch import fetch_html_with_fallback
from chords_fetch import normalize_match_text, score_title_artist_match
from midi_fetch import (
    collect_midi_candidates,
    fetch_midi_from_allowlisted_page,
    fetch_midi_url,
    is_allowed_midi_host,
    is_direct_midi_file_url,
)
from cpdl_fetch import collect_cpdl_candidates, fetch_cpdl_url, is_cpdl_url
from imslp_fetch import collect_imslp_candidates, fetch_imslp_url, is_imslp_url
from josquin_fetch import collect_josquin_candidates, fetch_josquin_url, is_josquin_url
from musicalion_fetch import collect_musicalion_candidates, fetch_musicalion_url, is_musicalion_url
from musescore_fetch import (
    MuseScoreDownloadUnavailable,
    actionable_musescore_manual_candidates,
    build_musescore_manual_candidate,
    collect_musescore_candidates,
    extract_musescore_page_meta,
    fetch_musescore_url,
    is_musescore_url,
    parse_musescore_score_url,
)
from openscore_fetch import collect_openscore_candidates, fetch_openscore_url, is_openscore_url
from w3c_musicxml_fetch import collect_w3c_examples_candidates, fetch_w3c_musicxml_url, is_w3c_musicxml_url
from polite_fetch import BROWSER_USER_AGENT
from tune_background_research import search_web

NOTATION_FETCH_TIMEOUT_SECONDS = 20.0
THESESSION_BASE = "https://thesession.org"
MAX_SESSION_TUNES = 5
MAX_WEB_URLS = 12

ABC_PAGE_HOST_SUFFIXES = (
    "abcnotation.com",
    "folkinfo.org",
    "norbeck.net",
    "henrik.norbeck.org",
    "jc.tzo.net",
    "mandolintab.net",
    "thesession.org",
    "slowplayers.org",
    "trillian.mit.edu",
    "ceolas.org",
    "mudcat.org",
    "contrafact.se",
    "nigelgatherer.com",
    "traditionalmusic.co.uk",
    "greensongs.ca",
    "olsonworks.org",
    "contemplator.com",
    "folktunes.org",
    "tunesearch.org.uk",
    "hardieonline.com",
    "folkwiki.ibiblio.org",
    "abc.sourceforge.net",
    "john-chambers.us",
    "irishtune.info",
    "sessionite.com",
    "themusicofireland.com",
)

WEB_ABC_SITE_HOSTS = (
    "abcnotation.com",
    "folkwiki.ibiblio.org",
    "abc.sourceforge.net",
    "john-chambers.us",
    "irishtune.info",
    "sessionite.com",
    "themusicofireland.com",
)

SONG_TYPE_HINTS = {
    "song": ("lyrics", "folk song", "ballad"),
    "instrumental": ("instrumental", "tune", "melody"),
    "traditional_tune": ("traditional", "irish tune", "folk tune", "session tune"),
    "choral": ("choral", "choir", "satb"),
}

ABC_BLOCK_RE = re.compile(
    r"(X:\s*\d+.*?)(?=\nX:\s*\d+|\Z)",
    re.S | re.I,
)
PRE_BLOCK_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
# Truncate scraped ABC when X:… matched past </pre> into page chrome.
HTML_CUT_RE = re.compile(
    r"</?(?:pre|div|span|p|html|body|head|script|style|table|tr|td|th|ul|ol|li|"
    r"section|article|nav|header|footer|main|form|button|a|br|hr|img|meta|link)\b[^>]*>",
    re.I,
)
HTTP_URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)


def meter_for_thesession_type(tune_type):
    text = str(tune_type or "").lower().strip()
    if text in ("waltz", "slide"):
        return "3/4"
    if text == "polka":
        return "2/4"
    if text == "slip jig":
        return "9/8"
    if text == "jig":
        return "6/8"
    if text == "hornpipe":
        return "4/4"
    return "4/4"


def build_thesession_setting_abc(tune_detail, setting):
    abc_body = str((setting or {}).get("abc") or "").strip()
    if not abc_body:
        return ""

    if re.search(r"^K:", abc_body, re.M) or abc_body.startswith("X:"):
        return abc_body

    tune_detail = tune_detail if isinstance(tune_detail, dict) else {}
    tune_name = str(tune_detail.get("name") or "").strip()
    tune_type = str(tune_detail.get("type") or "").strip()
    composer = str(tune_detail.get("composer") or "").strip()
    key = str((setting or {}).get("key") or "C").strip() or "C"

    header = [
        "X:1",
        "T:" + (tune_name or "Tune"),
    ]
    if composer:
        header.append("C:" + composer)
    if tune_type:
        header.append("R:" + tune_type)
    header.extend([
        "M:" + meter_for_thesession_type(tune_type),
        "L:1/8",
        "K:" + key,
    ])
    return "\n".join(header) + "\n" + abc_body


def _thesession_member_name(member):
    if not isinstance(member, dict):
        return ""
    return str(member.get("name") or "").strip()


def format_thesession_comments(comments, limit=5):
    if not isinstance(comments, list):
        return ""
    parts = []
    for comment in comments[:limit]:
        if not isinstance(comment, dict):
            continue
        content = str(comment.get("content") or "").strip()
        if not content:
            continue
        member_name = _thesession_member_name(comment.get("member"))
        date = str(comment.get("date") or "").strip()
        label = member_name
        if date:
            label = (label + " (" + date[:10] + ")").strip()
        if label:
            parts.append("**{0}:** {1}".format(label, content))
        else:
            parts.append(content)
    return "\n\n".join(parts)


def extract_thesession_tune_meta(tune_detail, setting):
    tune_detail = tune_detail if isinstance(tune_detail, dict) else {}
    setting = setting if isinstance(setting, dict) else {}

    tune_name = str(tune_detail.get("name") or "").strip()
    tune_type = str(tune_detail.get("type") or "").strip()
    composer = str(tune_detail.get("composer") or "").strip()
    tune_url = str(tune_detail.get("url") or "").strip()
    if not tune_url and tune_detail.get("id"):
        tune_url = THESESSION_BASE + "/tunes/" + str(tune_detail.get("id"))

    setting_url = str(setting.get("url") or "").strip()
    setting_key = str(setting.get("key") or "").strip()
    setting_member = _thesession_member_name(setting.get("member"))
    setting_date = str(setting.get("date") or "").strip()

    aliases = []
    if isinstance(tune_detail.get("aliases"), list):
        aliases = [str(alias).strip() for alias in tune_detail["aliases"] if str(alias).strip()]

    background_parts = []
    comments_text = format_thesession_comments(tune_detail.get("comments"))
    if comments_text:
        background_parts.append(comments_text)

    stats = []
    if tune_detail.get("recordings"):
        stats.append("{0} recording(s) listed on The Session".format(tune_detail.get("recordings")))
    if tune_detail.get("tunebooks"):
        stats.append("In {0} tunebook(s) on The Session".format(tune_detail.get("tunebooks")))
    if stats:
        background_parts.append(" ".join(stats))

    if setting_member:
        setting_note = "Setting contributed by {0}".format(setting_member)
        if setting_date:
            setting_note += " ({0})".format(setting_date[:10])
        background_parts.append(setting_note)

    links = []
    if tune_url:
        links.append({"link": tune_url, "name": "The Session"})
    if setting_url and setting_url != tune_url:
        links.append({"link": setting_url, "name": "The Session setting"})

    meta = {}
    if tune_detail.get("id"):
        meta["thesession_tune_id"] = [str(tune_detail.get("id"))]
    if setting.get("id"):
        meta["thesession_setting_id"] = [str(setting.get("id"))]

    tune_meta = {
        "name": tune_name,
        "composer": composer,
        "rhythm": tune_type,
        "meter": meter_for_thesession_type(tune_type),
        "noteLength": "1/8",
        "srcUrl": tune_url or setting_url,
        "aliases": aliases,
        "backgroundInfo": "\n\n".join(part for part in background_parts if part).strip(),
        "links": links,
        "meta": meta,
    }
    if setting_key:
        tune_meta["key"] = setting_key
    return tune_meta

def normalize_song_type(value):
    text = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
    if text in ("song", "songs"):
        return "song"
    if text in ("instrumental", "instrumentals"):
        return "instrumental"
    if text in ("traditional_tune", "traditional", "traditional_tunes", "tune", "tunes"):
        return "traditional_tune"
    if text in ("choral", "choir", "satb"):
        return "choral"
    return "instrumental"


async def _emit_progress(on_progress, stage, message, progress):
    if callable(on_progress):
        await on_progress(stage, message, progress)


def build_web_abc_queries(title, song_type="instrumental", artist=""):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        return []
    song_type = normalize_song_type(song_type)
    hints = SONG_TYPE_HINTS.get(song_type, SONG_TYPE_HINTS["instrumental"])
    quoted_title = '"{0}"'.format(title)
    queries = []
    if artist:
        quoted_artist = '"{0}"'.format(artist)
        queries.extend([
            "abc notation {0} {1}".format(quoted_title, quoted_artist),
            "abc notation {0} {1}".format(quoted_title, artist),
            'site:abcnotation.com {0} {1}'.format(quoted_title, quoted_artist),
        ])
    queries.extend([
        "abc notation {0} {1}".format(quoted_title, hints[0]),
        "abc notation {0} {1}".format(quoted_title, hints[1]),
        'site:abcnotation.com abc {0}'.format(quoted_title),
        '{0} filetype:abc'.format(quoted_title),
        '{0} ".abc"'.format(quoted_title),
    ])
    if artist:
        quoted_artist = '"{0}"'.format(artist)
        queries.append('{0} {1} filetype:abc'.format(quoted_title, quoted_artist))
    if song_type == "traditional_tune":
        queries.append('site:thesession.org {0}'.format(quoted_title))
    elif song_type == "song":
        queries.append("abc notation {0} {1}".format(quoted_title, hints[2]))
    else:
        queries.append("abc notation {0} {1}".format(quoted_title, hints[2]))
    for host in WEB_ABC_SITE_HOSTS:
        if host == "abcnotation.com":
            continue
        queries.append("site:{0} {1}".format(host, quoted_title))
    deduped = []
    seen = set()
    for query in queries:
        key = query.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(query)
    return deduped


def is_allowed_abc_host(hostname):
    host = (hostname or "").lower().replace("www.", "")
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in ABC_PAGE_HOST_SUFFIXES)


def normalize_scraped_url(raw_url):
    url = str(raw_url or "").strip()
    if not url:
        return ""
    return url.rstrip(".,;:!?)\"'>]»")


def extract_http_urls_from_text(text):
    if not text:
        return []
    found = []
    for match in HTTP_URL_RE.finditer(str(text)):
        url = normalize_scraped_url(match.group(0))
        if url:
            found.append(url)
    return found


def is_direct_abc_file_url(raw_url):
    normalized = normalize_scraped_url(raw_url)
    if not normalized:
        return False
    try:
        parsed = urlparse(normalized)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    path = (parsed.path or "").lower()
    if path.endswith(".abc"):
        return True
    basename = path.rsplit("/", 1)[-1]
    return basename.endswith(".abc")


def extract_urls_from_search_item(item):
    item = item if isinstance(item, dict) else {}
    ordered = []
    seen = set()

    def add_url(raw):
        normalized = normalize_scraped_url(raw)
        if not normalized:
            return
        key = normalized.lower()
        if key in seen:
            return
        seen.add(key)
        ordered.append(normalized)

    add_url(item.get("url"))
    for field in ("snippet", "title", "description"):
        for url in extract_http_urls_from_text(item.get(field)):
            add_url(url)
    return ordered


def validate_abc_page_url(raw_url):
    normalized = normalize_scraped_url(raw_url)
    if not normalized:
        return None, "Invalid URL"
    try:
        parsed = urlparse(normalized)
    except Exception:
        return None, "Invalid URL"
    if parsed.scheme not in ("http", "https"):
        return None, "Only http(s) URLs are allowed"
    if is_direct_abc_file_url(normalized):
        return normalized, None
    if not is_allowed_abc_host(parsed.hostname):
        return None, "ABC URL host is not supported"
    return normalized, None


def strip_html_tags(text):
    return html.unescape(TAG_RE.sub("", text or "")).strip()


def sanitize_abc_block(text):
    """
    Keep only ABC content from a scraped block.
    Truncates at the first HTML tag (common when X:… matches bleed past </pre>),
    then strips residual tags/entities.
    """
    raw = str(text or "")
    if not raw.strip():
        return ""
    cut = HTML_CUT_RE.search(raw)
    if cut:
        raw = raw[:cut.start()]
    # Stop if a bare tag slipped through without matching HTML_CUT_RE.
    bare = re.search(r"<[A-Za-z/!?]", raw)
    if bare and (bare.start() == 0 or raw[bare.start() - 1] in "\n\r"):
        raw = raw[:bare.start()]
    cleaned = strip_html_tags(raw)
    lines = [line.rstrip() for line in cleaned.splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).strip()


def _looks_like_html(text):
    sample = str(text or "")[:8000].lower()
    return "<pre" in sample or "<html" in sample or "</body>" in sample or "<div" in sample


def _abc_blocks_from_plain_text(text):
    text = str(text or "")
    if not text.strip():
        return []

    blocks = []
    for match in ABC_BLOCK_RE.finditer(text):
        block = sanitize_abc_block(match.group(1))
        if block and "K:" in block and ("|" in block or re.search(r"[A-Ga-g][,']", block)):
            blocks.append(block)

    if blocks:
        return blocks

    cleaned = sanitize_abc_block(text)
    if cleaned.startswith("X:") and "K:" in cleaned:
        return [cleaned]
    return []


def extract_abc_from_text(text):
    text = str(text or "")
    if not text.strip():
        return []

    # Prefer <pre> on HTML pages so X:… does not swallow chrome after </pre>.
    if _looks_like_html(text):
        blocks = []
        for pre_match in PRE_BLOCK_RE.finditer(text):
            pre_text = sanitize_abc_block(strip_html_tags(pre_match.group(1)))
            if "X:" in pre_text and "K:" in pre_text:
                blocks.extend(_abc_blocks_from_plain_text(pre_text))
        if blocks:
            return blocks

    blocks = _abc_blocks_from_plain_text(text)
    if blocks:
        return blocks

    for pre_match in PRE_BLOCK_RE.finditer(text):
        pre_text = sanitize_abc_block(strip_html_tags(pre_match.group(1)))
        if "X:" in pre_text and "K:" in pre_text:
            blocks.extend(_abc_blocks_from_plain_text(pre_text))
    return blocks


def abc_preview(abc_text, max_lines=6):
    lines = [line for line in str(abc_text or "").splitlines() if line.strip()]
    return "\n".join(lines[:max_lines])


def parse_abc_header_fields(abc_text):
    """Return first T:/C:/Q:/K:/M:/R: values from an ABC block."""
    fields = {}
    for match in re.finditer(r"^([TCKQMR]):\s*(.+?)\s*$", str(abc_text or ""), re.M | re.I):
        key = match.group(1).upper()
        if key in fields:
            continue
        value = match.group(2).strip()
        if value:
            fields[key] = value
    return fields


def _tempo_from_q_header(q_value):
    text = str(q_value or "").strip()
    if not text:
        return None
    equals = re.search(r"=\s*(\d+(?:\.\d+)?)", text)
    if equals:
        try:
            return float(equals.group(1)) if "." in equals.group(1) else int(equals.group(1))
        except ValueError:
            return None
    bare = re.match(r"^(\d+(?:\.\d+)?)\s*$", text)
    if bare:
        try:
            return float(bare.group(1)) if "." in bare.group(1) else int(bare.group(1))
        except ValueError:
            return None
    return text


def tune_meta_from_abc_headers(abc_text, source_url=""):
    fields = parse_abc_header_fields(abc_text)
    if not fields:
        return {}
    meta = {}
    if fields.get("T"):
        meta["name"] = fields["T"]
    if fields.get("C"):
        meta["composer"] = fields["C"]
    if fields.get("R"):
        meta["rhythm"] = fields["R"]
    if fields.get("M"):
        meta["meter"] = fields["M"]
    if fields.get("K"):
        meta["key"] = fields["K"]
    if fields.get("Q"):
        tempo = _tempo_from_q_header(fields["Q"])
        if tempo is not None:
            meta["tempo"] = tempo
    if source_url:
        meta["srcUrl"] = source_url
    return meta


def annotate_candidate(abc_text, title, source, source_url, artist="", title_only=False, tune_meta=None):
    result = {
        "abc": abc_text,
        "title": title or "",
        "artist": artist or "",
        "source": source or "",
        "sourceUrl": source_url or "",
        "preview": abc_preview(abc_text),
        "titleOnly": bool(title_only),
    }
    if tune_meta:
        result["tuneMeta"] = tune_meta
        if not result["artist"] and tune_meta.get("composer"):
            result["artist"] = tune_meta.get("composer")
        if not result["title"] and tune_meta.get("name"):
            result["title"] = tune_meta.get("name")
    return result


def candidate_key(candidate):
    source_url = (candidate.get("sourceUrl") or "").strip().lower()
    if source_url:
        return source_url
    abc_hash = normalize_match_text((candidate.get("abc") or "")[:120])
    return (candidate.get("title") or "") + ":" + abc_hash


def dedupe_candidates(candidates):
    seen = set()
    ordered = []
    for candidate in candidates or []:
        key = candidate_key(candidate)
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(candidate)
    return ordered


async def fetch_text(client, url):
    result = await fetch_html_with_fallback(client, url)
    text = result.text or ""
    if result.status >= 400 or result.blocked_reason == "http_status":
        raise httpx.HTTPStatusError(
            "HTTP {0} for {1}".format(result.status, url),
            request=httpx.Request("GET", url),
            response=httpx.Response(result.status or 500, text=text),
        )
    if not text.strip():
        raise ValueError("Empty response from {0}".format(url))
    return text


async def search_thesession_tunes(client, title):
    response = await client.get(
        THESESSION_BASE + "/tunes/search",
        params={"format": "json", "perpage": 50, "q": title},
        headers={"User-Agent": BROWSER_USER_AGENT},
        follow_redirects=True,
    )
    response.raise_for_status()
    data = response.json()
    tunes = data.get("tunes") if isinstance(data, dict) else []
    if not isinstance(tunes, list):
        return []
    return tunes


async def fetch_thesession_tune(client, tune_id):
    response = await client.get(
        THESESSION_BASE + "/tunes/" + str(tune_id),
        params={"format": "json", "perpage": 50},
        headers={"User-Agent": BROWSER_USER_AGENT},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.json()


async def collect_thesession_candidates(client, title, artist="", on_progress=None):
    await _emit_progress(on_progress, "thesession", "Searching The Session...", 0.15)
    tunes = await search_thesession_tunes(client, title)
    if not tunes:
        return []

    scored = []
    for tune in tunes:
        if not isinstance(tune, dict):
            continue
        tune_name = str(tune.get("name") or "")
        tune_type = str(tune.get("type") or "")
        score = score_title_artist_match(tune_name, "", title, artist)
        if tune_type:
            score += 5
        scored.append((score, tune))

    scored.sort(key=lambda item: item[0], reverse=True)
    candidates = []
    total = min(len(scored), MAX_SESSION_TUNES)

    for index, (_, tune) in enumerate(scored[:MAX_SESSION_TUNES]):
        tune_id = tune.get("id")
        if not tune_id:
            continue
        tune_name = str(tune.get("name") or title)
        tune_type = str(tune.get("type") or "")
        label = tune_name + ((" (" + tune_type + ")") if tune_type else "")
        await _emit_progress(
            on_progress,
            "thesession",
            "Fetching settings for {0}...".format(label),
            0.2 + (0.35 * (index + 1) / max(total, 1)),
        )
        try:
            detail = await fetch_thesession_tune(client, tune_id)
        except Exception:
            continue
        settings = detail.get("settings") if isinstance(detail, dict) else []
        if not isinstance(settings, list):
            continue
        source_url = THESESSION_BASE + "/tunes/" + str(tune_id)
        for setting_index, setting in enumerate(settings):
            if not isinstance(setting, dict):
                continue
            abc_text = build_thesession_setting_abc(detail, setting)
            if not abc_text:
                continue
            setting_title = label
            if len(settings) > 1:
                setting_title = label + " — setting " + str(setting_index + 1)
            tune_meta = extract_thesession_tune_meta(detail, setting)
            candidates.append(
                annotate_candidate(
                    abc_text,
                    setting_title,
                    "thesession.org",
                    source_url + "#setting" + str(setting.get("id") or setting_index),
                    artist=tune_meta.get("composer") or "",
                    tune_meta=tune_meta,
                )
            )
    return dedupe_candidates(candidates)


def _annotate_web_abc_candidate(abc_text, query_title, host, source_url):
    tune_meta = tune_meta_from_abc_headers(abc_text, source_url)
    abc_title = (tune_meta.get("name") or "").strip() or query_title
    abc_artist = (tune_meta.get("composer") or "").strip()
    return annotate_candidate(
        abc_text,
        abc_title,
        host,
        source_url,
        artist=abc_artist,
        title_only=not bool(tune_meta.get("name")),
        tune_meta=tune_meta or None,
    )


async def fetch_abc_from_url(client, url, title):
    validated, error = validate_abc_page_url(url)
    if error:
        return []
    try:
        text = await fetch_text(client, validated)
    except Exception:
        return []

    host = (urlparse(validated).hostname or "").replace("www.", "")
    blocks = extract_abc_from_text(text)
    results = []
    for block in blocks:
        results.append(_annotate_web_abc_candidate(block, title, host, validated))
    if not results and (validated.lower().endswith(".abc") or text.strip().startswith("X:")):
        if "K:" in text:
            results.append(
                _annotate_web_abc_candidate(text.strip(), title, host, validated)
            )
    return results


async def collect_web_abc_candidates(client, title, song_type, artist="", on_progress=None):
    queries = build_web_abc_queries(title, song_type, artist)
    if not queries:
        return []

    candidates = []
    tried_urls = set()
    total_queries = len(queries)

    for query_index, query in enumerate(queries):
        await _emit_progress(
            on_progress,
            "web",
            "Searching the web: {0}...".format(query),
            0.55 + (0.35 * query_index / max(total_queries, 1)),
        )
        try:
            results = await search_web(client, query)
        except Exception:
            results = []

        urls = []
        direct_abc_urls = []
        for item in results or []:
            if not isinstance(item, dict):
                continue
            for url in extract_urls_from_search_item(item):
                validated, error = validate_abc_page_url(url)
                if error or not validated or validated in tried_urls:
                    continue
                tried_urls.add(validated)
                if is_direct_abc_file_url(validated):
                    direct_abc_urls.append(validated)
                else:
                    urls.append(validated)

        combined_urls = (direct_abc_urls + urls)[:MAX_WEB_URLS]

        for url_index, url in enumerate(combined_urls):
            await _emit_progress(
                on_progress,
                "web",
                "Fetching ABC from {0}...".format(urlparse(url).hostname or url),
                0.6 + (0.35 * (query_index + (url_index + 1) / max(len(combined_urls), 1)) / max(total_queries, 1)),
            )
            for candidate in await fetch_abc_from_url(client, url, title):
                candidates.append(candidate)

        if candidates:
            break

    return dedupe_candidates(candidates)


def strip_notation_match_decorations(value):
    """Strip The Session display suffixes so setting labels still match the tune title."""
    text = str(value or "")
    text = re.sub(r"\s*[—–-]\s*setting\s+\d+\s*$", "", text, flags=re.I)
    text = re.sub(r"\s*\([^)]*\)\s*$", "", text)
    return text.strip()


def notation_candidate_score(candidate, title, artist):
    meta = (candidate or {}).get("tuneMeta") or {}
    match_title = ""
    match_artist = str((candidate or {}).get("artist") or "")
    if isinstance(meta, dict):
        match_title = str(meta.get("name") or "").strip()
        if not match_artist:
            match_artist = str(meta.get("composer") or "")
    if not match_title:
        match_title = strip_notation_match_decorations((candidate or {}).get("title") or "")
    else:
        match_title = strip_notation_match_decorations(match_title)
    return score_title_artist_match(
        match_title,
        match_artist,
        strip_notation_match_decorations(title),
        artist,
    )


def filter_notation_candidates(candidates, title, artist):
    if not candidates:
        return []
    artist_key = normalize_match_text(artist)
    filtered = []
    for candidate in candidates:
        score = notation_candidate_score(candidate, title, artist)
        if artist_key and score < 60:
            continue
        if score < 30 and str(candidate.get("source") or "") == "thesession.org":
            continue
        filtered.append(candidate)
    return filtered


def has_strong_notation_match(candidates, title, artist):
    for candidate in candidates or []:
        if notation_candidate_score(candidate, title, artist) >= 80:
            return True
    return False


def _candidate_has_usable_payload(candidate):
    abc = str((candidate or {}).get("abc") or "").strip()
    if abc and "K:" in abc:
        return True
    music_xml = str((candidate or {}).get("musicXml") or "").strip()
    if music_xml:
        return True
    pdf_attachment = (candidate or {}).get("pdfAttachment")
    return isinstance(pdf_attachment, dict) and bool(pdf_attachment.get("downloadUrl"))


def _candidate_import_format(candidate):
    meta = (candidate or {}).get("tuneMeta") or {}
    if isinstance(meta, dict):
        nested = meta.get("meta") or {}
        if isinstance(nested, dict) and nested.get("importFormat"):
            return str(nested.get("importFormat"))
    source = str((candidate or {}).get("source") or "").lower()
    if source == "musescore.com":
        return "musescore"
    if (candidate or {}).get("pdfAttachment") and not str((candidate or {}).get("musicXml") or "").strip():
        return "pdf"
    if (candidate or {}).get("musicXml") and not str((candidate or {}).get("abc") or "").strip():
        return "musicxml"
    return "abc"


MAX_NOTATION_CANDIDATES = 20
SOURCE_BONUS_MUSESCORE = 30
SOURCE_BONUS_OPENSCORE = 32
SOURCE_BONUS_ARCHIVE_MUSICXML = 25
SOURCE_BONUS_ABC = 10
SOURCE_BONUS_PDF = 5
SOURCE_BONUS_CPDL_CHORAL = 8
SOURCE_BONUS_MIDI = -45
MIN_ABC_BASE_SCORE = 30
MIN_PDF_BASE_SCORE = 15
MIN_MIDI_BASE_SCORE = 45


def notation_source_bonus(candidate, song_type="instrumental"):
    """Rank preference: MuseScore/archives up, ABC slight boost, MIDI demoted."""
    import_format = _candidate_import_format(candidate)
    source = str((candidate or {}).get("source") or "").lower()
    if import_format == "midi":
        return SOURCE_BONUS_MIDI
    if import_format == "pdf":
        bonus = SOURCE_BONUS_PDF
        if normalize_song_type(song_type) == "choral" and source == "cpdl.org":
            bonus += SOURCE_BONUS_CPDL_CHORAL
        return bonus
    if source == "openscore.org":
        return SOURCE_BONUS_OPENSCORE
    if source in (
        "josquin.stanford.edu",
        "cpdl.org",
        "imslp.org",
        "musicxml.com",
    ) or import_format == "musicxml":
        bonus = SOURCE_BONUS_ARCHIVE_MUSICXML
        if normalize_song_type(song_type) == "choral" and source == "cpdl.org":
            bonus += SOURCE_BONUS_CPDL_CHORAL
        return bonus
    if (
        import_format in ("musescore", "musicxml")
        or source == "musescore.com"
    ):
        return SOURCE_BONUS_MUSESCORE
    return SOURCE_BONUS_ABC


def notation_priority_score(candidate, title, artist, song_type="instrumental"):
    base = notation_candidate_score(candidate, title, artist)
    return base + notation_source_bonus(candidate, song_type=song_type)


def _with_match_score(candidate, score):
    out = dict(candidate or {})
    out["matchScore"] = int(score)
    return out


def finalize_notation_candidates(candidates, title, artist, relax_midi=False, song_type="instrumental"):
    """Rank/filter candidates with source weights; return up to 20."""
    min_midi_score = 20 if relax_midi else MIN_MIDI_BASE_SCORE
    usable = [
        candidate for candidate in (candidates or [])
        if _candidate_has_usable_payload(candidate)
    ]

    filtered = []
    for candidate in usable:
        base = notation_candidate_score(candidate, title, artist)
        import_format = _candidate_import_format(candidate)
        is_midi = import_format == "midi"
        is_pdf = import_format == "pdf"
        is_muse = (
            import_format in ("musescore", "musicxml")
            or str(candidate.get("source") or "").lower() == "musescore.com"
        )
        if is_midi and base < min_midi_score:
            continue
        if is_pdf and base < MIN_PDF_BASE_SCORE:
            continue
        if (not is_midi) and (not is_muse) and (not is_pdf) and base < MIN_ABC_BASE_SCORE:
            continue
        priority = base + notation_source_bonus(candidate, song_type=song_type)
        filtered.append(_with_match_score(candidate, priority))

    filtered.sort(key=lambda candidate: candidate.get("matchScore") or 0, reverse=True)
    if filtered:
        return filtered[:MAX_NOTATION_CANDIDATES]

    # Prefer MuseScore MusicXML, then any MusicXML/MIDI, then any usable.
    def score_fallback(candidate):
        return notation_priority_score(candidate, title, artist, song_type=song_type)

    muse = [
        candidate for candidate in usable
        if str(candidate.get("source") or "").lower() == "musescore.com"
        or _candidate_import_format(candidate) in ("musescore", "musicxml")
    ]
    if muse:
        muse_scored = [
            _with_match_score(candidate, score_fallback(candidate))
            for candidate in muse
        ]
        muse_scored.sort(key=lambda c: c.get("matchScore") or 0, reverse=True)
        return muse_scored[:MAX_NOTATION_CANDIDATES]

    alt = [
        candidate for candidate in usable
        if str(candidate.get("musicXml") or "").strip()
    ]
    pool = alt if alt else usable
    scored = [
        _with_match_score(candidate, score_fallback(candidate))
        for candidate in pool
    ]
    scored.sort(key=lambda c: c.get("matchScore") or 0, reverse=True)
    return scored[:MAX_NOTATION_CANDIDATES]


async def _last_chance_midi_candidates(client, title, artist="", on_progress=None):
    """Broad MIDI web search when MuseScore/ABC paths produced nothing usable."""
    title = str(title or "").strip()
    if not title:
        return []
    await _emit_progress(
        on_progress,
        "midi",
        "Trying MIDI fallback...",
        0.82,
    )
    return await collect_midi_candidates(
        client,
        title,
        artist=artist,
        on_progress=on_progress,
        relaxed=True,
    )


async def _musescore_page_title(client, page_url):
    try:
        page = await fetch_html_with_fallback(client, page_url, allow_playwright=False)
        html = page.text or ""
        if page.status >= 400 or not html.strip():
            return ""
        meta = extract_musescore_page_meta(html, page.final_url or page_url)
        return str(meta.get("title") or "").strip()
    except Exception:
        return ""


def _merge_manual_candidates(*result_sets):
    merged = []
    seen = set()
    for result in result_sets:
        for item in _collector_manual_candidates(result):
            url = str(item.get("url") or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)
            merged.append(item)
    return merged


async def search_notation_url(url, on_progress=None):
    """Fetch notation from MuseScore, MIDI, or allowlisted ABC URL."""
    page_url = str(url or "").strip()
    if not page_url:
        raise ValueError("URL is required")

    if is_josquin_url(page_url):
        try:
            return await fetch_josquin_url(page_url, on_progress=on_progress)
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch Josquin score") from exc

    if is_cpdl_url(page_url):
        try:
            return await fetch_cpdl_url(page_url, on_progress=on_progress)
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch CPDL score") from exc

    if is_imslp_url(page_url):
        try:
            result = await fetch_imslp_url(page_url, on_progress=on_progress)
            if isinstance(result, dict) and result.get("empty"):
                manuals = result.get("manualCandidates") or []
                if manuals:
                    return _empty_notation_manual_result(manuals)
            return result
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch IMSLP score") from exc

    if is_openscore_url(page_url):
        try:
            result = await fetch_openscore_url(page_url, on_progress=on_progress)
            if isinstance(result, dict) and result.get("empty"):
                manuals = result.get("manualCandidates") or []
                if manuals:
                    return _empty_notation_manual_result(manuals)
            return result
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch OpenScore score") from exc

    if is_musicalion_url(page_url):
        try:
            result = await fetch_musicalion_url(page_url, on_progress=on_progress)
            manuals = result.get("manualCandidates") if isinstance(result, dict) else []
            if manuals:
                return _empty_notation_manual_result(manuals)
            raise ValueError("Musicalion requires manual import")
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(str(exc) or "Could not open Musicalion page") from exc

    if is_w3c_musicxml_url(page_url):
        try:
            return await fetch_w3c_musicxml_url(page_url, on_progress=on_progress)
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch MusicXML example") from exc

    if is_musescore_url(page_url):
        try:
            return await fetch_musescore_url(page_url, on_progress=on_progress)
        except MuseScoreDownloadUnavailable as exc:
            parsed = parse_musescore_score_url(page_url)
            clean_url = (parsed or {}).get("url") or page_url
            query_title = ""
            async with httpx.AsyncClient(timeout=NOTATION_FETCH_TIMEOUT_SECONDS) as client:
                query_title = await _musescore_page_title(client, clean_url)
                midi_candidates = await _last_chance_midi_candidates(
                    client,
                    query_title or "MuseScore import",
                    on_progress=on_progress,
                )
            if midi_candidates:
                finalized = finalize_notation_candidates(
                    midi_candidates,
                    query_title or "",
                    "",
                    relax_midi=True,
                )
                if finalized:
                    await _emit_progress(on_progress, "midi", "MIDI fallback ready", 1.0)
                    if len(finalized) == 1:
                        return finalized[0]
                    return {
                        "multiple": True,
                        "candidates": finalized,
                    }
            manual = build_musescore_manual_candidate(
                clean_url,
                title=query_title or "",
                access_tier=getattr(exc, "access_tier", "unknown"),
            )
            manual_result = _notation_manual_result_from_muse_manual([manual])
            await _emit_progress(
                on_progress,
                "done",
                "MuseScore score needs manual download"
                if manual_result and manual_result.get("manualCandidates")
                else "MuseScore matches require PRO or purchase",
                1.0,
            )
            if manual_result:
                return manual_result
            raise ValueError(
                "MuseScore matches require PRO or purchase; try MIDI or ABC sources instead."
            )
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch MuseScore score") from exc

    if is_direct_midi_file_url(page_url):
        try:
            return await fetch_midi_url(page_url, on_progress=on_progress)
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch MIDI file") from exc

    try:
        host = urlparse(page_url).hostname
    except Exception:
        host = ""
    if is_allowed_midi_host(host):
        try:
            return await fetch_midi_from_allowlisted_page(page_url, on_progress=on_progress)
        except Exception as exc:
            raise ValueError(str(exc) or "Could not fetch MIDI from that page") from exc

    async with httpx.AsyncClient(timeout=NOTATION_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "fetch", "Fetching ABC from URL...", 0.2)
        candidates = await fetch_abc_from_url(client, page_url, title="")
        if not candidates:
            await _emit_progress(on_progress, "done", "Could not extract ABC from that URL", 1.0)
            raise ValueError("Could not extract ABC from that URL")
        await _emit_progress(on_progress, "done", "ABC found", 1.0)
        if len(candidates) == 1:
            return candidates[0]
        return {
            "multiple": True,
            "candidates": candidates,
        }


def _collector_results_or_empty(result):
    if isinstance(result, Exception):
        return []
    if isinstance(result, dict):
        candidates = result.get("candidates")
        if isinstance(candidates, list):
            return candidates
        return []
    if not isinstance(result, list):
        return []
    return result


def _collector_manual_candidates(result):
    if isinstance(result, Exception) or not isinstance(result, dict):
        return []
    manuals = result.get("manualCandidates")
    if not isinstance(manuals, list):
        return []
    return [item for item in manuals if isinstance(item, dict) and item.get("url")]


def _empty_notation_manual_result(manual_candidates):
    return {
        "empty": True,
        "found": False,
        "manualCandidates": list(manual_candidates or []),
    }


def _empty_notation_paywalled_result():
    return {
        "empty": True,
        "found": False,
        "musescorePaywalled": True,
        "manualCandidates": [],
    }


def _notation_manual_result_from_muse_manual(muse_manual):
    actionable = actionable_musescore_manual_candidates(muse_manual)
    if actionable:
        return _empty_notation_manual_result(actionable)
    if muse_manual:
        return _empty_notation_paywalled_result()
    return None


async def search_notation(title, artist="", song_type="instrumental", on_progress=None):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    song_type = normalize_song_type(song_type)
    if not title:
        raise ValueError("Song title is required")

    async with httpx.AsyncClient(timeout=NOTATION_FETCH_TIMEOUT_SECONDS) as client:
        session_candidates = await collect_thesession_candidates(
            client,
            title,
            artist,
            on_progress=on_progress,
        )
        session_candidates = filter_notation_candidates(session_candidates, title, artist)

        await _emit_progress(
            on_progress,
            "sources",
            "Searching ABC, MuseScore, archives, and MIDI...",
            0.4,
        )
        (
            web_result,
            muse_result,
            midi_result,
            josquin_result,
            cpdl_result,
            imslp_result,
            openscore_result,
            musicalion_result,
            w3c_result,
        ) = await asyncio.gather(
            collect_web_abc_candidates(
                client,
                title,
                song_type,
                artist,
                on_progress=on_progress,
            ),
            collect_musescore_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_midi_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_josquin_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_cpdl_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_imslp_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_openscore_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_musicalion_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            collect_w3c_examples_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            ),
            return_exceptions=True,
        )

        muse_manual = _collector_manual_candidates(muse_result)
        archive_manual = _merge_manual_candidates(
            imslp_result,
            openscore_result,
            musicalion_result,
        )
        candidates = dedupe_candidates(
            list(session_candidates)
            + _collector_results_or_empty(web_result)
            + _collector_results_or_empty(muse_result)
            + _collector_results_or_empty(midi_result)
            + _collector_results_or_empty(josquin_result)
            + _collector_results_or_empty(cpdl_result)
            + _collector_results_or_empty(imslp_result)
            + _collector_results_or_empty(openscore_result)
            + _collector_results_or_empty(w3c_result)
        )
        candidates = finalize_notation_candidates(
            candidates,
            title,
            artist,
            song_type=song_type,
        )

        if not candidates:
            midi_fallback = await _last_chance_midi_candidates(
                client,
                title,
                artist,
                on_progress=on_progress,
            )
            if midi_fallback:
                candidates = finalize_notation_candidates(
                    dedupe_candidates(midi_fallback),
                    title,
                    artist,
                    relax_midi=True,
                    song_type=song_type,
                )

        if not candidates:
            manual_result = _notation_manual_result_from_muse_manual(muse_manual)
            if not manual_result and archive_manual:
                manual_result = _empty_notation_manual_result(archive_manual)
            if manual_result:
                await _emit_progress(
                    on_progress,
                    "done",
                    "MuseScore score found — manual download required"
                    if manual_result.get("manualCandidates")
                    else "MuseScore matches require PRO or purchase",
                    1.0,
                )
                return manual_result
            await _emit_progress(on_progress, "done", "No ABC notation found", 1.0)
            raise ValueError("No ABC notation found for this tune")

        await _emit_progress(on_progress, "done", "ABC candidates ready", 1.0)
        if len(candidates) == 1:
            return candidates[0]
        return {
            "multiple": True,
            "candidates": candidates,
        }


async def search_notation_midi_fallback(title, artist="", on_progress=None):
    """MIDI-only notation search (used when MuseScore manual import is abandoned)."""
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        raise ValueError("Song title is required")

    async with httpx.AsyncClient(timeout=NOTATION_FETCH_TIMEOUT_SECONDS) as client:
        midi_fallback = await _last_chance_midi_candidates(
            client,
            title,
            artist,
            on_progress=on_progress,
        )
        candidates = finalize_notation_candidates(
            dedupe_candidates(midi_fallback),
            title,
            artist,
            relax_midi=True,
        )
        if not candidates:
            await _emit_progress(on_progress, "done", "No MIDI notation found", 1.0)
            raise ValueError("No MIDI notation found for this tune")
        await _emit_progress(on_progress, "done", "MIDI candidates ready", 1.0)
        if len(candidates) == 1:
            return candidates[0]
        return {
            "multiple": True,
            "candidates": candidates,
        }
