#!/usr/bin/env bash
# Upload Stripe secrets to GCP Secret Manager for Cloud Run.
# Usage: from local-resolver/
#   set -a && source .env && set +a   # or export STRIPE_* manually
#   ./deploy/setup-cloud-billing-secrets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${GCP_PROJECT:-abc2book}"
REGION="${REGION:-australia-southeast1}"

if [[ -z "${STRIPE_SECRET_KEY:-}" || -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  echo "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the environment first." >&2
  echo "Example: set -a && source .env && set +a" >&2
  exit 1
fi

if [[ "$STRIPE_SECRET_KEY" == sk_test_* ]]; then
  echo "WARNING: STRIPE_SECRET_KEY starts with sk_test_ (Stripe test mode)." >&2
  echo "Checkout will show test-mode prompts (e.g. 3DS code 000000). For real charges use sk_live_ from the Stripe Dashboard with Test mode OFF." >&2
  if [[ "${ALLOW_STRIPE_TEST_SECRETS:-}" != "1" ]]; then
    echo "Refusing to upload test keys. Export ALLOW_STRIPE_TEST_SECRETS=1 to override, or set live keys." >&2
    exit 1
  fi
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

put_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT"
    echo "Updated secret: $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT"
    echo "Created secret: $name"
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT" >/dev/null || true
}

put_secret stripe-secret-key "$STRIPE_SECRET_KEY"
put_secret stripe-webhook-secret "$STRIPE_WEBHOOK_SECRET"

echo "Stripe secrets ready for Cloud Run in project $PROJECT (region $REGION)."
