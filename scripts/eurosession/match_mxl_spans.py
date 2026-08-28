#!/usr/bin/env python3
"""Contour-match EuroSession OMR+ ABC against eurosessions-tunebook.mxl spans.

When mxl_title_index.json (from extract_mscz_title_index.py) is present, fuzzy
title matches restrict contour search to the indexed measure span (±pad).

Offline helper for expanding eval_omr_vs_mxl.TUNE_MAP. Does not modify the map;
print top hits for human confirmation.

Example:
  python3 scripts/eurosession/match_mxl_spans.py --top 3 --min-score 70
  python3 scripts/eurosession/match_mxl_spans.py --title-index \\
    /home/stever/Downloads/eurosession-work/mxl_title_index.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "local-resolver"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from abc_contour import abc_to_contour, contour_similarity  # noqa: E402
from extract_mscz_title_index import best_index_match  # noqa: E402

STEP_TO_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def load_score(mxl: Path) -> ET.Element:
    with zipfile.ZipFile(mxl) as zf:
        raw = zf.read("score.xml").decode("utf-8", errors="replace")
    raw = re.sub(r"<!DOCTYPE[^>]*>", "", raw)
    return ET.fromstring(raw)


def mxl_midi_by_measure(root: ET.Element) -> dict[int, list[int]]:
    """Staff-1 voice-1 melodic MIDI pitches keyed by measure number."""
    part = root.find("part")
    out: dict[int, list[int]] = {}
    for m in part.findall("measure"):
        n = int(m.get("number") or 0)
        pitches: list[int] = []
        for note in m.findall("note"):
            if note.find("chord") is not None or note.find("grace") is not None:
                continue
            if (note.findtext("staff") or "1") != "1":
                continue
            if (note.findtext("voice") or "1") not in ("1", ""):
                continue
            if note.find("rest") is not None:
                continue
            pitch = note.find("pitch")
            if pitch is None:
                continue
            step = pitch.findtext("step") or ""
            alter = int(pitch.findtext("alter") or 0)
            octave = int(pitch.findtext("octave") or 4)
            base = STEP_TO_PC.get(step.upper())
            if base is None:
                continue
            pitches.append((octave + 1) * 12 + base + alter)
        if pitches:
            out[n] = pitches
    return out


def mxl_key_meter_at(root: ET.Element, measure: int) -> tuple[str, str]:
    """Return (abc_key, meter) from attributes at or before measure."""
    part = root.find("part")
    key_abc = "C"
    meter = "4/4"
    fifths_to_maj = {
        -7: "Cb",
        -6: "Gb",
        -5: "Db",
        -4: "Ab",
        -3: "Eb",
        -2: "Bb",
        -1: "F",
        0: "C",
        1: "G",
        2: "D",
        3: "A",
        4: "E",
        5: "B",
        6: "F#",
        7: "C#",
    }
    for m in part.findall("measure"):
        n = int(m.get("number") or 0)
        if n > measure:
            break
        attrs = m.find("attributes")
        if attrs is None:
            continue
        key_el = attrs.find("key")
        if key_el is not None:
            fifths = int(key_el.findtext("fifths") or 0)
            mode = (key_el.findtext("mode") or "major").lower()
            maj = fifths_to_maj.get(fifths, "C")
            if mode.startswith("min"):
                rel = {
                    "C": "Am",
                    "G": "Em",
                    "D": "Bm",
                    "A": "F#m",
                    "E": "C#m",
                    "B": "G#m",
                    "F#": "D#m",
                    "F": "Dm",
                    "Bb": "Gm",
                    "Eb": "Cm",
                    "Ab": "Fm",
                    "Db": "Bbm",
                    "Gb": "Ebm",
                    "Cb": "Abm",
                }
                key_abc = rel.get(maj, maj + "m")
            else:
                key_abc = maj
        time_el = attrs.find("time")
        if time_el is not None:
            beats = time_el.findtext("beats") or "4"
            beat_type = time_el.findtext("beat-type") or "4"
            meter = f"{beats}/{beat_type}"
    return key_abc, meter


def window_contour(midi_by_m: dict[int, list[int]], m0: int, m1: int, max_notes: int = 48) -> dict:
    pitches: list[int] = []
    for n in range(m0, m1 + 1):
        pitches.extend(midi_by_m.get(n) or [])
        if len(pitches) >= max_notes:
            break
    pitches = pitches[:max_notes]
    from abc_contour import pitches_to_interval_string, pitches_to_parsons_code

    return {
        "pitches": pitches,
        "intervals": pitches_to_interval_string(pitches),
        "parsons": pitches_to_parsons_code(pitches),
    }


def build_windows(
    midi_by_m: dict[int, list[int]],
    *,
    min_bars: int = 8,
    max_bars: int = 64,
    step: int = 4,
    range_m0: int | None = None,
    range_m1: int | None = None,
) -> list[tuple[int, int, dict]]:
    """Sliding measure windows with enough notes for contour."""
    if not midi_by_m:
        return []
    lo = min(midi_by_m) if range_m0 is None else max(min(midi_by_m), int(range_m0))
    hi = max(midi_by_m) if range_m1 is None else min(max(midi_by_m), int(range_m1))
    if hi < lo:
        return []
    windows: list[tuple[int, int, dict]] = []
    # When constrained to a short indexed span, also try the exact span.
    if range_m0 is not None and range_m1 is not None:
        exact = window_contour(midi_by_m, lo, hi)
        if len(exact["pitches"]) >= 8:
            windows.append((lo, hi, exact))
    for m0 in range(lo, hi + 1, step):
        for length in (16, 24, 32, 48, 64, 8, 12):
            if length < min_bars or length > max_bars:
                continue
            m1 = min(hi, m0 + length - 1)
            if m1 - m0 + 1 < min_bars:
                continue
            cont = window_contour(midi_by_m, m0, m1)
            if len(cont["pitches"]) < 12:
                continue
            windows.append((m0, m1, cont))
    # Dedupe identical (m0,m1)
    seen: set[tuple[int, int]] = set()
    out: list[tuple[int, int, dict]] = []
    for m0, m1, cont in windows:
        key = (m0, m1)
        if key in seen:
            continue
        seen.add(key)
        out.append((m0, m1, cont))
    return out


def load_title_index(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    titles = data.get("titles") or []
    return [
        {
            "title": t["title"],
            "m0": int(t["m0"]),
            "m1": int(t["m1"]),
            "norm": "",  # filled by best_index_match via normalize
        }
        for t in titles
        if t.get("title") and t.get("m0") is not None
    ]


def load_query_tunes(work: Path, import_json: Path | None, *, all_import: bool = False) -> list[dict]:
    manifest = json.loads((work / "manifest.json").read_text(encoding="utf-8"))
    want: set[str] | None = None
    if import_json and import_json.is_file():
        data = json.loads(import_json.read_text(encoding="utf-8"))
        if all_import:
            want = {str(t.get("title") or "") for t in (data.get("tunes") or [])}
        else:
            want = {
                str(t.get("title") or "")
                for t in (data.get("tunes") or [])
                if not t.get("complete")
            }
    out = []
    for entry in manifest.get("tunes") or []:
        title = str(entry.get("title") or "")
        plus = next((c for c in (entry.get("candidates") or []) if c.get("source") == "omr+"), None)
        omr = next((c for c in (entry.get("candidates") or []) if str(c.get("source") or "").lower() == "omr"), None)
        abc = (
            (plus or {}).get("abc")
            or entry.get("omrPlusAbc")
            or (omr or {}).get("abc")
            or entry.get("omrAbc")
            or ""
        )
        if not abc.strip():
            continue
        if want is not None and title not in want:
            continue
        cont = abc_to_contour(abc, max_notes=48)
        if len(cont["pitches"]) < 12:
            continue
        out.append({"title": title, "abc": abc, "contour": cont})
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--import-json", default="/home/stever/Downloads/eurosession-import.json")
    parser.add_argument(
        "--title-index",
        default="/home/stever/Downloads/eurosession-work/mxl_title_index.json",
        help="MSCZ-derived title spans; empty string disables",
    )
    parser.add_argument("--index-pad", type=int, default=4, help="Bars of slack around indexed span")
    parser.add_argument("--min-name-score", type=float, default=0.72, help="Accept index gate above this")
    parser.add_argument("--top", type=int, default=3)
    parser.add_argument("--min-score", type=float, default=68.0)
    parser.add_argument("--all-import", action="store_true", help="Query all import titles, not only incomplete")
    parser.add_argument("--json-out", default="", help="Optional path to write ranked hits JSON")
    args = parser.parse_args()

    root = load_score(Path(args.mxl))
    midi_by_m = mxl_midi_by_measure(root)
    print(f"MXL measures with melody: {len(midi_by_m)} ({min(midi_by_m)}–{max(midi_by_m)})", flush=True)

    index: list[dict] = []
    if args.title_index:
        index = load_title_index(Path(args.title_index))
        print(f"title index entries: {len(index)}", flush=True)

    global_windows = build_windows(midi_by_m)
    print(f"global contour windows: {len(global_windows)}", flush=True)

    queries = load_query_tunes(Path(args.work), Path(args.import_json), all_import=args.all_import)
    print(f"query tunes: {len(queries)}", flush=True)

    all_hits: list[dict] = []
    for q in queries:
        name_hit = best_index_match(q["title"], index, min_score=float(args.min_name_score)) if index else None
        if name_hit and name_hit["match_score"] >= float(args.min_name_score):
            pad = max(0, int(args.index_pad))
            lo = max(1, int(name_hit["m0"]) - pad)
            hi = int(name_hit["m1"]) + pad
            windows = build_windows(midi_by_m, range_m0=lo, range_m1=hi, step=2, min_bars=6)
            gate = "index"
            # High-confidence name: also propose exact index span even if contour is thin.
            prefer_span = (int(name_hit["m0"]), int(name_hit["m1"]))
        else:
            windows = global_windows
            gate = "global"
            prefer_span = None

        scored: list[tuple[float, int, int, str]] = []
        for m0, m1, cont in windows:
            score = contour_similarity(q["contour"], cont)
            if score >= args.min_score:
                scored.append((score, m0, m1, gate))
        if prefer_span is not None and name_hit and name_hit["match_score"] >= 0.9:
            # Seed exact MSCZ span at synthetic high contour if nearby contour exists,
            # or at name-weighted baseline so suggestions still emit.
            pm0, pm1 = prefer_span
            cont = window_contour(midi_by_m, pm0, pm1)
            cscore = contour_similarity(q["contour"], cont) if len(cont["pitches"]) >= 8 else 0.0
            # Blend: strong name keeps span even when OMR contour is weak.
            blended = max(cscore, 50.0 + 40.0 * float(name_hit["match_score"]))
            scored.append((blended, pm0, pm1, "index-exact"))

        # Prefer exact MSCZ spans over nearby contour sub-windows.
        scored.sort(key=lambda x: (0 if x[3] == "index-exact" else 1, -x[0], x[1]))
        kept: list[tuple[float, int, int, str]] = []
        for score, m0, m1, src in scored:
            if any(abs(m0 - k[1]) < 8 for k in kept):
                continue
            kept.append((score, m0, m1, src))
            if len(kept) >= args.top:
                break

        print(f"\n== {q['title']} ==")
        if name_hit:
            print(
                f"  name→ {name_hit['match_score']:.2f} mm{name_hit['m0']}-{name_hit['m1']} "
                f"{name_hit['mscz_title'][:50]}",
                flush=True,
            )
        if not kept:
            print("  (no hits)")
            continue
        for score, m0, m1, src in kept:
            # TUNE_MAP suggestions: use full indexed span when name-gated.
            sm0, sm1 = m0, m1
            if prefer_span is not None and src in ("index", "index-exact"):
                sm0, sm1 = prefer_span
            key, meter = mxl_key_meter_at(root, sm0)
            print(f"  {score:5.1f}  mm {sm0}-{sm1}  K:{key} M:{meter}  [{src}]")
            all_hits.append(
                {
                    "title": q["title"],
                    "score": score,
                    "m0": sm0,
                    "m1": sm1,
                    "key": key,
                    "meter": meter,
                    "gate": src,
                    "nameScore": (name_hit or {}).get("match_score"),
                    "msczTitle": (name_hit or {}).get("mscz_title"),
                    "contourM0": m0,
                    "contourM1": m1,
                }
            )

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(all_hits, indent=2), encoding="utf-8")
        print(f"\nwrote {args.json_out}", flush=True)

    print("\n# Suggested TUNE_MAP entries (best hit ≥ min-score):")
    # One suggestion per title: prefer index-exact > index > global.
    by_title: dict[str, list[dict]] = {}
    for h in all_hits:
        by_title.setdefault(h["title"], []).append(h)
    gate_rank = {"index-exact": 0, "index": 1, "global": 2}
    for title, hits in by_title.items():
        hits_sorted = sorted(
            hits,
            key=lambda h: (gate_rank.get(h.get("gate") or "", 9), -float(h["score"]), h["m0"]),
        )
        h = hits_sorted[0]
        # Skip global-only contour hits when a title index is active (name gate missed).
        if index and h.get("gate") == "global":
            continue
        if h["score"] < args.min_score and not (
            h.get("gate") == "index-exact" and (h.get("nameScore") or 0) >= 0.9
        ):
            continue
        note = h.get("gate") or ""
        ns = h.get("nameScore")
        extra = f" gate={note}" + (f" name={ns}" if ns is not None else "")
        print(
            f'    "{h["title"]}": ({h["m0"]}, {h["m1"]}, "{h["key"]}", "{h["meter"]}"),  '
            f'# score={h["score"]:.1f}{extra}'
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
