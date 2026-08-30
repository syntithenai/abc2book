#!/usr/bin/env python3
"""Evaluate structure CV spike against eval_omr_vs_mxl weak-structure tunes.

Finds TUNE_MAP entries annotated with low st= in comments, locates crops under
``--work``, and runs ``spike_structure_omr`` structure detection for comparison.

Does not modify runtime transcribe code — offline diagnostics only.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_omr_vs_mxl import TUNE_MAP  # noqa: E402


def parse_st_f1_from_comment(comment: str) -> float | None:
    m = re.search(r"st=([\d.]+)", comment or "")
    return float(m.group(1)) if m else None


def weak_structure_titles(threshold: float = 0.67) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    for title, spec in TUNE_MAP.items():
        comment = ""
        if len(spec) >= 5:
            # tuple may have trailing comment in source — inspect line in eval file
            pass
        # Read annotation from TUNE_MAP source comments via title line in eval module
        import eval_omr_vs_mxl as ev

        line = next(
            (ln for ln in Path(ev.__file__).read_text(encoding="utf-8").splitlines() if title in ln),
            "",
        )
        st = parse_st_f1_from_comment(line)
        if st is not None and st < threshold:
            out.append((title, st))
    return sorted(out, key=lambda t: t[1])


def find_crop(work: Path, title: str) -> Path | None:
    manifest = work / "manifest.json"
    if not manifest.is_file():
        return None
    data = json.loads(manifest.read_text(encoding="utf-8"))
    entry = next((t for t in data.get("tunes") or [] if t.get("title") == title), None)
    if not entry:
        return None
    rel = entry.get("cropPath") or ""
    if not rel:
        page = int(entry.get("page") or 0)
        ti = int(entry.get("tuneIndex") or 0)
        matches = list((work / "tunes").glob(f"p{page:02d}_{ti:02d}_*.jpg"))
        return matches[0] if matches else None
    path = Path(rel)
    if not path.is_absolute():
        path = work / path
    return path if path.is_file() else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--threshold", type=float, default=0.67, help="st_f1 below this → weak")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--json-out", default="", help="Write full spike JSON")
    args = parser.parse_args()
    work = Path(args.work)
    weak = weak_structure_titles(args.threshold)
    if args.limit > 0:
        weak = weak[: args.limit]

    print(f"Weak structure tunes (st<{args.threshold}): {len(weak)}")
    rows: list[dict] = []
    spike = Path(__file__).resolve().parent / "spike_structure_omr.py"
    for title, st in weak:
        crop = find_crop(work, title)
        print(f"\n{title} (annotated st≈{st})")
        if not crop:
            print("  skip: no crop")
            rows.append({"title": title, "st_annotated": st, "skip": "no-crop"})
            continue
        print(f"  crop: {crop.name}")
        proc = subprocess.run(
            [sys.executable, str(spike), str(crop), "--json"],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            print(f"  spike failed: {proc.stderr.strip()[:200]}")
            rows.append({"title": title, "crop": str(crop), "error": proc.stderr.strip()[:500]})
            continue
        try:
            spike_rows = json.loads(proc.stdout)
        except json.JSONDecodeError:
            spike_rows = []
        merged = (spike_rows[0] or {}).get("merged") if spike_rows else []
        kinds = [e.get("kind") for e in merged if isinstance(e, dict)]
        print(f"  merged events: {len(merged)} kinds={sorted(set(kinds))}")
        rows.append({
            "title": title,
            "st_annotated": st,
            "crop": str(crop),
            "merged_count": len(merged),
            "kinds": sorted(set(kinds)),
            "spike": spike_rows,
        })

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rows, indent=2), encoding="utf-8")
        print(f"\nWrote {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
