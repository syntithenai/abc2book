"""Shared polite HTTP fetch layer for lyrics/chords/notation scrapes."""

from __future__ import annotations

import asyncio
import os
import random
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx

BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

POLITE_FETCH_PER_HOST = max(1, int(os.getenv("POLITE_FETCH_PER_HOST", "2")))
POLITE_FETCH_GLOBAL = max(1, int(os.getenv("POLITE_FETCH_GLOBAL", "4")))
POLITE_FETCH_JITTER_MS_MIN = max(0, int(os.getenv("POLITE_FETCH_JITTER_MS_MIN", "150")))
POLITE_FETCH_JITTER_MS_MAX = max(
    POLITE_FETCH_JITTER_MS_MIN,
    int(os.getenv("POLITE_FETCH_JITTER_MS_MAX", "400")),
)
POLITE_FETCH_MAX_RETRIES = max(0, int(os.getenv("POLITE_FETCH_MAX_RETRIES", "2")))

CHALLENGE_MARKERS = (
    "just a moment",
    "attention required",
    "cf-browser-verification",
    "cf-challenge",
    "challenge-platform",
    "checking your browser",
    "enable javascript and cookies",
    "captcha",
    "turnstile",
    "access denied",
    "sorry, you have been blocked",
)


@dataclass
class FetchResult:
    status: int
    text: str
    final_url: str
    blocked_reason: str  # none | http_status | challenge_html | empty


_global_sem: Optional[asyncio.Semaphore] = None
_host_sems: dict[str, asyncio.Semaphore] = {}
_host_last_request: dict[str, float] = defaultdict(float)
_lock = asyncio.Lock()


def browser_headers(referer: Optional[str] = None) -> dict:
    headers = {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def detect_challenge_html(text: str, status: int = 200) -> str:
    body = (text or "").strip()
    if status and status >= 400:
        return "http_status"
    if not body:
        return "empty"
    lower = body[:8000].lower()
    if any(marker in lower for marker in CHALLENGE_MARKERS):
        # Short challenge pages are more reliable signals than long song pages
        # that happen to mention "captcha" in lyrics.
        if len(body) < 12000 or "cf-" in lower or "challenge-platform" in lower:
            return "challenge_html"
    return "none"


def _host_key(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host or "unknown"


async def _get_semaphores(host: str):
    global _global_sem
    async with _lock:
        if _global_sem is None:
            _global_sem = asyncio.Semaphore(POLITE_FETCH_GLOBAL)
        if host not in _host_sems:
            _host_sems[host] = asyncio.Semaphore(POLITE_FETCH_PER_HOST)
        return _global_sem, _host_sems[host]


async def _jitter_for_host(host: str):
    now = time.monotonic()
    last = _host_last_request.get(host, 0.0)
    if last > 0:
        delay_ms = random.randint(POLITE_FETCH_JITTER_MS_MIN, POLITE_FETCH_JITTER_MS_MAX)
        elapsed = (now - last) * 1000.0
        remaining = delay_ms - elapsed
        if remaining > 0:
            await asyncio.sleep(remaining / 1000.0)
    _host_last_request[host] = time.monotonic()


async def polite_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: Optional[dict] = None,
    referer: Optional[str] = None,
    raise_for_status: bool = False,
) -> FetchResult:
    """GET with per-host/global caps, jitter, retries, and challenge detection."""
    host = _host_key(url)
    global_sem, host_sem = await _get_semaphores(host)
    merged = browser_headers(referer=referer)
    if headers:
        merged.update(headers)

    last_result = FetchResult(status=0, text="", final_url=url, blocked_reason="empty")
    attempts = POLITE_FETCH_MAX_RETRIES + 1

    async with global_sem:
        async with host_sem:
            for attempt in range(attempts):
                await _jitter_for_host(host)
                try:
                    response = await client.get(url, headers=merged, follow_redirects=True)
                    text = response.text or ""
                    final_url = str(response.url)
                    blocked = detect_challenge_html(text, response.status_code)
                    if response.status_code in {429, 503} and attempt < attempts - 1:
                        retry_after = response.headers.get("Retry-After")
                        try:
                            wait_s = float(retry_after)
                        except (TypeError, ValueError):
                            wait_s = (2 ** attempt) + random.uniform(0.1, 0.5)
                        await asyncio.sleep(max(0.1, wait_s))
                        continue
                    if raise_for_status and response.status_code >= 400:
                        response.raise_for_status()
                    if response.status_code >= 400 and blocked == "none":
                        blocked = "http_status"
                    last_result = FetchResult(
                        status=response.status_code,
                        text=text,
                        final_url=final_url,
                        blocked_reason=blocked,
                    )
                    return last_result
                except httpx.HTTPStatusError as exc:
                    status = exc.response.status_code if exc.response is not None else 0
                    text = ""
                    try:
                        text = exc.response.text if exc.response is not None else ""
                    except Exception:
                        text = ""
                    if status in {429, 503} and attempt < attempts - 1:
                        await asyncio.sleep((2 ** attempt) + random.uniform(0.1, 0.5))
                        continue
                    last_result = FetchResult(
                        status=status,
                        text=text or "",
                        final_url=url,
                        blocked_reason="http_status",
                    )
                    if raise_for_status:
                        raise
                    return last_result
                except httpx.HTTPError:
                    if attempt < attempts - 1:
                        await asyncio.sleep((2 ** attempt) + random.uniform(0.1, 0.5))
                        continue
                    last_result = FetchResult(
                        status=0,
                        text="",
                        final_url=url,
                        blocked_reason="empty",
                    )
                    if raise_for_status:
                        raise
                    return last_result
    return last_result


async def polite_get_text(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: Optional[dict] = None,
    referer: Optional[str] = None,
) -> str:
    """Compatibility helper: return response text or raise on hard failure."""
    result = await polite_get(
        client,
        url,
        headers=headers,
        referer=referer,
        raise_for_status=False,
    )
    if result.status >= 400 or result.blocked_reason == "http_status":
        raise httpx.HTTPStatusError(
            "HTTP {0} for {1}".format(result.status, url),
            request=httpx.Request("GET", url),
            response=httpx.Response(result.status or 500, text=result.text),
        )
    if result.blocked_reason in {"challenge_html", "empty"} and not (result.text or "").strip():
        raise ValueError("Blocked or empty response from {0}".format(url))
    return result.text
