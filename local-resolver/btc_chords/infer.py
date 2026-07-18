"""Inference wrapper for the BTC maj/min chord model."""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np

from .features import audio_to_cqt_features
from .labels import IDX2CHORD, normalize_btc_label

BTC_MODEL_DIR_ENV = "BTC_MODEL_DIR"
BTC_CHECKPOINT_ENV = "BTC_CHECKPOINT_PATH"
_NO_CHORD_INDEX = IDX2CHORD.index("N")


def _package_dir():
    return os.path.dirname(os.path.abspath(__file__))


def default_model_dir():
    return os.getenv(BTC_MODEL_DIR_ENV, "/opt/btc-chords").strip() or "/opt/btc-chords"


def default_checkpoint_path():
    explicit = os.getenv(BTC_CHECKPOINT_ENV, "").strip()
    if explicit:
        return explicit
    return os.path.join(default_model_dir(), "btc_model.pt")


def is_available(checkpoint_path=None):
    path = checkpoint_path or default_checkpoint_path()
    return bool(path) and os.path.isfile(path)


@lru_cache(maxsize=1)
def _load_runtime(checkpoint_path):
    import sys

    import torch

    package_dir = _package_dir()
    if package_dir not in sys.path:
        sys.path.insert(0, package_dir)

    from btc_model import BTC_model
    from utils.hparams import HParams

    config = HParams.load(os.path.join(package_dir, "run_config.yaml"))
    config.feature["large_voca"] = False
    config.model["num_chords"] = 25

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = BTC_model(config=config.model).to(device)
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    mean = checkpoint["mean"]
    std = checkpoint["std"]
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return {
        "torch": torch,
        "model": model,
        "config": config,
        "device": device,
        "mean": mean,
        "std": std,
    }


def recognize(audio_path, checkpoint_path=None):
    """Return chord segments [{start, end, label}] for an audio file."""
    path = checkpoint_path or default_checkpoint_path()
    if not is_available(path):
        raise FileNotFoundError(f"BTC checkpoint not found: {path}")

    runtime = _load_runtime(path)
    torch = runtime["torch"]
    model = runtime["model"]
    config = runtime["config"]
    device = runtime["device"]
    mean = runtime["mean"]
    std = runtime["std"]

    feature, feature_per_second, song_length_second = audio_to_cqt_features(audio_path, config)
    feature = feature.T
    feature = (feature - mean) / std
    n_timestep = int(config.model["timestep"])
    num_pad = n_timestep - (feature.shape[0] % n_timestep)
    if num_pad == n_timestep:
        num_pad = 0
    if num_pad:
        feature = np.pad(feature, ((0, num_pad), (0, 0)), mode="constant", constant_values=0)
    num_instance = max(1, feature.shape[0] // n_timestep)

    segments = []
    start_time = 0.0
    prev_chord = None
    with torch.no_grad():
        tensor = torch.tensor(feature, dtype=torch.float32).unsqueeze(0).to(device)
        for block in range(num_instance):
            block_feat = tensor[:, n_timestep * block : n_timestep * (block + 1), :]
            self_attn_output, _ = model.self_attn_layers(block_feat)
            prediction, _ = model.output_layer(self_attn_output)
            prediction = prediction.squeeze()
            if prediction.ndim == 0:
                prediction = prediction.unsqueeze(0)
            for frame in range(n_timestep):
                absolute = n_timestep * block + frame
                if absolute >= feature.shape[0] - num_pad and block == num_instance - 1:
                    if prev_chord is not None and start_time < song_length_second:
                        segments.append(
                            {
                                "start": float(start_time),
                                "end": float(song_length_second),
                                "label": normalize_btc_label(IDX2CHORD[prev_chord]),
                            }
                        )
                    return _trim_segments(segments, song_length_second)

                chord_idx = int(prediction[frame].item())
                # Lead-sheet UX: keep the previous harmony through N (no-chord) frames.
                if chord_idx == _NO_CHORD_INDEX:
                    if prev_chord is None:
                        continue
                    chord_idx = prev_chord
                if prev_chord is None:
                    prev_chord = chord_idx
                    start_time = 0.0
                    continue
                if chord_idx != prev_chord:
                    end_time = feature_per_second * absolute
                    if end_time > start_time:
                        segments.append(
                            {
                                "start": float(start_time),
                                "end": float(end_time),
                                "label": normalize_btc_label(IDX2CHORD[prev_chord]),
                            }
                        )
                    start_time = end_time
                    prev_chord = chord_idx

    if prev_chord is not None and start_time < song_length_second:
        segments.append(
            {
                "start": float(start_time),
                "end": float(song_length_second),
                "label": normalize_btc_label(IDX2CHORD[prev_chord]),
            }
        )
    return _trim_segments(segments, song_length_second)


def _trim_segments(segments, duration):
    trimmed = []
    for segment in segments:
        label = segment.get("label") or ""
        if not label:
            continue
        start = max(0.0, float(segment["start"]))
        end = min(float(duration), float(segment["end"])) if duration else float(segment["end"])
        if end <= start:
            continue
        trimmed.append({"start": start, "end": end, "label": label})
    return trimmed
