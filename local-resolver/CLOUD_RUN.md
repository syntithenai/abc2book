# Deploy Tunebook light resolver on Google Cloud Run

Project: **`abc2book`**  
Image: light gateway only (`Dockerfile.light` + `server_light.py`) — no local Whisper/Demucs/OCR GPU stack.

**Deployed service URL** (abc2book / australia-southeast1):

`https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app`

(No custom domain required. Alternate host form may appear in `gcloud run deploy` output; either resolves to the same service.)

---

## 0. One-time GCP setup

```bash
gcloud config set project abc2book

# APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# Pick a region close to you (examples)
export REGION=australia-southeast1

# Artifact Registry repo (once)
gcloud artifacts repositories create tunebook \
  --repository-format=docker \
  --location="$REGION" \
  --description="Tunebook images" \
  || true

export IMAGE="${REGION}-docker.pkg.dev/abc2book/tunebook/resolver-light"
```

Install/auth if needed: `gcloud auth login` and `gcloud auth configure-docker ${REGION}-docker.pkg.dev`.

---

## 1. Environment variables (what to set)

### Required for a usable public gateway

| Variable | Example / guidance |
|----------|-------------------|
| `REQUIRE_AUTH` | `true` |
| `GOOGLE_CLIENT_ID` | Same Web client ID as the Tunebook SPA (`REACT_APP_GOOGLE_CLIENT_ID`) |
| `RESOLVER_ACCESS_EMAILS` | Who may use this host. Omit or leave empty for any signed-in Google user. Comma list or `ALL`. |
| `ALLOWED_ORIGINS` | Comma-separated SPA origins that may CORS-call the service. Include production + local: `https://tunebook.net,http://localhost:3000,http://127.0.0.1:3000` |
| `BILLING_ENABLED` | `true` on Cloud Run (default when `RESOLVER_LIGHT_MODE=true` unless overridden) |

### Strongly recommended (feature toggles — already defaulted in the image, but set explicitly)

| Variable | Value | Why |
|----------|-------|-----|
| `RESOLVER_LIGHT_MODE` | `true` | Marks light health features |
| `PROXY_ENABLED` | `true` | Enables `/youtube` feature flag |
| `YTDLP_REQUIRE_USER_PROXY` | `true` | Refuse YouTube without user Webshare (public product) |
| `WHISPER_ENABLED` | `true` | Accept Whisper via providers |
| `LLM_ENABLED` | `true` | Accept LLM via providers |

### Optional — operator-paid (“host”) API keys

Users with resolver access may use these keys when they have credit (`BILLING_ENABLED=true`) or when billing is off (home resolver). Everyone can still overlay keys in **Settings → Providers**.

| Variable | Purpose |
|----------|---------|
| `PROVIDER_LLM_PROVIDER` | e.g. `groq` / `openai` / `custom` |
| `PROVIDER_LLM_BASE_URL` | e.g. `https://api.groq.com/openai/v1` |
| `PROVIDER_LLM_API_KEY` | Secret |
| `PROVIDER_LLM_MODEL` | e.g. `llama-3.1-8b-instant` |
| `PROVIDER_WHISPER_PROVIDER` | e.g. `groq` |
| `PROVIDER_WHISPER_BASE_URL` | e.g. `https://api.groq.com/openai/v1` |
| `PROVIDER_WHISPER_API_KEY` | Secret (often same Groq key) |
| `PROVIDER_WHISPER_MODEL` | e.g. `whisper-large-v3` |
| `PROVIDER_OCR_PROVIDER` | e.g. `openai` |
| `PROVIDER_OCR_BASE_URL` | e.g. `https://api.openai.com/v1` |
| `PROVIDER_OCR_API_KEY` | Secret |
| `PROVIDER_OCR_MODEL` | e.g. `gpt-4o-mini` |
| `PROVIDER_STEMS_PROVIDER` | e.g. `fal` / `replicate` |
| `PROVIDER_STEMS_BASE_URL` | e.g. `https://fal.run` |
| `PROVIDER_STEMS_API_KEY` | Secret (fal key or Replicate token) |
| `PROVIDER_STEMS_MODEL` | e.g. `htdemucs` or `cjwbw/demucs` |

