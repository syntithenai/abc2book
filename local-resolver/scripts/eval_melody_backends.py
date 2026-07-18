#!/usr/bin/env python3
"""Compare melody backends on one audio file (A/B smoke eval)."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile


def run_melody(python_bin, audio_path, backend, music_type="vocal"):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script = os.path.join(root, "detect_melody.py")
    config = {
        "melodyBackend": backend,
        "musicType": music_type,
        "sourceSeparation": "off",
        "confidenceThreshold": 0.4,
        "minNoteSeconds": 0.08,
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
        json.dump(config, handle)
        config_path = handle.name
    try:
        result = subprocess.run(
            [python_bin, script, audio_path, config_path],
            capture_output=True,
            text=True,
            cwd=root,
            env={
                **os.environ,
                "PYTHONPATH": root
                + (os.pathsep + os.environ["PYTHONPATH"] if os.environ.get("PYTHONPATH") else ""),
            },
        )
    finally:
        try:
            os.unlink(config_path)
        except FileNotFoundError:
            pass
    if result.returncode != 0:
        return {
            "backend": backend,
            "error": (result.stderr or result.stdout or "detect_melody failed").strip()[:500],
        }
    payload = json.loads(result.stdout)
    notes = payload.get("notes") or []
    return {
        "backend": payload.get("backend") or backend,
        "noteCount": len(notes),
        "candidateCount": len(payload.get("candidateNotes") or []),
        "detectedKey": payload.get("detectedKey") or payload.get("key") or "",
        "duration": payload.get("duration", 0),
        "pitchHistogram": _pitch_histogram(notes),
    }


def _pitch_histogram(notes):
    counts = {}
    for note in notes:
        midi = int(note.get("midi") or 0) % 12
        counts[str(midi)] = counts.get(str(midi), 0) + 1
    return counts


def main():
    parser = argparse.ArgumentParser(description="A/B compare melody backends")
    parser.add_argument("audio", help="Path to an audio file")
    parser.add_argument(
        "--backends",
        default="auto,basic-pitch,kong,mt3,crepe",
        help="Comma-separated backends to try",
    )
    parser.add_argument("--music-type", default="vocal", help="vocal|instrumental|piano")
    parser.add_argument("--python", default=os.getenv("AUTOCHORD_VENV_PYTHON", "python3"))
    args = parser.parse_args()

    report = {
        "audio": args.audio,
        "musicType": args.music_type,
        "results": [],
    }
    for backend in [part.strip() for part in args.backends.split(",") if part.strip()]:
        report["results"].append(run_melody(args.python, args.audio, backend, args.music_type))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
