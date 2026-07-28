#!/usr/bin/env python3
"""Snapcast stream control plugin for Tune Book playback sessions.

Communicates with snapserver over stdin/stdout using newline-delimited JSON-RPC 2.0.
Fetches session state from the local-resolver plugin HTTP API.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


PLUGIN_URL = os.environ.get(
    "SNAPCAST_PLUGIN_URL",
    "http://127.0.0.1:8787/snapcast-playback/plugin",
).strip()


def write_message(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def fetch_plugin_state() -> dict:
    try:
        with urllib.request.urlopen(PLUGIN_URL, timeout=2) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return {
            "canPlay": False,
            "canPause": False,
            "canSeek": False,
            "canGoNext": False,
            "canGoPrevious": False,
            "isPlaying": False,
            "currentTime": 0,
            "duration": 0,
            "title": "",
            "artist": "",
        }


def post_plugin_action(action: str, **params) -> dict:
    payload = {"action": action, **params}
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        PLUGIN_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return {"ok": False}


def handle_request(message: dict) -> None:
    method = message.get("method")
    msg_id = message.get("id")
    if method == "Plugin.Stream.Player.GetProperties":
        state = fetch_plugin_state()
        write_message(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "canPlay": bool(state.get("canPlay")),
                    "canPause": bool(state.get("canPause")),
                    "canSeek": bool(state.get("canSeek")),
                    "canGoNext": bool(state.get("canGoNext")),
                    "canGoPrevious": bool(state.get("canGoPrevious")),
                    "canControl": True,
                },
            }
        )
        return
    if method == "Plugin.Stream.Player.GetStatus":
        state = fetch_plugin_state()
        write_message(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "state": "playing" if state.get("isPlaying") else "paused",
                    "position": int(float(state.get("currentTime") or 0) * 1000),
                    "duration": int(float(state.get("duration") or 0) * 1000),
                },
            }
        )
        return
    if method == "Plugin.Stream.Player.GetMetadata":
        state = fetch_plugin_state()
        write_message(
            {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "title": state.get("title") or "",
                    "artist": state.get("artist") or "",
                },
            }
        )
        return
    if method == "Plugin.Stream.Player.Control":
        params = message.get("params") or {}
        command = params.get("command")
        command_params = params.get("params") or {}
        if command == "play":
            post_plugin_action("play")
        elif command == "pause":
            post_plugin_action("pause")
        elif command == "seek":
            ms = command_params.get("position")
            if ms is not None:
                post_plugin_action("seek", seconds=float(ms) / 1000.0)
        write_message({"jsonrpc": "2.0", "id": msg_id, "result": True})
        return
    write_message(
        {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }
    )


def main() -> int:
    write_message(
        {
            "jsonrpc": "2.0",
            "method": "Plugin.Stream.Ready",
            "params": {"name": "TuneBook", "version": "1.0"},
        }
    )
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("method"):
            handle_request(message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
