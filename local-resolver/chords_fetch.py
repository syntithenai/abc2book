import asyncio
import html
import json
import os
import re
import unicodedata
from urllib.parse import parse_qs, quote, unquote, urlparse

import httpx

from recording_artists import discover_recording_artists, is_generic_artist
from tune_background_research import (
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MODEL,
    LLM_TIMEOUT_SECONDS,
)

CHORDS_FETCH_TIMEOUT_SECONDS = 20.0
CHORD_SEARCH_RESULTS_PER_QUERY = int(os.getenv("CHORD_SEARCH_RESULTS_PER_QUERY", "8"))
BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

CHORD_PAGE_HOST_SUFFIXES = (
    "e-chords.com",
    "cifraclub.com",
    "cifraclub.com.br",
    "tabs.ultimate-guitar.com",
    "ultimate-guitar.com",
    "azchords.com",
    "chordsbase.com",
    "chords-and-tabs.net",
    "guitaretab.com",
    "akordy.kytary.cz",
    "worshiptogether.com",
)

BING_RSS_SEARCH_URL = "https://www.bing.com/search?format=rss&q="
AZCHORDS_CONTENT_RE = re.compile(r'<pre[^>]*id="content"[^>]*>(.*?)</pre>', re.S | re.I)
ECHORDS_PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
CIFRACLUB_PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
WORSHIPTOGETHER_NOTE_RE = re.compile(r'<div class="chord-pro-note">(.*?)</div>', re.S | re.I)
WORSHIPTOGETHER_LYRIC_RE = re.compile(r'<div class="chord-pro-lyric">(.*?)</div>', re.S | re.I)
WORSHIPTOGETHER_SECTION_RE = re.compile(
    r"^(?:intro|verse\s*\d*|chorus\s*\d*|bridge\s*\d*|pre-?chorus\s*\d*|tag\s*\d*|outro|turnaround|interlude|refrain|ending).*$",
    re.I,
)
# Chord spans on e-chords / cifraclub mark the chord as the element's inner text.
CHORD_SPAN_RE = re.compile(
    r"<(span|b)[^>]*data-chord(?:-name)?=\"[^\"]*\"[^>]*>(.*?)</\1>", re.S | re.I
)
# Guitar tablature lines (e.g. "E|-1-3-3-|") are noise for a lyric/chord sheet.
TAB_LINE_RE = re.compile(r"^[eadgbEADGB]\s*\|[-0-9hpbrx/\\~().*\s|]+$")
BEAT_COUNT_LINE_RE = re.compile(r"^(?:\d+\s*\+\s*)+\d?\s*\+?$")
CHORD_DIAGRAM_LINE_RE = re.compile(r"^(?:[A-G](?:#|b)?[^ ]*\s+)?[x0-9](?:-[x0-9]){3,}(?:-[x0-9])*\s*$", re.I)
DUCKDUCKGO_RESULT_RE = re.compile(r'class="result__a"\s+href="([^"]+)"', re.I)
RSS_ITEM_RE = re.compile(
    r"<item>\s*<title>(.*?)</title>\s*<link>(.*?)</link>\s*<description>(.*?)</description>",
    re.S | re.I,
)
SEARCH_RESULT_TAG_RE = re.compile(r"<[^>]+>")


def slugify(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text

CHORD_TOKEN_RE = re.compile(
    r"^[A-G](?:#|b)?"
    r"(?:(?:maj|min|dim|aug|sus|add|omit|no|m|M)|[0-9]|[#/b()+-])*$"
)
SECTION_HEADER_RE = re.compile(
    r"^\s*(?:\[[^\]]+\]|#+\s*(?:verse|chorus|bridge|intro|outro|pre-?chorus|refrain|tag|solo|instrumental)(?:\s*\d+)?|(?:verse|chorus|bridge|intro|outro|pre-?chorus|refrain|tag|solo|instrumental)(?:\s*\d+)?\s*:?)\s*$",
    re.I,
)
CHORD_SHEET_NOISE_RE = re.compile(
    r"^(?:capo\s+\d+|tuning\s*:.*|key\s*:.*|submitted by:.*|"
    r"www\.azchords\.com.*|azchords\.com.*|"
    r"amazing grace chords\s+[–-]\s+.*|"
    r"tabs too difficult\?.*|hard to play\?.*|"
    r"you may use it for private study.*|"
    r"contin[uú]a despu[eé]s del anuncio.*)$",
    re.I,
)
NON_ENGLISH_SECTION_LABEL_RE = re.compile(
    r"parte|primeira|primera|segunda|efeito|variaci[oó]n|passagem|"
    r"despu[eé]s|anuncio|pentat[oô]nica|menor|incial|tom de|"
    r"estr[eé]la|refr[aã]o|ponte|interl[uú]dio",
    re.I,
)


async def _emit_progress(on_progress, stage, message, progress):
    if callable(on_progress):
        await on_progress(stage, message, progress)


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


def is_allowed_chord_host(hostname):
    host = (hostname or "").lower()
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in CHORD_PAGE_HOST_SUFFIXES)