**Do not** set `YTDLP_PROXY` on the public Cloud Run service for “everyone” — users BYO Webshare in Settings, or use the browser Helper / home resolver.

### OAuth BFF on Cloud Run (Firestore sessions)

Silent Google refresh for the SPA. Sessions are stored in **Firestore** (durable across deploys, cold starts, and multiple instances).

**One-time GCP setup:**

```bash
gcloud services enable firestore.googleapis.com --project=abc2book

# Create Native-mode database (once) — pick region near Cloud Run
gcloud firestore databases create \
  --project=abc2book \
  --location=australia-southeast1 \
  --type=firestore-native \
  || true

PROJECT_NUMBER=$(gcloud projects describe abc2book --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding abc2book \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.user"
```

**Secrets in Secret Manager** (in addition to `google-client-id`):

```bash
cd local-resolver
set -a && source .env && set +a

echo -n "$GOOGLE_CLIENT_SECRET" | gcloud secrets create google-client-secret --data-file=- --project=abc2book \
  || echo -n "$GOOGLE_CLIENT_SECRET" | gcloud secrets versions add google-client-secret --data-file=-

python3 -c "import secrets; print(secrets.token_urlsafe(32), end='')" | \
  gcloud secrets create auth-session-secret --data-file=- --project=abc2book \
  || python3 -c "import secrets; print(secrets.token_urlsafe(32), end='')" | \
     gcloud secrets versions add auth-session-secret --data-file=-

python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode(), end='')" | \
  gcloud secrets create auth-refresh-token-fernet-key --data-file=- --project=abc2book \
  || python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode(), end='')" | \
     gcloud secrets versions add auth-refresh-token-fernet-key --data-file=-

for S in google-client-secret auth-session-secret auth-refresh-token-fernet-key; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=abc2book || true
done
```

**Env vars** — add to `/tmp/tunebook-resolver-env.yaml` (or `deploy/tunebook-resolver-env.yaml`):

```yaml
AUTH_SESSION_STORE: "firestore"
AUTH_SESSION_FIRESTORE_PROJECT: "abc2book"
AUTH_SESSION_FIRESTORE_COLLECTION: "oauth_sessions"
```

**Deploy secrets** — extend `--set-secrets`:

```
GOOGLE_CLIENT_SECRET=google-client-secret:latest,
AUTH_SESSION_SECRET=auth-session-secret:latest,
AUTH_REFRESH_TOKEN_FERNET_KEY=auth-refresh-token-fernet-key:latest
```

After deploy, `curl "$URL/health"` must include `"oauthBff": true`.

Optional tuning (defaults are safe for Firestore free tier):

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_REFRESH_MIN_INTERVAL_SECONDS` | `45` | Min seconds between Google token refreshes per session |
| `AUTH_ACCESS_TOKEN_CACHE_SKEW_SECONDS` | `60` | Serve cached access token when expiry is farther out than this |

Home peppertrees uses SQLite instead — see [PEPPERTREES_OAUTH.md](PEPPERTREES_OAUTH.md).

### Optional — skip OAuth BFF on Cloud Run

Without `GOOGLE_CLIENT_SECRET` / `AUTH_SESSION_SECRET`, `oauthBff` stays false; SPA login uses Token Client + Bearer token to this resolver.

### Not needed on Cloud Run light

`YTDLP_COOKIES_PATH`, Whisper model mounts, Demucs, Playwright, `STATIC_SITE_*`, Ollama, LM Studio.

---

## 2. Create secrets in Secret Manager

Prefer Secret Manager for keys (do not put API keys in tracked docs or `--set-env-vars`).

```bash
cd local-resolver
set -a && source .env && set +a   # loads PROVIDER_* and GOOGLE_CLIENT_ID from your local .env

