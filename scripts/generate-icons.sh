#!/usr/bin/env bash
# Regenerate Tune Book favicon and PWA icons from public/tunebook-icon.svg
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/generate-icons.py
