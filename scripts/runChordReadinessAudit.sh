#!/usr/bin/env bash
# Run chord readiness audit on exported tunebook JSON.
#
# Usage:
#   CHORD_READINESS_INPUT=~/Downloads/tunebook.json \
#   CHORD_READINESS_REPORT=/tmp/chord-readiness.json \
#   ./scripts/runChordReadinessAudit.sh
#
# Optional:
#   CHORD_READINESS_BOOK=songs     # filter to book (default: songs)
#   CHORD_READINESS_APPLY=1        # write fixed tunes JSON alongside report
#   CHORD_READINESS_FIXED=/tmp/tunes-fixed.json

set -euo pipefail
cd "$(dirname "$0")/.."

export CHORD_READINESS_INPUT="${CHORD_READINESS_INPUT:-}"
export CHORD_READINESS_REPORT="${CHORD_READINESS_REPORT:-}"
export CHORD_READINESS_BOOK="${CHORD_READINESS_BOOK:-songs}"
export CHORD_READINESS_APPLY="${CHORD_READINESS_APPLY:-0}"
export CHORD_READINESS_FIXED="${CHORD_READINESS_FIXED:-}"

if [[ -z "$CHORD_READINESS_INPUT" ]]; then
  echo "Set CHORD_READINESS_INPUT to an exported tunebook JSON file." >&2
  exit 1
fi

CI=1 npm test -- --watchAll=false --runInBand --testPathPattern=tuneChordReadiness.cli

if [[ -n "$CHORD_READINESS_REPORT" ]]; then
  echo "Wrote reports:"
  echo "  ${CHORD_READINESS_REPORT}"
  echo "  ${CHORD_READINESS_REPORT%.json}.md"
  echo "  ${CHORD_READINESS_REPORT%.json}.csv"
  if [[ "$CHORD_READINESS_APPLY" == "1" && -n "$CHORD_READINESS_FIXED" ]]; then
    echo "  ${CHORD_READINESS_FIXED}"
  fi
fi
