#!/usr/bin/env bash
# Phase 0 spike checklist for practice-track generation.
set -euo pipefail

AUDIO_CPP_URL="${AUDIO_CPP_URL:-http://127.0.0.1:8788}"
OUT_DIR="${OUT_DIR:-/tmp/abc2book-phase0-spike}"

echo "== Phase 0.1: Vulkan device =="
if command -v vulkaninfo >/dev/null 2>&1; then
  vulkaninfo 2>/dev/null | grep -m1 'deviceName' || echo "WARN: no Vulkan device found"
else
  echo "WARN: vulkaninfo not installed"
fi

echo "== Phase 0.2: audio.cpp sidecar health =="
if curl -sf "${AUDIO_CPP_URL}/health" >/dev/null 2>&1; then
  echo "OK: sidecar reachable at ${AUDIO_CPP_URL}"
elif curl -sf "${AUDIO_CPP_URL}/" >/dev/null 2>&1; then
  echo "OK: sidecar reachable (root)"
else
  echo "SKIP: audio.cpp not running at ${AUDIO_CPP_URL}"
  echo "      Start audiocpp_server or set PRACTICE_TRACK_PROVIDER=mock in .env for app dev"
  exit 0
fi

mkdir -p "${OUT_DIR}"

echo "== Phase 0.3–0.5: generation tests require audio.cpp task API =="
echo "Manual: generate 30s and 64s reel backing prompts; verify duration with:"
echo "  python3 local-resolver/detect_timing.py <wav>"
echo "Output directory: ${OUT_DIR}"
echo "Phase 0 spike script finished (automated HTTP generation depends on audio.cpp API version)."
