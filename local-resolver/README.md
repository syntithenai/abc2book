# Local media resolver

Self-hosted proxy for tunebook pitch/tempo playback. 

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check; reports `requireAuth` and, when auth is enabled, whether the bearer token is authorized |
| GET | `/youtube/:videoId/audio` | Stream YouTube audio |
| GET | `/proxy-audio?url=https://…` | Stream arbitrary HTTPS audio URL |
| POST | `/transcribe` | Transcribe either linked media URLs or uploaded audio |
| POST | `/detect-chords` | Discover chords from linked or uploaded audio using autochord |
| POST | `/analyze-media` | Analyze linked or uploaded audio once for lyrics, chords, and melody |

By default no login is required (`REQUIRE_AUTH=false`). The tunebook app checks `/health` on load and only shows resolver-backed controls when the resolver is reachable.

## Quick start

```bash
cd local-resolver
cp .env.example .env

docker compose up --build
```

Before starting the stack, make sure this host model file exists:

```text
/home/stever/projects/whisper models/ggml-large-v3.bin
```

The resolver container mounts that host directory read-only at `/models` and runs `whisper-cli` directly for lyrics transcription.

Whisper uses the Vulkan `whisper.cpp` image. `docker-compose.yml` exposes `/dev/dri` to the container, so `WHISPER_BACKEND_PREFERENCE=auto` will try the GPU when a render device is available and fall back to CPU if `WHISPER_CPU_FALLBACK=true`. Set `WHISPER_BACKEND_PREFERENCE=cpu` in `local-resolver/.env` to disable GPU use.

The resolver image predownloads the `autochord` chord model and NNLS-Chroma VAMP plugin during `docker compose build`. The first chord discovery request may still take a moment while TensorFlow loads the model into memory.

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
curl -I "http://localhost:8787/youtube/dQw4w9WgXcQ/audio" | head
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

Use a real 11-character video id (not the literal text `VIDEO_ID`):

```bash
docker compose exec local-resolver sh -c \
  'cp /app/secrets/youtube-cookies.txt /tmp/youtube-cookies.txt && \
   yt-dlp --cookies /tmp/youtube-cookies.txt -f bestaudio -o - \
   "https://www.youtube.com/watch?v=dQw4w9WgXcQ" | wc -c'
```

The server copies cookies to `/tmp` automatically because the secrets mount is read-only.

The Docker image includes **Deno** and **yt-dlp-ejs** so logged-in cookies can solve YouTube's web-player challenges. Without them, yt-dlp may only see storyboard images and fail with `Requested format is not available`.

After changing `Dockerfile` or `requirements.txt`, rebuild:

```bash
docker compose up --build
```

### Troubleshooting: "Requested format is not available"

This usually means yt-dlp could not access real audio formats — common when:

1. **Cookies are present but the image is outdated** — rebuild with `docker compose up --build` (needs Deno + `yt-dlp[default]`).
2. **Cookies are missing** for age-restricted or login-gated videos — export fresh cookies (see above).
3. **Cookies are expired** — re-export from Chrome while signed into YouTube.

Test inside the container (replace the video id if you like):

```bash
docker compose exec local-resolver sh -c \
  'cp /app/secrets/youtube-cookies.txt /tmp/youtube-cookies.txt && \
   yt-dlp --cookies /tmp/youtube-cookies.txt -f ba/b -o - \
   "https://www.youtube.com/watch?v=dQw4w9WgXcQ" | wc -c'
```

A successful run prints a byte count well over `1000000` (about 3 MB for that video).

## Dynamic DNS (Namecheap)

If this machine sits on a home connection with a changing IP, the bundled `ddns`
service keeps your Namecheap DNS record pointed at the current public IPv4.

1. In the Namecheap dashboard: **Domain List → Manage → Advanced DNS → Dynamic DNS**,
   toggle it **on**, and copy the generated **Dynamic DNS Password** (this is not
   your account password). Make sure an `A + Dynamic DNS Record` exists for each
   host you want updated (e.g. `peppertrees`).
2. In `local-resolver/.env`:

   ```bash
   NAMECHEAP_DDNS_DOMAIN=syntithenai.com
   NAMECHEAP_DDNS_HOSTS=peppertrees
   NAMECHEAP_DDNS_PASSWORD=your-dynamic-dns-password
   # NAMECHEAP_DDNS_INTERVAL=300
   ```

   Use `@` for the apex domain, or a comma-separated list like
   `peppertrees,@,www`.
3. Start it (combine with the HTTPS proxy as needed):

   ```bash
   docker compose --profile ddns up -d
   # or, with the reverse proxy:
   docker compose --profile https --profile ddns up -d
   ```

4. Check it is updating:

   ```bash
   docker compose logs -f ddns
   ```

   On success you'll see `ok: peppertrees.syntithenai.com -> <your.ip>`. The
   updater only calls Namecheap when the detected IPv4 changes.

## Configuration

Set in `local-resolver/.env`:

| Variable | Description |
|----------|-------------|
| `REQUIRE_AUTH` | Set `true` to require Google login (default `false`) |
| `GOOGLE_CLIENT_ID` | Required when `REQUIRE_AUTH=true` |
| `ALLOWED_EMAILS` | Comma-separated allowlist when auth is enabled |
| `ALLOWED_ORIGINS` | CORS origins for the tunebook app |
| `YTDLP_COOKIES_PATH` | Set automatically in docker-compose |
| `MAX_STREAM_BYTES` | Max single-file size (default 80 MB) |
| `WHISPER_TIMEOUT_SECONDS` | Max time to wait for Whisper transcription |
| `WHISPER_BACKEND_PREFERENCE` | `auto`, `gpu`, or `cpu` |
| `WHISPER_CPU_FALLBACK` | Whether GPU mode falls back to CPU |
| `WHISPER_CPP_BEST_OF` | `whisper-cli --best-of` value |
| `WHISPER_CPP_NO_CONTEXT` | Set `true` to pass `--no-context` |
| `WHISPER_LYRICS_FORMAT` | Set `false` to return Whisper transcription as one cleaned text block |
| `WHISPER_LYRICS_MAX_WORDS` | Maximum words per formatted lyric line |
| `WHISPER_LYRICS_LINE_PAUSE_SECONDS` | Pause length that starts a new lyric line |
| `WHISPER_LYRICS_STANZA_PAUSE_SECONDS` | Pause length that inserts a blank line between lyric sections |
| `AUTOCHORD_TIMEOUT_SECONDS` | Max time to wait for chord discovery |
| `NAMECHEAP_DDNS_DOMAIN` | Registered domain for the `ddns` service (e.g. `syntithenai.com`) |
| `NAMECHEAP_DDNS_HOSTS` | Comma-separated hosts to update; `@` is the apex (default `@`) |
| `NAMECHEAP_DDNS_PASSWORD` | Namecheap Dynamic DNS password (not the account password) |
| `NAMECHEAP_DDNS_INTERVAL` | Seconds between IP checks (default `300`) |
| `NAMECHEAP_DDNS_IP_LOOKUP_URL` | Public IPv4 echo service (default `https://ipv4.icanhazip.com`) |

## From repo root

```bash
npm run start:resolver
```