def validate_chord_page_url(raw_url):
    try:
        parsed = urlparse(raw_url)
    except Exception:
        return None, "Invalid URL"
    if parsed.scheme != "https":
        return None, "Only https URLs are allowed"
    if not is_allowed_chord_host(parsed.hostname):
        return None, "Chord URL host is not supported"
    return raw_url, None


def fetch_headers():
    return {"User-Agent": BROWSER_USER_AGENT}


def html_to_text(fragment):
    return html.unescape((fragment or "").replace("\r", ""))


def normalize_sheet_line(line):
    text = html_to_text(line).replace("\u00a0", " ").strip()
    if not text:
        return ""
    return re.sub(r"\s+", " ", text)


def is_section_header(line):
    return bool(SECTION_HEADER_RE.match(str(line or "")))


def token_is_chord(token):
    value = str(token or "").strip().replace("|", "")
    if not value or value in {".", "/"}:
        return False
    value = value.strip("(),.:")
    if not value:
        return False
    return bool(CHORD_TOKEN_RE.match(value))


def split_mixed_chord_line(line):
    tokens = re.split(r"\s+", str(line or "").strip())
    chord_tokens = []
    lyric_tokens = []
    for token in tokens:
        if not token:
            continue
        if token == "|":
            chord_tokens.append(token)
        elif token_is_chord(token):
            chord_tokens.append(token.strip())
        else:
            lyric_tokens.append(token.strip())
    return chord_tokens, lyric_tokens


def finalize_sheet_lines(raw_lines):
    sheet_lines = []
    for raw_line in raw_lines:
        line = normalize_sheet_line(raw_line)
        if not line:
            if sheet_lines and sheet_lines[-1] != "":
                sheet_lines.append("")
            continue
        if CHORD_SHEET_NOISE_RE.match(line):
            continue
        if TAB_LINE_RE.match(line):
            continue
        if BEAT_COUNT_LINE_RE.match(line):
            continue
        if CHORD_DIAGRAM_LINE_RE.match(line):
            continue
        if not re.search(r"[A-Za-z0-9]", line):
            if sheet_lines and sheet_lines[-1] != "":
                sheet_lines.append("")
            continue
        if is_section_header(line):
            if sheet_lines and sheet_lines[-1] != "":
                sheet_lines.append("")
            sheet_lines.append(line)
            continue

        chord_tokens, lyric_tokens = split_mixed_chord_line(line)
        lyric_text = " ".join(lyric_tokens)
        if not re.search(r"[A-Za-z0-9]", lyric_text):
            lyric_text = ""
        if chord_tokens and lyric_text:
            sheet_lines.append(" ".join(chord_tokens))
            sheet_lines.append(lyric_text)
        elif chord_tokens:
            sheet_lines.append(" ".join(chord_tokens))
        elif lyric_text:
            sheet_lines.append(lyric_text)

    while sheet_lines and sheet_lines[-1] == "":
        sheet_lines.pop()
    return sheet_lines


def is_chord_sheet_line(line):
    if is_section_header(line):
        return False
    chord_tokens, lyric_tokens = split_mixed_chord_line(line)
    return bool(chord_tokens) and not lyric_tokens


def has_usable_chord_lines(sheet_lines):
    chord_line_count = 0
    multi_chord_line_count = 0
    for line in sheet_lines or []:
        if not is_chord_sheet_line(line):
            continue
        chord_line_count += 1
        chord_tokens, _lyric_tokens = split_mixed_chord_line(line)
        if len(chord_tokens) >= 2:
            multi_chord_line_count += 1
    return chord_line_count >= 2 and (multi_chord_line_count >= 1 or chord_line_count >= 4)


def strip_azchords_chord_dictionary_preamble(sheet_lines):
    lines = list(sheet_lines or [])
    marker_index = None
    for idx, line in enumerate(lines[:25]):
        if str(line or "").strip().upper() == "CHORDS":
            marker_index = idx
            break
    if marker_index is None:
        return lines
    for idx in range(marker_index + 1, len(lines)):
        if is_section_header(lines[idx]):
            return lines[idx:]
    return lines


