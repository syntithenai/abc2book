#!/usr/bin/env bash
# Start either an OpenAI-compatible external proxy or a local llama.cpp server
# behind a logging front proxy so prompts/reasoning show up in docker logs.
set -euo pipefail

LISTEN_HOST="${LLM_LISTEN_HOST:-0.0.0.0}"
LISTEN_PORT="${LLM_LISTEN_PORT:-8080}"
INTERNAL_PORT="${LLM_INTERNAL_PORT:-8081}"
EXTERNAL_BASE_URL="${LLM_EXTERNAL_BASE_URL:-}"
MODEL_FILE="${LLM_MODEL_FILE:-/models/model.gguf}"
MODEL_ALIAS="${LLM_MODEL_ALIAS:-google/gemma-4-31b-qat}"
CTX_SIZE="${LLM_CTX_SIZE:-8192}"
N_GPU_LAYERS="${LLM_N_GPU_LAYERS:-99}"
THREADS="${LLM_THREADS:-}"
BATCH_SIZE="${LLM_BATCH_SIZE:-512}"
UBATCH_SIZE="${LLM_UBATCH_SIZE:-512}"
PARALLEL="${LLM_PARALLEL:-1}"
MMPROJ_FILE="${LLM_MMPROJ_FILE:-}"
EXTRA_ARGS="${LLM_SERVER_EXTRA_ARGS:-}"
API_KEY="${LLM_API_KEY:-${RESEARCH_LLM_API_KEY:-}}"
WAIT_FOR_MODEL_SECONDS="${LLM_WAIT_FOR_MODEL_SECONDS:-0}"
LOG_VERBOSE="${LLM_LOG_VERBOSE:-true}"
LOG_PROMPTS_DIR="${LLM_LOG_PROMPTS_DIR:-/var/log/llama-prompts}"
REASONING_FORMAT="${LLM_REASONING_FORMAT:-deepseek}"
LOG_TRAFFIC="${LLM_LOG_TRAFFIC:-true}"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -n "${EXTERNAL_BASE_URL}" ]]; then
  log "LLM_EXTERNAL_BASE_URL set; starting OpenAI-compatible proxy (no local model load)"
  export LLM_EXTERNAL_BASE_URL
  export LLM_EXTERNAL_API_KEY="${LLM_EXTERNAL_API_KEY:-}"
  export LLM_API_KEY="${API_KEY}"
  export LLM_LISTEN_HOST="${LISTEN_HOST}"
  export LLM_LISTEN_PORT="${LISTEN_PORT}"
  export LLM_LOG_TRAFFIC="${LOG_TRAFFIC}"
  exec python3 /app/external_proxy.py
fi

LLAMA_SERVER="${LLAMA_SERVER_BIN:-/opt/llama.cpp/llama-server}"
if [[ ! -x "${LLAMA_SERVER}" ]]; then
  log "ERROR: llama-server not found at ${LLAMA_SERVER}"
  exit 1
fi

waited=0
while [[ ! -f "${MODEL_FILE}" ]]; do
  if [[ "${WAIT_FOR_MODEL_SECONDS}" != "0" && "${waited}" -ge "${WAIT_FOR_MODEL_SECONDS}" ]]; then
    log "ERROR: model file not found at ${MODEL_FILE} after ${waited}s"
    exit 1
  fi
  log "Waiting for model file at ${MODEL_FILE} ..."
  sleep 5
  waited=$((waited + 5))
done

mkdir -p "${LOG_PROMPTS_DIR}"

log "Starting llama-server on 127.0.0.1:${INTERNAL_PORT} with ${MODEL_FILE} (alias=${MODEL_ALIAS}, ctx=${CTX_SIZE}, ngl=${N_GPU_LAYERS}, verbose=$(is_truthy "${LOG_VERBOSE}" && echo yes || echo no))"

