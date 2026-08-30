#!/usr/bin/env python3
"""Batch finalizer for EuroSession: MXL ground truth, OMR+ for unmatched, dubious list."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_abc_candidates import candidate_id  # noqa: E402
from make_abc_review_html import ensure_renderable_abc, is_omr_source  # noqa: E402
from mxl_span_to_abc import (  # noqa: E402
    MXL_SOURCE,
    import_key_for_tune,
    span_to_abc,
    upsert_mxl_candidate,
)
from omr_and_lookup import looks_weak_abc  # noqa: E402
from match_mxl_spans import load_score  # noqa: E402

GOOD_THRESHOLD = 0.72
DUBIOUS_MIN = 0.55
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]


def join_tier(match: dict | None) -> str:
    if not match:
        return "unmatched"
    score = float(match.get("match_score") or 0)
    if score >= GOOD_THRESHOLD:
        return "good"
    if score >= DUBIOUS_MIN:
        return "dubious"
    return "unmatched"


def manifest_by_import_key(tunes: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for t in tunes:
        if not t.get("cropPath"):
            continue
        key = import_key_for_tune(int(t.get("page") or 0), int(t.get("tuneIndex") or 0))
        out[key] = t
    return out


def count_repeat_markers(abc: str) -> int:
    return len(re.findall(r"[:|][:|]|:\||\|:|\|\:", abc or ""))


def candidate_rank(c: dict) -> tuple:
    src = str(c.get("source") or "").lower()
    abc = str(c.get("abc") or "")
    weak = looks_weak_abc(abc)
    if src in {"omr+", "omr-plus"}:
        tier = 0 if not weak else 2
    elif src == "omr":
        tier = 1 if not weak else 3
    elif is_omr_source(src):
        tier = 2 if not weak else 4
    elif src == MXL_SOURCE:
        tier = -1
    else:
        tier = 1 if not weak else 3
    structure = count_repeat_markers(abc)
    chords = int(c.get("chords") or 0)
    score = float(c.get("score") or 0)
    return (tier, -structure, -chords, -score)


def pick_best_omr_candidate(candidates: list[dict], tune: dict) -> tuple[str, dict] | tuple[None, None]:
    pool = [c for c in (candidates or []) if str(c.get("source") or "") != MXL_SOURCE]
    if not pool:
        omr_abc = str(tune.get("omrPlusAbc") or tune.get("omrAbc") or tune.get("abc") or "").strip()
        if omr_abc and not looks_weak_abc(omr_abc):
            title = str(tune.get("title") or "Tune")
            abc = ensure_renderable_abc(omr_abc, title)
            src = "omr+" if tune.get("omrPlusAbc") else "omr"
            row = {
                "id": candidate_id(src, abc),
                "source": src,
                "matchedTitle": title,
                "abc": abc,
                "chords": len(re.findall(r'"\s*[A-G]', abc, re.I)),
                "hasChords": False,
                "score": 0.4,
            }
            return row["id"], row
        return None, None
    best = sorted(pool, key=candidate_rank)[0]
    if looks_weak_abc(str(best.get("abc") or "")):
        non_weak = [c for c in pool if not looks_weak_abc(str(c.get("abc") or ""))]
        if non_weak:
            best = sorted(non_weak, key=candidate_rank)[0]
    return str(best.get("id") or ""), best


def build_import_json_from_manifest(manifest: dict, keys: set[str] | None = None) -> dict:
    tunes = []
    for t in manifest.get("tunes") or []:
        if not t.get("cropPath"):
            continue
        key = import_key_for_tune(int(t.get("page") or 0), int(t.get("tuneIndex") or 0))
        if keys is not None and key not in keys:
            continue
        tunes.append(
            {
                "key": key,
                "id": t.get("importId") or key,
                "title": t.get("title") or "",
                "page": t.get("page"),
                "tuneIndex": t.get("tuneIndex"),
                "crop": Path(str(t.get("cropPath") or "")).name,
                "complete": bool(t.get("complete")),
                "abc": t.get("abc") or "",
            }
        )
    return {"book": "eurosession", "version": 1, "tunes": tunes}


def run_omr_plus_batch(work: Path, keys: list[str], *, resolver: str, skip_omr: bool) -> None:
    if not keys:
        return
    manifest_path = work / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp:
        json.dump(build_import_json_from_manifest(manifest, set(keys)), tmp, ensure_ascii=False, indent=2)
        import_path = tmp.name
    cmd = [
        sys.executable,
        str(SCRIPT_DIR / "rerun_omr_plus.py"),
        "--import-json",
        import_path,
        "--work",
        str(work),
        "--resolver",
        resolver,
        "--keys",
        ",".join(keys),
    ]
    if skip_omr:
        cmd.append("--skip-omr")
    print("running:", " ".join(cmd), flush=True)
    proc = subprocess.run(cmd, cwd=str(ROOT))
    Path(import_path).unlink(missing_ok=True)
    if proc.returncode != 0:
        print(f"warning: rerun_omr_plus exited {proc.returncode}", flush=True)


def apply_mxl_ground_truth(
    entry: dict,
    match: dict,
    *,
    mxl: Path,
    score_root,
    title: str,
) -> dict:
    m0 = int(match["m0"])
    m1 = int(match["m1"])
    key = str(match.get("seedKey") or match.get("mxlKey") or "C")
    meter = str(match.get("seedMeter") or match.get("mxlMeter") or "4/4")
    subtitle = str(match.get("mscz_subtitle") or "")
    composer = str(match.get("mscz_composer") or "")
    abc = span_to_abc(
        mxl,
        m0,
        m1,
        title=title,
        key=key,
        meter=meter,
        subtitle=subtitle or None,
        composer=composer or None,
        root=score_root,
    )
    candidates, cid = upsert_mxl_candidate(
        list(entry.get("candidates") or []),
        abc,
        title=title,
        matched_title=str(match.get("mscz_title") or title),
    )
    entry["candidates"] = candidates
    entry["selectedCandidateId"] = cid
    entry["abc"] = abc
    entry["abcSource"] = MXL_SOURCE
    entry["complete"] = True
    entry["joinTier"] = "good"
    entry["mxlJoin"] = {
        "m0": m0,
        "m1": m1,
        "mscz_title": match.get("mscz_title"),
        "match_score": match.get("match_score"),
    }
    return {"import_key": import_key_for_tune(int(entry.get("page") or 0), int(entry.get("tuneIndex") or 0)), "action": "mxl_ground_truth", "m0": m0, "m1": m1}


def apply_best_omr(entry: dict, title: str) -> dict:
    cid, cand = pick_best_omr_candidate(list(entry.get("candidates") or []), entry)
    if not cand:
        entry["joinTier"] = "unmatched"
        entry["complete"] = False
        return {"action": "omr_none", "title": title}
    entry["selectedCandidateId"] = cid
    entry["abc"] = str(cand.get("abc") or "")
    entry["abcSource"] = str(cand.get("source") or "omr")
    entry["complete"] = False
    entry["joinTier"] = "unmatched"
    return {"action": "omr_best", "source": entry["abcSource"], "candidateId": cid}


def load_join_rows(work: Path, join_path: Path | None) -> list[dict]:
    path = join_path or (work / "mxl_title_join.json")
    if not path.is_file():
        raise SystemExit(f"missing join file: {path}")
    rows = json.loads(path.read_text(encoding="utf-8"))
    return rows if isinstance(rows, list) else []


def apply_join_overrides(rows: list[dict], overrides_path: Path) -> list[dict]:
    if not overrides_path.is_file():
        return rows
    overrides = json.loads(overrides_path.read_text(encoding="utf-8"))
    by_title = {str(r.get("import_title") or ""): r for r in rows}
    for item in overrides if isinstance(overrides, list) else []:
        title = str(item.get("import_title") or "").strip()
        if not title or title not in by_title:
            continue
        row = by_title[title]
        action = str(item.get("action") or "")
        if action == "accept" and item.get("match"):
            row["match"] = item["match"]
        elif action == "reject":
            row["match"] = None
        elif action == "alt_span" and item.get("match"):
            row["match"] = item["match"]
    return list(by_title.values())


def photo_tunes_complete(manifest: dict) -> bool:
    for t in manifest.get("tunes") or []:
        if t.get("notationOnly"):
            continue
        if not t.get("cropPath"):
            continue
        if t.get("joinTier") == "mxl_only":
            continue
        if not t.get("complete"):
            return False
    return True


def append_mxl_only_tunes(
    manifest: dict,
    *,
    mxl: Path,
    index_path: Path,
    join_rows: list[dict],
    score_root,
) -> list[dict]:
    idx = json.loads(index_path.read_text(encoding="utf-8"))
    titles = list(idx.get("titles") or [])
    good_spans = {
        (int(r["match"]["m0"]), int(r["match"]["m1"]))
        for r in join_rows
        if r.get("match") and float(r["match"].get("match_score") or 0) >= GOOD_THRESHOLD
    }
    remaining = [t for t in titles if (int(t["m0"]), int(t["m1"])) not in good_spans]
    remaining.sort(key=lambda t: (int(t["m0"]), int(t["m1"])))

    added: list[dict] = []
    existing_mxl = {
        (int(t.get("mxlJoin", {}).get("m0", -1)), int(t.get("mxlJoin", {}).get("m1", -1)))
        for t in manifest.get("tunes") or []
        if t.get("notationOnly")
    }

    for i, span in enumerate(remaining, start=1):
        m0, m1 = int(span["m0"]), int(span["m1"])
        if (m0, m1) in existing_mxl:
            continue
        title = str(span.get("title") or f"MXL tune {i}")
        key = str(span.get("mxlKey") or "C")
        meter = str(span.get("mxlMeter") or "4/4")
        subtitle = str(span.get("subtitle") or "") or None
        composer = str(span.get("composer") or "") or None
        abc = span_to_abc(
            mxl, m0, m1, title=title, key=key, meter=meter,
            subtitle=subtitle, composer=composer, root=score_root,
        )
        import_key = f"mxl_t{i:02d}"
        page = max(1, m0 // 24 + 1)
        entry = {
            "title": title,
            "page": page,
            "tuneIndex": i,
            "notationOnly": True,
            "complete": True,
            "joinTier": "mxl_only",
            "abc": abc,
            "abcSource": MXL_SOURCE,
            "importKey": import_key,
            "mxlJoin": {"m0": m0, "m1": m1, "mscz_title": title},
            "candidates": [],
            "selectedCandidateId": candidate_id(MXL_SOURCE, abc),
        }
        cands, cid = upsert_mxl_candidate([], abc, title=title, matched_title=title)
        entry["candidates"] = cands
        entry["selectedCandidateId"] = cid
        manifest.setdefault("tunes", []).append(entry)
        added.append({"import_key": import_key, "title": title, "m0": m0, "m1": m1, "action": "mxl_only_append"})
    return added


def finalize_main(args: argparse.Namespace) -> int:
    work = Path(args.work)
    mxl = Path(args.mxl)
    manifest_path = work / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"missing {manifest_path}")
    if not mxl.is_file():
        raise SystemExit(f"missing MXL: {mxl}")

    join_path = Path(args.join_json) if args.join_json else work / "mxl_title_join.json"
    overrides_path = work / "mxl_join_overrides.json"
    join_rows = apply_join_overrides(load_join_rows(work, join_path), overrides_path)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = list(manifest.get("tunes") or [])
    by_key = manifest_by_import_key(tunes)
    score_root = load_score(mxl)

    state: dict = {"good": [], "unmatched": [], "dubious": [], "errors": []}
    dubious_rows: list[dict] = []

    if args.append_mxl_only:
        if not photo_tunes_complete(manifest):
            raise SystemExit("Cannot append MXL-only tunes until all photo tunes are complete")
        index_path = Path(args.title_index) if args.title_index else work / "mxl_title_index.json"
        added = append_mxl_only_tunes(
            manifest,
            mxl=mxl,
            index_path=index_path,
            join_rows=join_rows,
            score_root=score_root,
        )
        state["mxl_only"] = added
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (work / "finalize_state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(f"appended {len(added)} MXL-only tunes → {manifest_path}")
        return 0

    unmatched_keys: list[str] = []
    dubious_keys: list[str] = []

    for row in join_rows:
        title = str(row.get("import_title") or "")
        import_key = str(row.get("import_key") or "")
        match = row.get("match")
        tier = join_tier(match)
        entry = by_key.get(import_key)
        if not entry:
            state["errors"].append({"import_key": import_key, "title": title, "reason": "missing manifest row"})
            continue

        if tier == "good":
            try:
                rec = apply_mxl_ground_truth(entry, match, mxl=mxl, score_root=score_root, title=title)
                state["good"].append(rec)
                print(f"MXL ✓ {title} mm{match['m0']}–{match['m1']}", flush=True)
            except Exception as exc:
                state["errors"].append({"import_key": import_key, "title": title, "reason": str(exc)})
                print(f"MXL FAIL {title}: {exc}", flush=True)
        elif tier == "dubious":
            dubious_keys.append(import_key)
            dubious_rows.append(
                {
                    "import_title": title,
                    "import_key": import_key,
                    "cropPath": entry.get("cropPath"),
                    "match": match,
                    "page": entry.get("page"),
                    "tuneIndex": entry.get("tuneIndex"),
                }
            )
            entry["joinTier"] = "dubious"
            entry["mxlJoin"] = {
                "m0": match.get("m0"),
                "m1": match.get("m1"),
                "mscz_title": match.get("mscz_title"),
                "match_score": match.get("match_score"),
            }
            state["dubious"].append({"import_key": import_key, "title": title})
        else:
            unmatched_keys.append(import_key)
            entry["joinTier"] = "unmatched"
            entry.pop("mxlJoin", None)

    if not args.skip_omr:
        need_omr = unmatched_keys + dubious_keys if args.omr_dubious else unmatched_keys
        run_omr_plus_batch(
            work,
            need_omr,
            resolver=args.resolver,
            skip_omr=args.skip_omr_run,
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        tunes = list(manifest.get("tunes") or [])
        by_key = manifest_by_import_key(tunes)

    for import_key in unmatched_keys:
        entry = by_key.get(import_key)
        if not entry:
            continue
        title = str(entry.get("title") or import_key)
        rec = apply_best_omr(entry, title)
        state["unmatched"].append({"import_key": import_key, **rec})
        print(f"OMR → {title} ({rec.get('source', '?')})", flush=True)

    manifest["tunes"] = tunes
    manifest["finalizeSummary"] = {
        "good": len(state["good"]),
        "dubious": len(state["dubious"]),
        "unmatched": len(state["unmatched"]),
        "errors": len(state["errors"]),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (work / "dubious_joins.json").write_text(json.dumps(dubious_rows, indent=2), encoding="utf-8")
    (work / "finalize_state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    print(
        f"done: good={len(state['good'])} dubious={len(state['dubious'])} "
        f"unmatched={len(state['unmatched'])} errors={len(state['errors'])} → {manifest_path}",
        flush=True,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Finalize EuroSession manifest (MXL + OMR tiers)")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--join-json", default="", help="mxl_title_join.json path")
    parser.add_argument("--title-index", default="", help="mxl_title_index.json for --append-mxl-only")
    parser.add_argument("--append-mxl-only", action="store_true", help="Append tunebook-only spans after photo complete")
    parser.add_argument("--skip-omr", action="store_true", help="Do not invoke rerun_omr_plus.py")
    parser.add_argument("--skip-omr-run", action="store_true", help="Pass --skip-omr to rerun (chords-only refresh)")
    parser.add_argument("--omr-dubious", action="store_true", help="Also refresh OMR+ for dubious joins")
    parser.add_argument("--resolver", default="http://127.0.0.1:8787")
    args = parser.parse_args()
    return finalize_main(args)


if __name__ == "__main__":
    raise SystemExit(main())
