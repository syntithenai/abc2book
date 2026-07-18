#!/usr/bin/env python3
"""Predownload ByteDance Kong piano transcription checkpoint during image build."""

from __future__ import annotations

import os
import sys
import urllib.request

DEFAULT_URL = (
    "https://zenodo.org/record/4034264/files/"
    "CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
)
DEFAULT_DIR = "/opt/kong-piano"
DEFAULT_NAME = "note_F1=0.9677_pedal_F1=0.9186.pth"


def main():
    model_dir = os.getenv("KONG_MODEL_DIR", DEFAULT_DIR).strip() or DEFAULT_DIR
    url = os.getenv("KONG_CHECKPOINT_URL", DEFAULT_URL).strip() or DEFAULT_URL
    dest = os.getenv("KONG_CHECKPOINT_PATH", "").strip() or os.path.join(model_dir, DEFAULT_NAME)
    os.makedirs(os.path.dirname(dest) or model_dir, exist_ok=True)
    home_dir = os.path.join(os.path.expanduser("~"), "piano_transcription_inference_data")
    os.makedirs(home_dir, exist_ok=True)

    # Package expects ~165 MB; treat smaller files as incomplete.
    if os.path.isfile(dest) and os.path.getsize(dest) > 160_000_000:
        print(f"kong: checkpoint already present at {dest}")
        return 0

    print(f"kong: downloading checkpoint from Zenodo (~165 MB)")
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
        print(
            f"kong: checkpoint download failed ({exc}); "
            "MELODY_BACKEND=kong will fall back to basic-pitch at runtime",
            file=sys.stderr,
        )
        return 0

    size = os.path.getsize(dest)
    print(f"kong: saved {dest} ({size} bytes)")

    # Also seed the default home path so piano_transcription_inference finds it
    # if checkpoint_path is omitted.
    home_dest = os.path.join(home_dir, DEFAULT_NAME)
    try:
        if not os.path.isfile(home_dest) or os.path.getsize(home_dest) < 160_000_000:
            import shutil

            shutil.copy2(dest, home_dest)
            print(f"kong: mirrored checkpoint to {home_dest}")
    except Exception as exc:
        print(f"kong: home mirror skipped ({exc})", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
