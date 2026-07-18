import os

import numpy as np

DEMUCS_MODEL_STEMS = {
    "htdemucs": ("drums", "bass", "other", "vocals"),
    "htdemucs_6s": ("drums", "bass", "other", "vocals", "guitar", "piano"),
}

# Backwards-compatible alias used by separate_stems.py.
HTDEMUCS_STEMS = DEMUCS_MODEL_STEMS["htdemucs"]


def demucs_stems_for_model(model_name=None):
    name = model_name or os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    return DEMUCS_MODEL_STEMS.get(name, DEMUCS_MODEL_STEMS["htdemucs"])


def _melody_device():
    preference = os.getenv("MELODY_BACKEND_PREFERENCE", "auto").lower()
    if preference == "cpu":
        return "cpu"
    try:
        import torch

        if torch.cuda.is_available() and preference in ("gpu", "auto", "cuda"):
            return "cuda"
    except Exception:
        pass
    return "cpu"


def separate_stems_to_dir(audio_path, output_dir, model_name=None):
    import librosa
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    os.makedirs(output_dir, exist_ok=True)
    device = _melody_device()
    resolved_model = (model_name or os.getenv("MELODY_DEMUCS_MODEL", "htdemucs") or "htdemucs").strip()
    allowed_stems = demucs_stems_for_model(resolved_model)
    model = get_model(resolved_model)
    model.eval()
    model.to(device)
    wav, _sr = librosa.load(audio_path, sr=model.samplerate, mono=False)
    if wav.ndim == 1:
        wav = np.stack([wav, wav])
    wav_tensor = torch.from_numpy(wav).unsqueeze(0).to(device)
    with torch.no_grad():
        sources = apply_model(model, wav_tensor, device=device)[0]
    source_names = list(model.sources)
    paths = {}
    duration = 0.0
    for index, name in enumerate(source_names):
        if name not in allowed_stems:
            continue
        stem = sources[index].detach().cpu().numpy()
        if stem.ndim > 1:
            stem = np.mean(stem, axis=0)
        out_path = os.path.join(output_dir, name + ".wav")
        sf.write(out_path, stem, model.samplerate)
        paths[name] = out_path
        duration = max(duration, float(len(stem)) / float(model.samplerate))
    backend = "demucs" + ("+cuda" if device == "cuda" else "")
    return {
        "paths": paths,
        "samplerate": int(model.samplerate),
        "duration": duration,
        "backend": backend,
        "model": resolved_model,
        "stems": list(allowed_stems),
    }
