#!/usr/bin/env bash
# Deploy tunebook-score-convert to Cloud Run (internal MuseScore conversion sidecar).
# Usage from local-resolver/:
#   ./deploy/setup-cloud-score-convert-secret.sh   # once
#   ./deploy-cloud-score-convert.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export REGION="${REGION:-australia-southeast1}"
export IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/abc2book/tunebook/score-convert}"

echo "Building $IMAGE ..."
gcloud builds submit \
  --config=cloudbuild.score-convert.yaml \
  --project=abc2book \
  --substitutions=_IMAGE="$IMAGE" \
  .

echo "Deploying tunebook-score-convert (internal) ..."
gcloud run deploy tunebook-score-convert \
  --project=abc2book \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --no-allow-unauthenticated \
  --port=8790 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=180 \
  --concurrency=1 \
  --max-instances=2 \
  --set-secrets="SCORE_CONVERT_SECRET=score-convert-secret:latest"

URL="$(gcloud run services describe tunebook-score-convert \
  --project=abc2book --region="$REGION" \
  --format='value(status.url)')"

echo "Score-convert URL: $URL"
echo "Grant tunebook-resolver-light invoker:"
echo "  gcloud run services add-iam-policy-binding tunebook-score-convert \\"
echo "    --project=abc2book --region=$REGION \\"
echo "    --member=serviceAccount:\$(gcloud run services describe tunebook-resolver-light --project=abc2book --region=$REGION --format='value(spec.template.spec.serviceAccountName)') \\"
echo "    --role=roles/run.invoker"
echo "Set SCORE_CONVERT_URL=$URL on tunebook-resolver-light and redeploy ./deploy-cloud-light.sh"
