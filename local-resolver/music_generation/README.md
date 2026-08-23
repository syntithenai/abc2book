# Practice track generation (MIDI-guided AI backing + notation melody)

Hybrid practice tracks: **canonical notation MIDI** (timing + harmony spine) + **styled AI arrangement** (Stable Audio 3 via [audio.cpp](https://github.com/FGDumitru/audio.cpp) Vulkan sidecar), with optional **FluidSynth** melody render and **beat-locked MIDI drum guide**.

## MIDI render (FluidSynth)

The resolver image installs `fluidsynth` and `fluid-soundfont-gm`. Optional env:

```
SF2_PATH=/usr/share/sounds/sf2/FluidR3_GM.sf2
MIDI_RENDER_SAMPLE_RATE=44100
```

- `POST /render-midi` — multipart `midi` file → WAV (debug / preview)
- Practice-track jobs accept optional `score` (`score.mid`); when FluidSynth is ready the server prefers that render for the melody stem.

## audio.cpp source audio paths

`AudioCppProvider` passes **filesystem paths** in the request `audio` field (audio.cpp does not accept base64 input). When the resolver and audio.cpp share a machine (`AUDIO_CPP_URL=http://127.0.0.1:8788`), job WAV paths are used directly. When the resolver runs in Docker and audio.cpp on the host, set:

```
AUDIO_CPP_INPUT_DIR=/audio-cpp-incoming
AUDIO_CPP_INPUT_API_PATH=/home/you/audio.cpp/incoming
```

and mount `~/audio.cpp/incoming` into the resolver container at `/audio-cpp-incoming` (see `docker-compose.yml`).

Guide melody conditioning for practice tracks uses the same staging (`audio` + `audio_input_kind=init_audio`).

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
in `.env`, then start compose with `--profile audio-cpp`. For a host-managed process
instead, use `AUDIO_CPP_URL=http://host.docker.internal:8788` and **do not** enable
the `audio-cpp` profile (avoids binding host port 8788 twice).

Without the compose sidecar, you can still run audio.cpp on the host.
**Use the hardened units from this repo** (they fix a recurring death mode):

```bash
# From the abc2book checkout:
bash local-resolver/audio-cpp/install-systemd-user.sh
```

That installs:

| Unit | Role |
|------|------|
| `abc2book-audio-cpp.service` | Sidecar with `Restart=always` (see note below) |
| `abc2book-audio-cpp-idle-supervisor.service` | Unloads models after idle via `systemctl --user restart` |
| `abc2book-audio-cpp-watchdog.timer` | Every minute: start the sidecar if `/health` fails |

Why `Restart=always` (not `on-failure`): systemd treats **SIGPIPE as a clean exit**.
`audiocpp_server` has died that way before (client disconnect / broken pipe). With
`Restart=on-failure` the unit stayed `inactive (dead)` until someone started it
by hand — which is why quality presets all showed unavailable.

Also ensure linger so user units survive logout:

```bash
loginctl enable-linger "$USER"
```

Manual / minimal unit (prefer the install script above):

```ini
# ~/.config/systemd/user/abc2book-audio-cpp.service
[Unit]
Description=audio.cpp Stable Audio server for abc2book
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=20

[Service]
Type=simple
WorkingDirectory=%h/audio.cpp
ExecStart=%h/audio.cpp/start-abc2book-sidecar.sh
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now abc2book-audio-cpp.service
systemctl --user enable --now abc2book-audio-cpp-watchdog.timer
```

Note: put `StartLimitIntervalSec=` / `StartLimitBurst=` in the **`[Unit]`** section
(systemd 240+); the install script units already do this.

## local-resolver configuration

Add to `local-resolver/.env`:

```
AUDIO_CPP_URL=http://127.0.0.1:8788
# mock = synthetic backing (no GPU); audio_cpp = sidecar HTTP
PRACTICE_TRACK_PROVIDER=mock
PRACTICE_TRACK_CACHE_DIR=/tmp/practice-track-cache
AUDIO_GEN_COORDINATION_REQUIRED=true
AUDIO_CPP_IDLE_UNLOAD_SECONDS=300
```

Install AceStep for linked-media cover variants:

```bash
cd ~/audio.cpp
python3 tools/model_manager.py install ace_step
```

Register both Stable Audio and AceStep in `~/audio.cpp/server.json` (see `local-resolver/audio-cpp/server.docker.json`).

## API

Canonical paths under `/generate-audio` (legacy `/generate-practice-track/*` aliases remain):

- `GET /generate-audio/backends` — tasks, quality presets, provider health, `midiRender`
- `POST /generate-audio` — multipart: `taskId`, `presetId`, plus task payload:
  - `practice_track`: `timingPlan` (JSON), `melody` (WAV), optional `chords`, `score`
  - `linked_cover`: `requestJson` with `sourceUrl`, `stylePrompt`, optional `lyrics`, trim `startAt`/`endAt`
- `GET /generate-audio/{jobId}` — status; `audioUrl` when complete
- `GET /generate-audio/{jobId}/audio` — output WAV
- `GET /audio-cpp/idle-status` — idle timer for sidecar supervisor (local resolver)

Also:

- `POST /render-midi` — multipart: `midi` (`.mid`); returns WAV

## Disk

~5 GB for Stable Audio 3 Small weights; temp WAV per job (cleaned after 24h TTL).
