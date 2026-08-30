#!/usr/bin/env bash
# Embed YogApp web build at ./yoga/ for GitHub Pages (tunebook.net/yoga/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YOGAPP="${YOGAPP_DIR:-$ROOT/../yogapp}"

if [[ ! -d "$YOGAPP" ]]; then
  echo "embed-yogapp: missing YogApp checkout at $YOGAPP" >&2
  echo "Clone https://github.com/syntithenai/yogapp next to abc2book, or set YOGAPP_DIR." >&2
  exit 1
fi

echo "embed-yogapp: building YogApp for /yoga/ from $YOGAPP"
(
  cd "$YOGAPP"
  npm run build:web
)

DEST_BUILD="$ROOT/build/yoga"
DEST_ROOT="$ROOT/yoga"
rm -rf "$DEST_BUILD" "$DEST_ROOT"
mkdir -p "$DEST_BUILD" "$DEST_ROOT"
cp -a "$YOGAPP/dist/." "$DEST_BUILD/"
cp -a "$YOGAPP/dist/." "$DEST_ROOT/"
echo "embed-yogapp: wrote $DEST_BUILD and $DEST_ROOT"
