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
        if "pdf" not in content_type and not url.lower().endswith(".pdf"):
            raise ValueError("Score attachment is not a PDF")
        return data, content_type or "application/pdf"
