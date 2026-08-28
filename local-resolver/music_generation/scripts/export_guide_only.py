#!/usr/bin/env python3
"""Export guide.wav (and styled MIDI) without calling Stable Audio.

Use this to listen-check guide quality before tuning prompts or init_noise.

Usage:
  python3 export_guide_only.py --score score.mid --timing-plan plan.json --out /tmp/guide-test
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

from music_generation.fidelity_validation import GUIDE_LISTEN_CHECKLIST, validate_guide_wav
from music_generation.jobs import ensure_job_dir, job_guide_wav, job_score_mid
from music_generation.practice_track import _render_full_score_guide_wav


def main() -> int:
    parser = argparse.ArgumentParser(description="Export practice-track guide WAV only")
    parser.add_argument("--score", type=Path, required=True, help="score.mid (melody-only or full)")
    parser.add_argument("--timing-plan", type=Path, required=True, help="Timing plan JSON")
    parser.add_argument("--out", type=Path, required=True, help="Output directory")
    parser.add_argument("--compare-abcjs", action="store_true", help="Also export abcjs harmony guide")
    args = parser.parse_args()

    plan = json.loads(args.timing_plan.read_text(encoding="utf-8"))
    cache_dir = os.getenv("PRACTICE_TRACK_CACHE_DIR") or "/tmp/practice-track-cache"
    os.environ.setdefault("PRACTICE_TRACK_CACHE_DIR", cache_dir)

    args.out.mkdir(parents=True, exist_ok=True)
    variants: list[tuple[str, dict]] = [("chord_chart", plan)]

    if args.compare_abcjs:
        abcjs_plan = dict(plan)
        abcjs_plan["guideHarmonySource"] = "abcjs"
        abcjs_plan.pop("chordsPerBar", None)
        variants.append(("abcjs", abcjs_plan))

    for label, variant_plan in variants:
        job_id = uuid.uuid4().hex
        ensure_job_dir(job_id)
        score_copy = job_score_mid(job_id)
        shutil.copy2(args.score, score_copy)
        timing = variant_plan.get("timing") or {}
        target = float(timing.get("totalDurationSec") or 30.0)
        boundaries = timing.get("barBoundariesSec") or []
        render_style = str(variant_plan.get("renderStyle") or "trad_session")
        lead = int(variant_plan.get("leadMidiProgram") or 40)
        acc = int(variant_plan.get("accompanimentMidiProgram") or 24)

        guide_path, info = _render_full_score_guide_wav(
            job_id,
            score_copy,
            target,
            bar_boundaries_sec=boundaries,
            lead_program=lead,
            accompaniment_program=acc,
            render_style=render_style,
            timing_plan=variant_plan,
        )
        if not guide_path or not guide_path.is_file():
            print(f"{label}: guide render failed", file=sys.stderr)
            continue

        styled_mid = guide_path.with_name("score-guide-style.mid")
        out_wav = args.out / f"guide-{label}.wav"
        out_mid = args.out / f"guide-{label}.mid"
        shutil.copy2(guide_path, out_wav)
        if styled_mid.is_file():
            shutil.copy2(styled_mid, out_mid)

        meter = str(timing.get("meter") or "4/4")
        quality = validate_guide_wav(
            out_wav,
            meter=meter,
            render_style=render_style,
            harmony_source=str(info.get("guideHarmonySource") or label),
        )
        print(f"\n=== {label} ===")
        print(f"guide.wav -> {out_wav}")
        if out_mid.is_file():
            print(f"guide.mid -> {out_mid}")
        print(json.dumps({"guideInfo": info, "guideQuality": quality}, indent=2))
        print("\nListen checklist:")
        for item in GUIDE_LISTEN_CHECKLIST:
            print(f"  - {item}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
