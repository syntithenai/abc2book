#!/usr/bin/env python3
"""Thin practice warmup analysis: pitch contour aligned to expected notes."""

import json
import os
import sys
import tempfile

import numpy as np
import soundfile as sf

from melody_pitch_processing import (
    hz_to_midi,
    segment_notes_from_contour,
    _pitch_close,
)

DEFAULT_TOLERANCE = 0.55


def _load_audio(path):
    y, sr = sf.read(path, always_2d=False)
    if y.ndim > 1:
        y = np.mean(y, axis=1)
    return np.asarray(y, dtype=float), int(sr)


def _run_pitch_contour(y, sr):
    backend = os.getenv("PRACTICE_PITCH_BACKEND", "pyin")
    times = []
    frequency = []
    confidence = []
    try:
        if backend == "crepe":
            import crepe

            step = 64 / sr
            time_base, f0, conf, _ = crepe.predict(y, sr, step_size=64, verbose=0)
            times = time_base.tolist()
            frequency = f0.tolist()
            confidence = conf.tolist()
        else:
            import librosa

            f0, voiced_flag, voiced_prob = librosa.pyin(
                y,
                fmin=librosa.note_to_hz("C2"),
                fmax=librosa.note_to_hz("C7"),
                sr=sr,
            )
            frame_times = librosa.times_like(f0, sr=sr)
            times = frame_times.tolist()
            frequency = np.nan_to_num(f0, nan=0.0).tolist()
            confidence = np.where(voiced_flag, voiced_prob, 0.0).tolist()
    except Exception as exc:
        return {"error": str(exc), "times": [], "frequency": [], "confidence": []}
    return {
        "times": times,
        "frequency": frequency,
        "confidence": confidence,
        "backend": backend,
    }


def _align_to_expected(detected_notes, expected_notes, tolerance):
    expected = expected_notes or []
    if not expected:
        return {"pitchPct": 0, "hits": 0, "totalNotes": 0, "missed": 0, "perNote": []}

    hits = 0
    per_note = []
    for exp in expected:
        exp_midi = exp.get("midi")
        start = float(exp.get("startSec", 0))
        end = float(exp.get("endSec", start + 0.25))
        match = None
        for note in detected_notes:
            if note.get("start", 0) >= start - 0.05 and note.get("end", 0) <= end + 0.15:
                if _pitch_close(note.get("midi"), exp_midi, tolerance):
                    match = note
                    break
            elif note.get("start", 0) <= end and note.get("end", 0) >= start:
                if _pitch_close(note.get("midi"), exp_midi, tolerance):
                    match = note
                    break
        hit = match is not None
        if hit:
            hits += 1
        per_note.append(
            {
                "midi": exp_midi,
                "hit": hit,
                "missed": not hit,
            }
        )
    total = len(expected)
    pitch_pct = int(round((hits / total) * 100)) if total else 0
    return {
        "pitchPct": pitch_pct,
        "hits": hits,
        "totalNotes": total,
        "missed": total - hits,
        "perNote": per_note,
    }


def analyze_practice(audio_path, config):
    y, sr = _load_audio(audio_path)
    contour = _run_pitch_contour(y, sr)
    if contour.get("error"):
        return {"error": contour["error"], "backend": contour.get("backend", "")}

    processing = {
        "confidenceThreshold": float(config.get("confidenceThreshold", 0.55)),
        "minNoteSeconds": float(config.get("minNoteSeconds", 0.12)),
        "pitchToleranceSemitones": float(config.get("pitchToleranceSemitones", DEFAULT_TOLERANCE)),
    }
    notes = segment_notes_from_contour(
        contour["times"],
        contour["frequency"],
        contour["confidence"],
        processing,
    )
    expected = config.get("expectedNotes") or []
    result = _align_to_expected(notes, expected, processing["pitchToleranceSemitones"])
    result["backend"] = contour.get("backend", "")
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: analyze_practice.py <audio> [config.json]"}))
        sys.exit(1)
    audio_path = sys.argv[1]
    config = {}
    if len(sys.argv) >= 3 and sys.argv[2]:
        with open(sys.argv[2], "r", encoding="utf-8") as handle:
            config.update(json.load(handle))
    result = analyze_practice(audio_path, config)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
