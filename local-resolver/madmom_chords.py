"""Madmom CNN+CRF chord recognition backend (offline, already in analysis venv)."""


def is_available():
    try:
        from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor  # noqa: F401

        return True
    except Exception:
        return False


def recognize(audio_path):
    from madmom.features.chords import CNNChordFeatureProcessor, CRFChordRecognitionProcessor

    features = CNNChordFeatureProcessor()(audio_path)
    decoded = CRFChordRecognitionProcessor()(features)
    segments = []
    for row in decoded:
        start = float(row[0])
        end = float(row[1])
        label = _normalize_madmom_label(row[2])
        if end <= start:
            continue
        segments.append({"start": start, "end": end, "label": label})
    return segments


def _normalize_madmom_label(label):
    value = str(label or "").strip()
    if not value or value in ("N", "X"):
        return ""
    if ":" not in value:
        return value + ":maj"
    root, quality = value.split(":", 1)
    quality = quality.strip().lower()
    if not quality or quality in ("maj", "major"):
        return root + ":maj"
    if quality in ("min", "minor"):
        return root + ":min"
    if quality in ("7", "dom7"):
        return root + ":7"
    if quality in ("maj7", " maj7"):
        return root + ":maj7"
    if quality in ("min7", "m7"):
        return root + ":min7"
    # Collapse exotic qualities to maj/min for lead-sheet UX.
    if "min" in quality:
        return root + ":min"
    return root + ":maj"
