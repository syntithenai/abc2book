#!/usr/bin/env python3
"""Smoke/eval helper for lyrics, chords, and melody detectors."""

import argparse
import json
import os
import subprocess
import sys


def run_json(command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "command failed").strip())
    return json.loads(result.stdout)


def summarize_lyrics(payload):
    segments = payload.get("segments") or []
    words = sum(len(segment.get("words") or []) for segment in segments)
    return {
        "textChars": len(payload.get("text") or ""),
        "segmentCount": len(segments),
        "wordCount": words,
        "backend": payload.get("backend", ""),
    }


def summarize_chords(payload):
    segments = payload.get("segments") or []
    labels = [segment.get("label", "") for segment in segments if segment.get("label")]
    return {
        "segmentCount": len(segments),
        "uniqueLabels": sorted(set(labels)),
        "tempo": payload.get("tempo", 0),
        "backend": payload.get("backend", ""),
    }


def summarize_melody(payload):
    notes = payload.get("notes") or []
    candidates = payload.get("candidateNotes") or []
    return {
        "noteCount": len(notes),
        "candidateCount": len(candidates),
        "detectedKey": payload.get("detectedKey") or payload.get("key") or "",
        "backend": payload.get("backend", ""),
        "duration": payload.get("duration", 0),
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate local transcription pipeline pieces")
    parser.add_argument("audio", help="Path to an audio file")
    parser.add_argument("--python", default=os.getenv("AUTOCHORD_VENV_PYTHON", "python3"))
    parser.add_argument("--melody-config", default="", help="Optional melody config JSON path")
    parser.add_argument("--chord-config", default="", help="Optional chord config JSON path")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    melody_cmd = [args.python, os.path.join(script_dir, "detect_melody.py"), args.audio]
    chord_cmd = [args.python, os.path.join(script_dir, "detect_chords.py"), args.audio]
    if args.melody_config:
        melody_cmd.append(args.melody_config)
    if args.chord_config:
        chord_cmd.append(args.chord_config)

    melody = run_json(melody_cmd)
    chords = run_json(chord_cmd)

    report = {
        "audio": args.audio,
        "melody": summarize_melody(melody),
        "chords": summarize_chords(chords),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
