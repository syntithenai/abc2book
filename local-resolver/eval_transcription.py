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
        "pitchClasses": sorted({int(note.get("midi") or 0) % 12 for note in notes}),
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate local transcription pipeline pieces")
    parser.add_argument("audio", help="Path to an audio file")
    parser.add_argument("--python", default=os.getenv("AUTOCHORD_VENV_PYTHON", "python3"))
    parser.add_argument("--melody-config", default="", help="Optional melody config JSON path")
    parser.add_argument("--chord-config", default="", help="Optional chord config JSON path")
    parser.add_argument(
        "--melody-backends",
        default="",
        help="Optional comma-separated melody backends to A/B (runs detect_melody once each)",
    )
    parser.add_argument("--music-type", default="vocal")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    report = {"audio": args.audio}

    if args.melody_backends:
        backend_results = []
        for backend in [part.strip() for part in args.melody_backends.split(",") if part.strip()]:
            config = {
                "melodyBackend": backend,
                "musicType": args.music_type,
                "sourceSeparation": "off",
            }
            import tempfile

            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
                json.dump(config, handle)
                config_path = handle.name
            try:
                melody = run_json([args.python, os.path.join(script_dir, "detect_melody.py"), args.audio, config_path])
                backend_results.append(summarize_melody(melody))
            except Exception as exc:
                backend_results.append({"backend": backend, "error": str(exc)})
            finally:
                try:
                    os.unlink(config_path)
                except FileNotFoundError:
                    pass
        report["melodyBackends"] = backend_results
    else:
        melody_cmd = [args.python, os.path.join(script_dir, "detect_melody.py"), args.audio]
        if args.melody_config:
            melody_cmd.append(args.melody_config)
        melody = run_json(melody_cmd)
        report["melody"] = summarize_melody(melody)

    chord_cmd = [args.python, os.path.join(script_dir, "detect_chords.py"), args.audio]
    if args.chord_config:
        chord_cmd.append(args.chord_config)
    chords = run_json(chord_cmd)
    report["chords"] = summarize_chords(chords)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
