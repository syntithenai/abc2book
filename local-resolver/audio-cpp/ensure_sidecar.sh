#!/usr/bin/env bash
# Ensure the host audio.cpp sidecar answers /health; start the unit if not.
set -euo pipefail

AUDIO_CPP_URL="${AUDIO_CPP_URL:-http://127.0.0.1:8788}"
UNIT="${AUDIO_CPP_SYSTEMD_UNIT:-abc2book-audio-cpp.service}"
HEALTH_TIMEOUT_SEC="${AUDIO_CPP_HEALTH_TIMEOUT_SEC:-3}"

if curl -fsS --max-time "$HEALTH_TIMEOUT_SEC" "${AUDIO_CPP_URL%/}/health" >/dev/null 2>&1; then
  exit 0
fi

echo "ensure_sidecar: ${AUDIO_CPP_URL}/health failed — starting ${UNIT}" >&2
systemctl --user start "$UNIT"

# Brief settle; do not fail the oneshot if health is still warming (Vulkan init).
for _ in 1 2 3 4 5; do
  if curl -fsS --max-time "$HEALTH_TIMEOUT_SEC" "${AUDIO_CPP_URL%/}/health" >/dev/null 2>&1; then
    echo "ensure_sidecar: healthy" >&2
    exit 0
  fi
  sleep 1
done

echo "ensure_sidecar: started ${UNIT} but health not ready yet" >&2
exit 0