echo -n "$GOOGLE_CLIENT_ID" | gcloud secrets create google-client-id --data-file=- --project=abc2book \
  || echo -n "$GOOGLE_CLIENT_ID" | gcloud secrets versions add google-client-id --data-file=-

# One Groq key reused for LLM / Whisper / OCR
echo -n "$PROVIDER_LLM_API_KEY" | gcloud secrets create provider-groq-api-key --data-file=- --project=abc2book \
  || echo -n "$PROVIDER_LLM_API_KEY" | gcloud secrets versions add provider-groq-api-key --data-file=-
```

Grant the Cloud Run runtime SA access:

```bash
PROJECT_NUMBER=$(gcloud projects describe abc2book --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for S in google-client-id provider-groq-api-key; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=abc2book || true
done
```

---

## 3. Build and deploy

**Sizing (you do not need 1Gi / 300s for the light gateway):**

| Concern | Reality on light image |
|---------|-------------------------|
| Request handling / Groq proxy | A few tens of MB RSS — **512Mi is plenty** |
| `music21` `/midi2xml` | Short CPU spike; rarely >200–400Mi for typical MIDI |
| Whisper upload | Holds audio in memory while posting to Groq — worst case tens of MB; **512Mi OK** unless you raise upload caps a lot |
| YouTube / yt-dlp | Streams in chunks; slowest part is waiting on network — needs **timeout**, not RAM |
| Timeout | Groq Whisper/LLM/OCR usually finish in **seconds–tens of seconds**. yt-dlp resolve can hang; **90–120s** is a sane default. **300s** was a fat-resolver leftover (local Whisper / Demucs), not this service |

Recommended defaults: `--memory=512Mi --cpu=1 --timeout=120`. Bump timeout to 180 only if YouTube+Webshare often stalls; bump memory to 1Gi only if midi2xml OOMs.

### Score-convert sidecar (MuseScore `/midi2abc` + `/score2xml`)

Premium notation conversion runs on a **second** Cloud Run service (`tunebook-score-convert`, `Dockerfile.score-convert`):

| Service | Memory | CPU | Timeout | Concurrency | Auth |
|---------|--------|-----|---------|-------------|------|
| `tunebook-resolver-light` | 512Mi | 1 | 120s | default | public + Google token |
| `tunebook-score-convert` | 2Gi | 2 | 180s | **1** | internal only (`--no-allow-unauthenticated`) |

Deploy order:

```bash
./deploy/setup-cloud-score-convert-secret.sh
./deploy-cloud-score-convert.sh
# grant run.invoker to light resolver SA (command printed by deploy script)
# set SCORE_CONVERT_URL + SCORE_CONVERT_USE_ID_TOKEN in deploy/cloud-run-env.yaml
./deploy-cloud-light.sh
```

Billing: `/midi2abc` and `/score2xml` on the light gateway reserve and charge `midi_import` / `score_file_convert` credits. `/midi2xml` (music21 only) stays on the light image and is not premium-billed.

See [deploy/README.md](deploy/README.md) for the smoke checklist.

```bash
cd local-resolver

export REGION=australia-southeast1
export IMAGE="${REGION}-docker.pkg.dev/abc2book/tunebook/resolver-light"

# Keep upload small: rely on .gcloudignore (do not upload whisper/models/soundfonts).
# gcloud builds submit has no -f; use a Cloud Build config:
cat > /tmp/cloudbuild-light.yaml << EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-t', '$IMAGE', '-f', 'Dockerfile.light', '.']
images:
  - '$IMAGE'
timeout: 1200s
EOF
gcloud builds submit --config=/tmp/cloudbuild-light.yaml --project=abc2book .

# Commas in ALLOWED_ORIGINS break --set-env-vars; use a YAML file instead.
cat > /tmp/tunebook-resolver-env.yaml << 'EOF'
REQUIRE_AUTH: "true"
RESOLVER_LIGHT_MODE: "true"
PROXY_ENABLED: "true"
YTDLP_REQUIRE_USER_PROXY: "true"
WHISPER_ENABLED: "true"
LLM_ENABLED: "true"
ALLOWED_ORIGINS: "https://tunebook.net,http://localhost:3000,http://127.0.0.1:3000"
PROVIDER_WHISPER_PROVIDER: "groq"
PROVIDER_WHISPER_BASE_URL: "https://api.groq.com/openai/v1"
PROVIDER_WHISPER_MODEL: "whisper-large-v3"
PROVIDER_LLM_PROVIDER: "groq"
PROVIDER_LLM_BASE_URL: "https://api.groq.com/openai/v1"
PROVIDER_LLM_MODEL: "openai/gpt-oss-120b"
PROVIDER_OCR_PROVIDER: "groq"
PROVIDER_OCR_BASE_URL: "https://api.groq.com/openai/v1"
PROVIDER_OCR_MODEL: "qwen/qwen3.6-27b"
AUTH_SESSION_STORE: "firestore"
AUTH_SESSION_FIRESTORE_PROJECT: "abc2book"
AUTH_SESSION_FIRESTORE_COLLECTION: "oauth_sessions"
EOF

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
  --env-vars-file=/tmp/tunebook-resolver-env.yaml \
  --set-secrets="\
GOOGLE_CLIENT_ID=google-client-id:latest,\
GOOGLE_CLIENT_SECRET=google-client-secret:latest,\
AUTH_SESSION_SECRET=auth-session-secret:latest,\
AUTH_REFRESH_TOKEN_FERNET_KEY=auth-refresh-token-fernet-key:latest,\
PROVIDER_WHISPER_API_KEY=provider-groq-api-key:latest,\
PROVIDER_LLM_API_KEY=provider-groq-api-key:latest,\
PROVIDER_OCR_API_KEY=provider-groq-api-key:latest\
"
```

Notes:

- `--allow-unauthenticated` means Cloud Run itself does not require a Google identity token; **app** auth is still `REQUIRE_AUTH=true` + Bearer Google access token + allowlist.
- Any signed-in Google user may use the service when `RESOLVER_ACCESS_EMAILS` is omitted (open cloud). Billing deducts credits for embedded provider usage.

Capture the service URL:

```bash
gcloud run services describe tunebook-resolver-light \
  --project=abc2book --region="$REGION" \
  --format='value(status.url)'
```

Smoke:

```bash
curl -sS "$(gcloud run services describe tunebook-resolver-light --project=abc2book --region=$REGION --format='value(status.url)')/health"
```

Expect JSON with `"ok": true`, `"lightMode": true`, `"requireAuth": true`.

---

## 4. Wire the SPA

Build/host Tunebook with the Cloud Run URL as a public candidate (or the only default):

```bash
# CRA / production build env
REACT_APP_MEDIA_PROXY_BASE=https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app
# and/or append to the fallback list:
REACT_APP_PUBLIC_MEDIA_PROXY_URLS=https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app
```

Discovery order remains: **saved Settings URL → local https → env/public**. Local home resolver still wins when reachable.

Also ensure Cloud Console OAuth **JavaScript origins** include your SPA hosts ([GOOGLE_CLOUD_OAUTH_CHECKLIST.md](GOOGLE_CLOUD_OAUTH_CHECKLIST.md)). You do **not** need to add the Cloud Run URL as an OAuth origin.

---

## 5. How users get YouTube pitch / cache / filters

On this Cloud Run service, `/youtube` needs one of:

1. **Settings → Providers → Webshare** proxy URL (sent as `X-Tunebook-Ytdlp-Proxy`), or  
2. **TuneBook Helper** browser extension, or
3. Point Media resolver at a **home BYOR** full resolver instead.

---

## 6. Typical cloud vs home configuration

**Public Cloud Run (open access + billing):**

```text
# omit RESOLVER_ACCESS_EMAILS — any signed-in Google user
BILLING_ENABLED=true
PROVIDER_LLM_MODEL=openai/gpt-oss-120b
PROVIDER_OCR_MODEL=qwen/qwen3.6-27b
PROVIDER_WHISPER_MODEL=whisper-large-v3
+ Groq key in Secret Manager (provider-groq-api-key)
```

**Home peppertrees (restricted list, no billing):**

```text
RESOLVER_ACCESS_EMAILS=you@gmail.com,friend@gmail.com
BILLING_ENABLED=false
+ PROVIDER_* keys in .env
```

**Friends bring their own keys only:**

```text
RESOLVER_ACCESS_EMAILS=ALL   # or a comma list
# omit PROVIDER_* secrets — users set keys in Settings → Providers
```

Friends open Settings → Providers → Wizard.

---

## 7. Redeploy after code changes

One-shot (build + deploy + health smoke):

```bash
./local-resolver/deploy-cloud-light.sh
```

Env/secrets persist on the service unless you change them with another `deploy` / `services update`.

---

## 8. Firestore backups (billing + OAuth)

Production billing and OAuth sessions live in **Cloud Firestore** (`abc2book`, `australia-southeast1`). Backups protect against accidental deletes or bad writes — regional replication alone is not a backup.

### Collections

| Collection | Purpose |
|------------|---------|
| `billing_accounts` | Balances, trial flags |
| `billing_ledger` | Append-only credit/debit history |
| `billing_holds` | Active credit reservations |
| `billing_payment_events` | Purchase idempotency (Stripe/PayPal) |
| `billing_stripe_events` | Legacy Stripe event dedup |
| `oauth_sessions` | OAuth BFF refresh tokens |

Stripe Dashboard remains the financial source of truth for charges; Firestore is the operational ledger.

### What is configured

| Mechanism | Details |
|-----------|---------|
| **Daily managed backups** | Schedule on `(default)` database, 30-day retention. View in [Firebase Console → Firestore → Backups](https://console.firebase.google.com/project/abc2book/firestore/backups). |
| **GCS export bucket** | `gs://abc2book-firestore-backups` in `australia-southeast1`, 90-day object lifecycle (`deploy/firestore-backups-lifecycle.json`). |
| **Firestore service agent** | `service-927667106833@gcp-sa-firestore.iam.gserviceaccount.com` has `roles/storage.objectAdmin` on the bucket. |

### Manual export (collection-scoped)

```bash
gcloud firestore export gs://abc2book-firestore-backups/manual/$(date +%Y%m%d) \
  --project=abc2book \
  --collection-ids=billing_accounts,billing_ledger,billing_holds,billing_payment_events,billing_stripe_events,oauth_sessions
```

First drill export (2026-08-08): **SUCCESSFUL** — 10 documents across all six collections in `gs://abc2book-firestore-backups/manual/20260808/`.

### Restore (do not run over production casually)

**From managed backup** (daily schedule):

```bash
# List backups
gcloud firestore backups list --database='(default)' --project=abc2book

# Restore to a new database (preferred) or during a maintenance window
gcloud firestore databases restore \
  --source-backup=BACKUP_NAME \
  --destination-database=RESTORED_DB
```

**From GCS export:**

```bash
gcloud firestore import gs://abc2book-firestore-backups/manual/YYYYMMDD \
  --project=abc2book
```

Import **overwrites** existing documents with matching IDs. Test restores in a separate GCP project or a new Firestore database before touching production.

### Optional: point-in-time recovery (PITR)

For sub-day recovery (last 7 days), enable once:

```bash
gcloud firestore databases update --database='(default)' --enable-pitr --project=abc2book
```

Adds per-GB cost; nightly backups are sufficient for most cases.

### Monitoring

- Firebase Console → Firestore → Backups: confirm daily runs succeed.
- GCS bucket: new objects under `manual/` after drill exports; scheduled managed backups appear in the backups list (not necessarily as GCS objects).

---

## 9. Home stack (not Cloud Run)

- Fat resolver: expose **only Caddy :443** (`docker compose --profile https`).
- Optional Ollama: `docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile ollama up -d`.
