#!/usr/bin/env bash
# Start the TTS stack: gateway + Kokoro primary + Piper fallback (always both).
# Keeps speech available if either backend dies; systemd watchdog re-runs this.
# Rebuild images only when TTS_BUILD=1 (watchdog uses start without rebuild).
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
read_env_var TTS_PUBLISH_PORT
read_env_var TTS_BUILD

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

GPU_WANTED=false
if [[ -e /dev/kfd && -e /dev/dri ]]; then
  if [[ "${TTS_SKIP_GPU:-}" == "1" || "${TTS_SKIP_GPU:-}" == "true" ]]; then
    echo "TTS_SKIP_GPU set; starting Piper + gateway only (skipping Kokoro)"
  else
    GPU_WANTED=true
    resolve_kokoro_image
    echo "AMD GPU devices detected; starting Kokoro primary + Piper fallback"
  fi
else
  echo "No /dev/kfd or /dev/dri; starting Piper + gateway only"
fi

BUILD_ARGS=()
if [[ "${TTS_BUILD:-}" == "1" || "${TTS_BUILD:-}" == "true" ]]; then
  BUILD_ARGS+=(--build)
fi

if [[ "$GPU_WANTED" == true ]]; then
  KOKORO_IMAGE="${TTS_KOKORO_IMAGE:-$KOKORO_ROCM_IMAGE_DEFAULT}"
  if ! docker image inspect "$KOKORO_IMAGE" >/dev/null 2>&1; then
    echo ""
    echo "To use Piper only: TTS_SKIP_GPU=1 ./scripts/tts-up.sh"
    echo ""
    if ! "$(dirname "$0")/tts-pull-gpu.sh"; then
      echo "WARNING: Could not pull Kokoro image; starting Piper + gateway only." >&2
      docker compose --profile tts --profile tts-cpu up -d "${BUILD_ARGS[@]}" tts-gateway tts-cpu
      echo "TTS stack up (Piper on :${TTS_PUBLISH_PORT:-8789})" >&2
      exit 1
    fi
  fi
  # Explicit service list avoids baking unrelated compose services (resolver/llm).
  docker compose --profile tts --profile tts-gpu --profile tts-cpu up -d "${BUILD_ARGS[@]}" \
    tts-gateway tts-gpu-init tts-gpu tts-cpu
  echo "TTS stack up (Kokoro primary + Piper fallback on :${TTS_PUBLISH_PORT:-8789})"
else
  docker compose --profile tts --profile tts-cpu up -d "${BUILD_ARGS[@]}" tts-gateway tts-cpu
  echo "TTS stack up (Piper on :${TTS_PUBLISH_PORT:-8789})"
fi
