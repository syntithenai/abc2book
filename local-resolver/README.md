# Local media resolver

Self-hosted proxy for tunebook pitch/tempo playback. Replaces the Cloudflare worker.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Public health check |
| GET | `/youtube/:videoId/audio` | Stream YouTube audio (auth required) |
| GET | `/proxy-audio?url=https://…` | Stream arbitrary HTTPS audio URL (auth required) |

Send the user's Google OAuth access token:

```http
Authorization: Bearer ya29…
```

## Quick start

```bash
cd local-resolver
cp .env.example .env
# edit .env — set GOOGLE_CLIENT_ID and ALLOWED_EMAILS

docker compose up --build
```

In the project root `.env`:

```bash
REACT_APP_MEDIA_PROXY_BASE=http://localhost:8787
```

Restart the React app (`npm start`).

## Verify

```bash
curl -s http://localhost:8787/health
```

```bash
curl -I -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8787/proxy-audio?url=https%3A%2F%2Fexample.com%2Faudio.mp3"
```

## YouTube cookies (recommended)

Many YouTube videos require logged-in cookies. Export Netscape-format cookies and save as:

```text
local-resolver/secrets/youtube-cookies.txt
```

The file is gitignored. Re-export periodically — cookies expire.

### Export cookies from Chrome (Netscape format)

1. Install the Chrome extension **Get cookies.txt LOCALLY**  
   (Chrome Web Store: search for "Get cookies.txt LOCALLY" by Kai)
2. In Chrome, open [https://www.youtube.com](https://www.youtube.com) and sign in.
3. Click the extension icon → export cookies for the current site.
4. Save the file as `local-resolver/secrets/youtube-cookies.txt`.
5. Restart the container: `docker compose restart`

**Alternative (Firefox):** extension **cookies.txt** — same Netscape format.

**Do not** commit `youtube-cookies.txt`; it contains session credentials.

### Check cookies work

```bash
docker compose exec local-resolver yt-dlp --cookies /app/secrets/youtube-cookies.txt -f bestaudio -g "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## Configuration

Set in `local-resolver/.env`:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Same as `REACT_APP_GOOGLE_CLIENT_ID` in the React app |
| `ALLOWED_EMAILS` | Comma-separated Google account allowlist |
| `ALLOWED_ORIGINS` | CORS origins for the tunebook app |
| `YTDLP_COOKIES_PATH` | Set automatically in docker-compose |
| `MAX_STREAM_BYTES` | Max single-file size (default 80 MB) |

## From repo root

```bash
npm run start:resolver
```
