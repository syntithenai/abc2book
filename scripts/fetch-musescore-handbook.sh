#!/usr/bin/env bash
# Fetch MuseScore Studio handbook machine-readable dumps into docs/musescore-handbook/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/musescore-handbook"
mkdir -p "$OUT"
curl -fsSL -o "$OUT/llms.txt" "https://handbook.musescore.org/llms.txt"
curl -fsSL -o "$OUT/llms-full.txt" "https://handbook.musescore.org/llms-full.txt"
echo "Updated:"
wc -c "$OUT/llms.txt" "$OUT/llms-full.txt"
