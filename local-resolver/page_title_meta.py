"""Conservative page-title extraction for lyrics/chords scrapes (no LLM)."""

from __future__ import annotations

import html
import re
import unicodedata
from urllib.parse import urlparse

TITLE_TAG_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
OG_TITLE_RE = re.compile(
    r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
    re.I,
)
OG_TITLE_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']',
    re.I,
)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")


def normalize_match_text(value):
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _clean_title_fragment(raw):
    text = TAG_RE.sub(" ", raw or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.split(r"\s+[|\u2013\u2014-]\s+", text)[0].strip()
    return text


def extract_raw_page_title(html_text):
    for pattern in (OG_TITLE_RE, OG_TITLE_RE_ALT, TITLE_TAG_RE, H1_RE):
        match = pattern.search(html_text or "")
        if match:
            cleaned = _clean_title_fragment(match.group(1))
            if cleaned:
                return cleaned
    return ""


def page_title_matches_query(page_title, query_title):
    """True only when page title clearly contains the query title tokens."""
    page_key = normalize_match_text(page_title)
    query_key = normalize_match_text(query_title)
    if not page_key or not query_key:
        return False
    if page_key == query_key:
        return True
    if query_key in page_key:
        return True
    query_tokens = [tok for tok in query_key.split() if len(tok) > 2]
    if not query_tokens:
        return False
    hits = sum(1 for tok in query_tokens if tok in page_key)
    return hits >= max(1, int(round(len(query_tokens) * 0.7)))


def conservative_page_title(html_text, query_title, fallback=""):
    """Return page title only when it clearly matches the search query title."""
    raw = extract_raw_page_title(html_text)
    if raw and page_title_matches_query(raw, query_title):
        return raw
    return fallback or ""


def host_label(url):
    return (urlparse(url).hostname or "").lower().replace("www.", "")
