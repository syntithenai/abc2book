"""Derive public scheme/base URLs from FastAPI requests behind reverse proxies."""

from __future__ import annotations

from fastapi import Request


def request_public_scheme(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    if forwarded in ("http", "https"):
        return forwarded
    scheme = request.url.scheme if request.url.scheme in ("http", "https") else "http"
    return scheme


def request_public_host(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if forwarded:
        return forwarded.split(":")[0]
    host = request.headers.get("host", "").split(",")[0].strip()
    if host:
        return host.split(":")[0]
    return ""


def request_public_host_header(request: Request) -> str:
    """Host header value (may include port), honoring X-Forwarded-Host."""
    forwarded = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    return request.headers.get("host", "").split(",")[0].strip()


def request_public_base(request: Request) -> str:
    host_header = request_public_host_header(request)
    if not host_header:
        return ""
    scheme = request_public_scheme(request)
    hostname = host_header.split(":")[0]
    port_part = host_header.split(":")[1] if ":" in host_header else ""
    if port_part and port_part not in ("80", "443"):
        return f"{scheme}://{hostname}:{port_part}"
    return f"{scheme}://{hostname}"
