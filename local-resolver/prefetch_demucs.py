"""Predownload Demucs model weights during image build."""

import contextlib
import io
import os


def main():
    model_name = os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        import torch
        from demucs.pretrained import get_model

        device = "cuda" if os.getenv("MELODY_PREFETCH_DEVICE", "cpu") == "cuda" and torch.cuda.is_available() else "cpu"
        model = get_model(model_name)
        model.to(device)
    print(f"demucs: {model_name} model prefetched (device={device})")


if __name__ == "__main__":
    main()
