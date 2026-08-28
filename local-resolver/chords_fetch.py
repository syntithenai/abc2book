import asyncio
import html
import json
import os
import re
import unicodedata
from urllib.parse import parse_qs, quote, unquote, urlparse

import httpx

from browser_fetch import (
    fetch_html_with_fallback,
    is_manual_only_host,
    is_playwright_eligible_host,
)
from polite_fetch import BROWSER_USER_AGENT
from recording_artists import discover_recording_artists, is_generic_artist
from scrape_proxy import make_scrape_http_client
from tune_background_research import LLM_TIMEOUT_SECONDS

CHORDS_FETCH_TIMEOUT_SECONDS = 20.0
CHORD_SEARCH_RESULTS_PER_QUERY = int(os.getenv("CHORD_SEARCH_RESULTS_PER_QUERY", "8"))
BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()

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
    "chordie.com",
    "guitartabs.cc",
    "worshiptogether.com",
)

# Hosts we can parse into a chord sheet.
SCRAPABLE_CHORD_HOST_SUFFIXES = (
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
    "chordie.com",
    "guitartabs.cc",
    "worshiptogether.com",
)

DISCOVERY_CHORD_HOST_SUFFIXES = SCRAPABLE_CHORD_HOST_SUFFIXES

DUCKDUCKGO_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/?q="
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
# Guitar tablature lines are noise for a lyric/chord sheet.
# Covers pipe form ("E|-1-3-3-|") and dash form ("G----", "E---5--5/12--0--").
TAB_LINE_RE = re.compile(
    r"^[eadgbEADGB]\s*(?:"
    r"\|[-0-9hpbrx/\\~().*\s|]+|"
    r"[-|]{2,}[-0-9hpbrx/\\~().*\s|]*"
    r")$"
)
BEAT_COUNT_LINE_RE = re.compile(r"^(?:\d+\s*\+\s*)+\d?\s*\+?$")
CHORD_DIAGRAM_LINE_RE = re.compile(r"^(?:[A-G](?:#|b)?[^ ]*\s+)?[x0-9](?:-[x0-9]){3,}(?:-[x0-9])*\s*$", re.I)
DUCKDUCKGO_RESULT_RE = re.compile(r'class="result__a"\s+href="([^"]+)"', re.I)
SEARCH_RESULT_TAG_RE = re.compile(r"<[^>]+>")
CAPO_META_RE = re.compile(r"^capo\s*:?\s*(\d+)\s*$", re.I)
KEY_META_RE = re.compile(r"^key\s*:\s*(.+)$", re.I)
TUNING_META_RE = re.compile(r"^tuning\s*:\s*(.+)$", re.I)
UG_JS_STORE_DATA_RE = re.compile(
    r'(?:class="[^"]*js-store[^"]*"[^>]*data-content="([^"]+)"|data-content="([^"]+)"[^>]*class="[^"]*js-store[^"]*")',
    re.I,
)
UG_DATA_CONTENT_RE = re.compile(r'data-content="([^"]+)"', re.I)
UG_CH_TAG_RE = re.compile(r"\[ch\](.*?)\[/ch\]", re.S | re.I)
UG_TAB_TAG_RE = re.compile(r"\[/?tab\]", re.I)
UG_CHORDS_TYPE_RE = re.compile(r"^chords$", re.I)


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
    r"^(?:capo\s*:?\s*\d+|tuning\s*:.*|key\s*:.*|submitted by:.*|"
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
    import unicodedata
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _meaningful_substring_overlap(left, right):
    if not left or not right:
        return False
    if left not in right and right not in left:
        return False
    shorter = min(len(left), len(right))
    longer = max(len(left), len(right))
    # Avoid "clare" ranking close to "claredelune".
    return shorter >= 5 and (shorter / float(longer)) >= 0.65


def score_title_artist_match(candidate_title, candidate_artist, title, artist):
    title_key = normalize_match_text(title)
    artist_key = normalize_match_text(artist)
    candidate_title_key = normalize_match_text(candidate_title)
    candidate_artist_key = normalize_match_text(candidate_artist)
    score = 0

    if title_key and candidate_title_key:
        if candidate_title_key == title_key:
            score += 80
        elif _meaningful_substring_overlap(title_key, candidate_title_key):
            score += 45

    if artist_key and candidate_artist_key:
        if candidate_artist_key == artist_key:
            score += 60
        elif _meaningful_substring_overlap(artist_key, candidate_artist_key):
            score += 30

    return score


def _host_matches_suffixes(hostname, suffixes):
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in suffixes)


def is_allowed_chord_host(hostname):
    return _host_matches_suffixes(hostname, CHORD_PAGE_HOST_SUFFIXES)


