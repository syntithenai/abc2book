"""Shared-secret auth for trusted services on this host (e.g. the voicecmd daemon).

A request is treated as a local service call only when all hold:
- LOCAL_SERVICE_TOKEN is set and the bearer token matches it (constant-time compare);
- the TCP peer is loopback or a Docker bridge address (host -> published port arrives via
  the bridge gateway), and no proxy forwarding headers are present, so requests relayed by
  Caddy or coming from the LAN never qualify;
- the path is one of the allowed prefixes (music collection + snapcast playback only).
"""

from __future__ import annotations

import hmac
import ipaddress
import os
from contextvars import ContextVar
from typing import Mapping

LOCAL_SERVICE_TOKEN = os.getenv("LOCAL_SERVICE_TOKEN", "").strip()
LOCAL_SERVICE_PATH_PREFIXES = (
    "/search-music-collection",
    "/music-collection",
    "/snapcast-playback/",
)
_TRUSTED_NETWORKS = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("172.16.0.0/12"),
)
_FORWARDING_HEADERS = ("x-forwarded-for", "forwarded", "x-real-ip", "x-forwarded-host")

_local_service_request: ContextVar[bool] = ContextVar("local_service_request", default=False)


def _is_trusted_peer(client_host: str) -> bool:
    try:
        addr = ipaddress.ip_address((client_host or "").strip())
    except ValueError:
        return False
    if getattr(addr, "ipv4_mapped", None):
        addr = addr.ipv4_mapped
    return any(addr in net for net in _TRUSTED_NETWORKS)


def is_local_service_call(
    authorization: str | None,
    client_host: str,
    headers: Mapping[str, str],
    path: str,
    token: str | None = None,
) -> bool:
    expected = LOCAL_SERVICE_TOKEN if token is None else token
    if not expected or not authorization:
        return False
    if not authorization.lower().startswith("bearer "):
        return False
    presented = authorization[7:].strip()
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        return False
    if not any(path.startswith(prefix) for prefix in LOCAL_SERVICE_PATH_PREFIXES):
        return False
    lowered = {k.lower() for k in headers.keys()}
    if any(h in lowered for h in _FORWARDING_HEADERS):
        return False
    return _is_trusted_peer(client_host)


def mark_local_service_request(value: bool):
    return _local_service_request.set(bool(value))


def reset_local_service_request(marker) -> None:
    _local_service_request.reset(marker)


def is_local_service_request() -> bool:
    return _local_service_request.get()


def local_service_identity() -> dict:
    return {
        "email": "local-service@localhost",
        "name": "local service",
        "picture": "",
        "resolverAccess": True,
        "allowed": True,
        "embeddedCreds": True,
        "localService": True,
    }
