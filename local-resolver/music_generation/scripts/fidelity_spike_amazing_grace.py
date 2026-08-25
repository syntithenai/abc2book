#!/usr/bin/env python3
"""Fidelity spike: Amazing Grace at init_noise 0.30/0.38/0.45 and AceStep cover.

Requires PRACTICE_TRACK_PROVIDER=audio_cpp and a running audio.cpp sidecar.
Usage:
  PRACTICE_TRACK_PROVIDER=audio_cpp python3 fidelity_spike_amazing_grace.py \\
    --abc "/path/to/Amazing Grace.abc" \\
    --score score.mid --melody melody.wav
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from music_generation.jobs import ensure_job_dir, job_output_wav, job_timing_plan_path
from music_generation.practice_track import run_practice_track_job, save_job_inputs
from music_generation.task_catalog import TASK_PRACTICE_TRACK, resolve_preset


def _load_timing_plan(path: Path | None) -> dict:
    if path and path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {
        "title": "Amazing Grace",
        "musical": {"tempoBpm": 100, "meter": "3/4", "key": "G", "rhythm": "waltz"},
        "timing": {
            "tempoBpm": 100,
            "meter": "3/4",
            "totalDurationSec": 86.0,
            "barBoundariesSec": [i * 1.8 for i in range(18)],
            "source": "spike",
            "sections": [],
            "repeatSchedule": [],
        },
        "backingPrompt": (
            "100 BPM, 3/4, orchestrate this exact performance, preserve melody and "
            "chord changes from the guide, Irish Scottish trad session accompaniment only, "
            "acoustic guitar chords, bodhrán, rhythm section, key of G, dry mix"
        ),
        "backingNegativePrompt": (
            "piano, general midi, cheap synthesizer, oom pah, muzak strings, vocals"
        ),
        "guideAudioConditioning": True,
        "includeStyleMelodyStem": False,
        "mixDrumGuide": False,
        "includeDrumGuide": False,
        "renderStyle": "trad_session",
    }


def _run_variant(
    label: str,
    timing_plan: dict,
    melody_path: Path,
    score_path: Path | None,
    chord_path: Path | None,
    *,
    preset_id: str = "fast",
    init_noise: float | None = None,
    guide_engine: str = "stable_audio",
) -> dict:
    job_id = uuid.uuid4().hex
    plan = dict(timing_plan)
    plan["presetId"] = preset_id
    plan["spikeLabel"] = label
    if init_noise is not None:
        plan["initNoiseLevel"] = init_noise
    plan["guideEngine"] = guide_engine

    save_job_inputs(
        job_id,
        plan,
        melody_path.read_bytes(),
        chord_bytes=chord_path.read_bytes() if chord_path and chord_path.is_file() else None,
        score_bytes=score_path.read_bytes() if score_path and score_path.is_file() else None,
    )

    print(f"\n=== Spike {label} (preset={preset_id}, noise={init_noise}, engine={guide_engine}) ===")
    result = run_practice_track_job(
        job_id,
        plan,
        melody_path,
        chord_path=chord_path,
        score_path=score_path,
    )
    fidelity = (result.get("validation") or {}).get("fidelity") or {}
    print(json.dumps({
        "jobId": job_id,
        "output": str(job_output_wav(job_id)),
        "initNoiseLevel": (result.get("validation") or {}).get("initNoiseLevel"),
        "guideEngine": (result.get("validation") or {}).get("guideEngine"),
        "fidelity": fidelity,
    }, indent=2))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Amazing Grace fidelity spike")
    parser.add_argument("--abc", type=Path, help="ABC file (informational)")
    parser.add_argument("--melody", type=Path, required=True, help="Client melody WAV")
    parser.add_argument("--score", type=Path, help="score.mid with melody + chords")
    parser.add_argument("--chords", type=Path, help="Optional chord layer WAV")
    parser.add_argument("--timing-plan", type=Path, help="JSON timing plan override")
    parser.add_argument("--skip-stable", action="store_true")
    parser.add_argument("--skip-ace", action="store_true")
    args = parser.parse_args()

    if args.abc and args.abc.is_file():
        print(f"ABC: {args.abc}")

    timing_plan = _load_timing_plan(args.timing_plan)
    cache_dir = os.getenv("PRACTICE_TRACK_CACHE_DIR") or "/tmp/practice-track-cache"
    os.environ.setdefault("PRACTICE_TRACK_CACHE_DIR", cache_dir)
    ensure_job_dir(uuid.uuid4().hex)

    resolve_preset(TASK_PRACTICE_TRACK, "fast")
    results: list[dict] = []

    if not args.skip_stable:
        for noise in (0.30, 0.38, 0.45):
            results.append(_run_variant(
                f"sa-noise-{noise:.2f}".replace(".", ""),
                timing_plan,
                args.melody,
                args.score,
                args.chords,
                preset_id="balanced",
                init_noise=noise,
                guide_engine="stable_audio",
            ))

    if not args.skip_ace:
        results.append(_run_variant(
            "ace-cover",
            timing_plan,
            args.melody,
            args.score,
            args.chords,
            preset_id="ace_fidelity",
            guide_engine="ace_step",
        ))

    summary_path = Path(cache_dir) / "fidelity-spike-summary.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nSummary written to {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
