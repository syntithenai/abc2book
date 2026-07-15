# Cloud Run light gateway deploy checklist

## What this is

`Dockerfile.light` + `server_light.py` — HTTPS `*.run.app` URL, no custom domain required.

Capabilities:

- Google auth + `FREE_ACCESS_EMAILS` / `EMBEDDED_CREDS_EMAILS` (`ALL` supported)
- Provider-backed `/transcribe`, `/provider-llm-chat`, cloud `/transcribe-sheet-image` (OCR)
- `/midi2xml`
- `/youtube/{id}/audio` via yt-dlp — **requires** `X-Tunebook-Ytdlp-Proxy` (Webshare from Settings → Providers) or host `YTDLP_PROXY`
- Hard 503 for stems / OMR / analyze-media / etc.

## Build & deploy

```bash
cd local-resolver
gcloud builds submit --tag gcr.io/PROJECT_ID/tunebook-resolver-light -f Dockerfile.light .
gcloud run deploy tunebook-resolver-light \
  --image gcr.io/PROJECT_ID/tunebook-resolver-light \
  --region REGION \
  --allow-unauthenticated \
  --set-env-vars "REQUIRE_AUTH=true,RESOLVER_LIGHT_MODE=true,YTDLP_REQUIRE_USER_PROXY=true,PROXY_ENABLED=true,ALLOWED_ORIGINS=https://tunebook.net,http://localhost:3000" \
  --set-secrets "GOOGLE_CLIENT_ID=...,PROVIDER_WHISPER_API_KEY=...,PROVIDER_LLM_API_KEY=...,PROVIDER_OCR_API_KEY=..."
```

Do **not** put a shared Webshare secret in Cloud Run for the public product — users BYO via Settings.

## SPA wiring

```bash
REACT_APP_MEDIA_PROXY_BASE=https://SERVICE-REGION.a.run.app
# or
REACT_APP_PUBLIC_MEDIA_PROXY_URLS=https://SERVICE-REGION.a.run.app
```

Discovery preference: saved UI URL → local HTTPS → env/public Cloud Run.

YouTube pitch/filters/cache unlock when: YouTube Helper extension **or** home BYOR **or** Webshare + light gateway.

## Single-port home HTTPS

On the fat home resolver, publish only Caddy **443** (compose profile `https`). Do not expose `:8787` on the public internet.

## Ollama at home

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile ollama up -d
```
