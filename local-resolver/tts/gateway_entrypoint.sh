#!/usr/bin/env bash
set -euo pipefail

HOST="${TTS_GATEWAY_LISTEN_HOST:-0.0.0.0}"
PORT="${TTS_GATEWAY_LISTEN_PORT:-8789}"

exec python3 -m uvicorn gateway:app --host "${HOST}" --port "${PORT}"
