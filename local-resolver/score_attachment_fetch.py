"""Proxy downloads for archive score PDF attachments."""

from __future__ import annotations

from urllib.parse import urlparse

import httpx

from cpdl_fetch import is_cpdl_url
from imslp_fetch import is_imslp_url
from mediawiki_fetch import fetch_binary, mediawiki_cookies_for_base_url, strip_www
from polite_fetch import browser_headers

SCORE_ATTACHMENT_TIMEOUT_SECONDS = 30.0
MAX_SCORE_ATTACHMENT_BYTES = 12 * 1024 * 1024

ALLOWED_ATTACHMENT_HOST_SUFFIXES = (
    "imslp.org",
    "cpdl.org",
    "wikimedia.org",
    "upload.wikimedia.org",
    "oldtimefiddletunes.net",
)


def is_allowed_score_attachment_url(url):
    text = str(url or "").strip()
    if not text:
        return False
    if is_imslp_url(text) or is_cpdl_url(text):
        return True
    try:
        host = strip_www(urlparse(text).hostname or "")
    except Exception:
        return False
    return any(host == suffix or host.endswith("." + suffix) for suffix in ALLOWED_ATTACHMENT_HOST_SUFFIXES)


def _guess_attachment_kind(url, content_type):
    path = (urlparse(str(url or "")).path or "").lower()
    ctype = str(content_type or "").lower()
    if "pdf" in ctype or path.endswith(".pdf"):
        return "pdf", "application/pdf"
    if "midi" in ctype or path.endswith(".mid") or path.endswith(".midi"):
        return "midi", "audio/midi"
    return "", ""


async def fetch_score_attachment_bytes(url):
    if not is_allowed_score_attachment_url(url):
        raise ValueError("URL host is not allowed for score attachment download")
    async with httpx.AsyncClient(timeout=SCORE_ATTACHMENT_TIMEOUT_SECONDS) as client:
        response = await fetch_binary(
            client,
            url,
            cookies=mediawiki_cookies_for_base_url(url),
        )
        if response.status_code >= 400:
            raise ValueError("Could not download score attachment (HTTP {0})".format(response.status_code))
        data = response.content or b""
        if not data:
            raise ValueError("Empty score attachment response")
        if len(data) > MAX_SCORE_ATTACHMENT_BYTES:
            raise ValueError("Score attachment exceeds size limit")
        content_type = (response.headers.get("content-type") or "").lower()
        kind, fallback_type = _guess_attachment_kind(url, content_type)
        if not kind:
            raise ValueError("Score attachment must be a PDF or MIDI file")
        return data, content_type if content_type and "octet-stream" not in content_type else fallback_type