def is_scrapable_chord_host(hostname):
    if is_manual_only_host(hostname):
        return False
    return _host_matches_suffixes(hostname, SCRAPABLE_CHORD_HOST_SUFFIXES)


def classify_chord_host(hostname):
    """Return 'manual_only', 'scrapable', or 'unknown' for a chord page host."""
    if is_manual_only_host(hostname):
        return "manual_only"
    if is_scrapable_chord_host(hostname):
        return "scrapable"
    return "unknown"


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
    # Tab frets ("G----", "E---5--") match CHORD_TOKEN_RE because "-" is allowed;
    # reject runs of dashes so bass/guitar tab is not treated as chord symbols.
    if re.search(r"-{2,}", value):
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


def extract_chord_sheet_meta(lines):
    """Capture capo/key/tuning from preamble-style lines before noise strip."""
    meta = {"capo": None, "key": None, "tuning": None}
    for raw_line in lines or []:
        line = normalize_sheet_line(raw_line)
        if not line:
            continue
        capo_match = CAPO_META_RE.match(line)
        if capo_match:
            if meta["capo"] is None:
                meta["capo"] = int(capo_match.group(1))
            continue
        key_match = KEY_META_RE.match(line)
        if key_match:
            if meta["key"] is None:
                meta["key"] = key_match.group(1).strip()
            continue
        tuning_match = TUNING_META_RE.match(line)
        if tuning_match:
            if meta["tuning"] is None:
                meta["tuning"] = tuning_match.group(1).strip()
            continue
    return meta


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

    from llm_runtime import enrich_chat_completion_payload, llm_auth_headers, llm_chat_url, llm_model

    prompt = (
        "Translate these chord-sheet section labels from Portuguese or Spanish into concise English.\n"
        "Keep square brackets when present.\n"
        "Prefer standard musician terms (Intro, Verse, Chorus, Bridge, Solo, Riff, Outro, etc.).\n"
        "Return ONLY a JSON object whose keys are the exact input strings and values are translations.\n\n"
        + json.dumps(labels_to_translate, ensure_ascii=False)
    )
    response = await client.post(
        llm_chat_url(),
        headers=llm_auth_headers(),
        json=enrich_chat_completion_payload({
            "model": llm_model(),
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
        }),
        timeout=LLM_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    from llm_runtime import note_chat_completion_usage

    note_chat_completion_usage(payload)
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


def extract_first_pre_sheet(html_text):
    match = ECHORDS_PRE_RE.search(html_text or "")
    if not match:
        return None
    sheet = _strip_chord_sheet_html(match.group(1))
    return sheet if sheet.strip() else None


def extract_echords_sheet(html_text):
    return extract_first_pre_sheet(html_text)


def extract_cifraclub_sheet(html_text):
    match = CIFRACLUB_PRE_RE.search(html_text or "")
    if not match:
        return None
    sheet = _strip_chord_sheet_html(match.group(1))
    return sheet if sheet.strip() else None


def extract_chordsbase_sheet(html_text):
    return extract_first_pre_sheet(html_text)


def extract_chords_and_tabs_sheet(html_text):
    return extract_first_pre_sheet(html_text)


def extract_guitaretab_sheet(html_text):
    return extract_first_pre_sheet(html_text)


def extract_akordy_kytary_sheet(html_text):
    return extract_first_pre_sheet(html_text)


def extract_chordie_sheet(html_text):
    return extract_first_pre_sheet(html_text)


def extract_guitartabs_sheet(html_text):
    return extract_first_pre_sheet(html_text)


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


def _parse_ug_js_store(html_text):
    """Decode Ultimate Guitar's embedded js-store JSON, or None."""
    if not html_text:
        return None
    encoded = None
    match = UG_JS_STORE_DATA_RE.search(html_text)
    if match:
        encoded = match.group(1) or match.group(2)
    if not encoded:
        for data_match in UG_DATA_CONTENT_RE.finditer(html_text):
            candidate = data_match.group(1)
            if "wiki_tab" in html.unescape(candidate):
                encoded = candidate
                break
    if not encoded:
        return None
    try:
        return json.loads(html.unescape(encoded))
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def _ug_page_data(store):
    if not isinstance(store, dict):
        return None
    page = (store.get("store") or {}).get("page") or {}
    data = page.get("data")
    return data if isinstance(data, dict) else None


def _strip_ug_wiki_markup(content):
    text = UG_CH_TAG_RE.sub(r"\1", content or "")
    text = UG_TAB_TAG_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text


def _ug_meta_preamble(tab, tab_view):
    """Build Capo/Key/Tuning lines from UG tab_view.meta for extract_chord_sheet_meta."""
    lines = []
    meta = (tab_view or {}).get("meta") if isinstance(tab_view, dict) else None
    if not isinstance(meta, dict):
        meta = {}
    capo = meta.get("capo")
    if capo is not None and str(capo).strip() != "":
        try:
            lines.append("Capo {0}".format(int(capo)))
        except (TypeError, ValueError):
            lines.append("Capo {0}".format(capo))
    tonality = (
        meta.get("tonality")
        or (tab or {}).get("tonality_name")
        or ""
    )
    tonality = str(tonality).strip()
    if tonality:
        lines.append("Key: {0}".format(tonality))
    tuning = meta.get("tuning")
    if isinstance(tuning, dict):
        tuning_value = str(tuning.get("value") or "").strip()
        if tuning_value:
            lines.append("Tuning: {0}".format(tuning_value))
    return lines


def extract_ultimate_guitar_sheet(html_text):
    """Extract a chord sheet from Ultimate Guitar's embedded js-store JSON."""
    store = _parse_ug_js_store(html_text)
    data = _ug_page_data(store)
    if not data:
        return None
    tab = data.get("tab") if isinstance(data.get("tab"), dict) else {}
    tab_view = data.get("tab_view") if isinstance(data.get("tab_view"), dict) else {}
    tab_type = str(tab.get("type") or "").strip()
    if tab_type and not UG_CHORDS_TYPE_RE.match(tab_type):
        return None
    wiki = tab_view.get("wiki_tab") if isinstance(tab_view.get("wiki_tab"), dict) else {}
    content = wiki.get("content")
    if not isinstance(content, str) or not content.strip():
        return None
    body = _strip_ug_wiki_markup(content).strip()
    if not body:
        return None
    preamble = _ug_meta_preamble(tab, tab_view)
    if preamble:
        return "\n".join(preamble + ["", body])
    return body


def extract_sheet_from_html(html_text, page_url):
    host = (urlparse(page_url).hostname or "").lower()
    if "ultimate-guitar.com" in host:
        return extract_ultimate_guitar_sheet(html_text)
    if "azchords.com" in host:
        return extract_azchords_sheet(html_text)
    if "e-chords.com" in host:
        return extract_echords_sheet(html_text)
    if "cifraclub.com" in host:
        return extract_cifraclub_sheet(html_text)
    if "worshiptogether.com" in host:
        return extract_worshiptogether_sheet(html_text)
    if "chordsbase.com" in host:
        return extract_chordsbase_sheet(html_text)
    if "chords-and-tabs.net" in host:
        return extract_chords_and_tabs_sheet(html_text)
    if "guitaretab.com" in host:
        return extract_guitaretab_sheet(html_text)
    if "akordy.kytary.cz" in host:
        return extract_akordy_kytary_sheet(html_text)
    if "chordie.com" in host:
        return extract_chordie_sheet(html_text)
    if "guitartabs.cc" in host:
        return extract_guitartabs_sheet(html_text)
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


def _is_known_discovery_host(host):
    return _host_matches_suffixes(host, DISCOVERY_CHORD_HOST_SUFFIXES)


def _candidate_from_search_result(item, title, artist, default_source):
    raw_url = str(item.get("url") or item.get("link") or "").strip()
    validated, error = validate_chord_page_url(raw_url)
    if error:
        return None

    host = _display_host(validated)
    # Discovery includes all scrapable chord hosts (including Ultimate Guitar).
    if not _is_known_discovery_host(host):
        return None

    result_title = _strip_search_result_text(item.get("title") or "")
    snippet = _strip_search_result_text(item.get("description") or item.get("snippet") or "")
    score = score_title_artist_match(result_title, snippet, title, artist)
    lower_text = " ".join([result_title, snippet, validated]).lower()
    lower_url = validated.lower()
    if "-chords-" in lower_url or "/chords/" in lower_url:
        score += 50
    elif "chord" in lower_text:
        score += 40
    if "ultimate-guitar.com" in host:
        score += 200
    if "-tabs-" in lower_url and "-chords-" not in lower_url:
        score -= 25
    if "guitar-pro" in lower_url or "guitar_pro" in lower_url:
        score -= 50
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


async def fetch_text(client, url, headers=None, allow_playwright=True):
    """Fetch HTML via polite httpx with optional Playwright fallback for eligible hosts."""
    host = urlparse(url).hostname or ""

    # Search-engine HTML does not need Playwright; chord pages may.
    use_playwright = allow_playwright and is_playwright_eligible_host(host)
    result = await fetch_html_with_fallback(
        client,
        url,
        allow_playwright=use_playwright,
    )
    text = result.text or ""
    if result.blocked_reason == "none" and text.strip():
        return text
    if result.blocked_reason in {"challenge_html", "empty", "http_status"} and not text.strip():
        raise ValueError("Blocked or empty response from {0}".format(url))
    if result.status >= 400:
        raise httpx.HTTPStatusError(
            "HTTP {0} for {1}".format(result.status, url),
            request=httpx.Request("GET", url),
            response=httpx.Response(result.status or 500, text=text),
        )
    return text


def build_brave_chord_query(title, artist, site_host=None):
    terms = ['"{0}"'.format(title)]
    if artist:
        terms.append('"{0}"'.format(artist))
    terms.append("chords")
    if site_host:
        terms.append("site:{0}".format(site_host))
    else:
        terms.append(
            "(site:tabs.ultimate-guitar.com OR site:e-chords.com OR site:cifraclub.com "
            "OR site:azchords.com OR site:worshiptogether.com OR site:chordsbase.com "
            "OR site:chords-and-tabs.net OR site:guitaretab.com OR site:akordy.kytary.cz "
            "OR site:chordie.com OR site:guitartabs.cc)"
        )
    return " ".join(terms)


async def search_brave_chord_candidates(client, title, artist, site_host=None):
    if not BRAVE_SEARCH_API_KEY:
        return []
    response = await client.get(
        "https://api.search.brave.com/res/v1/web/search",
        params={
            "q": build_brave_chord_query(title, artist, site_host=site_host),
            "count": CHORD_SEARCH_RESULTS_PER_QUERY,
        },
        headers={
            "Accept": "application/json",
            "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
        },
    )
    # Rate limits (429) and transient Brave failures should not abort UG discovery.
    if response.status_code >= 400:
        return []
    return brave_chord_candidates_from_results(response.json(), title, artist)


def _walk_ug_tab_entries(node, out):
    """Collect dicts that look like UG tab search/result rows."""
    if isinstance(node, dict):
        tab_url = node.get("tab_url") or node.get("tabUrl")
        tab_type = node.get("type") or node.get("type_name") or ""
        if isinstance(tab_url, str) and tab_url.strip():
            out.append(node)
        elif tab_type:
            # Keep walking; nested payloads still hold the rows.
            pass
        for value in node.values():
            _walk_ug_tab_entries(value, out)
    elif isinstance(node, list):
        for item in node:
            _walk_ug_tab_entries(item, out)


def ultimate_guitar_search_candidates_from_html(html_text, title, artist):
    """Parse Ultimate Guitar search-page js-store into ranked chord candidates."""
    store = _parse_ug_js_store(html_text)
    if not store:
        return []
    rows = []
    _walk_ug_tab_entries(store, rows)
    candidates = []
    seen = set()
    for row in rows:
        tab_type = str(row.get("type") or row.get("type_name") or "").strip().lower()
        if tab_type and tab_type not in {"chords", "chord"}:
            continue
        raw_url = str(row.get("tab_url") or row.get("tabUrl") or "").strip()
        if not raw_url:
            continue
        validated, error = validate_chord_page_url(raw_url)
        if error or not validated:
            continue
        lower_url = validated.lower()
        if "-chords-" not in lower_url and "/chords/" not in lower_url:
            # Search rows sometimes omit type; still require chords URL shape.
            if tab_type not in {"chords", "chord"}:
                continue
        if validated in seen:
            continue
        seen.add(validated)
        song_name = str(row.get("song_name") or row.get("songName") or title or "").strip()
        artist_name = str(row.get("artist_name") or row.get("artistName") or artist or "").strip()
        score = score_title_artist_match(song_name, artist_name, title, artist)
        try:
            votes = float(row.get("votes") or 0)
        except (TypeError, ValueError):
            votes = 0.0
        try:
            rating = float(row.get("rating") or 0)
        except (TypeError, ValueError):
            rating = 0.0
        # Prefer popular, highly rated Official-style sheets.
        score += min(220, int(votes / 50)) + int(rating * 8)
        score += 200  # Ultimate Guitar preference
        candidates.append({
            "url": validated,
            "title": song_name or title,
            "artist": artist_name or artist,
            "source": "tabs.ultimate-guitar.com",
            "score": score,
        })
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


async def search_ultimate_guitar_site_candidates(client, title, artist):
    """Query Ultimate Guitar's own search page for chord tabs (Brave-independent)."""
    query = " ".join([part for part in [title, artist] if part]).strip()
    if not query:
        return []
    # type=300 filters to Chords on UG search.
    search_url = (
        "https://www.ultimate-guitar.com/search.php?search_type=title&type=300&value="
        + quote(query)
    )
    try:
        html_text = await fetch_text(client, search_url, allow_playwright=True)
    except Exception:
        return []
    return ultimate_guitar_search_candidates_from_html(html_text, title, artist)


async def search_duckduckgo_site_candidates(client, title, artist, site_host, source_label):
    query = 'site:{0} "{1}" chords {2}'.format(site_host, title, artist or "").strip()
    html_text = await fetch_text(
        client,
        DUCKDUCKGO_HTML_SEARCH_URL + quote(query),
        allow_playwright=False,
    )
    candidates = []
    for url in parse_duckduckgo_result_urls(html_text):
        if site_host not in url:
            continue

        path = urlparse(url).path or ""
        parts = [part for part in path.split("/") if part]
        candidate_artist = artist
        candidate_title = title
        if len(parts) >= 2:
            artist_part = parts[-2]
            title_part = parts[-1]
            artist_part = re.sub(r"-tabs-\d+$", "", artist_part)
            title_part = re.sub(r"-tabs-\d+\.html$", "", title_part)
            candidate_artist = artist_part.replace("-", " ") or candidate_artist
            candidate_title = title_part.replace("-", " ") or candidate_title

        score = score_title_artist_match(candidate_title, candidate_artist, title, artist)
        lower_url = url.lower()
        if "-chords-" in lower_url or "/chords/" in lower_url:
            score += 50
        elif "chord" in lower_url or "chords" in lower_url:
            score += 40
        if "ultimate-guitar.com" in (site_host or "").lower() or "ultimate-guitar.com" in lower_url:
            score += 200
        if "-tabs-" in lower_url and "-chords-" not in lower_url:
            score -= 25
        if "guitar-pro" in lower_url or "guitar_pro" in lower_url:
            score -= 50
        if "ukulele" in lower_url:
            score -= 40
        if normalize_match_text(title) and normalize_match_text(title) in normalize_match_text(lower_url):
            score += 40
        if artist and normalize_match_text(artist) in normalize_match_text(lower_url):
            score += 30

        candidates.append(
            {
                "url": url,
                "title": candidate_title,
                "artist": candidate_artist,
                "source": source_label,
                "score": score or 5,
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates


async def search_azchords_candidates(client, title, artist):
    return await search_duckduckgo_site_candidates(
        client,
        title,
        artist,
        "azchords.com",
        "azchords.com",
    )


def _manual_candidate_from(candidate, reason="blocked"):
    url = candidate.get("url") or ""
    host = _display_host(url)
    return {
        "url": url,
        "title": candidate.get("title") or "",
        "artist": candidate.get("artist") or "",
        "source": candidate.get("source") or host,
        "host": host,
        "reason": reason,
        "contentType": "chords",
    }


def _append_manual_candidate(manual_candidates, candidate, reason="blocked"):
    if manual_candidates is None:
        return
    entry = _manual_candidate_from(candidate, reason=reason)
    url = entry.get("url") or ""
    if not url:
        return
    existing = {item.get("url") for item in manual_candidates}
    if url in existing:
        return
    manual_candidates.append(entry)


def _attach_sheet_meta(result, meta):
    if not result or not meta:
        return result
    if meta.get("capo") is not None:
        result["capo"] = meta["capo"]
    if meta.get("key"):
        result["key"] = meta["key"]
    if meta.get("tuning"):
        result["tuning"] = meta["tuning"]
    return result


async def fetch_chord_sheet_from_page(client, page_url, title="", artist="", page_html=None):
    validated, error = validate_chord_page_url(page_url)
    if error:
        raise ValueError(error)
    if page_html is not None and str(page_html).strip():
        html_text = str(page_html)
    else:
        html_text = await fetch_text(client, validated)
    raw_sheet = extract_sheet_from_html(html_text, validated)
    if not raw_sheet:
        return None
    raw_lines = raw_sheet.splitlines()
    meta = extract_chord_sheet_meta(raw_lines)
    sheet_lines = finalize_sheet_lines(raw_lines)
    if not sheet_lines:
        return None
    if not has_usable_chord_lines(sheet_lines):
        return None
    display_host = (urlparse(validated).hostname or "").replace("www.", "")
    if "azchords.com" in display_host:
        sheet_lines = strip_azchords_chord_dictionary_preamble(sheet_lines)
    if "cifraclub.com" in display_host:
        try:
            sheet_lines = await translate_cifraclub_section_labels(client, sheet_lines)
        except Exception:
            pass
    result = {
        "sheetLines": sheet_lines,
        "source": display_host,
        "sourceUrl": validated,
        "title": title or "",
        "artist": artist or "",
    }
    result = _attach_sheet_meta(result, meta)
    try:
        from page_title_meta import conservative_page_title

        page_title = conservative_page_title(html_text, title, fallback="")
        if page_title:
            result["title"] = page_title
    except Exception:
        pass
    return result


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


def dedupe_manual_candidates(manual_candidates):
    return dedupe_candidates(manual_candidates)


def _empty_manual_result(manual_candidates):
    return {
        "empty": True,
        "found": False,
        "manualCandidates": dedupe_manual_candidates(manual_candidates),
    }


def _is_empty_manual_result(result):
    return bool(result and result.get("empty") and result.get("manualCandidates"))


async def first_successful_candidate(client, candidates, title, artist, manual_candidates=None):
    """Fetch candidate pages concurrently and return the best (highest-priority)
    one that yields a usable sheet, preserving candidate order as the tie-break.

    Manual-only hosts are not fetched; they are appended to ``manual_candidates``
    instead. Fetches go through the polite layer (capped).
    """
    candidates = (candidates or [])[:8]
    if not candidates:
        return None

    scrapable = []
    for candidate in candidates:
        host = urlparse(candidate.get("url") or "").hostname or ""
        if is_manual_only_host(host) or classify_chord_host(host) == "manual_only":
            _append_manual_candidate(manual_candidates, candidate, reason="blocked")
            continue
        scrapable.append(candidate)

    if not scrapable:
        return None

    async def attempt(candidate):
        try:
            return await fetch_chord_sheet_from_page(
                client,
                candidate["url"],
                title=candidate.get("title") or title,
                artist=candidate.get("artist") or artist,
            )
        except Exception:
            return None

    results = await asyncio.gather(*[attempt(candidate) for candidate in scrapable])
    for candidate, result in zip(scrapable, results):
        if result:
            result["title"] = candidate.get("title") or title
            result["artist"] = candidate.get("artist") or artist
            return result
    return None


def _partition_discovered_candidates(candidates, manual_candidates):
    scrapable = []
    for candidate in candidates or []:
        host = urlparse(candidate.get("url") or "").hostname or ""
        if classify_chord_host(host) == "manual_only":
            _append_manual_candidate(manual_candidates, candidate, reason="blocked")
        elif is_scrapable_chord_host(host):
            scrapable.append(candidate)
        else:
            # Allowed but unknown parser — skip fetch.
            pass
    return scrapable


# Cap how many successful sheets we fetch/return in the picker.
# UG search often finds 10–25 chord versions; keep a small set choosable so
# interactive Search finishes before the client budget (~40s) aborts.
MAX_CHORD_SHEETS_PER_ARTIST = max(
    1,
    int(os.getenv("MAX_CHORD_SHEETS_PER_ARTIST", "5")),
)
# Stop after Stage 1 (Ultimate Guitar) once we have this many sheets — do not
# burn the budget on e-chords / Brave when UG already succeeded.
UG_EARLY_RETURN_MIN_SHEETS = max(
    1,
    int(os.getenv("UG_EARLY_RETURN_MIN_SHEETS", "1")),
)


async def _discover_ug_candidates(client, title, artist):
    """Ultimate Guitar first: UG site search, then Brave, then DuckDuckGo."""
    candidates = []
    # Prefer UG's own search — works when Brave is rate-limited (429) and DDG
    # returns empty HTML. This is what surfaces Wonderwall etc. reliably.
    try:
        candidates = await search_ultimate_guitar_site_candidates(client, title, artist)
    except Exception:
        candidates = []
    if not candidates:
        try:
            candidates = await search_brave_chord_candidates(
                client, title, artist, site_host="tabs.ultimate-guitar.com"
            )
        except Exception:
            candidates = []
    if not candidates:
        try:
            candidates = await search_duckduckgo_site_candidates(
                client,
                title,
                artist,
                "tabs.ultimate-guitar.com",
                "tabs.ultimate-guitar.com",
            )
        except Exception:
            candidates = []
    return dedupe_candidates(candidates)


async def _collect_successful_chord_sheets(
    client, candidates, title, artist, manual_candidates=None, limit=MAX_CHORD_SHEETS_PER_ARTIST
):
    """Fetch scrapable candidates in score order; keep up to ``limit`` successful sheets."""
    results = []
    seen = set()
    scrapable = []
    for candidate in candidates or []:
        host = urlparse(candidate.get("url") or "").hostname or ""
        if is_manual_only_host(host) or classify_chord_host(host) == "manual_only":
            _append_manual_candidate(manual_candidates, candidate, reason="blocked")
            continue
        if not is_scrapable_chord_host(host):
            continue
        scrapable.append(candidate)

    for candidate in scrapable:
        if len(results) >= limit:
            break
        try:
            result = await fetch_chord_sheet_from_page(
                client,
                candidate["url"],
                title=candidate.get("title") or title,
                artist=candidate.get("artist") or artist,
            )
        except Exception:
            result = None
        if not result:
            continue
        result["title"] = candidate.get("title") or title
        result["artist"] = candidate.get("artist") or artist
        key = _chord_candidate_key(result)
        if key in seen:
            continue
        seen.add(key)
        results.append(result)
    return results


async def _search_chords_for_artist(client, title, artist, on_progress=None, manual_candidates=None):
    """Prefer Ultimate Guitar, then direct slug sites, then broader discovery.

    Returns a single sheet dict, an empty-manual result, a multiple-candidates
    payload, or None.
    """
    if manual_candidates is None:
        manual_candidates = []
    collected = []
    seen_keys = set()
    tried_urls = set()

    def _absorb(sheets):
        for sheet in sheets or []:
            key = _chord_candidate_key(sheet)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            collected.append(sheet)

    # Stage 1: Ultimate Guitar (preferred source for chords + lyrics).
    await _emit_progress(
        on_progress,
        "search",
        "Stage 1: searching Ultimate Guitar...",
        0.22,
    )
    ug_candidates = await _discover_ug_candidates(client, title, artist)
    for item in ug_candidates:
        if item.get("url"):
            tried_urls.add(item["url"])
    ug_sheets = await _collect_successful_chord_sheets(
        client,
        ug_candidates,
        title,
        artist,
        manual_candidates=manual_candidates,
        # Fetch a few UG versions for the picker, not dozens — each page can take
        # up to CHORDS_FETCH_TIMEOUT_SECONDS and was blowing the client budget.
        limit=min(MAX_CHORD_SHEETS_PER_ARTIST, max(UG_EARLY_RETURN_MIN_SHEETS, 3)),
    )
    _absorb(ug_sheets)

    # Prefer-chords / lyrics editor: return UG hits immediately. Continuing to
    # Stages 2–3 (and fetching dozens of tab pages) is why the client timed out
    # even when Ultimate Guitar already had the song.
    if len(collected) >= UG_EARLY_RETURN_MIN_SHEETS:
        await _emit_progress(
            on_progress,
            "search",
            "Ultimate Guitar match found",
            0.9,
        )
        if len(collected) == 1:
            return collected[0]
        return {
            "multiple": True,
            "candidates": [
                _annotate_chord_candidate(item, title_only=False) for item in collected
            ],
        }

    # Stage 2: direct slug candidates (e-chords, cifraclub).
    await _emit_progress(
        on_progress,
        "search",
        "Stage 2 (apis/slugs): checking direct chord site URLs...",
        0.4,
    )
    direct_candidates = [
        item
        for item in dedupe_candidates(build_direct_candidates(title, artist))
        if item.get("url") not in tried_urls
    ]
    for item in direct_candidates:
        if item.get("url"):
            tried_urls.add(item["url"])
    direct_sheets = await _collect_successful_chord_sheets(
        client,
        direct_candidates,
        title,
        artist,
        manual_candidates=manual_candidates,
        limit=max(0, MAX_CHORD_SHEETS_PER_ARTIST - len(collected)),
    )
    _absorb(direct_sheets)

    # Stage 3: broader Brave/DDG discovery for remaining hosts.
    if len(collected) < MAX_CHORD_SHEETS_PER_ARTIST:
        await _emit_progress(
            on_progress,
            "search",
            "Stage 3 (discover): searching other chord sites...",
            0.55,
        )
        try:
            brave_candidates = await search_brave_chord_candidates(client, title, artist)
        except Exception:
            brave_candidates = []

        discovered = [
            candidate
            for candidate in dedupe_candidates(brave_candidates)
            if candidate.get("url") not in tried_urls
        ]

        if not discovered:
            try:
                az_candidates = await search_azchords_candidates(client, title, artist)
            except Exception:
                az_candidates = []
            discovered = [
                candidate
                for candidate in dedupe_candidates(az_candidates)
                if candidate.get("url") not in tried_urls
            ]

        scrapable = _partition_discovered_candidates(discovered, manual_candidates)
        other_sheets = await _collect_successful_chord_sheets(
            client,
            scrapable,
            title,
            artist,
            manual_candidates=manual_candidates,
            limit=max(0, MAX_CHORD_SHEETS_PER_ARTIST - len(collected)),
        )
        _absorb(other_sheets)

    if collected:
        if len(collected) == 1:
            return collected[0]
        return {
            "multiple": True,
            "candidates": [
                _annotate_chord_candidate(item, title_only=False) for item in collected
            ],
        }

    # Stage 4: degrade to manualCandidates when nothing scrapable succeeded.
    if manual_candidates:
        await _emit_progress(
            on_progress,
            "search",
            "Stage 4: no scrapable sheet; locked sources available",
            0.85,
        )
        return _empty_manual_result(manual_candidates)

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


def _merge_chord_search_payloads(payloads):
    """Flatten single/multiple/_empty results into a multiple list or empty/manual."""
    candidates = []
    seen = set()
    all_manual = []
    for payload in payloads or []:
        if not payload:
            continue
        if _is_empty_manual_result(payload):
            for item in payload.get("manualCandidates") or []:
                url = item.get("url")
                if url and url not in {m.get("url") for m in all_manual}:
                    all_manual.append(item)
            continue
        if payload.get("multiple") and isinstance(payload.get("candidates"), list):
            sheets = payload["candidates"]
        else:
            sheets = [payload]
        for sheet in sheets:
            if not sheet or _is_empty_manual_result(sheet):
                continue
            key = _chord_candidate_key(sheet)
            if key in seen:
                continue
            seen.add(key)
            candidates.append(
                sheet if "preview" in sheet else _annotate_chord_candidate(sheet)
            )
    if candidates:
        if len(candidates) == 1:
            # Drop annotation-only fields that single responses historically omit.
            single = dict(candidates[0])
            single.pop("preview", None)
            single.pop("titleOnly", None)
            return single
        return {"multiple": True, "candidates": candidates}
    if all_manual:
        return _empty_manual_result(all_manual)
    return None


async def search_chords_with_candidates(title, on_progress=None):
    title = str(title or "").strip()
    if not title:
        raise ValueError("Song title is required")

    async with make_scrape_http_client(CHORDS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(
            on_progress,
            "search",
            "Discovering artists who recorded this song...",
            0.12,
        )
        artists = await discover_recording_artists(client, title)

        payloads = []
        all_manual = []
        total_steps = max(len(artists), 1) + 1

        for index, search_artist in enumerate(artists):
            await _emit_progress(
                on_progress,
                "search",
                "Searching chords for {0}...".format(search_artist),
                0.15 + (0.55 * (index + 1) / total_steps),
            )
            result = await _search_chords_for_artist(
                client,
                title,
                search_artist,
                on_progress=on_progress,
                manual_candidates=all_manual,
            )
            if result:
                payloads.append(result)

        await _emit_progress(
            on_progress,
            "search",
            "Searching chords by title...",
            0.78,
        )
        title_result = await _search_chords_for_artist(
            client,
            title,
            "",
            on_progress=on_progress,
            manual_candidates=all_manual,
        )
        if title_result and not _is_empty_manual_result(title_result):
            if title_result.get("multiple") and isinstance(title_result.get("candidates"), list):
                for item in title_result["candidates"]:
                    item["titleOnly"] = True
            else:
                title_result = _annotate_chord_candidate(title_result, title_only=True)
            payloads.append(title_result)

        merged = _merge_chord_search_payloads(payloads)
        if not merged:
            if all_manual:
                await _emit_progress(
                    on_progress,
                    "done",
                    "No importable chords; locked sources available",
                    1.0,
                )
                return _empty_manual_result(all_manual)
            await _emit_progress(on_progress, "done", "No chords found for this song", 1.0)
            raise ValueError("No chords found for this song")

        await _emit_progress(on_progress, "done", "Chord candidates ready", 1.0)
        if merged.get("multiple"):
            return merged
        return {
            "multiple": True,
            "candidates": [_annotate_chord_candidate(merged, title_only=False)],
        }


async def search_chords(title, artist, on_progress=None):
    title = str(title or "").strip()
    artist = str(artist or "").strip()
    if not title:
        raise ValueError("Song title is required")

    if is_generic_artist(artist):
        return await search_chords_with_candidates(title, on_progress=on_progress)

    async with make_scrape_http_client(CHORDS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(
            on_progress,
            "search",
            "Searching chord sites (Ultimate Guitar first)...",
            0.2,
        )
        manual_candidates = []
        result = await _search_chords_for_artist(
            client,
            title,
            artist,
            on_progress=on_progress,
            manual_candidates=manual_candidates,
        )
        if result:
            if _is_empty_manual_result(result):
                await _emit_progress(
                    on_progress,
                    "done",
                    "No importable chords; locked sources available",
                    1.0,
                )
                return result
            await _emit_progress(on_progress, "done", "Chords found", 1.0)
            return result

    await _emit_progress(on_progress, "done", "No chords found for this song", 1.0)
    raise ValueError("No chords found for this song")


async def fetch_chords_url(url, on_progress=None, page_html=None):
    await _emit_progress(on_progress, "fetch", "Fetching chord page...", 0.15)
    async with make_scrape_http_client(CHORDS_FETCH_TIMEOUT_SECONDS) as client:
        await _emit_progress(on_progress, "extract", "Extracting chords...", 0.55)
        result = await fetch_chord_sheet_from_page(
            client,
            url,
            page_html=page_html,
        )
        if not result:
            await _emit_progress(on_progress, "done", "Could not extract chords from that page", 1.0)
            raise ValueError("Could not extract chords from that page")
        result["title"] = ""
        result["artist"] = ""
        await _emit_progress(on_progress, "done", "Chords found", 1.0)
        return result
