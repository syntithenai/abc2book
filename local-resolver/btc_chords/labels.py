"""Maj/min chord label tables matching BTC-ISMIR19 checkpoints."""

IDX2CHORD = [
    "C",
    "C:min",
    "C#",
    "C#:min",
    "D",
    "D:min",
    "D#",
    "D#:min",
    "E",
    "E:min",
    "F",
    "F:min",
    "F#",
    "F#:min",
    "G",
    "G:min",
    "G#",
    "G#:min",
    "A",
    "A:min",
    "A#",
    "A#:min",
    "B",
    "B:min",
    "N",
]


def normalize_btc_label(label):
    """Map BTC maj/min labels to colon form used by chord_processing."""
    value = str(label or "").strip()
    if not value or value in ("N", "X"):
        return ""
    if ":" in value:
        root, quality = value.split(":", 1)
        quality = quality.strip().lower()
        if not quality or quality == "maj":
            return root + ":maj"
        if quality == "min":
            return root + ":min"
        return root + ":" + quality
    # Bare root means major in BTC maj/min vocabulary.
    return value + ":maj"
