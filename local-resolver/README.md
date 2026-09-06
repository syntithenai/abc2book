# Local media resolver

Self-hosted proxy for tunebook pitch/tempo playback. 

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Cheap liveness check (`ok`, `staticSite`, `soundfontsReady` / `soundfontsProgress`, optional auth status) |
| GET | `/health/ready` | Deep readiness check with `features` (includes `soundfonts`), Demucs model info, and cached LLM probe |
| GET | `/youtube/:videoId/audio` | Stream YouTube audio |
| GET | `/proxy-audio?url=https://…` | Stream arbitrary HTTPS audio URL |
| POST | `/search-lyrics` | Search lyrics sites by title/artist (or fetch a supported lyrics URL) and return stanza chunks with ad/noise lines stripped. Accept `application/x-ndjson` for streaming progress events. |
| POST | `/lyrics-dictionary` | Look up dictionary entries for a word through the resolver and return the dictionaryapi.dev-style response. Falls back to a Wikipedia encyclopedia summary (with optional lead image) when no dictionary entry is found. |
| POST | `/lyrics-thesaurus` | Return synonym, antonym, and related-word groups for a word through Datamuse. |
| POST | `/lyrics-rhyme` | Return perfect rhymes, near rhymes, and sound-alike words for a word through Datamuse. |
| POST | `/lyrics-reverse-dictionary` | Return meaning, topic, and pattern matches for a phrase or concept. |
| POST | `/lyrics-phrases` | Return left-context, right-context, and phrase-shaped suggestions for a phrase or seed word. |
| POST | `/search-chords` | Search supported chord-tab sites by title/artist (or fetch a supported chord URL) and return a normalized chord+lyric sheet for import into the chord editor. Accept `application/x-ndjson` for streaming progress events. |
| POST | `/search-notation` | Search The Session, then ABC sites, public MuseScore.com MusicXML, and the mounted local MIDI library (then allowlisted MIDI sites on the web) in parallel by title (optional `songType`). Returns up to 20 candidates ranked by match (MuseScore boosted, MIDI demoted). Optional `url` for musescore.com, direct `.mid`/`.midi`, `/midi-resources/…`, allowlisted MIDI pages, or allowlisted ABC URLs. Accept `application/x-ndjson` for streaming progress. |
| GET | `/midi-resources/:path` | Serve a file from the mounted local MIDI library (`MIDI_RESOURCES_DIR`) when an index is present |
| POST | `/search-music-collection` | Search the personal music collection by title/artist |
| POST | `/rebuild-music-collection-index` | Rebuild `music_collection_index.json` from files on disk |
| GET | `/music-collection/:path` | Stream an audio file from the music collection |
| GET | `/music-collection-art/:entryId` | Serve embedded album art for a collection entry |
| GET | `/review-projects` | Admin catalog of Milliner–Koken / oldtime working files (`REVIEW_PROJECTS_DIR`, host default `~/Documents/oldtime sources review`) |
| GET | `/review-projects/file/{path}` | Serve a file from that review root (admin; path-traversal safe) |
| POST | `/research-tune-background` | Research tune background from Wikipedia, MusicBrainz, and web search, then summarize with a configurable OpenAI-compatible LLM (compose `llm` / LM Studio fallback by default) |
| POST | `/transcribe` | Transcribe either linked media URLs or uploaded audio |
| POST | `/voice-command` | Combined voice command: upload short audio, transcribe with Whisper, parse SHOW/SEARCH intent (regex fast path + LLM), return structured tool call |
| POST | `/detect-chords` | Discover chords from linked or uploaded audio (BTC maj/min preferred, then madmom CNN+CRF, then autochord) |
| POST | `/analyze-media` | Analyze linked or uploaded audio once for lyrics, chords, and melody. Runs shared beat/downbeat timing first (`detect_timing.py`, madmom when available, librosa fallback), then lyrics/chords/melody in parallel. Chords run on the harmonic Demucs mix and reuse shared beat times. Melody uses CREPE when available with optional Demucs vocal separation; falls back to librosa pyin. Optional `processing` JSON controls separation, noise mode, and quantize settings. Response includes `timing`, `melody.silences`, and `melody.noise`. |
| POST | `/transcribe-sheet-image` | Upload a chord-chart or lead-sheet image/PDF page. Runs PaddleOCR for lyrics/chords and homr OMR for main-melody ABC when staff notation is detected. Optional LLM cleanup for low-confidence chord text. |

