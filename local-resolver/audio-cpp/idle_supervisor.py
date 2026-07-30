#!/usr/bin/env python3
"""Restart audio.cpp sidecar when models have been idle past AUDIO_CPP_IDLE_UNLOAD_SECONDS."""

from __future__ import annotations

import json
import os
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
SERVER_BIN = os.getenv("AUDIO_CPP_SERVER_BIN", "")
SERVER_CONFIG = os.getenv("AUDIO_CPP_CONFIG", "")
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


def _restart_audio_cpp() -> None:
    restart_cmd = (os.getenv("AUDIO_CPP_RESTART_CMD") or "").strip()
    if restart_cmd:
        print("idle_supervisor: restarting audio.cpp via", restart_cmd, flush=True)
        subprocess.run(restart_cmd, shell=True, check=False)
        return
    if not SERVER_BIN or not SERVER_CONFIG:
        print("idle_supervisor: AUDIO_CPP_SERVER_BIN/CONFIG not set; skip restart", file=sys.stderr)
        return
    print("idle_supervisor: restarting audio.cpp after idle timeout", flush=True)
    subprocess.run(["pkill", "-f", "audiocpp_server"], check=False)
    time.sleep(2)
    subprocess.Popen(
        [SERVER_BIN, "--config", SERVER_CONFIG, "--backend", "vulkan", "--host", "0.0.0.0", "--port", "8788"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def main() -> int:
    if not ENABLED:
        print("idle_supervisor: disabled")
        return 0
    while True:
        try:
            status = _fetch_json(RESOLVER_URL + "/audio-cpp/idle-status")
            if status.get("shouldUnload"):
                _restart_audio_cpp()
                try:
                    urllib.request.urlopen(AUDIO_CPP_URL + "/health", timeout=5)
                except urllib.error.URLError:
                    pass
        except Exception as exc:
            print("idle_supervisor:", exc, file=sys.stderr)
        time.sleep(POLL_SECONDS)
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    raise SystemExit(main())
