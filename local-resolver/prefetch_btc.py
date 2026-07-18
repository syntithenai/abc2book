#!/usr/bin/env python3
"""Predownload BTC maj/min checkpoint during image build."""

from __future__ import annotations

import os
import sys
import urllib.request

DEFAULT_URL = (
    "https://huggingface.co/amaai-lab/music2emo/resolve/main/inference/data/btc_model.pt"
)
DEFAULT_DIR = "/opt/btc-chords"


def main():
    model_dir = os.getenv("BTC_MODEL_DIR", DEFAULT_DIR).strip() or DEFAULT_DIR
    url = os.getenv("BTC_CHECKPOINT_URL", DEFAULT_URL).strip() or DEFAULT_URL
    dest = os.path.join(model_dir, "btc_model.pt")
    os.makedirs(model_dir, exist_ok=True)

    if os.path.isfile(dest) and os.path.getsize(dest) > 1_000_000:
        print(f"btc: checkpoint already present at {dest}")
        return 0

    print(f"btc: downloading checkpoint from {url}")
    tmp = dest + ".partial"
    try:
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, dest)
    except Exception as exc:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass
        print(f"btc: checkpoint download failed ({exc}); madmom/autochord fallback will be used", file=sys.stderr)
        return 0

    size = os.path.getsize(dest)
    print(f"btc: saved {dest} ({size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