By default production compose does not require login (`REQUIRE_AUTH=false` in `.env.example`). **`docker-compose.dev.yml` sets `REQUIRE_AUTH=true`** so auth issues show up during local development. The tunebook app checks `/health` on load and only shows resolver-backed controls when the resolver is reachable (and authorized when auth is required).

## Quick start

Build the tunebook once, then start the resolver. It serves the built app, local ABC
collection files, soundfonts, and scrape helpers on port **8787** — no separate
`npm start` or `npm run serveextras` process is required for local use.

```bash
# from the project root
npm run build

cd local-resolver
cp .env.example .env

docker compose up --build
```

Open **http://localhost:8787** for the full app (media resolver, piano, local tune
search/import, and playback tools).

For React hot reload during UI work, you can still run `npm start` on port 3000.
The dev server loads ABC/soundfont/scrape assets from the resolver on 8787 by
default (override with `REACT_APP_RESOURCE_BASE` in `.env`).

```bash
# optional: UI development with live reload
npm start
```

Before starting the stack, download a whisper.cpp model and place it on the host.
By default the resolver mounts `local-resolver/whisper/models` into the container
at `/models`:

```bash
mkdir -p whisper/models
# Example: ggml-large-v3 (~3 GB) from https://huggingface.co/ggerganov/whisper.cpp
# Save as whisper/models/ggml-large-v3.bin
```

To use a different host directory, set `WHISPER_MODELS_DIR` in `.env` (absolute
or relative to `local-resolver/`). The container expects the file at
`/models/ggml-large-v3.bin` unless you override `MODEL_PATH` in compose.

### MusyngKite soundfonts

On first start the resolver downloads the full **MusyngKite** GM bank (~1GB,
128 instruments as per-note MP3 packs plus `.js` packs for soundfont-player) into
a Docker volume mounted at `/soundfonts` (host default `local-resolver/soundfonts`).

- Progress is reported on `/health` as `soundfontsReady` and `soundfontsProgress`.
- Samples are served at `/midi-js-soundfonts/MusyngKite/...`. Files already shipped
  under `midi-js-soundfonts/selection/MusyngKite/` or piano under `abcjs/` are
  preferred over the volume (overlay).
- Until the download finishes (or if the resolver is offline), the SPA remaps MIDI
  programs onto the embedded instrument subset.
- Disable with `SOUNDFONT_DOWNLOAD_ENABLED=false`. Change the host folder with
  `SOUNDFONT_HOST_DIR`.

### Local MIDI library

The sibling folder `abc2book_midi_resources` (next to this repo, not inside it) is mounted at `/midi-resources`.
From `local-resolver/`, the default compose path is `../../abc2book_midi_resources`.
Build the search index once:

```bash
cd local-resolver
python3 scripts/build_midi_resources_index.py ../../abc2book_midi_resources
```

Notation search checks this library before querying online MIDI sites. Files are
served at `/midi-resources/...` for direct import. Override the host path with
`MIDI_RESOURCES_HOST_DIR` in `.env`.

### Personal music collection

Mount a folder of tagged audio files at `/music-collection` (default host path
`./music-collection` under `local-resolver/`). Build the search index:

```bash
cd local-resolver
python3 scripts/build_music_collection_index.py ./music-collection
```

