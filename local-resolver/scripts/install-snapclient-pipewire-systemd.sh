#!/usr/bin/env bash
# Install the systemd --user hook that re-attaches the snapclient container to PipeWire
# whenever pipewire.socket is (re)created. Only needed with SNAPCLIENT_PIPEWIRE_SOCKET set.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT=abc2book-snapclient-pipewire.service
UNIT_DST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$UNIT_DST"
chmod +x "$ROOT/scripts/ensure-snapclient-pipewire.sh"
install -m 644 "$ROOT/systemd/$UNIT" "$UNIT_DST/$UNIT"
echo "Installed $UNIT_DST/$UNIT"

systemctl --user daemon-reload
systemctl --user enable "$UNIT"
systemctl --user restart "$UNIT"
systemctl --user --no-pager --full status "$UNIT" || true
