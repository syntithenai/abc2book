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
| `FREE_ACCESS_EMAILS` or `ALLOWED_EMAILS` | Who may call media routes. Use your email(s), or `ALL` for every signed-in Google user. **Empty + auth = nobody can use it.** |
| `ALLOWED_ORIGINS` | Comma-separated SPA origins that may CORS-call the service. Include production + local: `https://tunebook.net,http://localhost:3000,http://127.0.0.1:3000` |

### Strongly recommended (feature toggles — already defaulted in the image, but set explicitly)

| Variable | Value | Why |
|----------|-------|-----|
| `RESOLVER_LIGHT_MODE` | `true` | Marks light health features |
| `PROXY_ENABLED` | `true` | Enables `/youtube` feature flag |
| `YTDLP_REQUIRE_USER_PROXY` | `true` | Refuse YouTube without user Webshare (public product) |
| `WHISPER_ENABLED` | `true` | Accept Whisper via providers |
| `LLM_ENABLED` | `true` | Accept LLM via providers |

### Optional — operator-paid (“host”) API keys

Only callers on `EMBEDDED_CREDS_EMAILS` (or `ALL`) use these. Everyone else must put keys in **Settings → Providers**.

| Variable | Purpose |
|----------|---------|
| `EMBEDDED_CREDS_EMAILS` | Who may spend your keys (e.g. `you@gmail.com` or `ALL`) |
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

**Do not** set `YTDLP_PROXY` on the public Cloud Run service for “everyone” — users BYO Webshare in Settings, or use the browser Helper / home resolver.

### Optional — OAuth BFF on Cloud Run

Skip for the light public gateway unless you intentionally host silent refresh here:

- `GOOGLE_CLIENT_SECRET`
- `AUTH_SESSION_SECRET`
- `AUTH_SESSION_DB_PATH` (needs writable volume — awkward on Cloud Run; prefer BFF on home Caddy host)

Without those, `oauthBff` stays false; SPA login still works via Token Client + Bearer token to this resolver.

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
FREE_ACCESS_EMAILS: "syntithenai@gmail.com"
EMBEDDED_CREDS_EMAILS: "syntithenai@gmail.com"
ALLOWED_ORIGINS: "https://tunebook.net,http://localhost:3000,http://127.0.0.1:3000"
PROVIDER_WHISPER_PROVIDER: "groq"
PROVIDER_WHISPER_BASE_URL: "https://api.groq.com/openai/v1"
PROVIDER_WHISPER_MODEL: "whisper-large-v3"
PROVIDER_LLM_PROVIDER: "groq"
PROVIDER_LLM_BASE_URL: "https://api.groq.com/openai/v1"
PROVIDER_LLM_MODEL: "openai/gpt-oss-120b"
PROVIDER_OCR_PROVIDER: "groq"
PROVIDER_OCR_BASE_URL: "https://api.groq.com/openai/v1"
PROVIDER_OCR_MODEL: "meta-llama/llama-4-scout-17b-16e-instruct"
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
PROVIDER_WHISPER_API_KEY=provider-groq-api-key:latest,\
PROVIDER_LLM_API_KEY=provider-groq-api-key:latest,\
PROVIDER_OCR_API_KEY=provider-groq-api-key:latest\
"
```

Notes:

- `--allow-unauthenticated` means Cloud Run itself does not require a Google identity token; **app** auth is still `REQUIRE_AUTH=true` + Bearer Google access token + allowlist.
- Only **`syntithenai@gmail.com`** gets free access and embedded Groq spend on this service (as configured above).
- Other signed-in users will get 403 on media unless you widen `FREE_ACCESS_EMAILS`; they can still use Settings → Providers with their own keys if you later open allowlists.

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
2. **YouTube Helper** browser extension, or  
3. Point Media resolver at a **home BYOR** full resolver instead.

---

## 6. Typical “just me for free APIs” vs “friends with their own keys”

**Just you (you pay Groq) — current default:**

```text
FREE_ACCESS_EMAILS=syntithenai@gmail.com
EMBEDDED_CREDS_EMAILS=syntithenai@gmail.com
PROVIDER_LLM_MODEL=openai/gpt-oss-120b
PROVIDER_OCR_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
PROVIDER_WHISPER_MODEL=whisper-large-v3
+ Groq key in Secret Manager (provider-groq-api-key)
```

**Friends bring their own keys:**

```text
FREE_ACCESS_EMAILS=ALL   # or a comma list
EMBEDDED_CREDS_EMAILS=   # empty — no free ride on your bill
# omit PROVIDER_* secrets
```

Friends open Settings → Providers → Wizard.

---

## 7. Redeploy after code changes

```bash
cd local-resolver
gcloud builds submit --tag "$IMAGE" -f Dockerfile.light . --project=abc2book
gcloud run deploy tunebook-resolver-light \
  --project=abc2book --image="$IMAGE" --region="$REGION"
```

Env/secrets persist on the service unless you change them with another `deploy` / `services update`.

---

## 8. Home stack (not Cloud Run)

- Fat resolver: expose **only Caddy :443** (`docker compose --profile https`).
- Optional Ollama: `docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile ollama up -d`.
