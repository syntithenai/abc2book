import asyncio
import html
import re
from urllib.parse import quote, urlparse

import httpx

from chords_fetch import normalize_match_text, score_title_artist_match
from tune_background_research import search_web

NOTATION_FETCH_TIMEOUT_SECONDS = 20.0
THESESSION_BASE = "https://thesession.org"
MAX_SESSION_TUNES = 5
MAX_WEB_URLS = 12

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

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
)

SONG_TYPE_HINTS = {
    "song": ("lyrics", "folk song", "ballad"),
    "instrumental": ("instrumental", "tune", "melody"),
    "traditional_tune": ("traditional", "irish tune", "folk tune", "session tune"),
}

ABC_BLOCK_RE = re.compile(
    r"(X:\s*\d+.*?)(?=\nX:\s*\d+|\Z)",
    re.S | re.I,
)
PRE_BLOCK_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")
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


def extract_abc_from_text(text):
    text = str(text or "")
    if not text.strip():
        return []

    blocks = []
    for match in ABC_BLOCK_RE.finditer(text):
        block = match.group(1).strip()
        if "K:" in block and ("|" in block or re.search(r"[A-Ga-g][,']", block)):
            blocks.append(block)

    if blocks:
        return blocks

    if text.strip().startswith("X:") and "K:" in text:
        return [text.strip()]

    for pre_match in PRE_BLOCK_RE.finditer(text):
        pre_text = strip_html_tags(pre_match.group(1))
        if "X:" in pre_text and "K:" in pre_text:
            for block in extract_abc_from_text(pre_text):
                blocks.append(block)

    return blocks


def abc_preview(abc_text, max_lines=6):
    lines = [line for line in str(abc_text or "").splitlines() if line.strip()]
    return "\n".join(lines[:max_lines])


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
    response = await client.get(
        url,
        headers={"User-Agent": BROWSER_USER_AGENT},
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.text


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


async def fetch_abc_from_url(client, url, title):
    validated, error = validate_abc_page_url(url)
    if error:
        return []
    content_type = ""
    try:
        response = await client.get(
            validated,
            headers={"User-Agent": BROWSER_USER_AGENT},
            follow_redirects=True,
        )
        response.raise_for_status()
        content_type = (response.headers.get("content-type") or "").lower()
        text = response.text
    except Exception:
        return []

    host = (urlparse(validated).hostname or "").replace("www.", "")
    blocks = extract_abc_from_text(text)
    results = []
    for block in blocks:
        results.append(
            annotate_candidate(
                block,
                title,
                host,
                validated,
                title_only=True,
            )
        )
    if not results and ("text/plain" in content_type or validated.lower().endswith(".abc")):
        if "K:" in text:
            results.append(
                annotate_candidate(text.strip(), title, host, validated, title_only=True)
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


def notation_candidate_score(candidate, title, artist):
    return score_title_artist_match(
        candidate.get("title") or "",
        candidate.get("artist") or "",
        title,
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

        artist_key = normalize_match_text(artist)
        need_web = (
            song_type == "song"
            or bool(artist_key)
            or not session_candidates
            or not has_strong_notation_match(session_candidates, title, artist)
        )

        candidates = list(session_candidates)
        if need_web:
            await _emit_progress(
                on_progress,
                "web",
                "Searching the web for ABC notation...",
                0.5,
            )
            web_candidates = await collect_web_abc_candidates(
                client,
                title,
                song_type,
                artist,
                on_progress=on_progress,
            )
            candidates = dedupe_candidates(candidates + web_candidates)

        candidates.sort(
            key=lambda candidate: notation_candidate_score(candidate, title, artist),
            reverse=True,
        )
        candidates = [
            candidate for candidate in candidates
            if notation_candidate_score(candidate, title, artist) >= 30
        ] or candidates[:8]

        if not candidates:
            await _emit_progress(on_progress, "done", "No ABC notation found", 1.0)
            raise ValueError("No ABC notation found for this tune")

        await _emit_progress(on_progress, "done", "ABC candidates ready", 1.0)
        if len(candidates) == 1:
            return candidates[0]
        return {
            "multiple": True,
            "candidates": candidates,
        }
