#!/usr/bin/env bash
# Start the TTS stack, enabling the Kokoro GPU service when AMD ROCm devices exist.
set -euo pipefail

cd "$(dirname "$0")/.."

PROFILES=(--profile tts)
if [[ -e /dev/kfd && -e /dev/dri ]]; then
  PROFILES+=(--profile tts-gpu)
  echo "AMD GPU devices detected; including Kokoro (tts-gpu) profile"
else
  echo "No /dev/kfd or /dev/dri; starting Piper CPU TTS only"
fi

exec docker compose "${PROFILES[@]}" up -d --build "$@"
