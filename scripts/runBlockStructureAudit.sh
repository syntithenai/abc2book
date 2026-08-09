#!/usr/bin/env bash
# Run block structure corpus audit and write JSON/Markdown reports.
#
# Usage:
#   ./scripts/runBlockStructureAudit.sh scrape/songs.abc [scrape/tunes.abc]
#   ./scripts/runBlockStructureAudit.sh scrape/songs.abc --report /tmp/block-audit.json

set -euo pipefail
cd "$(dirname "$0")/.."

REPORT_PATH=""
FILES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --report)
      REPORT_PATH="${2:-}"
      shift 2
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  FILES=("scrape/songs.abc" "scrape/tunes.abc")
fi

export BLOCK_AUDIT_FILES="${FILES[*]}"
export BLOCK_AUDIT_REPORT="${REPORT_PATH}"

CI=1 npm test -- --watchAll=false --runInBand --testPathPattern=tuneBlockCorpus.cli

if [[ -n "$REPORT_PATH" ]]; then
  echo "Wrote reports:"
  echo "  ${REPORT_PATH}"
  echo "  ${REPORT_PATH%.json}.md"
fi
