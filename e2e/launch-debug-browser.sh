#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${CHROME_DEBUG_PORT:-9222}"
DEBUG_PROFILE="${CHROME_DEBUG_PROFILE:-$HOME/.chrome-abc2book-debug}"
START_URL="${BROWSER_START_URL:-http://localhost:3000}"

find_chrome() {
  local candidates=(
    "${CHROME_BIN:-}"
    google-chrome
    google-chrome-stable
    chromium
    chromium-browser
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" ]] && command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

CHROME_CMD="$(find_chrome || true)"
if [[ -z "$CHROME_CMD" ]]; then
  echo "Error: could not find Chrome/Chromium. Set CHROME_BIN to the browser executable." >&2
  exit 1
fi

mkdir -p "$DEBUG_PROFILE"

echo "Launching browser: $CHROME_CMD"
echo "Profile: $DEBUG_PROFILE"
echo "DevTools: http://127.0.0.1:$DEBUG_PORT"
echo "Start URL: $START_URL"

exec "$CHROME_CMD" \
  --remote-debugging-port="$DEBUG_PORT" \
  --user-data-dir="$DEBUG_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  "$START_URL"