#!/usr/bin/env bash
# Redeploy tunebook-resolver-light to Cloud Run (build + deploy).
# Usage from local-resolver/:
#   cp deploy/cloud-run-env.example.yaml deploy/cloud-run-env.yaml
#   ./deploy/setup-cloud-billing-secrets.sh   # once, after setting STRIPE_* in .env
#   ./deploy-cloud-light.sh
#
# Env vars and secrets persist on the service unless you change them with another deploy.
# Billing packaging + unit tests run before build; post-deploy requires billingEnabled=true.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export REGION="${REGION:-australia-southeast1}"
export IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/abc2book/tunebook/resolver-light}"
ENV_FILE="${CLOUD_RUN_ENV_FILE:-$ROOT/deploy/cloud-run-env.yaml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  echo "Copy deploy/cloud-run-env.example.yaml to deploy/cloud-run-env.yaml and edit." >&2
  exit 1
fi

# Pre-deploy tests need light gateway deps (fastapi/httpx/stripe/…).
resolve_light_python() {
  local candidate
  for candidate in \
    "${RESOLVER_PYTHON:-}" \
    "$ROOT/.venv-light/bin/python" \
    "$ROOT/../.venv/bin/python" \
    "$(command -v python3 || true)" \
    "$(command -v python || true)"; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    if "$candidate" -c "import fastapi, httpx, stripe" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_light_python() {
  local py
  if py="$(resolve_light_python)"; then
    echo "$py"
    return 0
  fi
  echo "Light Python deps missing — creating $ROOT/.venv-light from requirements-light.txt ..." >&2
  python3 -m venv "$ROOT/.venv-light"
  "$ROOT/.venv-light/bin/pip" install -q -r "$ROOT/requirements-light.txt"
  if ! "$ROOT/.venv-light/bin/python" -c "import fastapi, httpx, stripe" >/dev/null 2>&1; then
    echo "Failed to install light resolver deps into .venv-light" >&2
    exit 1
  fi
  echo "$ROOT/.venv-light/bin/python"
}

LIGHT_PYTHON="$(ensure_light_python)"
echo "Pre-deploy billing tests ($LIGHT_PYTHON) ..."
"$LIGHT_PYTHON" -m unittest test_light_billing_packaging test_billing -v

CLOUD_RUN_SECRETS="\
GOOGLE_CLIENT_ID=google-client-id:latest,\
GOOGLE_CLIENT_SECRET=google-client-secret:latest,\
AUTH_SESSION_SECRET=auth-session-secret:latest,\
AUTH_REFRESH_TOKEN_FERNET_KEY=auth-refresh-token-fernet-key:latest,\
PROVIDER_WHISPER_API_KEY=provider-groq-api-key:latest,\
PROVIDER_LLM_API_KEY=provider-groq-api-key:latest,\
PROVIDER_OCR_API_KEY=provider-groq-api-key:latest,\
STRIPE_SECRET_KEY=stripe-secret-key:latest,\
STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest,\
SCORE_CONVERT_SECRET=score-convert-secret:latest"

echo "Building $IMAGE ..."
gcloud builds submit \
  --config=cloudbuild.light.yaml \
  --project=abc2book \
  --substitutions=_IMAGE="$IMAGE" \
  .

echo "Deploying tunebook-resolver-light (env: $ENV_FILE) ..."
gcloud run deploy tunebook-resolver-light \
  --project=abc2book \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --no-cpu-throttling \
  --timeout=300 \
  --max-instances=3 \
  --env-vars-file="$ENV_FILE" \
  --set-secrets="$CLOUD_RUN_SECRETS"

URL="$(gcloud run services describe tunebook-resolver-light \
  --project=abc2book --region="$REGION" \
  --format='value(status.url)')"

echo "Smoke: $URL/health"
HEALTH_JSON="$(curl -sS --max-time 30 "$URL/health")"
echo "$HEALTH_JSON" | head -c 800
echo

python - "$HEALTH_JSON" <<'PY'
import json, sys
body = json.loads(sys.argv[1])
if body.get("billingEnabled") is not True:
    print(
        "ERROR: post-deploy health billingEnabled is not true:",
        body.get("billingEnabled"),
        file=sys.stderr,
    )
    sys.exit(1)
print("Billing check OK: billingEnabled=true creditRequired=", body.get("creditRequired"))
PY

CAN_AFFORD_CODE="$(curl -sS --max-time 30 -o /tmp/billing-can-afford.json -w '%{http_code}' \
  -X POST "$URL/billing/can-afford" \
  -H 'Content-Type: application/json' \
  -d '{"operations":[{"id":"background_research"}]}' || true)"
case "$CAN_AFFORD_CODE" in
  401|403) echo "Billing route OK: POST /billing/can-afford -> $CAN_AFFORD_CODE (auth required)" ;;
  *)
    echo "ERROR: POST /billing/can-afford returned HTTP $CAN_AFFORD_CODE (expected 401/403)" >&2
    head -c 400 /tmp/billing-can-afford.json 2>/dev/null || true
    echo >&2
    exit 1
    ;;
esac

echo "Webhook URL: $URL/billing/webhook"
echo "Done: $URL"
