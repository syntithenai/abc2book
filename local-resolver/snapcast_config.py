"""Snapcast sidecar configuration for local-resolver."""

from __future__ import annotations

import os


def snapcast_enabled() -> bool:
    return os.getenv("SNAPCAST_ENABLED", "false").strip().lower() in ("1", "true", "yes")


def snapcast_tcp_bind() -> str:
    return os.getenv("SNAPCAST_TCP_BIND", "0.0.0.0:4954").strip() or "0.0.0.0:4954"


def snapcast_stream_name() -> str:
    return os.getenv("SNAPCAST_STREAM_NAME", "TuneBook").strip() or "TuneBook"


def snapcast_server_host() -> str:
    return os.getenv("SNAPCAST_SERVER_HOST", "snapserver").strip() or "snapserver"


def snapcast_public_url() -> str | None:
    value = os.getenv("SNAPCAST_PUBLIC_URL", "").strip()
    return value or None


def snapcast_plugin_url() -> str:
    return os.getenv("SNAPCAST_PLUGIN_URL", "http://local-resolver:8787/snapcast-playback/plugin").strip()


def snapclient_enabled() -> bool:
    if not snapcast_enabled():
        return False
    return os.getenv("SNAPCLIENT_ENABLED", "true").strip().lower() in ("1", "true", "yes")


def snapclient_hostname() -> str:
    return os.getenv("SNAPCLIENT_HOSTNAME", "resolver-host").strip() or "resolver-host"


def snapclient_soundcard() -> str:
    return os.getenv("SNAPCLIENT_SOUNDCARD", "default").strip() or "default"


def snapcast_max_sessions() -> int:
    try:
        return max(1, int(os.getenv("SNAPCAST_MAX_SESSIONS", "1")))
    except ValueError:
        return 1
