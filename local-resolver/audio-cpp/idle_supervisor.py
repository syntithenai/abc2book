#!/usr/bin/env python3
"""Unload audio.cpp models after idle by restarting the systemd-managed sidecar.

Hardening notes
---------------
* Prefer ``systemctl --user restart <unit>`` (AUDIO_CPP_SYSTEMD_UNIT) so systemd
  owns the process lifecycle. Never ``pkill`` a systemd service — that races
  Restart= and can leave the unit inactive.
* AUDIO_CPP_RESTART_CMD must be a single shell-safe string. systemd
  ``Environment=KEY=value with spaces`` truncates at the first space unless
  quoted; prefer AUDIO_CPP_SYSTEMD_UNIT instead of a multi-word restart cmd.
* After restart, wait for /health and ``systemctl --user start`` if needed.
"""

from __future__ import annotations

import json
import os
import shlex
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

IDLE_SECONDS = float(os.getenv("AUDIO_CPP_IDLE_UNLOAD_SECONDS", "300"))
RESOLVER_URL = (os.getenv("AUDIO_GEN_IDLE_RESOLVER_URL") or "http://127.0.0.1:8787").rstrip("/")
AUDIO_CPP_URL = (os.getenv("AUDIO_CPP_URL") or "http://127.0.0.1:8788").rstrip("/")
POLL_SECONDS = float(os.getenv("AUDIO_CPP_IDLE_POLL_SECONDS", "30"))
SYSTEMD_UNIT = (os.getenv("AUDIO_CPP_SYSTEMD_UNIT") or "abc2book-audio-cpp.service").strip()
HEALTH_WAIT_SECONDS = float(os.getenv("AUDIO_CPP_HEALTH_WAIT_SECONDS", "45"))
ENABLED = os.getenv("AUDIO_CPP_IDLE_SUPERVISOR_ENABLED", "true").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)


def _fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def _health_ok(timeout: float = 5.0) -> bool:
    try:
        urllib.request.urlopen(AUDIO_CPP_URL + "/health", timeout=timeout)
        return True
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def resolve_restart_argv(env: dict | None = None) -> list[str]:
    """Build argv for restarting the sidecar (pure; testable)."""
    source = env if env is not None else os.environ
    restart_cmd = (source.get("AUDIO_CPP_RESTART_CMD") or "").strip()
    if restart_cmd:
        argv = shlex.split(restart_cmd)
        # Guard the historical bug: Environment= truncated to bare "systemctl".
        if argv == ["systemctl"] or argv == ["systemctl", "--user"]:
            unit = (source.get("AUDIO_CPP_SYSTEMD_UNIT") or SYSTEMD_UNIT).strip()
            return ["systemctl", "--user", "restart", unit]
        return argv
    unit = (source.get("AUDIO_CPP_SYSTEMD_UNIT") or SYSTEMD_UNIT).strip()
    return ["systemctl", "--user", "restart", unit]


def _run(argv: list[str]) -> int:
    print("idle_supervisor: running", " ".join(argv), flush=True)
    completed = subprocess.run(argv, check=False)
    return int(completed.returncode or 0)


def _ensure_started() -> None:
    _run(["systemctl", "--user", "start", SYSTEMD_UNIT])


def _wait_for_health(deadline_seconds: float) -> bool:
    deadline = time.time() + deadline_seconds
    while time.time() < deadline:
        if _health_ok():
            return True
        time.sleep(1.0)
    return False


def restart_audio_cpp() -> bool:
    """Restart the sidecar and ensure /health recovers. Returns True on health ok."""
    argv = resolve_restart_argv()
    code = _run(argv)
    if code != 0:
        print(
            f"idle_supervisor: restart command exited {code}; forcing start",
            file=sys.stderr,
            flush=True,
        )
        _ensure_started()

    if _wait_for_health(HEALTH_WAIT_SECONDS):
        print("idle_supervisor: sidecar healthy after unload restart", flush=True)
        return True

    print(
        "idle_supervisor: health still down after restart — starting unit",
        file=sys.stderr,
        flush=True,
    )
    _ensure_started()
    ok = _wait_for_health(min(30.0, HEALTH_WAIT_SECONDS))
    if ok:
        print("idle_supervisor: sidecar healthy after start fallback", flush=True)
    else:
        print("idle_supervisor: sidecar still unhealthy", file=sys.stderr, flush=True)
    return ok


def main() -> int:
    if not ENABLED:
        print("idle_supervisor: disabled")
        return 0
    print(
        "idle_supervisor: watching idle via",
        RESOLVER_URL + "/audio-cpp/idle-status",
        f"(unload after {IDLE_SECONDS}s, poll {POLL_SECONDS}s, unit={SYSTEMD_UNIT})",
        flush=True,
    )
    while True:
        try:
            status = _fetch_json(RESOLVER_URL + "/audio-cpp/idle-status")
            if status.get("shouldUnload"):
                idle = status.get("idleSeconds")
                print(
                    f"idle_supervisor: shouldUnload idleSeconds={idle}",
                    flush=True,
                )
                restart_audio_cpp()
        except Exception as exc:
            print("idle_supervisor:", exc, file=sys.stderr, flush=True)
        time.sleep(POLL_SECONDS)
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    raise SystemExit(main())