Tunebook searches this library before YouTube when adding links. Files stream at
`/music-collection/...`. Access is gated by `MUSIC_COLLECTION_EMAILS` when set
(fail-closed allowlist, independent of resolver access). Override the host
path with `MUSIC_COLLECTION_HOST_DIR` in `.env`. Re-run the index script after
adding or renaming files, or use **Settings → Music collection → Rebuild index**
(background build with per-file timeouts and `build_errors.jsonl` logging).

Robustness env vars (optional): `MUSIC_COLLECTION_FILE_TIMEOUT_SECONDS`,
`MUSIC_COLLECTION_CHECKPOINT_EVERY`, `MUSIC_COLLECTION_MAX_ERROR_LOG`,
`MUSIC_COLLECTION_SKIP_SYMLINKS`. Resume interrupted builds with
`python3 scripts/build_music_collection_index.py /music-collection --resume`.

Whisper uses the Vulkan `whisper.cpp` image. `docker-compose.yml` exposes `/dev/dri` to the container, so `WHISPER_BACKEND_PREFERENCE=auto` will try the GPU when a render device is available and fall back to CPU if `WHISPER_CPU_FALLBACK=true`. Set `WHISPER_BACKEND_PREFERENCE=cpu` in `local-resolver/.env` to disable GPU use.

### OpenAI-compatible LLM (`llm-gateway` → host qwen-server)

The resolver talks to **llm-gateway** on `:12340`. By default that gateway forwards to host **qwen-proxy** on `127.0.0.1:8081` (`qwen3.8-off`). The in-compose Gemma llama.cpp container (`llm` / `abc2book-llm`) is **opt-in** so it does not fight Qwen for the GPU.

| Service | Port | Role |
|---------|------|------|
| host `qwen-proxy` | `8081` | Qwen 3.8 reasoning proxy (safe-mode llama-server on `:8000`) |
| `llm-gateway` (`abc2book-llm-bridge`) | `12340` (host network) | Forwards to qwen-proxy; no LM Studio fallback |
| `llm` (`abc2book-llm`) | `12341` | Optional Gemma GGUF — `docker compose --profile gemma-llm up -d` |

Keep `RESEARCH_LLM_BASE_URL=http://host.docker.internal:12340/v1`.

```bash
# Host Qwen (default)
# RESEARCH_LLM_MODEL=qwen3.8-off
# RESEARCH_LLM_API_KEY must match QWEN_API_KEY in qwen-server/env/qwen-server.env
# RESEARCH_LLM_API_KEY=
# LLM_PRIMARY_BASE_URL=http://127.0.0.1:8081

# Optional in-compose Gemma (do not run while qwen-server is using the GPU)
# docker compose --profile gemma-llm up -d
# LLM_MODELS_DIR=/home/YOU/.lmstudio/models/lmstudio-community/gemma-4-31B-it-QAT-GGUF
# LLM_MODEL_FILENAME=gemma-4-31B-it-QAT-Q4_0.gguf
# RESEARCH_LLM_MODEL=google/gemma-4-31b-qat
```

Gateway health: `curl -s http://127.0.0.1:12340/health`. Qwen must be running (`systemctl --user start qwen-server qwen-proxy`) or chat completions return 503.

### Ollama (optional compose overlay)

