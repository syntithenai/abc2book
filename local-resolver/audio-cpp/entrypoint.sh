#!/usr/bin/env bash
set -euo pipefail

BIN="${AUDIO_CPP_SERVER_BIN:-/audio-cpp/build/linux-vulkan-release/bin/audiocpp_server}"
CONFIG="${AUDIO_CPP_CONFIG:-/app/server.docker.json}"

if [[ ! -x "${BIN}" ]]; then
  echo "audio.cpp server binary not found at ${BIN}" >&2
  echo "Build on the host, then mount the repo at /audio-cpp:" >&2
  echo "  cd ~/audio.cpp && bash scripts/build_linux.sh --backend vulkan --target audiocpp_server" >&2
  exit 1
fi

if [[ ! -f "${CONFIG}" ]]; then
  echo "audio.cpp config not found at ${CONFIG}" >&2
  exit 1
fi

exec "${BIN}" --config "${CONFIG}" --backend vulkan --host 0.0.0.0 --port 8788
