# Google Cloud Console checklist — Seamless Google login (OAuth BFF)

Do this once for the shared OAuth Web client used by the SPA (`REACT_APP_GOOGLE_CLIENT_ID`)
and by resolvers that advertise `oauthBff`.

## Authorized JavaScript origins

Register SPA origins only (not resolver API hosts, unless the SPA is served from them):

- `https://tunebook.net`
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `https://localhost` (if you open the static site via local HTTPS)
- Resolver static-site origin only if users load the app from there

## Authorized redirect URIs

GIS Code Client popup mode uses the **page origin** as `redirect_uri`. Register the same SPA origins:

- `https://tunebook.net`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Do **not** add resolver paths like `https://peppertrees.syntithenai.com/auth/callback` unless you switch to redirect UX.

## Resolver `.env` (trusted oauthBff hosts only)

```bash
GOOGLE_CLIENT_ID=<same as SPA>
GOOGLE_CLIENT_SECRET=<web client secret — never in the SPA>
AUTH_SESSION_SECRET=<random 32+ bytes>
# optional:
# AUTH_SESSION_DB_PATH=./data/oauth_sessions.sqlite
# AUTH_REFRESH_TOKEN_FERNET_KEY=<fernet key>
```

Public resolvers may omit `GOOGLE_CLIENT_SECRET` / `AUTH_SESSION_SECRET`. Then `oauthBff` stays false and the SPA keeps today’s Token Client login (including the hourly popup).

## First login after enabling BFF

Users may need one consent (`prompt=consent`) so Google returns a `refresh_token`. Later renewals are silent via `POST /auth/google/refresh`.
