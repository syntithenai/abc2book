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

Published ports (defaults):

| Port | Service |
|------|---------|
| 1780 | snapserver HTTP / WebSocket (browser control, snapweb) |
| 1704 | snapcast client protocol |
| 1705 | snapcast client protocol (TLS) |
| 4954 | Resolver TCP PCM feed (internal; snapserver connects as client) |

## Snapclients

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
3. Open snapweb or Tune Book Snapcast panel — groups/clients visible
4. Start snapclient on another machine — appears in client list
5. Play a tune with neutral pitch/tempo → **Play on Snapcast** — audio on clients
6. Pause/seek from Tune Book — clients follow (via stream plugin)
7. Stop Snapcast session — resolver `DELETE` cleans up ffmpeg

## Troubleshooting

- **No audio:** confirm snapserver TCP client connected (`health.snapcast.tcpClients` > 0)
- **Browser cannot connect:** check CORS / mixed content; use `SNAPCAST_PUBLIC_URL` with `wss://`
- **Pitch shift disabled while casting:** processed cast requires stem cache (Phase S2)
