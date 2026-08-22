"""Optional Playwright Chromium fallback for soft bot walls (last automated stage)."""

from __future__ import annotations

import asyncio
import os
from typing import Optional
from urllib.parse import urlparse

from polite_fetch import BROWSER_USER_AGENT, FetchResult, detect_challenge_html

PLAYWRIGHT_ENABLED = os.getenv("PLAYWRIGHT_ENABLED", "true").strip().lower() not in {
    "0",
    "false",
    "no",
}
PLAYWRIGHT_TIMEOUT_MS = max(1000, int(os.getenv("PLAYWRIGHT_TIMEOUT_MS", "20000")))

# Hosts that must never use Playwright (hard anti-bot / manual paste only).
# Empty: Ultimate Guitar is scrapable via js-store JSON (Playwright is a soft fallback).
MANUAL_ONLY_HOST_SUFFIXES = ()

# Soft JS / empty-SSR hosts that may benefit from a real browser after httpx fails.
PLAYWRIGHT_ELIGIBLE_HOST_SUFFIXES = (
    "musixmatch.com",
    "letras.mus.br",
    "letras.com",
    "lyricsmode.com",
    "chordsbase.com",
    "chords-and-tabs.net",
    "guitaretab.com",
    "akordy.kytary.cz",
    "chordie.com",
    "guitartabs.cc",
    "worshiptogether.com",
    "cifraclub.com",
    "cifraclub.com.br",
    "e-chords.com",
    "azchords.com",
    "genius.com",
    "metrolyrics.com",
    "songlyrics.com",
    "musescore.com",
    "tabs.ultimate-guitar.com",
    "ultimate-guitar.com",
)

HOST_WAIT_SELECTORS = {
    "musixmatch.com": "[class*='lyrics'], [data-testid*='lyrics']",
    "genius.com": '[data-lyrics-container="true"]',
    "azchords.com": "pre#content, pre",
    "e-chords.com": "pre",
    "cifraclub.com": "pre",
    "cifraclub.com.br": "pre",
    "worshiptogether.com": ".chord-pro-line, .chord-pro-lyric",
    "letras.com": ".lyric-original, .cnt-letra",
    "letras.mus.br": ".lyric-original, .cnt-letra",
    "lyricsmode.com": "#lyrics_text, .ui-annotatable",
    "chordie.com": "pre, #chordpro",
    "tabs.ultimate-guitar.com": ".js-store[data-content]",
    "ultimate-guitar.com": ".js-store[data-content]",
}

_browser = None
_context = None
_playwright = None
_page_sem: Optional[asyncio.Semaphore] = None
_init_lock = asyncio.Lock()
_available: Optional[bool] = None


def _host_matches(hostname: str, suffixes) -> bool:
    host = (hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return any(host == s or host.endswith("." + s) for s in suffixes)


def is_manual_only_host(hostname: str) -> bool:
    return _host_matches(hostname, MANUAL_ONLY_HOST_SUFFIXES)


def is_playwright_eligible_host(hostname: str) -> bool:
    if is_manual_only_host(hostname):
        return False
    return _host_matches(hostname, PLAYWRIGHT_ELIGIBLE_HOST_SUFFIXES)


def playwright_available() -> bool:
    global _available
    if not PLAYWRIGHT_ENABLED:
        return False
    if _available is not None:
        return _available
    try:
        import playwright  # noqa: F401

        _available = True
    except Exception:
        _available = False
    return _available


def _wait_selector_for(url: str) -> Optional[str]:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    for suffix, selector in HOST_WAIT_SELECTORS.items():
        if host == suffix or host.endswith("." + suffix):
            return selector
    return None


async def _ensure_browser():
    global _browser, _context, _playwright, _page_sem, _available
    async with _init_lock:
        if not playwright_available():
            return None
        if _page_sem is None:
            _page_sem = asyncio.Semaphore(1)
        if _browser is not None:
            return _browser
        try:
            from playwright.async_api import async_playwright

            _playwright = await async_playwright().start()
            _browser = await _playwright.chromium.launch(headless=True)
            _context = await _browser.new_context(
                user_agent=BROWSER_USER_AGENT,
                viewport={"width": 1280, "height": 720},
                locale="en-US",
            )
            return _browser
        except Exception:
            _available = False
            _browser = None
            _context = None
            return None


async def browser_get_html(url: str, *, referer: Optional[str] = None) -> FetchResult:
    """Fetch rendered HTML via Chromium. One page at a time."""
    host = urlparse(url).hostname or ""
    if is_manual_only_host(host):
        return FetchResult(status=403, text="", final_url=url, blocked_reason="http_status")
    if not is_playwright_eligible_host(host):
        return FetchResult(status=0, text="", final_url=url, blocked_reason="empty")
    if not await _ensure_browser():
        return FetchResult(status=0, text="", final_url=url, blocked_reason="empty")

    assert _page_sem is not None
    assert _context is not None
    async with _page_sem:
        page = await _context.new_page()
        try:
            if referer:
                await page.set_extra_http_headers({"Referer": referer})
            response = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=PLAYWRIGHT_TIMEOUT_MS,
            )
            selector = _wait_selector_for(url)
            if selector:
                try:
                    await page.wait_for_selector(selector, timeout=min(8000, PLAYWRIGHT_TIMEOUT_MS))
                except Exception:
                    pass
            else:
                await page.wait_for_timeout(400)
            html = await page.content()
            status = response.status if response is not None else 200
            final_url = page.url or url
            blocked = detect_challenge_html(html, status)
            if status >= 400 and blocked == "none":
                blocked = "http_status"
            return FetchResult(
                status=status,
                text=html,
                final_url=final_url,
                blocked_reason=blocked,
            )
        except Exception:
            return FetchResult(status=0, text="", final_url=url, blocked_reason="empty")
        finally:
            await page.close()


async def fetch_html_with_fallback(
    client,
    url: str,
    *,
    referer: Optional[str] = None,
    allow_playwright: bool = True,
) -> FetchResult:
    """Stage 3 httpx then optional stage 4 Playwright for eligible hosts."""
    from polite_fetch import polite_get

    result = await polite_get(client, url, referer=referer)
    if result.blocked_reason == "none" and (result.text or "").strip():
        return result
    host = urlparse(url).hostname or ""
    if (
        allow_playwright
        and is_playwright_eligible_host(host)
        and result.blocked_reason in {"http_status", "challenge_html", "empty"}
    ):
        pw = await browser_get_html(url, referer=referer)
        if pw.blocked_reason == "none" and (pw.text or "").strip():
            return pw
        if (pw.text or "").strip() and len(pw.text) > len(result.text or ""):
            return pw
    return result
