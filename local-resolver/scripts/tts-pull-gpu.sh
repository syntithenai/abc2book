#!/usr/bin/env bash
# Pull the Kokoro ROCm image (multi-GB layers). Use when docker pull fails with
# "unexpected EOF" on large layers — often fixed by max-concurrent-downloads: 1
# in /etc/docker/daemon.json (see README TTS section).
set -euo pipefail

cd "$(dirname "$0")/.."

KOKORO_ROCM_IMAGE="${TTS_KOKORO_IMAGE:-ghcr.io/remsky/kokoro-fastapi-rocm:latest}"
MAX_ATTEMPTS="${TTS_GPU_PULL_ATTEMPTS:-10}"

if docker image inspect "$KOKORO_ROCM_IMAGE" >/dev/null 2>&1; then
  echo "Image already present: $KOKORO_ROCM_IMAGE"
  exit 0
fi

echo "Pulling $KOKORO_ROCM_IMAGE (attempts up to $MAX_ATTEMPTS)..."
echo "Large layers (5GB+) can take many minutes each."
echo "If you see unexpected EOF near 100%, set max-concurrent-downloads: 1 in"
echo "/etc/docker/daemon.json and restart Docker (see README TTS section)."
echo ""

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if DOCKER_PROGRESS=plain docker pull "$KOKORO_ROCM_IMAGE"; then
    echo "Pull complete."
    exit 0
  fi

  echo "Pull failed (attempt $attempt/$MAX_ATTEMPTS)." >&2
  docker rmi "$KOKORO_ROCM_IMAGE" 2>/dev/null || true

  if (( attempt < MAX_ATTEMPTS )); then
    wait_sec=$((attempt * 15))
    echo "Retrying in ${wait_sec}s..." >&2
    sleep "$wait_sec"
  fi
done

echo "ERROR: Could not pull $KOKORO_ROCM_IMAGE after $MAX_ATTEMPTS attempts." >&2
echo "Try: merge into /etc/docker/daemon.json and restart Docker:" >&2
echo '  "max-concurrent-downloads": 1,' >&2
echo '  "max-download-attempts": 15' >&2
echo "Or use Piper only: TTS_SKIP_GPU=1 ./scripts/tts-up.sh" >&2
exit 1
