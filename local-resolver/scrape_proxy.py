"""Request-scoped residential/scrape proxy for chord/lyrics HTML fetches."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Optional

import httpx

_scrape_proxy: ContextVar[str] = ContextVar("scrape_proxy", default="")


def get_scrape_proxy() -> str:
    return (_scrape_proxy.get() or "").strip()


def set_scrape_proxy(url: Optional[str]):
    """Set the scrape proxy for the current async context. Returns a reset token."""
    return _scrape_proxy.set((url or "").strip())


def reset_scrape_proxy(token) -> None:
    _scrape_proxy.reset(token)


@contextmanager
def use_scrape_proxy(url: Optional[str]) -> Iterator[None]:
    token = set_scrape_proxy(url)
    try:
        yield
    finally:
        reset_scrape_proxy(token)


def make_scrape_http_client(timeout: float) -> httpx.AsyncClient:
    """httpx client that routes through the request scrape proxy when set."""
    kwargs = {
        "timeout": timeout,
        "follow_redirects": True,
    }
    proxy = get_scrape_proxy()
    if proxy:
        kwargs["proxy"] = proxy
    return httpx.AsyncClient(**kwargs)