def collect_section_labels(sheet_lines):
    labels = []
    seen = set()
    for line in sheet_lines or []:
        if not is_section_header(line):
            continue
        label = str(line or "").strip()
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels


def section_labels_need_translation(labels):
    for label in labels or []:
        if NON_ENGLISH_SECTION_LABEL_RE.search(label):
            return True
    return False


def parse_llm_json_mapping(content, expected_keys):
    text = _extract_llm_message_text(content)
    if not text:
        raise ValueError("LLM returned empty text")
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    else:
        object_match = re.search(r"(\{.*\})", text, re.S)
        if object_match:
            text = object_match.group(1)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("LLM translation response was not a JSON object")
    mapping = {}
    for key in expected_keys:
        translated = data.get(key)
        if isinstance(translated, str) and translated.strip():
            mapping[key] = translated.strip()
    return mapping


def _extract_llm_message_text(message_or_content):
    if isinstance(message_or_content, dict):
        content = str(message_or_content.get("content") or "").strip()
        if content:
            return content
        reasoning = str(message_or_content.get("reasoning_content") or "").strip()
        if reasoning:
            fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", reasoning, re.S)
            if fenced:
                return fenced.group(1)
            object_match = re.search(r"(\{.*\})", reasoning, re.S)
            if object_match:
                return object_match.group(1)
        return ""
    return str(message_or_content or "").strip()


def apply_section_label_translations(sheet_lines, mapping):
    if not mapping:
        return list(sheet_lines or [])
    translated = []
    for line in sheet_lines or []:
        replacement = mapping.get(line)
        translated.append(replacement if replacement else line)
    return translated


async def translate_cifraclub_section_labels(client, sheet_lines):
    labels = collect_section_labels(sheet_lines)
    labels_to_translate = [
        label for label in labels if NON_ENGLISH_SECTION_LABEL_RE.search(label)
    ]
    if not labels_to_translate:
        return sheet_lines

    prompt = (
        "Translate these chord-sheet section labels from Portuguese or Spanish into concise English.\n"
        "Keep square brackets when present.\n"
        "Prefer standard musician terms (Intro, Verse, Chorus, Bridge, Solo, Riff, Outro, etc.).\n"
        "Return ONLY a JSON object whose keys are the exact input strings and values are translations.\n\n"
        + json.dumps(labels_to_translate, ensure_ascii=False)
    )
    response = await client.post(
        f"{LLM_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {LLM_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": LLM_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You translate short chord-sheet section labels for musicians. "
                        "Respond with valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 1024,
        },
        timeout=LLM_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("LLM returned no choices")
    message = choices[0].get("message") or {}
    mapping = parse_llm_json_mapping(message, labels_to_translate)
    if not mapping:
        return sheet_lines
    return apply_section_label_translations(sheet_lines, mapping)


def extract_azchords_sheet(html_text):
    match = AZCHORDS_CONTENT_RE.search(html_text or "")
    if not match:
        return None
    return html_to_text(match.group(1))


def _strip_chord_sheet_html(fragment):
    # Keep the inner text of chord spans (which is the chord name), drop other tags.
    text = CHORD_SPAN_RE.sub(lambda m: m.group(2), fragment or "")
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(div|p)>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\u00a0", " ")
    return text


def extract_echords_sheet(html_text):
    match = ECHORDS_PRE_RE.search(html_text or "")
    if not match:
        return None
    sheet = _strip_chord_sheet_html(match.group(1))
    return sheet if sheet.strip() else None


def extract_cifraclub_sheet(html_text):
    match = CIFRACLUB_PRE_RE.search(html_text or "")
    if not match:
        return None
    sheet = _strip_chord_sheet_html(match.group(1))
    return sheet if sheet.strip() else None


def _clean_worshiptogether_fragment(fragment):
    text = re.sub(r"<[^>]+>", "", fragment or "")
    text = html.unescape(text).replace("\xa0", " ").replace("&nbsp;", " ").strip()
    return text