# Preload into RAM then keep resident in VRAM/RAM for low-latency replies.
# --no-mmap forces a full load at startup instead of demand-paging the GGUF.
args=(
  --model "${MODEL_FILE}"
  --alias "${MODEL_ALIAS}"
  --host "127.0.0.1"
  --port "${INTERNAL_PORT}"
  --ctx-size "${CTX_SIZE}"
  --n-gpu-layers "${N_GPU_LAYERS}"
  --batch-size "${BATCH_SIZE}"
  --ubatch-size "${UBATCH_SIZE}"
  --parallel "${PARALLEL}"
  --no-mmap
  --metrics
  --log-timestamps
  --log-prompts-dir "${LOG_PROMPTS_DIR}"
  --reasoning-format "${REASONING_FORMAT}"
)

if is_truthy "${LOG_VERBOSE}"; then
  args+=(--verbose)
fi

if [[ -n "${THREADS}" ]]; then
  args+=(--threads "${THREADS}")
fi

if [[ -n "${API_KEY}" ]]; then
  args+=(--api-key "${API_KEY}")
fi

if [[ -n "${MMPROJ_FILE}" && -f "${MMPROJ_FILE}" ]]; then
  args+=(--mmproj "${MMPROJ_FILE}")
fi

# shellcheck disable=SC2206
if [[ -n "${EXTRA_ARGS}" ]]; then
  extra=( ${EXTRA_ARGS} )
  args+=("${extra[@]}")
fi

"${LLAMA_SERVER}" "${args[@]}" &
LLAMA_PID=$!

cleanup() {
  if kill -0 "${LLAMA_PID}" 2>/dev/null; then
    kill "${LLAMA_PID}" 2>/dev/null || true
    wait "${LLAMA_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Mirror llama prompt dump files into container stdout.
(
  # Wait for first file, then follow all new prompt logs.
  while [[ ! -d "${LOG_PROMPTS_DIR}" ]]; do sleep 1; done
  log "Tailing prompt dumps from ${LOG_PROMPTS_DIR}"
  # shellcheck disable=SC2034
  while true; do
    if compgen -G "${LOG_PROMPTS_DIR}/*" > /dev/null; then
      tail -n +1 -F "${LOG_PROMPTS_DIR}"/* 2>/dev/null | while IFS= read -r line; do
        printf '%s llama-prompt: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "${line}"
      done
      break
    fi
    sleep 2
  done
) &
TAIL_PID=$!

# Wait until llama is accepting HTTP before exposing the front proxy.
for _ in $(seq 1 180); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${INTERNAL_PORT}/v1/models" >/dev/null 2>&1 \
    || curl -fsS --max-time 2 "http://127.0.0.1:${INTERNAL_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${LLAMA_PID}" 2>/dev/null; then
    log "ERROR: llama-server exited before becoming ready"
    exit 1
  fi
  sleep 2
done

log "Starting logging front proxy on ${LISTEN_HOST}:${LISTEN_PORT} -> 127.0.0.1:${INTERNAL_PORT} (LLM_LOG_TRAFFIC=${LOG_TRAFFIC})"
export LLM_LOCAL_UPSTREAM_BASE_URL="http://127.0.0.1:${INTERNAL_PORT}"
export LLM_LISTEN_HOST="${LISTEN_HOST}"
export LLM_LISTEN_PORT="${LISTEN_PORT}"
export LLM_LOG_TRAFFIC="${LOG_TRAFFIC}"
python3 /app/local_front_proxy.py &
FRONT_PID=$!

wait_any() {
  while true; do
    if ! kill -0 "${LLAMA_PID}" 2>/dev/null; then
      log "llama-server exited"
      return 1
    fi
    if ! kill -0 "${FRONT_PID}" 2>/dev/null; then
      log "front proxy exited"
      return 1
    fi
    sleep 2
  done
}

wait_any
EXIT_CODE=$?
kill "${FRONT_PID}" "${TAIL_PID}" 2>/dev/null || true
exit "${EXIT_CODE}"
