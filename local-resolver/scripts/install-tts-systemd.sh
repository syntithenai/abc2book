#!/usr/bin/env bash
# Install abc2book TTS systemd --user units (always-on gateway + backends).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/systemd"
UNIT_DST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$UNIT_DST"

units=(
  abc2book-tts.service
  abc2book-tts-watchdog.service
  abc2book-tts-watchdog.timer
)

chmod +x "$ROOT/scripts/tts-up.sh" "$ROOT/scripts/ensure-tts.sh"

for unit in "${units[@]}"; do
  src="$UNIT_SRC/$unit"
  dst="$UNIT_DST/$unit"
  if [[ ! -f "$src" ]]; then
    echo "Missing $src" >&2
    exit 1
  fi
  install -m 644 "$src" "$dst"
  echo "Installed $dst"
done

systemctl --user daemon-reload
systemctl --user enable --now abc2book-tts.service
systemctl --user enable --now abc2book-tts-watchdog.timer
systemctl --user start abc2book-tts-watchdog.service || true

echo
systemctl --user --no-pager --full status abc2book-tts.service abc2book-tts-watchdog.timer || true
echo
echo "Linger (required so units survive logout): $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown)"
echo "Health: curl -fsS http://127.0.0.1:8789/health"
