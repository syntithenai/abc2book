#!/usr/bin/env python3
"""Re-export MusicXML ABC that contains broken /0 durations after the slicer fix.

Scans eurosession-work/manifest.json for musicxml candidates (or selected abc)
with /0 note suffixes, re-runs span_to_abc with sticky <divisions>, and upserts
the MXL candidate. Only re-selects MXL when the current selection itself has /0
(or abcSource is already musicxml), so archive picks stay intact.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from finalize_eurosession import load_join_rows  # noqa: E402
from match_mxl_spans import load_score  # noqa: E402
from mxl_span_to_abc import (  # noqa: E402
    MXL_SOURCE,
    ZERO_DURATION_RE,
    import_key_for_tune,
    span_to_abc,
    upsert_mxl_candidate,
)


def abc_has_zero_duration(abc: str) -> bool:
    return bool(ZERO_DURATION_RE.search(abc or ""))


def selected_abc(entry: dict) -> str:
    sid = str(entry.get("selectedCandidateId") or "")
    for c in entry.get("candidates") or []:
        if str(c.get("id") or "") == sid:
            return str(c.get("abc") or "")
    return str(entry.get("abc") or "")


def entry_needs_repair(entry: dict) -> bool:
    if abc_has_zero_duration(str(entry.get("abc") or "")):
        return True
    if abc_has_zero_duration(selected_abc(entry)):
        return True
    for c in entry.get("candidates") or []:
        if str(c.get("source") or "") == MXL_SOURCE and abc_has_zero_duration(str(c.get("abc") or "")):
            return True
    return False


def selection_is_broken_mxl(entry: dict) -> bool:
    """True when the active selection is the broken MusicXML (must re-select)."""
    if abc_has_zero_duration(str(entry.get("abc") or "")):
        return True
    if abc_has_zero_duration(selected_abc(entry)):
        return True
    src = str(entry.get("abcSource") or "")
    if src == MXL_SOURCE and abc_has_zero_duration(selected_abc(entry) or str(entry.get("abc") or "")):
        return True
    sid = str(entry.get("selectedCandidateId") or "")
    for c in entry.get("candidates") or []:
        if str(c.get("id") or "") != sid:
            continue
        if str(c.get("source") or "") == MXL_SOURCE and abc_has_zero_duration(str(c.get("abc") or "")):
            return True
    return False


def match_for_entry(entry: dict, join_by_key: dict[str, dict]) -> dict | None:
    """Prefer live mxlJoin on the entry; fall back to / merge title-join row."""
    key = import_key_for_tune(int(entry.get("page") or 0), int(entry.get("tuneIndex") or 0))
    row = join_by_key.get(key) or {}
    join_match = row.get("match") if isinstance(row.get("match"), dict) else {}

    mxl = entry.get("mxlJoin") or {}
    if mxl.get("m0") is not None and mxl.get("m1") is not None:
        return {
            "m0": int(mxl["m0"]),
            "m1": int(mxl["m1"]),
            "seedKey": mxl.get("seedKey") or mxl.get("mxlKey") or join_match.get("seedKey") or join_match.get("mxlKey"),
            "seedMeter": mxl.get("seedMeter")
            or mxl.get("mxlMeter")
            or join_match.get("seedMeter")
            or join_match.get("mxlMeter"),
            "mxlKey": mxl.get("mxlKey") or join_match.get("mxlKey"),
            "mxlMeter": mxl.get("mxlMeter") or join_match.get("mxlMeter"),
            "mscz_title": mxl.get("mscz_title") or join_match.get("mscz_title"),
            "mscz_subtitle": mxl.get("mscz_subtitle") or join_match.get("mscz_subtitle"),
            "mscz_composer": mxl.get("mscz_composer") or join_match.get("mscz_composer"),
            "match_score": mxl.get("match_score") or join_match.get("match_score") or 1.0,
        }
    return join_match or None


def repair_entry(entry: dict, match: dict, *, mxl: Path, score_root, title: str) -> dict:
    m0 = int(match["m0"])
    m1 = int(match["m1"])
    key = match.get("seedKey") or match.get("mxlKey") or None
    meter = match.get("seedMeter") or match.get("mxlMeter") or None
    subtitle = str(match.get("mscz_subtitle") or "") or None
    composer = str(match.get("mscz_composer") or "") or None
    abc = span_to_abc(
        mxl,
        m0,
        m1,
        title=title,
        key=str(key) if key else None,
        meter=str(meter) if meter else None,
        subtitle=subtitle,
        composer=composer,
        root=score_root,
    )
    if abc_has_zero_duration(abc):
        raise RuntimeError("re-export still contains /0")

    was_complete = bool(entry.get("complete"))
    was_tier = entry.get("joinTier")
    prev_sid = str(entry.get("selectedCandidateId") or "")
    prev_src = str(entry.get("abcSource") or "")
    reselect = selection_is_broken_mxl(entry)

    candidates, cid = upsert_mxl_candidate(
        list(entry.get("candidates") or []),
        abc,
        title=title,
        matched_title=str(match.get("mscz_title") or title),
    )
    entry["candidates"] = candidates
    entry["mxlJoin"] = {
        "m0": m0,
        "m1": m1,
        "mscz_title": match.get("mscz_title"),
        "match_score": match.get("match_score"),
        "seedKey": key,
        "seedMeter": meter,
    }
    if reselect:
        entry["selectedCandidateId"] = cid
        entry["abc"] = abc
        entry["abcSource"] = MXL_SOURCE
        entry["joinTier"] = "good"
        entry["complete"] = True if was_complete or was_tier == "good" else was_complete
    else:
        # Keep archive/session selection; only refreshed the MXL candidate.
        entry["selectedCandidateId"] = prev_sid
        entry["abcSource"] = prev_src
        if was_tier is not None:
            entry["joinTier"] = was_tier
        entry["complete"] = was_complete
    return {"m0": m0, "m1": m1, "reselected": reselect, "candidateId": cid}


def main() -> int:
    parser = argparse.ArgumentParser(description="Repair MusicXML /0 durations in EuroSession manifest")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--join-json", default="", help="mxl_title_join.json (default: work/mxl_title_join.json)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-html", action="store_true", help="Do not regenerate review_abc.html")
    args = parser.parse_args()

    work = Path(args.work)
    mxl = Path(args.mxl)
    manifest_path = work / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"missing {manifest_path}")
    if not mxl.is_file():
        raise SystemExit(f"missing {mxl}")

    join_path = Path(args.join_json) if args.join_json else work / "mxl_title_join.json"
    join_rows = load_join_rows(work, join_path if join_path.is_file() else None)
    join_by_key = {str(r.get("import_key") or ""): r for r in join_rows}

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = list(manifest.get("tunes") or [])
    targets = [t for t in tunes if entry_needs_repair(t)]
    print(f"tunes with /0: {len(targets)}", flush=True)
    if not targets:
        return 0

    if args.dry_run:
        for t in targets:
            key = import_key_for_tune(int(t.get("page") or 0), int(t.get("tuneIndex") or 0))
            broken_sel = selection_is_broken_mxl(t)
            print(f"  {key} reselect={broken_sel} {t.get('title')}", flush=True)
        return 0

    score_root = load_score(mxl)
    ok = 0
    failed = 0
    reselected = 0
    log: list[dict] = []

    for entry in targets:
        title = str(entry.get("title") or "Tune")
        key = import_key_for_tune(int(entry.get("page") or 0), int(entry.get("tuneIndex") or 0))
        match = match_for_entry(entry, join_by_key)
        if not match or match.get("m0") is None or match.get("m1") is None:
            print(f"  FAIL {key} {title}: no mxl span", flush=True)
            failed += 1
            log.append({"import_key": key, "title": title, "ok": False, "reason": "no-span"})
            continue
        try:
            info = repair_entry(entry, match, mxl=mxl, score_root=score_root, title=title)
            ok += 1
            if info["reselected"]:
                reselected += 1
            print(
                f"  OK {key} {title} mm{info['m0']}–{info['m1']} "
                f"reselect={info['reselected']} complete={entry.get('complete')}",
                flush=True,
            )
            log.append({"import_key": key, "title": title, "ok": True, **info})
        except Exception as exc:
            failed += 1
            print(f"  FAIL {key} {title}: {exc}", flush=True)
            log.append({"import_key": key, "title": title, "ok": False, "reason": str(exc)})

    manifest["tunes"] = tunes
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    log_path = work / "repair_mxl_zero_durations.json"
    log_path.write_text(json.dumps(log, indent=2), encoding="utf-8")
    print(
        f"done: ok={ok} reselected={reselected} failed={failed} → {manifest_path}",
        flush=True,
    )
    print(f"log: {log_path}", flush=True)

    if not args.skip_html and ok > 0:
        html_cmd = [
            sys.executable,
            str(Path(__file__).resolve().parent / "make_abc_review_html.py"),
            "--work",
            str(work),
        ]
        print("regenerating review HTML…", flush=True)
        proc = subprocess.run(html_cmd)
        if proc.returncode != 0:
            print(f"warning: make_abc_review_html exited {proc.returncode}", flush=True)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
