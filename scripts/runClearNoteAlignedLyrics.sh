#!/usr/bin/env bash
# Count or clear note-aligned lyrics (tune.wLines) in an exported tunebook JSON.
#
# Usage (dry-run / report):
#   NOTE_ALIGNED_INPUT=~/Downloads/tunebook.json ./scripts/runClearNoteAlignedLyrics.sh
#
# Apply (writes cleared JSON):
#   NOTE_ALIGNED_INPUT=~/Downloads/tunebook.json \
#   NOTE_ALIGNED_APPLY=1 \
#   NOTE_ALIGNED_OUTPUT=/tmp/tunebook-no-wlines.json \
#   ./scripts/runClearNoteAlignedLyrics.sh
#
# Then re-import the output JSON into the app (Import / restore backup).

set -euo pipefail
cd "$(dirname "$0")/.."

export NOTE_ALIGNED_INPUT="${NOTE_ALIGNED_INPUT:-}"
export NOTE_ALIGNED_APPLY="${NOTE_ALIGNED_APPLY:-0}"
export NOTE_ALIGNED_OUTPUT="${NOTE_ALIGNED_OUTPUT:-}"

if [[ -z "$NOTE_ALIGNED_INPUT" ]]; then
  echo "Set NOTE_ALIGNED_INPUT to an exported tunebook JSON (or .abc) file." >&2
  exit 1
fi

CI=1 npm test -- --watchAll=false --runInBand --testPathPattern=clearNoteAlignedLyrics.cli