def extract_worshiptogether_sheet(html_text):
    if not html_text:
        return None
    lines = []
    line_starts = [match.start() for match in re.finditer(r'<div class="chord-pro-line">', html_text, re.I)]
    for index, start in enumerate(line_starts):
        end = line_starts[index + 1] if index + 1 < len(line_starts) else len(html_text)
        chunk = html_text[start:end]
        note_match = WORSHIPTOGETHER_NOTE_RE.search(chunk)
        lyric_match = WORSHIPTOGETHER_LYRIC_RE.search(chunk)
        note = _clean_worshiptogether_fragment(note_match.group(1) if note_match else "")
        lyric = _clean_worshiptogether_fragment(lyric_match.group(1) if lyric_match else "")
        if note and not lyric:
            lines.append(note)
        elif lyric and not note:
            if WORSHIPTOGETHER_SECTION_RE.match(lyric):
                lines.append("[{0}]".format(lyric))
            else:
                lines.append(lyric)
        elif note and lyric:
            lines.append(note)
            lines.append(lyric)
    if not lines:
        return None
    return "\n".join(lines)


def extract_sheet_from_html(html_text, page_url):
    host = (urlparse(page_url).hostname or "").lower()
    if "azchords.com" in host:
        return extract_azchords_sheet(html_text)
    if "e-chords.com" in host:
        return extract_echords_sheet(html_text)
    if "cifraclub.com" in host:
        return extract_cifraclub_sheet(html_text)
    if "worshiptogether.com" in host:
        return extract_worshiptogether_sheet(html_text)
    return None


def build_direct_candidates(title, artist):
    """Build predictable slug URLs for sites that don't need a search engine."""
    title_slug = slugify(title)
    artist_slug = slugify(artist)
    if not title_slug or not artist_slug:
        return []
    return [
        {
            "url": "https://www.e-chords.com/chords/{0}/{1}".format(artist_slug, title_slug),
            "title": title,
            "artist": artist,
            "source": "e-chords.com",
            "score": 100,
        },
        {
            "url": "https://www.cifraclub.com/{0}/{1}/".format(artist_slug, title_slug),
            "title": title,
            "artist": artist,
            "source": "cifraclub.com",
            "score": 90,
        },
    ]


def _display_host(raw_url):
    return (urlparse(raw_url).hostname or "").lower().replace("www.", "")


def _strip_search_result_text(value):
    text = html.unescape(str(value or ""))
    text = SEARCH_RESULT_TAG_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def _candidate_from_search_result(item, title, artist, default_source):
    raw_url = str(item.get("url") or item.get("link") or "").strip()
    validated, error = validate_chord_page_url(raw_url)
    if error:
        return None

    host = _display_host(validated)
    # We can only use discovered pages from hosts we know how to parse.
    if not any(known in host for known in ("e-chords.com", "cifraclub.com", "azchords.com", "worshiptogether.com")):
        return None

    result_title = _strip_search_result_text(item.get("title") or "")
    snippet = _strip_search_result_text(item.get("description") or item.get("snippet") or "")
    score = score_title_artist_match(result_title, snippet, title, artist)
    lower_text = " ".join([result_title, snippet, validated]).lower()
    if "chord" in lower_text:
        score += 40
    if "tab" in lower_text:
        score += 10
    if "ukulele" in lower_text:
        score -= 35
    if normalize_match_text(title) and normalize_match_text(title) in normalize_match_text(lower_text):
        score += 40
    if artist and normalize_match_text(artist) in normalize_match_text(lower_text):
        score += 30

    return {
        "url": validated,
        "title": title,
        "artist": artist,
        "source": host or default_source,
        "score": score or 5,
    }


def brave_chord_candidates_from_results(data, title, artist):
    candidates = []
    web_results = ((data or {}).get("web") or {}).get("results") or []
    for item in web_results:
        if not isinstance(item, dict):
            continue
        candidate = _candidate_from_search_result(item, title, artist, "brave")
        if candidate:
            candidates.append(candidate)
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


def parse_duckduckgo_result_urls(html_text):
    urls = []
    for match in DUCKDUCKGO_RESULT_RE.finditer(html_text or ""):
        candidate = html.unescape(match.group(1))
        if candidate.startswith("//"):
            candidate = "https:" + candidate
        parsed = urlparse(candidate)
        if "duckduckgo.com" in (parsed.netloc or ""):
            target = parse_qs(parsed.query).get("uddg", [""])[0]
            candidate = unquote(target) if target else candidate
        validated, error = validate_chord_page_url(candidate)
        if error:
            continue
        if validated not in urls:
            urls.append(validated)
    return urls


