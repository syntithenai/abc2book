#!/usr/bin/env bash
# Create or rotate SCORE_CONVERT_SECRET in Secret Manager (shared by light + score-convert).
set -euo pipefail

PROJECT="${GCP_PROJECT:-abc2book}"
SECRET_NAME="score-convert-secret"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET_NAME" --project="$PROJECT" --replication-policy=automatic
fi

TOKEN="$(openssl rand -hex 32)"
printf '%s' "$TOKEN" | gcloud secrets versions add "$SECRET_NAME" --project="$PROJECT" --data-file=-

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT" >/dev/null

echo "Added new version to $SECRET_NAME"
echo "Granted roles/secretmanager.secretAccessor to ${SA}"
echo "Redeploy tunebook-score-convert and tunebook-resolver-light to pick up the secret."
