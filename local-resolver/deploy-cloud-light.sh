#!/usr/bin/env bash
# Redeploy tunebook-resolver-light to Cloud Run (build + deploy).
# Usage: from local-resolver/
#   cp deploy/cloud-run-env.example.yaml deploy/cloud-run-env.yaml
#   ./deploy/setup-cloud-billing-secrets.sh   # once, after setting STRIPE_* in .env
#   ./deploy-cloud-light.sh
#
# Env vars and secrets persist on the service unless you change them with another deploy.
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
  --timeout=120 \
  --max-instances=3 \
  --env-vars-file="$ENV_FILE" \
  --set-secrets="$CLOUD_RUN_SECRETS"

URL="$(gcloud run services describe tunebook-resolver-light \
  --project=abc2book --region="$REGION" \
  --format='value(status.url)')"

echo "Smoke: $URL/health"
curl -sS "$URL/health" | head -c 800
echo
echo "Billing check: curl -sS $URL/health | jq '.billingEnabled, .creditRequired'"
echo "Webhook URL: $URL/billing/webhook"
echo "Done: $URL"
