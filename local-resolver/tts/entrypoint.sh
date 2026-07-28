#!/usr/bin/env bash
set -euo pipefail

VOICE="${TTS_PIPER_VOICE:-en_US-lessac-medium}"
DATA_DIR="${TTS_PIPER_DATA_DIR:-/voices}"
HOST="${TTS_LISTEN_HOST:-0.0.0.0}"
PORT="${TTS_LISTEN_PORT:-5000}"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

mkdir -p "${DATA_DIR}"

if [[ ! -f "${DATA_DIR}/${VOICE}.onnx" && ! -f "${DATA_DIR}/${VOICE}/${VOICE}.onnx" ]]; then
  log "Downloading Piper voice ${VOICE} into ${DATA_DIR}"
  python3 -m piper.download_voices "${VOICE}" --data-dir "${DATA_DIR}"
fi

log "Starting Piper HTTP server voice=${VOICE} on ${HOST}:${PORT}"
exec python3 -m piper.http_server \
  -m "${VOICE}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --data-dir "${DATA_DIR}"
