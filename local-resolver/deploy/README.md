# Resolver environment split

Three deployments share one codebase (`local-resolver/`) but **different config**:

| Target | Config file | Billing | Session store | Deploy |
|--------|-------------|---------|---------------|--------|
| **Cloud Run** (`tunebook-resolver-light`) | `deploy/cloud-run-env.yaml` + Secret Manager | `BILLING_ENABLED=true`, Stripe secrets | Firestore | `./deploy-cloud-light.sh` |
| **Peppertrees** (home Docker) | `.env` on home machine | `BILLING_ENABLED=false` | SQLite in `./data` | `docker compose --profile https up -d --build` |
| **Local laptop** | `.env` in `local-resolver/` | `BILLING_ENABLED=false` | optional SQLite | `uvicorn` or `docker compose -f docker-compose.dev.yml` |

The SPA always sends `/billing/*` to Cloud Run. Peppertrees and localhost handle heavy ML / home playback only.

## Cloud Run setup (once)

1. Copy env template:

   ```bash
   cp deploy/cloud-run-env.example.yaml deploy/cloud-run-env.yaml
   # edit deploy/cloud-run-env.yaml (non-secrets only)
   ```

2. Upload Stripe + existing secrets:

   ```bash
   # Reads STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from ../.env
   ./deploy/setup-cloud-billing-secrets.sh
   ```

3. Deploy:

   ```bash
   ./deploy-cloud-light.sh
   ```

4. Stripe Dashboard (live mode):

   - Webhook: `https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app/billing/webhook`
   - Event: `checkout.session.completed`

## Peppertrees

Use `deploy/peppertrees.env.example` as a checklist. Keep `BILLING_ENABLED=false`. Never put production Stripe keys on the home box unless you are deliberately testing webhooks against it.

## Local dev

Use `deploy/local.env.example`. `BILLING_ENABLED=false`. Test purchases with live/test Stripe on Cloud Run; checkout return URLs are sent from the SPA (`localhost:3000` is allowlisted).

## Do not use one `.env` for everything

Your laptop `.env` is convenient but mixes roles. Minimum split:

- **Cloud Run:** `deploy/cloud-run-env.yaml` + GCP Secret Manager
- **Peppertrees:** `.env` on the home server (no billing, no Stripe)
- **Local:** `.env` with `BILLING_ENABLED=false`

See also [CLOUD_RUN.md](../CLOUD_RUN.md) and [PEPPERTREES_OAUTH.md](../PEPPERTREES_OAUTH.md).
