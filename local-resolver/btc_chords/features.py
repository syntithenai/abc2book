"""CQT feature extraction matching BTC-ISMIR19 run_config.yaml."""

import numpy as np


def audio_to_cqt_features(audio_path, config):
    import librosa

    song_hz = float(config.mp3["song_hz"])
    inst_len = float(config.mp3["inst_len"])
    n_bins = int(config.feature["n_bins"])
    bins_per_octave = int(config.feature["bins_per_octave"])
    hop_length = int(config.feature["hop_length"])
    timestep = int(config.model["timestep"])

    original_wav, sr = librosa.load(audio_path, sr=song_hz, mono=True)
    if original_wav is None or len(original_wav) == 0:
        empty = np.zeros((n_bins, 1), dtype=np.float32)
        return empty, inst_len / timestep, 0.0

    chunk_samples = int(song_hz * inst_len)
    cursor = 0
    chunks = []
    while cursor + chunk_samples < len(original_wav):
        chunks.append(original_wav[cursor : cursor + chunk_samples])
        cursor += chunk_samples
    chunks.append(original_wav[cursor:])

    features = []
    for chunk in chunks:
        if len(chunk) == 0:
            continue
        # Pad very short tails so CQT can run.
        if len(chunk) < hop_length:
            chunk = np.pad(chunk, (0, hop_length - len(chunk)))
        cqt = librosa.cqt(
            chunk,
            sr=sr,
            n_bins=n_bins,
            bins_per_octave=bins_per_octave,
            hop_length=hop_length,
        )
        features.append(cqt)

    feature = np.concatenate(features, axis=1)
    feature = np.log(np.abs(feature) + 1e-6)
    feature_per_second = inst_len / timestep
    song_length_second = float(len(original_wav) / song_hz)
    return feature, feature_per_second, song_length_second
