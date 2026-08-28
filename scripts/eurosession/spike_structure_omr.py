#!/usr/bin/env python3
"""Offline spike: run CV (+ optional alt) structure detection on staff crops.

Does not require Audiveris. Set STRUCTURE_ALT_OMR_CMD to exercise the alt probe.

Examples:
  python3 scripts/eurosession/spike_structure_omr.py \\
    scrape/ukrainian-dance-nign/staff-*.png

  STRUCTURE_ALT_OMR_CMD='python3 scripts/eurosession/structure_alt_omr_stub.py --image {image} --bars {bars}' \\
    python3 scripts/eurosession/spike_structure_omr.py scrape/ukrainian-dance-nign/staff-1.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "local-resolver"))

from sheet_image_structure import (  # noqa: E402
    detect_structure_alternate,
    detect_structure_cv,
    detect_structure_on_staff_crop,
    merge_structure_events,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", help="Staff crop PNG paths")
    parser.add_argument("--bars", type=int, default=8, help="Default bar count per system")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    args = parser.parse_args()

    rows = []
    for img in args.images:
        path = Path(img)
        if not path.is_file():
            print(f"missing: {path}", file=sys.stderr)
            continue
        cv = detect_structure_cv(str(path), args.bars)
        alt = detect_structure_alternate(str(path), args.bars)
        merged = merge_structure_events(cv, alt)
        full = detect_structure_on_staff_crop(str(path), args.bars)
        row = {
            "image": str(path),
            "bars": args.bars,
            "cv": [e.to_dict() for e in cv],
            "alt": [e.to_dict() for e in alt],
            "merged": [e.to_dict() for e in merged],
            "detect": [e.to_dict() for e in full],
        }
        rows.append(row)
        if not args.json:
            print(f"\n== {path.name} (bars={args.bars}) ==")
            print(f"  cv:     {[ (e.kind, e.measure_index, round(e.confidence, 2)) for e in cv ]}")
            print(f"  alt:    {[ (e.kind, e.measure_index, round(e.confidence, 2)) for e in alt ]}")
            print(f"  merged: {[ (e.kind, e.measure_index, e.source) for e in merged ]}")

    if args.json:
        print(json.dumps(rows, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
