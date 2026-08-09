# Resolver environment split

Three deployments share one codebase (`local-resolver/`) but **different config**:

| Target | Config file | Billing | Session store | Deploy |
|--------|-------------|---------|---------------|--------|
| **Cloud Run** (`tunebook-resolver-light`) | `deploy/cloud-run-env.yaml` + Secret Manager | `BILLING_ENABLED=true`, Stripe secrets | Firestore | `./deploy-cloud-light.sh` |
| **Cloud Run** (`tunebook-score-convert`) | internal sidecar | none (billed on light gateway) | n/a | `./deploy-cloud-score-convert.sh` |
| **Peppertrees** (home Docker) | `.env` on home machine | `BILLING_ENABLED=false` | SQLite in `./data` | `docker compose --profile https up -d --build` |
| **Local laptop** | `.env` in `local-resolver/` | `BILLING_ENABLED=false` | optional SQLite | `uvicorn` or `docker compose -f docker-compose.dev.yml` |

The SPA always sends `/billing/*` to Cloud Run. Peppertrees and localhost handle heavy ML / home playback only.

## Cloud Run setup (once)

1. Copy env template:

   ```bash
   cp deploy/cloud-run-env.example.yaml deploy/cloud-run-env.yaml
   # edit deploy/cloud-run-env.yaml (non-secrets only)
   ```

2. Upload Stripe + existing secrets (use **live** keys with Stripe Dashboard test mode **off**):

   ```bash
   # In .env: STRIPE_SECRET_KEY=sk_live_... and live webhook whsec_...
   set -a && source .env && set +a
   ./deploy/setup-cloud-billing-secrets.sh
   ./deploy-cloud-light.sh   # restart Cloud Run so it picks up new secret versions
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

## Score-convert sidecar (hosted MuseScore conversions)

Hosted MIDI→ABC (`/midi2abc`) and native MuseScore file conversion (`/score2xml`) run on a **separate internal** Cloud Run service so the light gateway stays small.

1. Create the shared secret (once):

   ```bash
   ./deploy/setup-cloud-score-convert-secret.sh
   ```

2. Deploy the sidecar:

   ```bash
   ./deploy-cloud-score-convert.sh
   ```

3. Grant the light resolver service account `roles/run.invoker` on `tunebook-score-convert` (command printed at end of deploy).

4. Set on `tunebook-resolver-light` in `deploy/cloud-run-env.yaml`:

   - `SCORE_CONVERT_URL` — sidecar URL from deploy output
   - `SCORE_CONVERT_USE_ID_TOKEN: "true"`

5. Redeploy the light gateway:

   ```bash
   ./deploy-cloud-light.sh
   ```

**Smoke checklist**

- `curl -sS "$LIGHT_URL/health" | jq '.features.midiImport, .features.scoreConvert'` → both `true` when sidecar is healthy
- Import a `.mid` file via the SPA (Midi Import Wizard) — ledger shows `midi_import`
- Import a native `.mscx` via Score import — ledger shows `score_file_convert`
- `/midi2xml` on the light gateway remains unbilled (music21 utility path)

**Local dev with sidecar**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile score-convert up -d score-convert
# Run server_light with:
# SCORE_CONVERT_URL=http://localhost:8790 SCORE_CONVERT_SECRET=dev-score-convert-secret
```

When `SCORE_CONVERT_URL` is unset, the full home resolver converts inline (no sidecar).
