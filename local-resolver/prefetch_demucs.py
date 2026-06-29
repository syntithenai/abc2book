"""Predownload Demucs htdemucs weights during image build."""

import contextlib
import io
import os


def main():
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        import torch
        from demucs.pretrained import get_model

        device = "cuda" if os.getenv("MELODY_PREFETCH_DEVICE", "cpu") == "cuda" and torch.cuda.is_available() else "cpu"
        model = get_model("htdemucs")
        model.to(device)
    print(f"demucs: htdemucs model prefetched (device={device})")


if __name__ == "__main__":
    main()
