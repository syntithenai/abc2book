#!/usr/bin/env python3
"""Offline: dump MXL harmony onsets vs OMR+ quote-chords for calibration.

Does not modify runtime code — prints per-bar chord alignment diagnostics.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_omr_vs_mxl import (  # noqa: E402
    TUNE_MAP,
    abc_chords,
    load_abc_for_title,
    load_score,
    mxl_chords_and_pcs,
    ratio,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--title", default="Ukrainian Dance Nign")
    args = parser.parse_args()
    if args.title not in TUNE_MAP:
        print(f"unknown title; choose from {list(TUNE_MAP)}")
        return 1
    m0, m1, _k, _m = TUNE_MAP[args.title]
    root = load_score(Path(args.mxl))
    manifest = json.loads((Path(args.work) / "manifest.json").read_text(encoding="utf-8"))
    abc = load_abc_for_title(manifest, args.title)
    ref_ch, _ = mxl_chords_and_pcs(root, m0, m1)
    omr_ch = abc_chords(abc)
    print(f"{args.title} mm {m0}-{m1}")
    print(f"mxl ({len(ref_ch)}): {' '.join(ref_ch)}")
    print(f"omr ({len(omr_ch)}): {' '.join(omr_ch)}")
    print(f"ratio={ratio(omr_ch, ref_ch):.3f}")
    # Position diffs
    n = max(len(ref_ch), len(omr_ch))
    misses = 0
    for i in range(n):
        a = ref_ch[i] if i < len(ref_ch) else "—"
        b = omr_ch[i] if i < len(omr_ch) else "—"
        mark = " " if a.lower() == b.lower() else "!"
        if mark == "!":
            misses += 1
        if mark == "!" or i < 12:
            print(f"  {i:3d} {mark} mxl={a:6s} omr={b}")
    print(f"positional mismatches (aligned by index): {misses}/{n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
