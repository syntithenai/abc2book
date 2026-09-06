#!/usr/bin/env bash
# Ensure the TTS gateway has a reachable backend. Restart/start via tts-up.sh if not.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${TTS_PUBLISH_PORT:-8789}"
URL="http://127.0.0.1:${PORT}/health"

if curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; then
  exit 0
fi

# Gateway up but no backend (503), or nothing listening — bring stack up.
echo "TTS unhealthy at $URL; ensuring stack..."
exec "$ROOT/scripts/tts-up.sh"
