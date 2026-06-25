#!/usr/bin/env bash
# Seed a Chrome profile for playback E2E (remote debugging + IndexedDB tune data).
#
# Chrome stores IndexedDB in two places for each origin:
#   *.indexeddb.leveldb  — metadata / keys
#   *.indexeddb.blob     — actual blob bytes (audio, recordings, etc.)
# Copying only leveldb causes: "Data lost due to missing file … irrecoverable"
set -euo pipefail

SOURCE_PROFILE="${CHROME_SOURCE_PROFILE:-$HOME/.config/google-chrome}"
TARGET_PROFILE="${CHROME_DEBUG_PROFILE:-$HOME/.chrome-abc2book-debug}"
ORIGIN_PREFIX="http_localhost_3000.indexeddb"
SOURCE_IDB="$SOURCE_PROFILE/Default/IndexedDB"
TARGET_IDB="$TARGET_PROFILE/Default/IndexedDB"

chrome_running() {
  pgrep -x chrome >/dev/null 2>&1 || pgrep -f '/opt/google/chrome/chrome' >/dev/null 2>&1
}

copy_idb_tree() {
  local name="$1"
  local src="$SOURCE_IDB/$name"
  local dst="$TARGET_IDB/$name"
  if [[ ! -e "$src" ]]; then
    echo "  skip (not found): $name"
    return 0
  fi
  rm -rf "$dst"
  cp -a "$src" "$dst"
  echo "  copied: $name ($(du -sh "$dst" | cut -f1))"
}

if chrome_running; then
  echo "Error: Chrome is still running. Quit all Chrome windows first, then re-run." >&2
  exit 1
fi

if [[ ! -d "$SOURCE_IDB/${ORIGIN_PREFIX}.leveldb" ]]; then
  echo "Error: No localhost:3000 IndexedDB at:" >&2
  echo "  $SOURCE_IDB/${ORIGIN_PREFIX}.leveldb" >&2
  echo "Open http://localhost:3000 in your normal Chrome once so tune data exists." >&2
  exit 1
fi

mkdir -p "$TARGET_IDB"

echo "Copying localhost:3000 IndexedDB from $SOURCE_PROFILE"
copy_idb_tree "${ORIGIN_PREFIX}.leveldb"
copy_idb_tree "${ORIGIN_PREFIX}.blob"

if [[ ! -d "$TARGET_IDB/${ORIGIN_PREFIX}.blob" ]]; then
  echo
  echo "Warning: no blob store found in source profile."
  echo "If your tunebook stores audio blobs, E2E may still fail."
fi

echo
echo "Debug profile ready: $TARGET_PROFILE"
echo
echo "Start Chrome with remote debugging:"
echo "  google-chrome --remote-debugging-port=9222 --user-data-dir=\"$TARGET_PROFILE\""
echo
echo "Verify port (should print JSON):"
echo "  curl http://127.0.0.1:9222/json/version"
echo
echo "Run E2E (with npm start in another terminal):"
echo "  PLAYBACK_TEST_CDP_URL=http://127.0.0.1:9222 npm run test:playback:e2e"
