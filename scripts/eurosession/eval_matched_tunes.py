#!/usr/bin/env python3
"""Score all MSCZ index-matched import tunes against MXL (offline oracle).

Uses mxl_title_join.json spans + seed K/M; does not require TUNE_MAP membership.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from eval_omr_vs_mxl import load_abc_for_title, load_score, score_tune


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--join-json", default="/home/stever/Downloads/eurosession-work/mxl_title_join.json")
    parser.add_argument("--min-score", type=float, default=0.72, help="Min fuzzy join score")
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    root = load_score(Path(args.mxl))
    manifest = json.loads((Path(args.work) / "manifest.json").read_text(encoding="utf-8"))
    join = json.loads(Path(args.join_json).read_text(encoding="utf-8"))

    print(
        f"{'title':36} {'pc':>5} {'ch':>5} {'st':>5} {'rh':>5} "
        f"{'bars':>7} {'mode':>28} {'K':>4} {'M':>4}"
    )
    rows: list[dict] = []
    for entry in join:
        m = entry.get("match") or {}
        if (m.get("match_score") or 0) < args.min_score:
            continue
        title = str(entry.get("import_title") or "")
        abc = load_abc_for_title(manifest, title)
        if not abc.strip():
            print(f"{title[:36]:36} MISSING_ABC")
            continue
        key = str(m.get("seedKey") or m.get("mxlKey") or "C")
        meter = str(m.get("seedMeter") or m.get("mxlMeter") or "4/4")
        m0, m1 = int(m["m0"]), int(m["m1"])
        row = score_tune(root, title, m0, m1, key, meter, abc)
        tune = next((t for t in manifest.get("tunes") or [] if t.get("title") == title), {})
        status = tune.get("omrPlusStatus") or {}
        if isinstance(status, dict):
            enh = status.get("enhancedOmr") or {}
            mode = str(enh.get("mode") or "") if isinstance(enh, dict) else ""
        else:
            mode = ""
        if not mode:
            omr_plus = next(
                (c for c in (tune.get("candidates") or []) if c.get("source") == "omr+"),
                None,
            )
            if omr_plus:
                enh = omr_plus.get("enhancedOmr") or {}
                mode = str(enh.get("mode") or "") if isinstance(enh, dict) else ""
        row["omrMode"] = mode or "?"
        row["joinScore"] = m.get("match_score")
        rows.append(row)
        kmark = "ok" if row["K_ok"] else "!"
        mmark = "ok" if row["M_ok"] else "!"
        print(
            f"{title[:36]:36} {row['pc_r']:5.2f} {row['ch_r']:5.2f} {row['st_f1']:5.2f} "
            f"{row['rhythm_r']:5.2f} {row['bars_abc']:3d}/{row['bars_mxl']:<3} "
            f"{mode:>28} {kmark:>4} {mmark:>4}"
        )

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"wrote {args.json_out}")

    good = [r for r in rows if r["pc_r"] >= 0.70 and abs(r["bar_err"]) <= 8]
    strong = [r for r in rows if r["pc_r"] >= 0.85 and r["rhythm_r"] >= 0.70]
    print(f"\n{len(rows)} matched; pc≥0.70 & bar_err≤8: {len(good)}; pc≥0.85 & rh≥0.70: {len(strong)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
