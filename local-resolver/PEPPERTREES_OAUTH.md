# OAuth BFF on peppertrees (home full resolver)

Silent Google refresh on the home resolver uses **SQLite** (not Firestore). The code lives in `server.py` + `oauth_bff.py`; routes are registered via `oauth_bff_routes.py`.

## Prerequisites

1. **Google Cloud Console** — SPA origins and redirect URIs per [GOOGLE_CLOUD_OAUTH_CHECKLIST.md](GOOGLE_CLOUD_OAUTH_CHECKLIST.md). Do not add a peppertrees callback URL unless you switch to redirect UX.

2. **Home `.env`** (copy from `.env.example`):

```bash
GOOGLE_CLIENT_ID=<same as REACT_APP_GOOGLE_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<web client secret — never in the SPA>
AUTH_SESSION_SECRET=<random 32+ bytes>
AUTH_SESSION_DB_PATH=/app/data/oauth_sessions.sqlite
AUTH_REFRESH_TOKEN_FERNET_KEY=<optional but recommended>
REQUIRE_AUTH=true
ALLOWED_ORIGINS=https://tunebook.net,http://localhost:3000,http://127.0.0.1:3000
RESOLVER_ACCESS_EMAILS=your@gmail.com,friend@gmail.com
```

`oauth_bff_configured()` is true only when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SESSION_SECRET` are all set.

3. **Persistent session volume** — `docker-compose.yml` mounts `./data:/app/data` so OAuth sessions survive container restarts.

## Start the stack

```bash
cd local-resolver
docker compose --profile https --profile ddns up -d --build
```

- **Caddy** terminates TLS on 443 and proxies to the resolver on 8787.
- **DDNS** keeps `peppertrees.syntithenai.com` pointed at your public IP.

## Verify

```bash
# Local (on the home machine)
curl -sS http://127.0.0.1:8787/health | jq '.oauthBff, .features.oauthBff'
# expect: true, true

# Public
curl -sS https://peppertrees.syntithenai.com/health | jq '.oauthBff, .features.oauthBff'
# expect: true, true (not 502)
```

In TuneBook: **Settings → Providers → Google sign-in** should show **Silent refresh: Yes** with auth resolver `https://peppertrees.syntithenai.com` after sign-out and sign-in.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `oauthBff: false` on `/health` | Missing `GOOGLE_CLIENT_SECRET` or `AUTH_SESSION_SECRET` in `.env` |
| HTTP 502 on peppertrees | Resolver or Caddy down; check `docker compose ps` and logs |
| Silent refresh lost after `docker compose up --build` | `./data` volume not mounted or `AUTH_SESSION_DB_PATH` not under `/app/data` |
| SPA still uses Token Client | Resolver unreachable; probe falls back to Cloud Run light |

After changing `.env`:

```bash
docker compose up -d --build local-resolver
```