def azchords_candidates(search_html, title, artist):
    candidates = []
    for url in parse_duckduckgo_result_urls(search_html):
        path = urlparse(url).path or ""
        parts = [part for part in path.split("/") if part]
        candidate_artist = ""
        candidate_title = ""
        if len(parts) >= 2:
            artist_part = parts[-2]
            title_part = parts[-1]
            artist_part = re.sub(r"-tabs-\d+$", "", artist_part)
            title_part = re.sub(r"-tabs-\d+\.html$", "", title_part)
            candidate_artist = artist_part.replace("-", " ")
            candidate_title = title_part.replace("-", " ")
        score = score_title_artist_match(candidate_title, candidate_artist, title, artist)
        if score <= 0:
            score = 5
        candidates.append(
            {
                "url": url,
                "title": candidate_title or title,
                "artist": candidate_artist or artist,
                "source": "azchords.com",
                "score": score,
            }
        )
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


async def fetch_text(client, url, headers=None):
    merged_headers = fetch_headers()
    if headers:
        merged_headers.update(headers)
    response = await client.get(url, headers=merged_headers, follow_redirects=True)
    response.raise_for_status()
    return response.text


def build_brave_chord_query(title, artist):
    terms = ['"{0}"'.format(title)]
    if artist:
        terms.append('"{0}"'.format(artist))
    terms.append("chords")
    terms.append("(site:e-chords.com OR site:cifraclub.com OR site:azchords.com OR site:worshiptogether.com)")
    return " ".join(terms)


async def search_brave_chord_candidates(client, title, artist):
    if not BRAVE_SEARCH_API_KEY:
        return []
    response = await client.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={
            "q": build_brave_chord_query(title, artist),
            "count": CHORD_SEARCH_RESULTS_PER_QUERY,
        },
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
        },
    )
    response.raise_for_status()
    return brave_chord_candidates_from_results(response.json(), title, artist)


