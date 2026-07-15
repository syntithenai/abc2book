"""Predownload Demucs model weights during image build."""

import contextlib
import io
import os
from pathlib import Path


def main():
    model_name = os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        import torch
        from demucs.pretrained import get_model

        device = "cuda" if os.getenv("MELODY_PREFETCH_DEVICE", "cpu") == "cuda" and torch.cuda.is_available() else "cpu"
        model = get_model(model_name)
        model.to(device)

    # Demucs 4.1+ loads bag models from the HuggingFace hub (cache under
    # ~/.cache/huggingface). Legacy AWS fallbacks still use the torch hub cache.
    # Always create both so Docker COPY --from=... succeeds either way.
    cache_roots = (
        Path.home() / ".cache" / "huggingface",
        Path.home() / ".cache" / "torch",
    )
    for root in cache_roots:
        root.mkdir(parents=True, exist_ok=True)

    hf_files = list((Path.home() / ".cache" / "huggingface").rglob("*"))
    torch_files = list((Path.home() / ".cache" / "torch").rglob("*"))
    if not any(p.is_file() for p in hf_files + torch_files):
        raise RuntimeError(
            "demucs prefetch finished but no weights found under "
            "~/.cache/huggingface or ~/.cache/torch"
        )
    print(f"demucs: {model_name} model prefetched (device={device})")


if __name__ == "__main__":
    main()
