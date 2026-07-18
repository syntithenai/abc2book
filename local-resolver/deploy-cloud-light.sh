#!/usr/bin/env bash
# Redeploy tunebook-resolver-light to Cloud Run (build + deploy).
# Usage: from repo root or local-resolver/
#   ./local-resolver/deploy-cloud-light.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

export REGION="${REGION:-australia-southeast1}"
export IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/abc2book/tunebook/resolver-light}"

echo "Building $IMAGE ..."
gcloud builds submit \
  --config=cloudbuild.light.yaml \
  --project=abc2book \
  --substitutions=_IMAGE="$IMAGE" \
  .

echo "Deploying tunebook-resolver-light ..."
gcloud run deploy tunebook-resolver-light \
  --project=abc2book \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed

URL="$(gcloud run services describe tunebook-resolver-light \
  --project=abc2book --region="$REGION" \
  --format='value(status.url)')"

echo "Smoke: $URL/health"
curl -sS "$URL/health" | head -c 500
echo
echo "Done: $URL"
