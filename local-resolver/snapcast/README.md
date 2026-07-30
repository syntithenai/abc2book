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
| `local-resolver` | PCM source (connects to snapserver :4954) + HTTP control API |
| `snapserver` | Multi-room hub + browser WebSocket control (built from [badaix/snapcast](https://github.com/badaix/snapcast) release `.deb`) |
| `snapclient` | **Resolver host speakers** — plays audio on this machine |

Published ports (defaults):

| Port | Service |
|------|---------|
| 1780 | snapserver HTTP / WebSocket (browser control, snapweb) |
| 1704 | snapcast client protocol |
| 1705 | snapcast client protocol (TLS) |
| 4954 | snapserver PCM ingest (internal; resolver connects as client) |

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
control.

Set in `.env` when the public hostname differs from the direct resolver port:

```bash
CAST_PUBLIC_URL=https://peppertrees.example.com
# HTTPS base path (not wss:// — Tune Book derives wss from this in snapcastSupport.js)
SNAPCAST_PUBLIC_URL=https://peppertrees.example.com/snapcast
```

Combine profiles:

```bash
docker compose --profile https --profile snapcast up -d --build local-resolver
```

After HTTPS is working, prefer closing public firewall access to port **1780**
and use the Caddy `/snapcast` path only.

## Health checks and curl troubleshooting

| URL | Use |
|-----|-----|
| `http://<host>:8787/health` | Direct resolver (HTTP only) |
| `https://<domain>/health` | Via Caddy (HTTPS, recommended for tunebook.net) |
| `https://<host>:8787/health` | **Wrong** — port 8787 speaks plain HTTP; TLS fails silently |

```bash
# Correct (HTTPS via Caddy)
curl -s https://peppertrees.example.com/health | jq '{snapcast, cast}'

# Correct (HTTP direct)
curl -s http://peppertrees.example.com:8787/health | jq '{snapcast, cast}'
```

If `curl` prints nothing or `curl: (35) TLS connect error`, you are using HTTPS
on the HTTP port. Use one of the URLs above.

Verify public bases are HTTPS when using Caddy:

```bash
curl -s https://peppertrees.example.com/health | jq '.cast.publicBase, .snapcast.controlUrl'
```

## Android

The Chromecast Web SDK is not available in the Tune Book Android app. **Snapcast**
is the primary whole-home output path on Android: enable the snapcast profile on
your home resolver and use **Output → Snapcast** (or route via your LAN snapclients).

## External snapserver (advanced)

If you already run snapserver elsewhere, set `SNAPCAST_ENABLED=true` on the
resolver with `SNAPCAST_TCP_MODE=server` so the resolver listens for PCM, then
configure your snapserver to read from the resolver TCP feed (use an IP address,
not a hostname — snapcast 0.35 TCP client mode does not resolve DNS):

```ini
source = tcp://<resolver-ip>:4954?name=TuneBook&mode=client&sampleformat=48000%3A16%3A2
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

- **snapserver unhealthy / `Invalid argument`:** snapcast 0.35 TCP client sources require an IP, not a hostname. The compose sidecar uses snapserver `mode=server` on :4954 with the resolver in `SNAPCAST_TCP_MODE=client`.
- **No audio:** confirm resolver connected (`health.snapcast.tcpClients` > 0). If `tcpClients` is 0 while `reachable` is true, check resolver logs for `Snapcast TCP client could not reach` — usually snapserver is not running (`docker compose --profile snapcast up -d`) or `SNAPCAST_TCP_TARGET` is wrong (default `snapserver:4954` in compose).
- **PCM idle vs routing:** `tcpClients` may be 0 until the resolver TCP hub connects; after `docker compose --profile snapcast up`, restart `local-resolver` if needed. While idle (not playing), Tune Book shows “PCM link activates when you press Play”; if that persists during playback, inspect `docker logs abc2book-local-resolver` and `docker logs abc2book-snapserver`.
- **Resolver host silent:** check `docker logs abc2book-snapclient`; try `SNAPCLIENT_SOUNDCARD=default` or `aplay -L` on host
- **Browser cannot connect:** check CORS / mixed content; use `SNAPCAST_PUBLIC_URL` with `wss://`
- **Pitch shift disabled while casting:** processed cast requires stem cache (Phase S2)