async def search_azchords_candidates(client, title, artist):
    query = 'site:azchords.com "{0}" chords {1}'.format(title, artist or "").strip()
    xml_text = await fetch_text(client, BING_RSS_SEARCH_URL + quote(query))
    candidates = []
    for item_match in RSS_ITEM_RE.finditer(xml_text or ""):
        item_title = html.unescape(item_match.group(1) or "")
        item_url = html.unescape(item_match.group(2) or "")
        item_description = html.unescape(item_match.group(3) or "")
        validated, error = validate_chord_page_url(item_url)
        if error or "azchords.com" not in validated:
            continue

        title_match = re.match(r"^(.*?)\s+Chords\s+[–-]\s+(.*?)\s+\|", item_title, re.I)
        candidate_title = title
        candidate_artist = artist
        if title_match:
            candidate_title = title_match.group(1).strip() or candidate_title
            candidate_artist = title_match.group(2).strip() or candidate_artist

        score = score_title_artist_match(candidate_title, candidate_artist, title, artist)
        lower_title = item_title.lower()
        if " chords " in (" " + lower_title + " "):
            score += 40
        if "ukulele" in lower_title:
            score -= 40
        if item_description:
            score += min(20, len(item_description) // 60)

        candidates.append(
            {
                "url": validated,
                "title": candidate_title,
                "artist": candidate_artist,
                "source": "azchords.com",
                "score": score or 5,
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


async def fetch_chord_sheet_from_page(client, page_url):
    validated, error = validate_chord_page_url(page_url)
    if error:
        raise ValueError(error)
    html_text = await fetch_text(client, validated)
    raw_sheet = extract_sheet_from_html(html_text, validated)
    if not raw_sheet:
        return None
    sheet_lines = finalize_sheet_lines(raw_sheet.splitlines())
    if not sheet_lines:
        return None
    if not has_usable_chord_lines(sheet_lines):
        return None
    host = (urlparse(validated).hostname or "").replace("www.", "")
    if "azchords.com" in host:
        sheet_lines = strip_azchords_chord_dictionary_preamble(sheet_lines)
    if "cifraclub.com" in host:
        try:
            sheet_lines = await translate_cifraclub_section_labels(client, sheet_lines)
        except Exception:
            pass
    return {
        "sheetLines": sheet_lines,
        "source": host,
        "sourceUrl": validated,
    }


def dedupe_candidates(candidates):
    seen = set()
    ordered = []
    for candidate in candidates or []:
        url = candidate.get("url") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        ordered.append(candidate)
    return ordered


async def first_successful_candidate(client, candidates, title, artist):
    """Fetch candidate pages concurrently and return the best (highest-priority)
    one that yields a usable sheet, preserving candidate order as the tie-break."""
    candidates = (candidates or [])[:8]
    if not candidates:
        return None

    async def attempt(candidate):
        try:
            return await fetch_chord_sheet_from_page(client, candidate["url"])
        except Exception:
            return None

    results = await asyncio.gather(*[attempt(candidate) for candidate in candidates])
    for candidate, result in zip(candidates, results):
        if result:
            result["title"] = candidate.get("title") or title
            result["artist"] = candidate.get("artist") or artist
            return result
    return None


async def _search_chords_for_artist(client, title, artist):
    direct_candidates = dedupe_candidates(build_direct_candidates(title, artist))
    result = await first_successful_candidate(client, direct_candidates, title, artist)
    if result:
        return result

    try:
        brave_candidates = await search_brave_chord_candidates(client, title, artist)
    except Exception:
        brave_candidates = []

    tried_urls = {candidate.get("url") for candidate in direct_candidates}
    brave_candidates = [
        candidate
        for candidate in dedupe_candidates(brave_candidates)
        if candidate.get("url") not in tried_urls
    ]
    if brave_candidates:
        return await first_successful_candidate(client, brave_candidates, title, artist)

    try:
        az_candidates = await search_azchords_candidates(client, title, artist)
    except Exception:
        az_candidates = []
    az_candidates = [
        candidate
        for candidate in dedupe_candidates(az_candidates)
        if candidate.get("url") not in tried_urls
    ]
    if az_candidates:
        return await first_successful_candidate(client, az_candidates, title, artist)

    return None


def _chord_preview(sheet_lines, max_lines=4):
    meaningful = [line for line in (sheet_lines or []) if str(line or "").strip()]
    return "\n".join(meaningful[:max_lines])


def _annotate_chord_candidate(result, title_only=False):
    annotated = dict(result)
    annotated["titleOnly"] = bool(title_only)
    annotated["preview"] = _chord_preview(result.get("sheetLines") or [])
    return annotated


def _chord_candidate_key(result):
    source_url = (result.get("sourceUrl") or "").strip().lower()
    if source_url:
        return source_url
    artist = normalize_match_text(result.get("artist"))
    source = normalize_match_text(result.get("source"))
    return artist + ":" + source


async def search_chords_with_candidates(title, on_progress=None):
    title = str(title or "").strip()
    if not title:
        raise ValueError("Song title is required")

    async with httpx.AsyncClient(timeout=CHORDS_FETCH_TIMEOUT_SECONDS) as client:
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
                "Searching chords for {0}...".format(search_artist),
                0.15 + (0.55 * (index + 1) / total_steps),
            )
            result = await _search_chords_for_artist(client, title, search_artist)
            if not result:
                continue
            key = _chord_candidate_key(result)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(_annotate_chord_candidate(result, title_only=False))

        await _emit_progress(
            on_progress,
            "search",
            "Searching chords by title...",
            0.78,
        )
        title_result = await _search_chords_for_artist(client, title, "")
        if title_result:
            key = _chord_candidate_key(title_result)
            if key not in seen:
                candidates.append(_annotate_chord_candidate(title_result, title_only=True))

        if not candidates:
            await _emit_progress(on_progress, "done", "No chords found for this song", 1.0)
            raise ValueError("No chords found for this song")

        await _emit_progress(on_progress, "done", "Chord candidates ready", 1.0)
        return {
            "multiple": True,
            "candidates": candidates,
        }


async def search_chords(title, artist, on_progress=None):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        raise ValueError("Song title is required")

    if is_generic_artist(artist):
        return await search_chords_with_candidates(title, on_progress=on_progress)

    async with httpx.AsyncClient(timeout=CHORDS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "search", "Checking chord sites...", 0.2)
        result = await _search_chords_for_artist(client, title, artist)
        if result:
            await _emit_progress(on_progress, "done", "Chords found", 1.0)
            return result

    await _emit_progress(on_progress, "done", "No chords found for this song", 1.0)
    raise ValueError("No chords found for this song")


async def fetch_chords_url(url, on_progress=None):
    await _emit_progress(on_progress, "fetch", "Fetching chord page...", 0.15)
    async with httpx.AsyncClient(timeout=CHORDS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "extract", "Extracting chords...", 0.55)
        result = await fetch_chord_sheet_from_page(client, url)
        if not result:
            await _emit_progress(on_progress, "done", "Could not extract chords from that page", 1.0)
            raise ValueError("Could not extract chords from that page")
        result["title"] = ""
        result["artist"] = ""
        await _emit_progress(on_progress, "done", "Chords found", 1.0)
        return result