Run [Ollama](https://ollama.com) instead of LM Studio / local GGUF:

```bash
cd local-resolver
docker compose -f docker-compose.yml -f docker-compose.ollama.yml --profile ollama up -d
# pull a model once:
docker exec -it abc2book-ollama ollama pull llama3.2
```

Set `RESEARCH_LLM_MODEL` to the Ollama model name. The overlay points `llm` / `llm-gateway` at `http://…:11434/v1`.

### Text-to-speech (Kokoro GPU + Piper CPU)

Optional TTS for future screen-free practice announcements (not wired into the SPA yet). A small **gateway** on port **8789** exposes OpenAI-compatible `POST /v1/audio/speech` and auto-selects the best backend:

| Service | Port | Role |
|---------|------|------|
| `tts-gateway` (`abc2book-tts-gateway`) | `8789` | Routes to Kokoro when healthy, else Piper |
| `tts-gpu` (`abc2book-tts-gpu`) | internal `:8880` | Kokoro-82M (ROCm or CPU image on Strix Halo) |
| `tts-cpu` (`abc2book-tts-cpu`) | internal `:5000` | Piper CPU fallback (kept running alongside Kokoro) |

**Start (auto-detects AMD GPU):**

```bash
cd local-resolver
chmod +x scripts/tts-up.sh
./scripts/tts-up.sh
```

`tts-up.sh` starts the **gateway + Kokoro + Piper together** when `/dev/kfd` and `/dev/dri` exist (gateway prefers Kokoro, falls back to Piper). Set `TTS_SKIP_GPU=1` for Piper only. To keep the stack always up across stops/reboots:

```bash
chmod +x scripts/install-tts-systemd.sh
./scripts/install-tts-systemd.sh   # user systemd unit + 1-minute health watchdog
```

Manual compose:

```bash
docker compose --profile tts --profile tts-cpu up -d --build                      # Piper only
docker compose --profile tts --profile tts-gpu --profile tts-cpu up -d --build    # Kokoro + Piper
```

**Smoke test:**

```bash
curl -s http://localhost:8789/health | jq .
curl -X POST http://localhost:8789/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Practice session starting.","voice":"af_bella","response_format":"wav"}' \
  -o /tmp/practice.wav
```

`/health` reports `activeBackend` (`kokoro` or `piper`). Kokoro voices: `af_bella`, `af_sky`, `am_adam`. Piper voice: set `TTS_PIPER_VOICE` (see [piper samples](https://rhasspy.github.io/piper-samples/)). In-compose URL: `TTS_URL=http://tts-gateway:8789`.

**Kokoro pull fails with `unexpected EOF`:** The ROCm image has two ~5 GB layers. Docker’s default pulls several layers in parallel; on many links the connection drops near 100% and Docker discards the partial layer (so the next pull starts over). Fix:

1. Set sequential downloads in `/etc/docker/daemon.json` (merge with existing keys), then restart Docker:

```json
{
  "max-concurrent-downloads": 1,
  "max-download-attempts": 15
}
```

2. Pull with retries: `chmod +x scripts/tts-pull-gpu.sh && ./scripts/tts-pull-gpu.sh`

3. Or skip GPU for now: `TTS_SKIP_GPU=1 ./scripts/tts-up.sh` (Piper on `:8789` works immediately).

**Strix Halo / Radeon 8060S (gfx1151):** The published `kokoro-fastapi-rocm` image uses ROCm 6.4 without gfx1151 support and **segfaults** during model load. `tts-up.sh` auto-selects `kokoro-fastapi-cpu` on these machines. Kokoro still runs as the gateway primary (better voices than Piper); GPU ROCm needs a ROCm 7.2+ custom build (see [Kokoro #454](https://github.com/remsky/Kokoro-FastAPI/issues/454)).

First Kokoro start downloads the model and may take several minutes. MIOpen cache volumes persist kernel tuning. After startup, synthesize a few varied sentences once for low latency on short prompts.

Watch prompts and model reasoning in the llm container logs:

```bash
docker logs -f abc2book-llm
```

By default the llm service enables `LLM_LOG_TRAFFIC=true` (logs chat messages plus `reasoning_content`/`content`), `LLM_LOG_VERBOSE=true` (llama.cpp verbose), and `LLM_REASONING_FORMAT=deepseek`.

On non-AMD hosts without `/dev/kfd`, remove that device mapping from the `llm` service in `docker-compose.yml`.

The resolver image predownloads chord models during `docker compose build`: BTC maj/min weights under `/opt/btc-chords`, madmom chord/beat networks, and the legacy `autochord` TensorFlow model plus NNLS-Chroma VAMP plugin. At runtime `CHORD_BACKEND=auto` tries BTC, then madmom, then autochord.

Resolver-backed chord and lyrics search prefer cheap sources first: free APIs
and direct slug URLs, then web discovery (Brave when `BRAVE_SEARCH_API_KEY` is
set), then polite `httpx` fetches, then an optional Playwright Chromium fallback
for soft JavaScript walls. Ultimate Guitar and similar hard-blocked hosts are
**discovered** via search but not scraped; the UI offers locked paste-into-review
when those are the only hits. Capo/key/tuning lines are captured as metadata
before being stripped from chord sheet bodies.

When `BRAVE_SEARCH_API_KEY` is set, chord search also
uses Brave's web search API to discover supported e-chords, CifraClub,
AZChords, WorshipTogether, chordie, and related pages (including Ultimate Guitar
for discovery-only). It then fetches scrapable pages and normalizes the
interleaved chord/lyric sheet for import. CifraClub section labels in Portuguese or Spanish are translated to
English via the same `RESEARCH_LLM_*` settings used for tune background lookup.
AZChords pages are still parsed when supplied as a direct URL. A title and
artist are both required to build the slug URLs; when no match is found (or no
artist is available) the app falls back to the existing external Google search
link. Other chord hosts may still be blocked by Cloudflare or site-specific
anti-bot protections — Playwright may help soft cases; hard blocks use manual paste.

Polite fetch env vars: `POLITE_FETCH_PER_HOST`, `POLITE_FETCH_GLOBAL`,
`POLITE_FETCH_JITTER_MS_*`, `POLITE_FETCH_MAX_RETRIES`. Playwright:
`PLAYWRIGHT_ENABLED`, `PLAYWRIGHT_TIMEOUT_MS` (reported on `/health/ready` as
`features.playwright`).

Chord/lyric import alignment stores `meta.chordSheetAlignment` (column→word
anchors). Merging into ABC prefers those anchors for beat placement when
present, preserves real melody timing, and can offer key-transpose merge options
when the sheet key does not match notation `K:` (user picks; tune key is not
auto-overwritten).

**Meter / time signature:** Chord↔ABC beat placement uses a shared bar model
(`getBarModel`): compound meters such as 6/8 and 9/8 use dotted-beat counts
(2 / 3 beats), not six or nine unit “beats.” Chord-sheet skeletons emit a full
bar of rests for the resolved meter. Text chord/lyric pairing (column anchors,
section blanks) stays meter-blind. When sheet and notation meters disagree,
ChordsWizard offers a keep-notation vs use-sheet choice before merge.

Melody analysis uses a separate Python venv with **madmom** (beat/downbeat timing), **CREPE** or optional **basic-pitch** (polyphonic note events), **Demucs** (vocal separation), and **Kong** (ByteDance piano transcription via `piano_transcription_inference`). Models are prefetched at build time via `prefetch_madmom.py`, `prefetch_demucs.py`, `prefetch_basic_pitch.py`, and `prefetch_kong.py` (checkpoint under `/opt/kong-piano`). If madmom is unavailable at runtime, timing falls back to librosa with a stderr warning. Multi-instrument MT3 (`mt3-infer`) is not baked in (large); use `MELODY_AMT_PROVIDER=replicate` or install manually.

Sheet image import (chord OCR + homr OMR) uses a separate `/opt/vision-venv`. During `docker compose build`, `prefetch_vision.py` runs `homr --init` and warms up PaddleOCR so ONNX and OCR weights are baked into the image. Paddle models are stored under `/opt/vision-cache/official_models`; homr and RapidOCR weights live inside the vision venv. The first sheet-image request should work offline after a successful build. Rebuild with `VISION_PREFETCH_DEVICE=gpu` in the Docker build args if you want homr/PaddleOCR GPU variants prefetched (optional).

### Transcription accuracy tuning

Environment variables for the accuracy improvements:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WHISPER_CPP_BEST_OF` | `5` | Whisper search breadth for lyrics |
| `WHISPER_CPP_BEAM_SIZE` | `5` | Whisper beam size |
| `WHISPER_LANGUAGE` | `en` | Whisper language hint |
| `WHISPER_WORD_TIMESTAMPS` | `true` | Request word-level timestamps when supported |
| `MELODY_BACKEND` | `auto` | `auto`, `basic-pitch`, `kong`, `mt3`, `crepe`, or `pyin`. `auto` uses Kong when `musicType=piano`, else basic-pitch then CREPE/pYIN |
| `KONG_CHECKPOINT_PATH` | `/opt/kong-piano/note_F1=….pth` | Prefetched Kong weights (full image) |
| `MELODY_AMT_PROVIDER` | *(empty)* | Set `replicate` to fall back to cloud Kong/MT3 when local packages/weights are missing |
| `CHORD_BACKEND` | `auto` | `auto` (BTC→madmom→autochord), `btc`, `madmom`, or `autochord` |
| `BTC_MODEL_DIR` | `/opt/btc-chords` | Directory containing `btc_model.pt` |
| `BTC_CHECKPOINT_PATH` | *(empty)* | Optional explicit BTC checkpoint path |
| `CHORD_CONSTRAIN_TO_KEY` | `true` | Snap smoothed chords toward the detected key (diatonic + V) |
| `CHORD_MIN_DURATION_SECONDS` | `0.35` | Merge very short chord segments |
| `CHORD_MEDIAN_WINDOW` | `3` | Median smoothing window for chord labels |
| `CHORD_CHANGE_GRID` | `beat` | `beat`, `half-bar`, or `bar` chord persistence |
| `STEM_CACHE_DIR` | `/tmp/stem-cache` | Shared Demucs cache for Stem Create and `/analyze-media` |

The analyze payload can also include `whisperPrompt`, `melodyBackend`, `musicType`, `stemCacheId`, `precreateStemsBeforeAnalyze`, `constrainChordsToKey`, `chordChangeGrid`, `detectedKey`/`key`, and `snapToScale`. Prefer creating stems once (Stem Create or “Stems first”) so analyze reuses `STEM_CACHE` instead of running Demucs twice.

Optional AMT: Kong is installed and prefetched in the full image (`requirements-amt.txt` + `prefetch_kong.py`). Install `mt3-infer` separately only if you need local multi-instrument MT3.

Local smoke evaluation without the UI:

```bash
python3 local-resolver/eval_transcription.py /path/to/audio.wav
python3 local-resolver/eval_transcription.py /path/to/audio.wav --melody-backends auto,basic-pitch,kong --music-type piano
# Chord backends A/B (optional .lab ground truth):
python3 local-resolver/scripts/eval_chords.py /path/to/audio.wav \
  --backends auto,btc,madmom,autochord \
  --lab /path/to/labels.lab \
  --snapshot /tmp/chord-snapshots
python3 local-resolver/scripts/eval_melody_backends.py /path/to/audio.wav --music-type piano
```

### Development (live source reload)

To iterate on the Python source without rebuilding the image, use the dev
override, which bind-mounts the `.py` files into the container and runs uvicorn
with `--reload`:

```bash
cd local-resolver
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Editing any mounted source file (e.g. `server.py`, `lyrics_fetch.py`) restarts
the server automatically. System deps, venvs, the whisper build and models still
come from the built image; only the source is overlaid from the host. Rebuild
normally (`docker compose up --build`) when you change `requirements*.txt` or the
`Dockerfile`.

### GPU resolver (optional)

For CUDA-accelerated Demucs separation, use the GPU compose overlay (requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)):

```bash
cd local-resolver
MELODY_TORCH_INDEX=https://download.pytorch.org/whl/cu121 \
  docker compose -f docker-compose.yml -f docker-compose.gpu.yml --profile gpu up --build
```

Set `MELODY_BACKEND_PREFERENCE=gpu` in `.env` when running the GPU profile. CPU-only builds remain the default `docker compose up --build`.

In the project root `.env` (optional when using the resolver-hosted site on :8787):

```bash
REACT_APP_MEDIA_PROXY_BASE=http://localhost:8787
# Only needed for npm start (port 3000); defaults to http://localhost:8787
# REACT_APP_RESOURCE_BASE=http://localhost:8787
```

Restart the React app (`npm start`) if you change `.env` during UI development.
When using the built site from the resolver, set the resolver URL in Settings to
`http://localhost:8787` (or leave blank to auto-detect localhost).

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

### Troubleshooting: HTTP 403 Forbidden

YouTube now PO-token-gates `android_vr` DASH audio (format 251). The resolver skips that client on the first attempt, uses Deno for web/TV n-sig, and retries with the `android` client + best audio (`ba/b`) when formats are missing or blocked. If you still see `unable to download video data: HTTP Error 403`:

1. **Rebuild** so yt-dlp is current: `docker compose up --build`
2. **Export cookies** to `local-resolver/secrets/youtube-cookies.txt` (see above)
3. **Use a residential proxy** (Settings → Providers → Webshare) or `YTDLP_PROXY`
4. **Play the video once** in Tunebook so analysis can use cached audio, or install TuneBook Helper

Optional overrides:

```bash
YTDLP_YOUTUBE_EXTRACTOR_ARGS=youtube:player_client=default,-android_vr
YTDLP_YOUTUBE_FALLBACK_EXTRACTOR_ARGS=youtube:player_client=android
YTDLP_YOUTUBE_FALLBACK_FORMAT=ba/b
```

### Single-port HTTPS (production)

Expose **only Caddy on port 443** to the internet. Do not publish the app’s `:8787` publicly.

```bash
docker compose --profile https up -d
```

TLS uses `RESOLVER_DOMAIN` / `ACME_EMAIL` from `.env`. From an HTTPS Tunebook page the SPA reaches a local resolver at `https://localhost` (see Media settings).

For a slim public Cloud Run gateway (no GPU), see [CLOUD_RUN.md](CLOUD_RUN.md).

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
| `REQUIRE_AUTH` | Set `true` to require Google login (default `false` in `.env.example`; enabled in `docker-compose.dev.yml`) |
| `GOOGLE_CLIENT_ID` | Required when `REQUIRE_AUTH=true` |
| `RESOLVER_ACCESS_EMAILS` | Who may use this host when auth is on; empty = any signed-in Google user; `ALL` = explicit open |
| `MUSIC_COLLECTION_EMAILS` | Dedicated allowlist for personal music library streaming |
| `ALLOWED_ADMIN_EMAILS` | Admin UI (billing panel, feedback) |
| `BILLING_ENABLED` | Credit metering (default `false` locally; default `true` on Cloud Run via `RESOLVER_LIGHT_MODE`) |
| `PROVIDER_LLM_*` / `PROVIDER_WHISPER_*` / `PROVIDER_OCR_*` | Optional host-embedded cloud providers (`_PROVIDER`, `_BASE_URL`, `_API_KEY`, `_MODEL`) |
| `RESOLVER_LIGHT_MODE` | Slim gateway: no local Whisper/Demucs/OCR (see [CLOUD_RUN.md](CLOUD_RUN.md)) |
| `YTDLP_PROXY` | Optional host residential proxy for yt-dlp |
| `YTDLP_REQUIRE_USER_PROXY` | Require user/host proxy for `/youtube` (default true in light mode) |
| `YTDLP_YOUTUBE_EXTRACTOR_ARGS` | yt-dlp `--extractor-args` for YouTube (default skips `android_vr` DASH) |
| `HEAVY_JOB_QUEUE_TIMEOUT_SECONDS` | Wait budget for heavy ML slots before 503 (default 120) |
| `MAX_CONCURRENT_HEAVY_JOBS` | Concurrent Whisper/stems/OCR jobs (default 2) |
| `GOATCOUNTER_API_URL` | Optional GoatCounter count API URL for resolver endpoint analytics (paths are prefixed with resolver-server/) |
| `GOATCOUNTER_API_TOKEN` | Optional GoatCounter API token; keep server-side only |
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
