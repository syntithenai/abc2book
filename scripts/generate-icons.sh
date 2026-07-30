#!/usr/bin/env bash
# Sync from twonotes.svg, then regenerate Tune Book favicon and PWA icons.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/sync-tunebook-icon.py
python3 scripts/generate-icons.py
python3 scripts/generate-android-icons.py
