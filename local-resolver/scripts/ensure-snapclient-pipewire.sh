#!/usr/bin/env bash
# Keep the snapclient container attached to the host's live PipeWire socket.
#
# The socket is bind-mounted by inode, so when pipewire.socket is recreated (restart, package
# upgrade, reboot) the container keeps a dead socket and goes silent. Run by
# abc2book-snapclient-pipewire.service, which is started/restarted together with pipewire.socket.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${SNAPCLIENT_CONTAINER:-abc2book-snapclient}"
SOCKET="${SNAPCLIENT_PIPEWIRE_SOCKET:-$(sed -n 's/^SNAPCLIENT_PIPEWIRE_SOCKET=//p' "$ROOT/.env" 2>/dev/null | tail -1 | tr -d '"')}"

if [[ -z "$SOCKET" ]]; then
  echo "SNAPCLIENT_PIPEWIRE_SOCKET not set; snapclient uses ALSA, nothing to do"
  exit 0
fi

for _ in $(seq 60); do
  docker info >/dev/null 2>&1 && break
  sleep 2
done
if ! docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "$CONTAINER does not exist; nothing to do"
  exit 0
fi

for _ in $(seq 15); do
  [[ -S "$SOCKET" ]] && break
  sleep 1
done
if [[ ! -S "$SOCKET" ]]; then
  echo "$SOCKET is not a socket; is pipewire.socket running?" >&2
  exit 1
fi
host_inode="$(stat -c %d:%i "$SOCKET")"

if [[ "$(docker container inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
  echo "$CONTAINER not running; starting it"
  docker start "$CONTAINER" >/dev/null
  exit 0
fi

container_inode="$(docker exec "$CONTAINER" stat -c %d:%i /run/host-pipewire/pipewire-0 2>/dev/null || true)"
if [[ "$container_inode" == "$host_inode" ]]; then
  echo "$CONTAINER already bound to the current PipeWire socket (dev:inode $host_inode)"
  exit 0
fi

echo "$CONTAINER has a stale PipeWire socket (container ${container_inode:-none}, host $host_inode); restarting"
docker restart "$CONTAINER" >/dev/null
