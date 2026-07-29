# Snapcast sidecar for Tune Book resolver

Turn the resolver host into a Snapcast multi-room hub. Tune Book routes playback
through the resolver (ffmpeg PCM) into snapserver; snapclients on your LAN play
in sync.

## Enable

```bash
cd local-resolver
# Set SNAPCAST_ENABLED=true in .env (see .env.example)
docker compose --profile snapcast up -d --build
```

This starts three Snapcast-related services:

| Service | Role |
|---------|------|
| `local-resolver` | PCM source (TCP :4954) + HTTP control API |
| `snapserver` | Multi-room hub + browser WebSocket control |
| `snapclient` | **Resolver host speakers** — plays audio on this machine |

Published ports (defaults):

| Port | Service |
|------|---------|
| 1780 | snapserver HTTP / WebSocket (browser control, snapweb) |
| 1704 | snapcast client protocol |
| 1705 | snapcast client protocol (TLS) |
| 4954 | Resolver TCP PCM feed (internal; snapserver connects as client) |

## Resolver host audio (snapclient)

When Snapcast is enabled, compose also starts `snapclient`, which connects to
`snapserver` and plays through the host sound card (`/dev/snd`).

Check it appears in Tune Book → **Output → Snapcast** or `/snapcast` as
**resolver-host** (override with `SNAPCLIENT_HOSTNAME` in `.env`).

```bash
# List sound cards (on the host)
aplay -L

# Optional: pick a specific ALSA device
SNAPCLIENT_SOUNDCARD=plughw:0,0
```

**Headless server (no speakers):** disable the local client:

```bash
SNAPCLIENT_ENABLED=false
```

**PipeWire desktop:** if `default` does not work, try:

```bash
SNAPCLIENT_SOUNDCARD=pipewire
```

and add a compose override that mounts your PipeWire socket, e.g.
`/run/user/1000/pipewire-0:/tmp/pipewire-0` with `XDG_RUNTIME_DIR=/tmp` in the
`snapclient` service environment.

## Other snapclients

Install [snapclient](https://github.com/badaix/snapcast) on speakers, Pis, or PCs
and point them at the resolver host on port **1704**:

```bash
snapclient -h <resolver-host> -p 1704
```

In Tune Book, open **Now Playing → Output → Snapcast** to pick a group and route
playback to the **TuneBook** stream.

## HTTPS / Caddy

When using `docker compose --profile https --profile snapcast`, Caddy proxies
`/snapcast/*` to snapserver so browsers on HTTPS Tune Book can use `wss://` for
control. Set `SNAPCAST_PUBLIC_URL` in `.env` if the public URL differs from the
resolver origin.

## External snapserver (advanced)

If you already run snapserver elsewhere, set `SNAPCAST_ENABLED=true` on the
resolver and configure your snapserver to read from the resolver TCP feed:

```ini
source = tcp://<resolver-host>:4954?name=TuneBook&mode=client&sampleformat=48000:16:2
```

Point Tune Book at your snapserver WebSocket URL in **Settings → Snapcast** (or
set `SNAPCAST_PUBLIC_URL` on the resolver for auto-discovery).

## Manual test checklist

1. `docker compose --profile snapcast up -d` — snapserver healthy on `:1780`
2. `curl http://localhost:8787/health` — `snapcast.enabled` true, `controlUrl` set
3. Open snapweb or Tune Book Snapcast panel — **resolver-host** client visible
4. Start snapclient on another machine — appears in client list
5. Play a tune with neutral pitch/tempo → **Play on Snapcast** — audio on clients
6. Pause/seek from Tune Book — clients follow (via stream plugin)
7. Stop Snapcast session — resolver `DELETE` cleans up ffmpeg

## Troubleshooting

- **No audio:** confirm snapserver TCP client connected (`health.snapcast.tcpClients` > 0)
- **Resolver host silent:** check `docker logs abc2book-snapclient`; try `SNAPCLIENT_SOUNDCARD=default` or `aplay -L` on host
- **Browser cannot connect:** check CORS / mixed content; use `SNAPCAST_PUBLIC_URL` with `wss://`
- **Pitch shift disabled while casting:** processed cast requires stem cache (Phase S2)
