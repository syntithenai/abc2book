#!/usr/bin/env python3
"""Re-run OMR for tunes missing omrAbc and inject an omr candidate into manifest."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_abc_candidates import (  # noqa: E402
    candidate_id,
    is_omr_source,
    normalize_candidate,
)
from omr_and_lookup import (  # noqa: E402
    ensure_x_header,
    extract_omr_abc,
    looks_weak_abc,
    polish_extracted_omr,
    post_omr,
)


def needs_omr_backfill(entry: dict) -> bool:
    if entry.get("omrAbc") and "%% missing abc" not in str(entry.get("omrAbc") or ""):
        return False
    cands = entry.get("candidates") or []
    if any(is_omr_source(str(c.get("source") or "")) and c.get("abc") for c in cands):
        return False
    crop = Path(str(entry.get("cropPath") or ""))
    return crop.is_file()


def inject_omr_candidate(entry: dict, omr_abc: str, title: str, index: int) -> bool:
    abc = ensure_x_header(omr_abc.strip(), index, title)
    if not abc or looks_weak_abc(abc):
        return False
    row = normalize_candidate(
        title,
        {
            "source": "omr",
            "matchedTitle": title,
            "abc": abc,
            "url": "",
            "score": 0.4,
        },
    )
    if not row:
        return False

    # Replace plain omr only; keep omr-chords and all non-OMR sources.
    cands = [
        c
        for c in (entry.get("candidates") or [])
        if str(c.get("source") or "").lower() != "omr"
    ]
    omr_cand = {
        "id": row["id"],
        "source": "omr",
        "matchedTitle": title,
        "url": "",
        "score": round(float(row.get("rankScore") or 0), 3),
        "chords": row.get("chords") or 0,
        "hasChords": bool(row.get("hasChords")),
        "abc": row["abc"],
    }
    other = [c for c in cands if not is_omr_source(str(c.get("source") or ""))]
    omr_rest = [c for c in cands if is_omr_source(str(c.get("source") or ""))]
    entry["candidates"] = other + [omr_cand] + omr_rest
    entry["omrAbc"] = row["abc"]
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill missing OMR ABC transcripts for EuroSession")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--resolver", default="http://127.0.0.1:8787")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true", help="List tunes needing OMR only")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = [t for t in manifest.get("tunes") or [] if t.get("cropPath")]
    targets = [t for t in tunes if needs_omr_backfill(t)]
    if args.limit > 0:
        targets = targets[: args.limit]

    print(f"tunes={len(tunes)} need_omr_backfill={len(targets)}")
    if args.dry_run:
        for t in targets:
            print(f"  p{t.get('page')} t{t.get('tuneIndex')} {t.get('title')}")
        return 0

    ok = fail = 0
    for i, entry in enumerate(targets, start=1):
        title = str(entry.get("title") or f"Tune {i}")
        crop = Path(entry["cropPath"])
        idx = int(entry.get("page") or 0) * 100 + int(entry.get("tuneIndex") or 0)
        print(f"[{i}/{len(targets)}] {title}")
        t0 = time.time()
        omr = post_omr(args.resolver, crop)
        omr_abc, omr_status = extract_omr_abc(omr)
        if omr_abc:
            omr_abc = polish_extracted_omr(omr_abc, title)
        print(f"  OMR {omr_status} in {time.time() - t0:.1f}s ({len(omr_abc)} chars)")
        entry["omrStatus"] = omr_status
        if inject_omr_candidate(entry, omr_abc, title, idx):
            ok += 1
            print(f"  injected omr candidate {entry['candidates'][0]['id']}")
        else:
            fail += 1
            print("  failed to inject (empty or weak ABC)")

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"done: ok={ok} fail={fail} manifest={manifest_path}")
    return 0 if ok or not targets else 1


if __name__ == "__main__":
    raise SystemExit(main())
