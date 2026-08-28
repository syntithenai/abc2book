#!/usr/bin/env python3
"""Beauty spike: compare abcjs vs chord-chart guides × styles × presets.

Requires PRACTICE_TRACK_PROVIDER=audio_cpp (or mock) and FluidSynth for guides.
Usage:
  python3 fidelity_spike_amazing_grace.py \\
    --melody melody.wav --score score.mid --timing-plan plan.json \\
    --out /tmp/beauty-spike
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from music_generation.fidelity_validation import GUIDE_LISTEN_CHECKLIST
from music_generation.jobs import (
    ensure_job_dir,
    job_guide_wav,
    job_output_wav,
    job_score_mid,
    job_section_backing_wav,
)
from music_generation.practice_track import run_practice_track_job, save_job_inputs
from music_generation.task_catalog import TASK_PRACTICE_TRACK, resolve_preset


def _load_timing_plan(path: Path | None) -> dict:
    if path and path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    boundaries = [i * 1.8 for i in range(49)]
    mid = boundaries[24]
    return {
        "title": "Amazing Grace",
        "musical": {"tempoBpm": 100, "meter": "3/4", "key": "G", "rhythm": "waltz"},
        "timing": {
            "tempoBpm": 100,
            "meter": "3/4",
            "totalDurationSec": 86.4,
            "barBoundariesSec": boundaries,
            "source": "spike",
            "sections": [
                {
                    "id": "strain-A",
                    "strainLabel": "A",
                    "startTimeSec": 0.0,
                    "endTimeSec": mid,
                    "durationSec": mid,
                    "startBar": 0,
                    "endBar": 23,
                },
                {
                    "id": "strain-B",
                    "strainLabel": "B",
                    "startTimeSec": mid,
                    "endTimeSec": 86.4,
                    "durationSec": 86.4 - mid,
                    "startBar": 24,
                    "endBar": 47,
                },
            ],
            "repeatSchedule": [],
        },
        "chordsPerBar": (["G", "G", "C", "G", "G", "D", "G", "G"] * 6),
        "guideHarmonySource": "chord_chart",
        "renderStyle": "classical",
        "guideAudioConditioning": True,
        "includeStyleMelodyStem": False,
        "mixDrumGuide": False,
        "includeDrumGuide": False,
        "leadMidiProgram": 40,
        "accompanimentMidiProgram": 48,
        "initNoiseLevel": 0.22,
        "backingPrompt": "100 BPM, 3/4, classical chamber strings, key of G",
        "backingNegativePrompt": "organ, oom pah, general midi, ambient wash, dropout",
    }


def _run_variant(
    label: str,
    timing_plan: dict,
    melody_path: Path,
    score_path: Path | None,
    out_dir: Path,
    *,
    preset_id: str = "balanced",
    skip_ai: bool = False,
) -> dict:
    job_id = uuid.uuid4().hex
    plan = dict(timing_plan)
    plan["presetId"] = preset_id
    plan["spikeLabel"] = label

    save_job_inputs(
        job_id,
        plan,
        melody_path.read_bytes(),
        score_bytes=score_path.read_bytes() if score_path and score_path.is_file() else None,
    )

    print(f"\n=== Spike {label} (preset={preset_id}) ===")
    if skip_ai or os.getenv("PRACTICE_TRACK_PROVIDER") == "mock":
        from music_generation.practice_track import _render_full_score_guide_wav

        score_copy = job_score_mid(job_id)
        timing = plan.get("timing") or {}
        target = float(timing.get("totalDurationSec") or 30.0)
        guide_path, guide_info = _render_full_score_guide_wav(
            job_id,
            score_copy,
            target,
            bar_boundaries_sec=timing.get("barBoundariesSec") or [],
            lead_program=int(plan.get("leadMidiProgram") or 40),
            accompaniment_program=int(plan.get("accompanimentMidiProgram") or 48),
            render_style=str(plan.get("renderStyle") or "trad_session"),
            timing_plan=plan,
        )
        result = {
            "jobId": job_id,
            "guide": str(guide_path) if guide_path else None,
            "validation": {"guideInfo": guide_info, "guideQuality": guide_info.get("guideQuality")},
        }
    else:
        result = run_practice_track_job(
            job_id,
            plan,
            melody_path,
            score_path=score_path,
        )

    variant_dir = out_dir / label
    variant_dir.mkdir(parents=True, exist_ok=True)
    guide_src = job_guide_wav(job_id)
    output_src = job_output_wav(job_id)
    if guide_src.is_file():
        shutil.copy2(guide_src, variant_dir / "guide.wav")
    if output_src.is_file():
        shutil.copy2(output_src, variant_dir / "output.wav")
    # Dump per-chunk/section WAVs when present (mid-track debug).
    for index in range(8):
        section = job_section_backing_wav(job_id, index)
        if section.is_file():
            shutil.copy2(section, variant_dir / f"chunk-{index}.wav")
            guide_slice = section.with_suffix(".guide.wav")
            if guide_slice.is_file():
                shutil.copy2(guide_slice, variant_dir / f"chunk-{index}-guide.wav")

    summary = {
        "label": label,
        "jobId": job_id,
        "guide": str(variant_dir / "guide.wav") if guide_src.is_file() else None,
        "output": str(variant_dir / "output.wav") if output_src.is_file() else None,
        "validation": result.get("validation") or {},
        "listenChecklist": GUIDE_LISTEN_CHECKLIST,
    }
    print(json.dumps(summary, indent=2))
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Practice-track beauty spike matrix")
    parser.add_argument("--melody", type=Path, required=True)
    parser.add_argument("--score", type=Path, help="Melody-only or full score.mid")
    parser.add_argument("--timing-plan", type=Path, help="Timing plan JSON")
    parser.add_argument("--out", type=Path, default=Path("/tmp/beauty-spike"))
    parser.add_argument("--guide-only", action="store_true", help="Skip Stable Audio (guide export only)")
    parser.add_argument("--styles", nargs="*", default=["classical", "trad_session"])
    parser.add_argument("--presets", nargs="*", default=["balanced", "high"])
    args = parser.parse_args()

    base_plan = _load_timing_plan(args.timing_plan)
    cache_dir = os.getenv("PRACTICE_TRACK_CACHE_DIR") or "/tmp/practice-track-cache"
    os.environ.setdefault("PRACTICE_TRACK_CACHE_DIR", cache_dir)
    ensure_job_dir(uuid.uuid4().hex)
    args.out.mkdir(parents=True, exist_ok=True)

    for preset_id in args.presets:
        resolve_preset(TASK_PRACTICE_TRACK, preset_id)

    results: list[dict] = []
    harmony_sources = ("chord_chart", "abcjs")
    for harmony in harmony_sources:
        for style in args.styles:
            for preset_id in args.presets:
                plan = dict(base_plan)
                plan["renderStyle"] = style
                plan["guideHarmonySource"] = harmony
                if harmony == "abcjs":
                    plan.pop("chordsPerBar", None)
                elif not plan.get("chordsPerBar"):
                    plan["chordsPerBar"] = ["G", "C", "D", "G"]
                if style == "classical":
                    plan["leadMidiProgram"] = 40
                    plan["accompanimentMidiProgram"] = 48
                    plan["initNoiseLevel"] = 0.22
                else:
                    plan["leadMidiProgram"] = 40
                    plan["accompanimentMidiProgram"] = 24
                    plan["initNoiseLevel"] = 0.28
                label = f"{harmony}_{style}_{preset_id}"
                results.append(_run_variant(
                    label,
                    plan,
                    args.melody,
                    args.score,
                    args.out,
                    preset_id=preset_id,
                    skip_ai=args.guide_only,
                ))

    summary_path = args.out / "beauty-spike-summary.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nSummary written to {summary_path}")
    print("\nShip when chord_chart + balanced/high passes listen checklist on guide AND output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
