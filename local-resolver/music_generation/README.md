# Practice track generation (AI backing + notation melody)

Hybrid practice tracks: **abcjs soundfont melody** (timing-accurate) + **AI accompaniment** (Stable Audio 3 via [audio.cpp](https://github.com/FGDumitru/audio.cpp) Vulkan sidecar).

## Phase 0 spike (run before relying on production generation)

```bash
# Prerequisites: Vulkan (Mesa RADV), cmake, git, Python 3.12+
vulkaninfo | grep deviceName   # should list Radeon 8060S

git clone https://github.com/FGDumitru/audio.cpp.git ~/audio.cpp
cd ~/audio.cpp
scripts/build_linux.sh --backend vulkan --target audiocpp_server

# Download Stable Audio 3 Small-Music weights per audio.cpp docs, then:
./build/bin/audiocpp_server --backend vulkan --host 127.0.0.1 --port 8788

# Run checklist
./local-resolver/music_generation/scripts/phase0_spike.sh
```

Pass criteria: 64s backing within ±1s of requested duration; mix with a hand-rendered melody is usable for practice.

## Sidecar service (production)

The `audio-cpp` service in `docker-compose.yml` runs the sidecar alongside
`local-resolver` and `llm`. It mounts a host-built `audio.cpp` tree
(`AUDIO_CPP_HOST_DIR`, default `~/audio.cpp`) and uses Vulkan via `/dev/dri`.

```bash
cd local-resolver
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Set `PRACTICE_TRACK_PROVIDER=audio_cpp` and `AUDIO_CPP_URL=http://audio-cpp:8788`
in `.env` (compose sets this by default when unset). For a host-managed process
instead, use `AUDIO_CPP_URL=http://host.docker.internal:8788` and optionally
`docker compose stop audio-cpp`.

Without the compose sidecar, you can still run audio.cpp on the host:

```ini
# ~/.config/systemd/user/abc2book-audio-cpp.service
[Unit]
Description=audio.cpp Stable Audio server for abc2book
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/audio.cpp
ExecStart=%h/audio.cpp/build/bin/audiocpp_server --config %h/audio.cpp/server.json --backend vulkan --host 0.0.0.0 --port 8788
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now abc2book-audio-cpp.service
```

## local-resolver configuration

Add to `local-resolver/.env`:

```
AUDIO_CPP_URL=http://127.0.0.1:8788
# mock = synthetic backing (no GPU); audio_cpp = sidecar HTTP
PRACTICE_TRACK_PROVIDER=mock
PRACTICE_TRACK_CACHE_DIR=/tmp/practice-track-cache
```

## API

- `GET /generate-practice-track/backends` — provider health
- `POST /generate-practice-track` — multipart: `timingPlan` (JSON), `melody` (WAV); returns `{ jobId }`
- `GET /generate-practice-track/{jobId}` — status; `audioUrl` when complete

## Disk

~5 GB for Stable Audio 3 Small weights; temp WAV per job (cleaned after 24h TTL).
