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


def _allowed_pitch_classes(key_info, include_secondary_dominant=True):
    if not key_info:
        return set(range(12))
    root_index = _root_to_index(key_info["root"])
    if root_index is None:
        return set(range(12))
    scale = NATURAL_MINOR_SCALE if key_info["mode"] == "minor" else MAJOR_SCALE
    allowed = {(root_index + step) % 12 for step in scale}
    if include_secondary_dominant:
        # V of key (dominant) — common secondary colour even when not diatonic in minor.
        allowed.add((root_index + 7) % 12)
    return allowed


def _normalize_quality_token(raw):
    value = str(raw or "").strip().lstrip(":").strip().lower()
    if value in QUALITY_ALIASES:
        return QUALITY_ALIASES[value]
    if value in ("maj", "min", "7", "maj7", "min7"):
        return value
    if value in ("major",):
        return "maj"
    if value in ("minor", "m"):
        return "min"
    if value in ("min7", "m7") or "min7" in value:
        return "min7"
    if value == "maj7" or "maj7" in value:
        return "maj7"
    if value.endswith("7") and "maj" not in value and "min" not in value:
        return "7"
    if "min" in value:
        return "min"
    if not value:
        return "maj"
    return "maj"


def collapse_chord_label(label):
    """Normalize detector labels to maj/min/7 vocabulary used by the app."""
    value = str(label or "").strip()
    if not value or value in ("N", "X"):
        return ""
    parsed = _parse_chord_label(value)
    if not parsed:
        return ""
    return _format_chord_label(parsed["root_index"], parsed["quality"], prefer_flats="b" in value)


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
    quality = _normalize_quality_token(match.group(3) or "")
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
    allowed = _allowed_pitch_classes(key_info, include_secondary_dominant=True)
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


def estimate_key_from_chord_segments(segments):
    """Cheap key guess from chord root histogram + maj/min bias. Returns '' if unsure."""
    major_weights = [0.0] * 12
    minor_weights = [0.0] * 12
    for segment in segments or []:
        parsed = _parse_chord_label(segment.get("label", ""))
        if not parsed:
            continue
        duration = max(0.05, float(segment.get("end", 0) or 0) - float(segment.get("start", 0) or 0))
        root = parsed["root_index"]
        quality = parsed["quality"]
        if quality in ("min", "min7"):
            minor_weights[root] += duration
        else:
            major_weights[root] += duration
    best_score = 0.0
    best_key = ""
    # Score each candidate tonic by how well diatonic roots match weighted usage.
    for tonic in range(12):
        maj_score = 0.0
        min_score = 0.0
        for step in MAJOR_SCALE:
            pc = (tonic + step) % 12
            maj_score += major_weights[pc] + 0.35 * minor_weights[pc]
        for step in NATURAL_MINOR_SCALE:
            pc = (tonic + step) % 12
            min_score += minor_weights[pc] + 0.35 * major_weights[pc]
        # Prefer tonic that also appears as a chord root.
        maj_score += 0.5 * major_weights[tonic]
        min_score += 0.5 * minor_weights[tonic]
        if maj_score > best_score:
            best_score = maj_score
            best_key = _index_to_root(tonic)
        if min_score > best_score:
            best_score = min_score
            best_key = _index_to_root(tonic) + "m"
    if best_score < 0.25:
        return ""
    return best_key


def _segment_duration(segment):
    return max(0.0, float(segment.get("end", 0) or 0) - float(segment.get("start", 0) or 0))


def _merge_short_segments(segments, min_duration=0.35):
    """Merge short flickers into the longer neighbour without adopting the flicker label."""
    if not segments:
        return []
    merged = []
    for segment in segments:
        row = dict(segment)
        duration = _segment_duration(row)
        if merged and duration < min_duration:
            prev = merged[-1]
            prev_duration = _segment_duration(prev)
            # Keep the longer span's label; only adopt short label if previous is also short.
            if prev_duration < min_duration and row.get("label"):
                prev["label"] = row["label"]
            prev["end"] = row["end"]
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


def _change_penalty_smooth(labels, stick_bonus=1.0):
    """Light left-to-right smoother: prefer sticking unless neighbours disagree."""
    if not labels:
        return labels
    result = list(labels)
    for index in range(1, len(result)):
        prev = result[index - 1]
        cur = result[index]
        nxt = result[index + 1] if index + 1 < len(result) else ""
        if not cur:
            result[index] = prev
            continue
        if cur == prev:
            continue
        # Flip back to previous when this beat is an isolated flicker.
        if prev and nxt and prev == nxt and cur != prev:
            result[index] = prev
            continue
        if stick_bonus > 0 and prev and cur != prev and (not nxt or nxt == prev):
            result[index] = prev
    return result


def _grid_step_beats(change_grid, beats_per_bar):
    grid = str(change_grid or "beat").strip().lower()
    bpb = max(1, int(beats_per_bar or 4))
    if grid in ("bar", "measure"):
        return bpb
    if grid in ("half-bar", "halfbar", "half"):
        return max(1, bpb // 2)
    return 1


def _apply_change_grid(beat_rows, change_grid="beat", beats_per_bar=4):
    step = _grid_step_beats(change_grid, beats_per_bar)
    if step <= 1 or not beat_rows:
        return beat_rows
    labels = [row.get("label", "") for row in beat_rows]
    snapped = list(labels)
    for start in range(0, len(labels), step):
        chunk = labels[start:start + step]
        nonzero = [label for label in chunk if label]
        if not nonzero:
            continue
        mode = max(set(nonzero), key=nonzero.count)
        for index in range(start, min(start + step, len(snapped))):
            snapped[index] = mode
    out = []
    for index, row in enumerate(beat_rows):
        item = dict(row)
        item["label"] = snapped[index]
        out.append(item)
    return out


def smooth_chord_segments(
    segments,
    beat_times=None,
    min_duration=0.35,
    median_window=3,
    change_grid="beat",
    beats_per_bar=4,
    change_penalty=True,
):
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
            beat_rows.append({
                "start": float(beat_start),
                "end": float(beat_end),
                "label": label,
            })
        beat_rows = _median_smooth_labels(beat_rows, window=median_window)
        if change_penalty:
            labels = _change_penalty_smooth([row.get("label", "") for row in beat_rows])
            for index, row in enumerate(beat_rows):
                row["label"] = labels[index]
        beat_rows = _apply_change_grid(
            beat_rows,
            change_grid=change_grid,
            beats_per_bar=beats_per_bar,
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


def post_process_chords(
    segments,
    key_text="",
    constrain_to_key=True,
    beat_times=None,
    min_duration=0.35,
    median_window=3,
    change_grid="beat",
    beats_per_bar=4,
    change_penalty=True,
):
    key_info = _parse_key_signature(key_text)
    normalized = []
    for segment in segments or []:
        row = dict(segment)
        row["label"] = collapse_chord_label(row.get("label", ""))
        if row["label"]:
            normalized.append(row)
    smoothed = smooth_chord_segments(
        normalized,
        beat_times=beat_times,
        min_duration=min_duration,
        median_window=median_window,
        change_grid=change_grid,
        beats_per_bar=beats_per_bar,
        change_penalty=change_penalty,
    )
    if not constrain_to_key or not key_info:
        return smoothed
    return [
        dict(segment, label=constrain_chord_label(segment.get("label", ""), key_info, enabled=True))
        for segment in smoothed
    ]
