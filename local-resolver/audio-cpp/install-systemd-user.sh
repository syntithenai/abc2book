#!/usr/bin/env bash
# Install hardened abc2book audio.cpp systemd --user units from this repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UNIT_SRC="$ROOT/systemd"
UNIT_DST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$UNIT_DST"

units=(
  abc2book-audio-cpp.service
  abc2book-audio-cpp-idle-supervisor.service
  abc2book-audio-cpp-watchdog.service
  abc2book-audio-cpp-watchdog.timer
)

chmod +x "$ROOT/ensure_sidecar.sh"

for unit in "${units[@]}"; do
  src="$UNIT_SRC/$unit"
  dst="$UNIT_DST/$unit"
  if [[ ! -f "$src" ]]; then
    echo "Missing $src" >&2
    exit 1
  fi
  # Copy (not symlink) so edits in the repo can be reviewed before install.
  install -m 644 "$src" "$dst"
  echo "Installed $dst"
done

# start-abc2book-sidecar.sh must be executable
if [[ -f "$HOME/audio.cpp/start-abc2book-sidecar.sh" ]]; then
  chmod +x "$HOME/audio.cpp/start-abc2book-sidecar.sh"
fi

systemctl --user daemon-reload
systemctl --user enable --now abc2book-audio-cpp.service
systemctl --user enable --now abc2book-audio-cpp-idle-supervisor.service
systemctl --user enable --now abc2book-audio-cpp-watchdog.timer

# Kick an immediate health ensure (in addition to the timer).
systemctl --user start abc2book-audio-cpp-watchdog.service || true

echo
systemctl --user --no-pager --full status abc2book-audio-cpp.service abc2book-audio-cpp-idle-supervisor.service abc2book-audio-cpp-watchdog.timer || true
echo
echo "Linger (required so units survive logout): $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown)"
echo "Done. Health: curl -fsS http://127.0.0.1:8788/health"
