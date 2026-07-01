import re

CHORD_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

QUALITY_ALIASES = {
    "": "maj",
    "maj": "maj",
    "major": "maj",
    "M": "maj",
    "min": "min",
    "minor": "min",
    "m": "min",
    "7": "7",
    "maj7": "maj7",
    "M7": "maj7",
    "min7": "min7",
    "m7": "min7",
}


def format_key_signature_short(key_text):
    text = str(key_text or "").strip()
    if not text:
        return ""
    key_info = _parse_key_signature(text)
    if not key_info:
        return text
    if key_info["mode"] == "minor":
        return key_info["root"] + "m"
    return key_info["root"]


def _parse_key_signature(key_text):
    text = str(key_text or "").strip()
    if not text:
        return None
    match = re.match(r"^([A-Ga-g])([#b]?)\s*(major|minor|maj|min|m)?$", text)
    if not match:
        match = re.match(r"^([A-Ga-g])([#b]?)(m)?$", text)
    if not match:
        return None
    root = match.group(1).upper()
    accidental = match.group(2) or ""
    if accidental == "#":
        root = root + "#"
    elif accidental == "b":
        root = root.replace("B", "Bb").replace("A", "Ab").replace("G", "Gb").replace("F", "Fb")
        if len(root) == 1:
            root = root + "b"
    mode_group = match.group(3) if len(match.groups()) >= 3 else ""
    mode = "minor" if mode_group and mode_group.lower() in ("m", "min", "minor") else "major"
    return {"root": root, "mode": mode}


def _root_to_index(root):
    root = str(root or "").strip()
    if root in CHORD_ROOTS:
        return CHORD_ROOTS.index(root)
    if root in FLAT_ROOTS:
        return FLAT_ROOTS.index(root)
    return None


def _index_to_root(index, prefer_flats=False):
    names = FLAT_ROOTS if prefer_flats else CHORD_ROOTS
    return names[index % 12]


def _allowed_pitch_classes(key_info):
    if not key_info:
        return set(range(12))
    root_index = _root_to_index(key_info["root"])
    if root_index is None:
        return set(range(12))
    scale = NATURAL_MINOR_SCALE if key_info["mode"] == "minor" else MAJOR_SCALE
    return {(root_index + step) % 12 for step in scale}


def _parse_chord_label(label):
    value = str(label or "").strip()
    if not value or value == "N":
        return None
    match = re.match(r"^([A-G])([#b]?)(.*)$", value)
    if not match:
        return None
    root = match.group(1)
    accidental = match.group(2) or ""
    if accidental == "#":
        root = root + "#"
    elif accidental == "b":
        root = root + "b"
    quality = QUALITY_ALIASES.get((match.group(3) or "").strip(), (match.group(3) or "maj").strip() or "maj")
    if quality not in ("maj", "min", "7", "maj7", "min7"):
        quality = "maj"
    root_index = _root_to_index(root)
    if root_index is None:
        return None
    return {"root_index": root_index, "quality": quality, "label": value}


def _format_chord_label(root_index, quality, prefer_flats=False):
    root = _index_to_root(root_index, prefer_flats=prefer_flats)
    if quality == "min":
        return root + ":min"
    if quality == "7":
        return root + ":7"
    if quality == "maj7":
        return root + ":maj7"
    if quality == "min7":
        return root + ":min7"
    return root + ":maj"


def constrain_chord_label(label, key_info, enabled=True):
    if not enabled or not key_info:
        return label
    parsed = _parse_chord_label(label)
    if not parsed:
        return label
    allowed = _allowed_pitch_classes(key_info)
    if parsed["root_index"] in allowed:
        return label
    nearest = min(
        allowed,
        key=lambda pitch_class: min(
            (pitch_class - parsed["root_index"]) % 12,
            (parsed["root_index"] - pitch_class) % 12,
        ),
    )
    prefer_flats = "b" in str(key_info.get("root", ""))
    return _format_chord_label(nearest, parsed["quality"], prefer_flats=prefer_flats)


def _merge_short_segments(segments, min_duration=0.35):
    if not segments:
        return []
    merged = []
    for segment in segments:
        row = dict(segment)
        if merged and (row["end"] - row["start"]) < min_duration:
            merged[-1]["end"] = row["end"]
            if row.get("label"):
                merged[-1]["label"] = row["label"]
            continue
        if merged and merged[-1].get("label") == row.get("label"):
            merged[-1]["end"] = row["end"]
            continue
        merged.append(row)
    return merged


def _median_smooth_labels(segments, window=3):
    if not segments or window <= 1:
        return segments
    labels = [segment.get("label", "") for segment in segments]
    half = window // 2
    smoothed = []
    for index, segment in enumerate(segments):
        start = max(0, index - half)
        end = min(len(labels), index + half + 1)
        window_labels = [label for label in labels[start:end] if label]
        if not window_labels:
            label = segment.get("label", "")
        else:
            label = max(set(window_labels), key=window_labels.count)
        row = dict(segment)
        row["label"] = label
        smoothed.append(row)
    return smoothed


def smooth_chord_segments(segments, beat_times=None, min_duration=0.35, median_window=3):
    if not segments:
        return []
    rows = [dict(segment) for segment in segments if segment.get("label")]
    rows = _merge_short_segments(rows, min_duration=min_duration)
    rows = _median_smooth_labels(rows, window=median_window)
    if beat_times:
        beat_rows = []
        for index, beat_start in enumerate(beat_times):
            beat_end = beat_times[index + 1] if index + 1 < len(beat_times) else beat_start + 0.5
            midpoint = (float(beat_start) + float(beat_end)) / 2.0
            label = ""
            for segment in rows:
                if segment["start"] <= midpoint < segment["end"]:
                    label = segment.get("label", "")
                    break
            beat_rows.append(label)
        beat_rows = _median_smooth_labels(
            [{"start": beat_times[i], "end": beat_times[i + 1] if i + 1 < len(beat_times) else beat_times[i] + 0.5, "label": beat_rows[i]}
             for i in range(len(beat_times))],
            window=median_window,
        )
        rebuilt = []
        current = None
        for row in beat_rows:
            label = row.get("label", "")
            if current and current["label"] == label:
                current["end"] = row["end"]
                continue
            current = dict(row)
            rebuilt.append(current)
        return rebuilt
    return rows


def post_process_chords(segments, key_text="", constrain_to_key=True, beat_times=None):
    key_info = _parse_key_signature(key_text)
    smoothed = smooth_chord_segments(segments, beat_times=beat_times)
    if not constrain_to_key or not key_info:
        return smoothed
    return [
        dict(segment, label=constrain_chord_label(segment.get("label", ""), key_info, enabled=True))
        for segment in smoothed
    ]
