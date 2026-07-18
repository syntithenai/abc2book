#!/usr/bin/env python3
"""Chord A/B eval: compare backends and optionally score against .lab ground truth."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile


ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def run_detect(python_bin, audio_path, backend, beat_times=None, tempo=None):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script = os.path.join(root, "detect_chords.py")
    config = {"chordBackend": backend, "constrainChordsToKey": False}
    if beat_times:
        config["beatTimes"] = beat_times
    if tempo is not None:
        config["tempo"] = tempo
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
        json.dump(config, handle)
        config_path = handle.name
    try:
        result = subprocess.run(
            [python_bin, script, audio_path, config_path],
            capture_output=True,
            text=True,
            cwd=root,
            env={**os.environ, "PYTHONPATH": root + (os.pathsep + os.environ["PYTHONPATH"] if os.environ.get("PYTHONPATH") else "")},
        )
    finally:
        try:
            os.unlink(config_path)
        except FileNotFoundError:
            pass
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "detect_chords failed").strip())
    return json.loads(result.stdout)


def parse_lab(path):
    segments = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 3:
                continue
            start = float(parts[0])
            end = float(parts[1])
            label = " ".join(parts[2:])
            segments.append({"start": start, "end": end, "label": label})
    return segments


def _root_index(label):
    value = str(label or "").strip()
    if not value or value in ("N", "X"):
        return None
    root = value.split(":", 1)[0].split("m", 1)[0]
    if len(root) >= 2 and root[1] in "#b":
        token = root[:2]
    else:
        token = root[:1]
    if token in ROOTS:
        return ROOTS.index(token)
    if token in FLAT_ROOTS:
        return FLAT_ROOTS.index(token)
    return None


def _is_minor(label):
    value = str(label or "").strip().lower()
    if ":" in value:
        quality = value.split(":", 1)[1]
        return quality.startswith("min") or quality == "m"
    return value.endswith("m") and not value.endswith("maj")


def label_at(segments, time):
    for segment in segments:
        if float(segment["start"]) <= time < float(segment["end"]):
            return segment.get("label") or ""
    return ""


def score_against_lab(estimated, reference, sample_hz=10.0):
    if not reference:
        return None
    duration = max(float(segment["end"]) for segment in reference)
    if duration <= 0:
        return None
    step = 1.0 / max(sample_hz, 1.0)
    total = 0
    root_hits = 0
    majmin_hits = 0
    t = 0.0
    while t < duration:
        ref = label_at(reference, t)
        est = label_at(estimated, t)
        total += 1
        ref_root = _root_index(ref)
        est_root = _root_index(est)
        if ref_root is None and est_root is None:
            root_hits += 1
            majmin_hits += 1
        elif ref_root is not None and ref_root == est_root:
            root_hits += 1
            if (not ref or not est) or (_is_minor(ref) == _is_minor(est)):
                majmin_hits += 1
        t += step
    if total == 0:
        return None
    return {
        "sampleCount": total,
        "rootAccuracy": root_hits / total,
        "majMinAccuracy": majmin_hits / total,
    }


def summarize(payload):
    segments = payload.get("segments") or []
    labels = [segment.get("label", "") for segment in segments if segment.get("label")]
    return {
        "segmentCount": len(segments),
        "uniqueLabels": sorted(set(labels)),
        "tempo": payload.get("tempo", 0),
        "backend": payload.get("backend", ""),
        "duration": payload.get("duration", 0),
        "segments": segments,
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate chord backends")
    parser.add_argument("audio", help="Path to an audio file")
    parser.add_argument(
        "--python",
        default=os.getenv("AUTOCHORD_VENV_PYTHON", "python3"),
        help="Python binary with chord deps",
    )
    parser.add_argument(
        "--backends",
        default="auto,btc,madmom,autochord",
        help="Comma-separated backends to try",
    )
    parser.add_argument("--lab", default="", help="Optional ground-truth .lab file")
    parser.add_argument(
        "--snapshot",
        default="",
        help="Optional directory to write per-backend JSON snapshots",
    )
    args = parser.parse_args()

    reference = parse_lab(args.lab) if args.lab else []
    if args.snapshot:
        os.makedirs(args.snapshot, exist_ok=True)

    report = {"audio": args.audio, "lab": args.lab or None, "backends": {}}
    for backend in [item.strip() for item in args.backends.split(",") if item.strip()]:
        entry = {"backend": backend}
        try:
            payload = run_detect(args.python, args.audio, backend)
            summary = summarize(payload)
            entry.update(summary)
            if reference:
                entry["scores"] = score_against_lab(payload.get("segments") or [], reference)
            if args.snapshot:
                out_path = os.path.join(args.snapshot, f"{backend}.json")
                with open(out_path, "w", encoding="utf-8") as handle:
                    json.dump(payload, handle, indent=2)
                entry["snapshot"] = out_path
        except Exception as exc:
            entry["error"] = str(exc)
        report["backends"][backend] = entry

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
