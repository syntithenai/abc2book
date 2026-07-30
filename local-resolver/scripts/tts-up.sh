#!/usr/bin/env bash
# Start the TTS stack, enabling the Kokoro GPU service when AMD ROCm devices exist.
set -euo pipefail

cd "$(dirname "$0")/.."

KOKORO_ROCM_IMAGE_DEFAULT=ghcr.io/remsky/kokoro-fastapi-rocm:latest
KOKORO_CPU_IMAGE=ghcr.io/remsky/kokoro-fastapi-cpu:latest

read_env_var() {
  local key="$1"
  if [[ -z "${!key:-}" && -f .env ]] && grep -qE "^${key}=" .env; then
    # shellcheck disable=SC2163
    export "$key"="$(grep -E "^${key}=" .env | tail -1 | cut -d= -f2- | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//')"
  fi
}

read_env_var TTS_SKIP_GPU
read_env_var TTS_KOKORO_IMAGE
read_env_var TTS_KOKORO_USE_GPU
read_env_var TTS_KOKORO_DEVICE
read_env_var HSA_OVERRIDE_GFX_VERSION
read_env_var HSA_ENABLE_SDMA

is_strix_halo_gfx1151() {
  if ! command -v rocminfo >/dev/null; then
    return 1
  fi
  # grep -q closes the pipe early; rocminfo then exits non-zero and pipefail treats
  # the pipeline as failed. Read full rocminfo output instead.
  rocminfo 2>/dev/null | grep 'gfx1151' >/dev/null
}

resolve_kokoro_image() {
  if [[ -n "${TTS_KOKORO_IMAGE:-}" ]]; then
    return
  fi
  if is_strix_halo_gfx1151; then
    export TTS_KOKORO_IMAGE="$KOKORO_CPU_IMAGE"
    export TTS_KOKORO_USE_GPU=false
    export TTS_KOKORO_DEVICE=cpu
    echo "Strix Halo (gfx1151) detected: ROCm 6.4 Kokoro image segfaults on this GPU."
    echo "Using Kokoro CPU image ($TTS_KOKORO_IMAGE). Set TTS_KOKORO_IMAGE in .env to override."
  else
    export TTS_KOKORO_IMAGE="$KOKORO_ROCM_IMAGE_DEFAULT"
  fi
}

stop_piper_if_running() {
  if docker ps -q --filter name=^abc2book-tts-cpu$ | grep -q .; then
    echo "Stopping Piper (tts-cpu); Kokoro is the active backend."
    docker compose --profile tts-cpu stop tts-cpu 2>/dev/null || docker stop abc2book-tts-cpu 2>/dev/null || true
  fi
}

GPU_WANTED=false
if [[ -e /dev/kfd && -e /dev/dri ]]; then
  if [[ "${TTS_SKIP_GPU:-}" == "1" || "${TTS_SKIP_GPU:-}" == "true" ]]; then
    echo "TTS_SKIP_GPU set; starting Piper CPU TTS only (skipping Kokoro)"
  else
    GPU_WANTED=true
    resolve_kokoro_image
    echo "AMD GPU devices detected; will start Kokoro (tts-gpu), not Piper"
  fi
else
  echo "No /dev/kfd or /dev/dri; starting Piper CPU TTS only"
fi

if [[ "$GPU_WANTED" == true ]]; then
  echo "Starting TTS gateway..."
  docker compose --profile tts up -d --build "$@"
else
  echo "Starting Piper CPU + gateway..."
  docker compose --profile tts --profile tts-cpu up -d --build "$@"
fi

if [[ "$GPU_WANTED" != true ]]; then
  echo "TTS stack up (Piper CPU on :${TTS_PUBLISH_PORT:-8789})"
  exit 0
fi

KOKORO_IMAGE="${TTS_KOKORO_IMAGE:-$KOKORO_ROCM_IMAGE_DEFAULT}"
if ! docker image inspect "$KOKORO_IMAGE" >/dev/null 2>&1; then
  echo ""
  echo "To use Piper CPU only instead: TTS_SKIP_GPU=1 ./scripts/tts-up.sh"
  echo ""
  if ! "$(dirname "$0")/tts-pull-gpu.sh"; then
    echo "WARNING: Could not pull Kokoro image; starting Piper fallback." >&2
    docker compose --profile tts-cpu up -d --build
    echo "TTS stack up (Piper CPU on :${TTS_PUBLISH_PORT:-8789})" >&2
    exit 1
  fi
fi

echo "Starting Kokoro service ($KOKORO_IMAGE)..."
docker compose --profile tts-gpu up -d
stop_piper_if_running
echo "TTS stack up (Kokoro on :${TTS_PUBLISH_PORT:-8789}; Piper not started)"
