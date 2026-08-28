#!/usr/bin/env python3
"""Build side-by-side crop image + ABC notation review HTML."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


def ensure_renderable_abc(abc: str, title: str) -> str:
    """Inject minimal headers so abcjs can draw incomplete OMR bodies."""
    text = (abc or "").strip()
    if not text:
        return f"X:1\nT:{title}\nM:4/4\nL:1/8\nK:C\n%% missing abc\n"
    lines = text.splitlines()
    has_m = any(line.startswith("M:") for line in lines)
    has_l = any(line.startswith("L:") for line in lines)
    has_k = any(line.startswith("K:") for line in lines)
    if has_m and has_l and has_k:
        return text

    x_line = next((line for line in lines if line.startswith("X:")), "X:1")
    t_line = next((line for line in lines if line.startswith("T:")), f"T:{title}")
    other_headers = [
        line
        for line in lines
        if re.match(r"^[A-Za-z%]:", line) and not line.startswith(("X:", "T:", "M:", "L:", "K:"))
    ]
    body = [line for line in lines if not re.match(r"^[A-Za-z%]:", line) and not line.startswith("%%")]
    body_warnings = [line for line in lines if line.startswith("%%")]
    headers = [x_line, t_line]
    headers.append(next((line for line in lines if line.startswith("M:")), "M:4/4"))
    headers.append(next((line for line in lines if line.startswith("L:")), "L:1/8"))
    headers.append(next((line for line in lines if line.startswith("K:")), "K:C"))
    headers.extend(other_headers)
    return "\n".join(headers + body_warnings + body)


def parse_abc_header(abc: str, key: str) -> str:
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", abc or "", re.M)
    return (m.group(1).strip() if m else "")


def normalize_key_for_select(raw: str) -> str:
    text = re.sub(r"\s*transpose\s*=\s*-?\d+", "", raw or "", flags=re.I).strip()
    text = text.replace("minor", "m").replace("major", "")
    text = re.sub(r"\s+", "", text)
    if not text:
        return "C"
    return text


METER_OPTIONS = ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8", "3/8", "2/2", "5/4", "7/8"]


def candidate_id(source: str, abc: str) -> str:
    import hashlib

    digest = hashlib.sha1((source + "\n" + (abc or "")[:800]).encode("utf-8", errors="replace")).hexdigest()[:10]
    safe = re.sub(r"[^a-zA-Z0-9:_-]+", "-", (source or "src"))[:40]
    return f"{safe}-{digest}"


def is_omr_source(source: str) -> bool:
    return str(source or "").lower().startswith("omr")


def order_candidates_omr_last(candidates: list[dict]) -> list[dict]:
    """Archive/session sources first; plain omr, other omr-*, omr-chords, then omr+."""
    other = [c for c in candidates if not is_omr_source(str(c.get("source") or ""))]
    omr_plain = [c for c in candidates if str(c.get("source") or "").lower() == "omr"]
    omr_chords = [c for c in candidates if str(c.get("source") or "").lower() == "omr-chords"]
    omr_plus = [c for c in candidates if str(c.get("source") or "").lower() in {"omr+", "omr-plus"}]
    omr_other = [
        c
        for c in candidates
        if is_omr_source(str(c.get("source") or ""))
        and str(c.get("source") or "").lower() not in {"omr", "omr-chords", "omr+", "omr-plus"}
    ]
    return other + omr_plain + omr_other + omr_chords + omr_plus


def ensure_omr_candidate(candidates: list[dict], tune: dict, title: str) -> list[dict]:
    """Guarantee an OMR transcript remains selectable alongside archive hits."""
    if any(str(c.get("source") or "").lower() == "omr" for c in candidates):
        return order_candidates_omr_last(candidates)

    omr_abc = str(tune.get("omrAbc") or "").strip()
    if not omr_abc and is_omr_source(str(tune.get("abcSource") or "")):
        omr_abc = str(tune.get("abc") or "").strip()
    if not omr_abc or "%% missing abc" in omr_abc:
        return order_candidates_omr_last(candidates)

    abc = ensure_renderable_abc(omr_abc, title)
    omr_row = {
        "id": candidate_id("omr", abc),
        "source": "omr",
        "matchedTitle": title,
        "url": "",
        "score": tune.get("lookupScore") if is_omr_source(str(tune.get("abcSource") or "")) else 0.4,
        "chords": len(re.findall(r'"\s*[A-G]', abc, re.I)),
        "hasChords": False,
        "abc": abc,
        "detectedKey": normalize_key_for_select(parse_abc_header(abc, "K")),
        "detectedMeter": parse_abc_header(abc, "M") or "4/4",
        "notationIssues": [],
    }
    return order_candidates_omr_last(list(candidates) + [omr_row])


def main() -> int:
    parser = argparse.ArgumentParser(description="Make EuroSession ABC review HTML")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--out", default="", help="Output HTML path (default: work/review_abc.html)")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = [t for t in manifest.get("tunes") or [] if t.get("cropPath")]
    tunes = sorted(tunes, key=lambda t: (int(t.get("page") or 0), int(t.get("tuneIndex") or 0)))

    out_path = Path(args.out) if args.out else work / "review_abc.html"
    resolved = sum(
        1
        for t in tunes
        if t.get("abcSource")
        and t.get("abcSource") != "missing"
        and t.get("abc")
        and "%% missing abc" not in str(t.get("abc") or "")
    )
    chorded = sum(1 for t in tunes if any(c.get("hasChords") for c in (t.get("candidates") or [])))
    chorded_sel = int(manifest.get("chordedCount") or 0)

    payload = []
    for i, tune in enumerate(tunes, start=1):
        title = str(tune.get("title") or f"Tune {i}")
        candidates = []
        for c in tune.get("candidates") or []:
            abc = ensure_renderable_abc(str(c.get("abc") or ""), title)
            candidates.append(
                {
                    "id": c.get("id") or "",
                    "source": c.get("source") or "",
                    "matchedTitle": c.get("matchedTitle") or "",
                    "url": c.get("url") or "",
                    "score": c.get("score"),
                    "chords": c.get("chords") or 0,
                    "hasChords": bool(c.get("hasChords")),
                    "abc": abc,
                    "detectedKey": normalize_key_for_select(parse_abc_header(abc, "K")),
                    "detectedMeter": parse_abc_header(abc, "M") or "4/4",
                    "notationIssues": c.get("notationIssues") or [],
                }
            )
        candidates = ensure_omr_candidate(candidates, tune, title)
        if not candidates and tune.get("abc"):
            abc = ensure_renderable_abc(str(tune.get("abc") or ""), title)
            candidates = [
                {
                    "id": "current",
                    "source": tune.get("abcSource") or "current",
                    "matchedTitle": tune.get("lookupMatch") or title,
                    "url": tune.get("lookupUrl") or "",
                    "score": tune.get("lookupScore"),
                    "chords": len(re.findall(r'"\s*[A-G]', str(tune.get("abc") or ""), re.I)),
                    "hasChords": False,
                    "abc": abc,
                    "detectedKey": normalize_key_for_select(parse_abc_header(abc, "K")),
                    "detectedMeter": parse_abc_header(abc, "M") or "4/4",
                    "notationIssues": tune.get("notationIssues") or [],
                }
            ]
            candidates = ensure_omr_candidate(candidates, tune, title)
        selected_id = str(tune.get("selectedCandidateId") or "")
        if selected_id and not any(c["id"] == selected_id for c in candidates) and candidates:
            selected_id = ""
        if not selected_id and candidates:
            # Never auto-prefer omr / omr-chords — only fall back when nothing else exists.
            non_omr = [c for c in candidates if not is_omr_source(str(c.get("source") or ""))]
            pool = non_omr or candidates
            chorded_c = [c for c in pool if c.get("hasChords")]
            selected_id = (chorded_c or pool)[0]["id"]
        selected_abc = next((c["abc"] for c in candidates if c["id"] == selected_id), "")
        if not selected_abc:
            selected_abc = ensure_renderable_abc(str(tune.get("abc") or ""), title)

        crop = Path(tune["cropPath"]).name
        payload.append(
            {
                "id": f"t{i:03d}",
                "page": int(tune.get("page") or 0),
                "tuneIndex": int(tune.get("tuneIndex") or 0),
                "title": title,
                "crop": crop,
                "source": str(tune.get("abcSource") or "missing"),
                "match": str(tune.get("lookupMatch") or ""),
                "omrStatus": str(tune.get("omrStatus") or ""),
                "abc": selected_abc,
                "selectedCandidateId": selected_id,
                "candidates": candidates,
                "chordOcrStatus": tune.get("chordOcrStatus") or {},
            }
        )

    payload_json = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c")
    meters_json = json.dumps(METER_OPTIONS)

    parts = [
        "<!DOCTYPE html>",
        "<html lang='en'><head>",
        "<meta charset='utf-8'>",
        "<meta name='viewport' content='width=device-width, initial-scale=1'>",
        "<title>EuroSession ABC review</title>",
        "<script src='https://cdn.jsdelivr.net/npm/abcjs@6.4.4/dist/abcjs-basic.min.js'></script>",
        "<script src='https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js'></script>",
        "<script src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'></script>",
        "<script src='xml2abc-review.js'></script>",
        "<style>",
        ":root{--bg:#12141a;--card:#1b1f2a;--line:#2c3344;--text:#e8ecf4;--muted:#9aa3b5;--accent:#7eb6ff;--ok:#6dcea0;--warn:#e0b35a;--bad:#e07a7a}",
        "*{box-sizing:border-box}",
        "body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text)}",
        "header{position:sticky;top:0;z-index:5;background:rgba(18,20,26,.96);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:.85rem 1.1rem}",
        "header h1{margin:0;font-size:1.15rem;font-weight:650}",
        "header .meta{color:var(--muted);font-size:.86rem;margin-top:.25rem}",
        "header a{color:var(--accent)}",
        ".toolbar{display:flex;flex-wrap:wrap;gap:.55rem;align-items:center;margin-top:.7rem}",
        "button{appearance:none;border:1px solid var(--line);background:#252b38;color:var(--text);border-radius:8px;padding:.45rem .75rem;font:inherit;font-size:.86rem;cursor:pointer}",
        "button:hover{border-color:#5a6780;background:#2c3344}",
        "button:disabled{opacity:.45;cursor:not-allowed}",
        "button:disabled:hover{border-color:var(--line);background:#252b38}",
        "button.primary{background:#2a4a72;border-color:#3d6aa0;color:#eaf3ff}",
        "button.primary:hover{background:#335987}",
        "button.copied{background:#2a5240;border-color:#3d7a5c}",
        "button.danger{background:#5a2a2a;border-color:#7a3d3d;color:#ffe8e8}",
        "button.danger:hover{background:#6a3333}",
        ".toolbar .hint{color:var(--muted);font-size:.8rem}",
        "label.chk{display:inline-flex;gap:.35rem;align-items:center;color:var(--muted);font-size:.82rem;cursor:pointer;user-select:none}",
        "nav{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.65rem}",
        "nav a{color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:.15rem .55rem;font-size:.78rem}",
        "nav a:hover,nav a.has-comment{color:var(--text);border-color:#4a5568}",
        "nav a.has-comment{border-color:#6a5530;color:var(--warn)}",
        "main{padding:1rem;max-width:1680px;margin:0 auto}",
        ".tune{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem;margin:0 0 1rem}",
        ".tune.has-comment{border-color:#6a5530;box-shadow:inset 3px 0 0 var(--warn)}",
        ".tune.is-complete{border-color:#355a48;box-shadow:inset 3px 0 0 var(--ok)}",
        ".tune.is-complete.has-comment{box-shadow:inset 3px 0 0 var(--ok), inset 6px 0 0 var(--warn)}",
        ".tune.is-filtered-out,.page-head.is-filtered-out{display:none}",
        ".tune-head{grid-column:1 / -1;display:flex;align-items:center;gap:.65rem;margin:-.15rem 0 .1rem}",
        ".tune-head-actions{margin-left:auto;display:flex;align-items:center;gap:.35rem}",
        ".play-group{position:relative;display:inline-flex;align-items:stretch;border:1px solid var(--line);border-radius:8px;overflow:visible}",
        ".play-group > button{border:0;border-radius:0;background:#252b38}",
        ".play-group > button:hover{background:#2c3344}",
        ".play-group > button+button{border-left:1px solid var(--line)}",
        ".play-group .play-main{padding:.35rem .75rem;min-width:4.6rem}",
        ".play-group .play-caret{padding:.35rem .45rem;color:var(--muted)}",
        ".play-group.is-playing{border-color:#3d7a5c}",
        ".play-group.is-playing .play-main{background:#2a5240;color:#e8fff3}",
        ".play-group.is-loading .play-main{opacity:.7}",
        ".play-menu{display:none;position:absolute;right:0;top:calc(100% + 4px);min-width:10rem;background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.45);z-index:20;padding:.25rem;max-height:14rem;overflow:auto}",
        ".play-menu.open{display:block}",
        ".play-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;border-radius:6px;padding:.4rem .55rem;font:inherit;font-size:.82rem;color:var(--text);cursor:pointer}",
        ".play-menu button:hover{background:#2c3344}",
        ".play-menu button.is-active{background:#2a4a72;color:#eaf3ff}",
        ".play-hint{font-size:.72rem;color:var(--muted);max-width:12rem;text-align:right}",
        ".play-hint.is-err{color:var(--bad)}",
        ".tune-id{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.72rem;"
        "color:var(--muted);letter-spacing:.01em;user-select:all}",
        ".tune-id::before{content:'id ';font-family:inherit;opacity:.7}",
        ".complete-chk{display:inline-flex;align-items:center;gap:.4rem;font-size:.86rem;color:var(--muted);cursor:pointer;user-select:none}",
        ".complete-chk input{width:1rem;height:1rem;accent-color:var(--ok)}",
        ".complete-chk.is-on{color:var(--ok);font-weight:600}",
        ".filter-bar{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin-top:.55rem}",
        ".filter-bar button{min-width:6.5rem}",
        ".filter-bar button.active{background:#2a5240;border-color:#3d7a5c;color:#e8fff3}",
        ".filter-bar button.active.incomplete{background:#5a3a2a;border-color:#7a553d;color:#ffe8d8}",
        ".filter-bar button.active.omr{background:#1a3a48;border-color:#3a6a78;color:#d8f0ff}",
        ".filter-bar button.active.abc{background:#2a3a5a;border-color:#4a5a7a;color:#e0e8ff}",
        ".filter-bar .tally{font-variant-numeric:tabular-nums;opacity:.9}",
        ".filter-bar .pct{color:var(--muted);font-size:.82rem;margin-left:.15rem}",
        ".filter-bar .sep{width:1px;height:1.4rem;background:var(--line);margin:0 .15rem}",
        "@media (max-width:720px){.tune{grid-template-columns:1fr}}",
        ".col-image,.col-notation,.col-abc,.left,.right{min-width:0}",
        ".label{font-size:.78rem;color:var(--muted);margin-bottom:.35rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}",
        ".badge{display:inline-block;border-radius:999px;padding:.1rem .5rem;border:1px solid var(--line);font-size:.72rem}",
        ".badge.omr{color:var(--ok);border-color:#355a48}",
        ".badge.session{color:var(--accent);border-color:#3a5378}",
        ".badge.missing{color:var(--bad);border-color:#6a3a3a}",
        ".badge.warn{color:var(--warn);border-color:#6a5530}",
        ".badge.chords{color:var(--ok);border-color:#3d7a5c;background:#1a2e24}",
        "h2{margin:0 0 .55rem;font-size:1.02rem;line-height:1.3}",
        ".crop-wrap{position:relative;background:#0d0f14;border:1px solid var(--line);border-radius:8px;overflow:auto;max-height:70vh;user-select:none}",
        ".crop-wrap img{display:block;width:100%;height:auto;pointer-events:none}",
        ".crop-stage{position:relative;display:block;width:100%}",
        ".bad-rect{position:absolute;border:2px solid var(--bad);background:rgba(224,122,122,.22);pointer-events:none;box-sizing:border-box}",
        ".bad-rect.drawing{border-style:dashed;background:rgba(224,122,122,.12)}",
        ".crop-hint{font-size:.72rem;color:var(--muted);margin:.3rem 0 .2rem}",
        ".notation-toolbar{display:flex;flex-wrap:wrap;gap:.55rem;align-items:center;margin:.45rem 0 .45rem}",
        ".notation-actions{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:0 0 .45rem}",
        ".notation-align-spacer{width:100%;pointer-events:none}",
        ".col-notation .label{margin-bottom:.35rem}",
        ".notation-toolbar .tb-label{font-size:.78rem;color:var(--muted)}",
        ".notation-toolbar select{background:#0d0f14;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:.25rem .4rem;font:inherit;font-size:.82rem}",
        ".notation-toolbar select.overridden{border-color:var(--warn);color:var(--warn)}",
        ".btn-group{display:inline-flex;align-items:stretch;border:1px solid var(--line);border-radius:8px;overflow:hidden}",
        ".btn-group button{border:0;border-radius:0;padding:.3rem .65rem;background:#252b38}",
        ".btn-group button+button{border-left:1px solid var(--line)}",
        ".btn-group button:hover{background:#2c3344}",
        ".btn-group .btn-value{min-width:2.4rem;text-align:center;font-variant-numeric:tabular-nums;pointer-events:none;background:#1a1f2a;color:var(--accent);font-weight:600}",
        ".btn-group.overridden{border-color:var(--warn)}",
        ".btn-group.overridden .btn-value{color:var(--warn)}",
        ".staff{background:#fff;color:#111;border-radius:8px;border:1px solid var(--line);padding:1.1rem .55rem .55rem;overflow:auto;min-height:80px;max-height:70vh;position:relative}",
        ".staff.abcjs-container{overflow:visible!important}",
        ".staff .abcjs-container{max-width:100%}",
        ".staff .abcjs-note,.staff .abcjs-rest,.staff .abcjs-chord,.staff .abcjs-decoration{cursor:pointer}",
        ".staff .abcjs-highlight{fill:#2a4a72!important;stroke:#2a4a72!important}",
        ".staff.chord-edit-active .abcjs-annotation,.staff.chord-edit-active .abcjs-chord{opacity:0!important}",
        ".staff-chord-layer{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:6;overflow:visible;isolation:isolate}",
        ".review-chord{position:absolute;transform:translate(-50%,-100%);font-weight:700;font-size:.82rem;line-height:1.1;color:#111;pointer-events:auto;user-select:none;white-space:nowrap;padding:0 3px;touch-action:none;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.16);border-radius:3px;z-index:4}",
        ".review-chord--draggable{cursor:grab;z-index:5}",
        ".review-chord--draggable:active{cursor:grabbing}",
        ".review-chord--add{color:#0a58ca;opacity:1;min-width:.95em;height:1.05em;text-align:center;cursor:pointer;background:rgba(232,240,254,.95);border:1px solid #0d6efd;font:inherit;font-weight:700;padding:0 2px;line-height:1.05em;z-index:1}",
        ".review-chord--add:hover,.review-chord--add:focus{opacity:1;background:#0d6efd;color:#fff}",
        ".review-chord--source{opacity:.35;z-index:3}",
        ".review-chord--ghost{position:fixed;transform:translate(-50%,-100%);pointer-events:none;z-index:50;opacity:.9;text-shadow:0 1px 2px rgba(255,255,255,.8)}",
        ".review-chord-hit{position:absolute;transform:translate(-50%,-50%);width:22px;height:34px;pointer-events:none;border-radius:3px}",
        ".review-chord-hit.is-target{outline:2px solid #0d6efd;outline-offset:1px;background:rgba(13,110,253,.14)}",
        ".chord-dialog-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:40;align-items:center;justify-content:center}",
        ".chord-dialog-backdrop.open{display:flex}",
        ".chord-dialog{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1rem 1.1rem;min-width:min(92vw,320px);box-shadow:0 12px 40px rgba(0,0,0,.4)}",
        ".chord-dialog h3{margin:0 0 .65rem;font-size:1rem}",
        ".chord-dialog p{margin:0 0 .75rem;font-size:.86rem;line-height:1.4;color:var(--muted)}",
        ".chord-dialog p strong{color:var(--warn);font-weight:600}",
        ".chord-dialog label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:.25rem}",
        ".chord-dialog input{width:100%;border:1px solid var(--line);border-radius:8px;background:#0d0f14;color:var(--text);padding:.45rem .6rem;font:inherit;font-size:1rem;margin-bottom:.75rem}",
        ".chord-dialog .row{display:flex;flex-wrap:wrap;gap:.4rem;justify-content:flex-end}",
        ".err{color:var(--bad);font-size:.85rem;padding:.4rem}",
        ".issues{margin:0 0 .15rem;border:1px solid var(--line);border-radius:8px;background:#141824;padding:.45rem .55rem}",
        ".issues-title{font-size:.78rem;color:var(--muted);margin-bottom:.3rem}",
        ".issue{font-size:.78rem;line-height:1.35;padding:.2rem 0;border-bottom:1px solid #222836}",
        ".issue:last-child{border-bottom:0}",
        ".issue .sev{font-weight:600;margin-right:.35rem}",
        ".issue.error .sev{color:var(--bad)}",
        ".issue.warning .sev,.issue.info .sev{color:var(--warn)}",
        ".issue .code{color:var(--muted);font-family:ui-monospace,monospace;font-size:.72rem}",
        "details{margin-top:.45rem}",
        "summary{cursor:pointer;color:var(--muted);font-size:.82rem}",
        "pre{margin:.4rem 0 0;padding:.6rem;background:#0d0f14;border:1px solid var(--line);border-radius:8px;overflow:auto;font-size:.75rem;line-height:1.35;white-space:pre-wrap}",
        "textarea.abc-edit{width:100%;min-height:14rem;resize:vertical;border:1px solid var(--line);border-radius:8px;background:#0d0f14;color:var(--text);padding:.55rem .65rem;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;line-height:1.4;tab-size:2}",
        "textarea.abc-edit:focus{outline:2px solid #3d6aa0;outline-offset:1px;border-color:#3d6aa0}",
        "textarea.abc-edit.is-edited{border-color:var(--warn)}",
        ".abc-toolbar{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:.45rem 0 .35rem}",
        ".abc-toolbar .hint,.notation-actions .hint{color:var(--muted);font-size:.72rem}",
        ".comment-box{margin:0 0 .55rem}",
        ".comment-box label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:.3rem}",
        ".comment-box textarea{width:100%;min-height:4.5rem;resize:vertical;border:1px solid var(--line);border-radius:8px;background:#0d0f14;color:var(--text);padding:.55rem .65rem;font:inherit;font-size:.88rem;line-height:1.35}",
        ".comment-box textarea:focus{outline:2px solid #3d6aa0;outline-offset:1px;border-color:#3d6aa0}",
        ".comment-box textarea.has-text{border-color:#6a5530}",
        ".options{margin-top:.75rem;border:1px solid var(--line);border-radius:8px;background:#141824;padding:.45rem .55rem}",
        ".options-title{font-size:.78rem;color:var(--muted);margin-bottom:.35rem}",
        ".options-list{display:flex;flex-direction:column;gap:.2rem}",
        ".options-add{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin-top:.55rem;padding-top:.45rem;border-top:1px solid var(--line)}",
        ".options-add .hint{color:var(--muted);font-size:.75rem}",
        ".options-add .hint.is-err{color:var(--bad)}",
        ".options-add .hint.is-ok{color:var(--ok)}",
        ".opt{display:flex;gap:.45rem;align-items:flex-start;padding:.35rem .25rem;border-radius:6px}",
        ".opt:hover{background:#1c2230}",
        ".opt input{margin-top:.2rem}",
        ".opt .meta{font-size:.8rem;line-height:1.35}",
        ".opt .meta strong{font-weight:600}",
        ".opt .sub{color:var(--muted);font-size:.72rem}",
        "</style></head><body>",
        "<header>",
        "<h1>EuroSession ABC review</h1>",
        f"<div class='meta'>{len(tunes)} tunes · {resolved} resolved · "
        f"{chorded} with chorded option · {chorded_sel} chorded selected · "
        f"<a href='review.html'>crop review</a> · "
        f"<a href='#' id='eurosession-abc-link' download='eurosession.abc' "
        f"title='Download ABC built from current review selections'>eurosession.abc</a></div>",
        "<div class='toolbar'>",
        "<button type='button' class='primary' id='copy-btn'>Copy comments for Copilot</button>",
        "<button type='button' class='primary' id='export-tunebook-import-btn' "
        "title='Download eurosession-import.json for abc2book (ABC edits, complete flags, stable tune ids, crop names)'>"
        "Export tunebook import</button>",
        "<label class='chk'><input type='checkbox' id='copy-all'> Include all tunes (not just commented)</label>",
        "<label class='chk'><input type='checkbox' id='prefer-chords' checked> Prefer chorded when picking defaults</label>",
        "<button type='button' class='danger' id='clear-data-btn' title='Clear all saved review data in this browser'>Clear saved data</button>",
        "<span class='hint' id='comment-count'>0 comments saved</span>",
        "</div>",
        "<div class='filter-bar' id='complete-filter-bar' role='group' aria-label='Filter tunes'>",
        "<button type='button' id='filter-all' data-filter='all' class='active'>All <span class='tally' id='tally-all'>0</span></button>",
        "<button type='button' id='filter-complete' data-filter='complete'>Complete <span class='tally' id='tally-complete'>0</span></button>",
        "<button type='button' id='filter-incomplete' data-filter='incomplete' class='incomplete'>Incomplete <span class='tally' id='tally-incomplete'>0</span></button>",
        "<span class='sep' aria-hidden='true'></span>",
        "<button type='button' id='filter-omr' data-filter='omr' class='omr' title='Current selection is OMR / OMR-chords'>OMR <span class='tally' id='tally-omr'>0</span></button>",
        "<button type='button' id='filter-abc' data-filter='abc' class='abc' title='Current selection is archive/session ABC'>ABC <span class='tally' id='tally-abc'>0</span></button>",
        "<span class='pct' id='complete-pct'>0 / 0 complete (0%)</span>",
        "</div>",
        "<nav id='toc'></nav>",
        "</header>",
        "<main id='list'></main>",
        "<div class='chord-dialog-backdrop' id='chord-dialog-backdrop' aria-hidden='true'>",
        "<div class='chord-dialog' role='dialog' aria-modal='true' aria-labelledby='chord-dialog-title'>",
        "<h3 id='chord-dialog-title'>Edit chord</h3>",
        "<label for='chord-dialog-input'>Chord symbol</label>",
        "<input id='chord-dialog-input' type='text' autocomplete='off' spellcheck='false' placeholder='Am, G7, D…'>",
        "<div class='row'>",
        "<button type='button' id='chord-dialog-remove' class='danger'>Remove</button>",
        "<button type='button' id='chord-dialog-cancel'>Cancel</button>",
        "<button type='button' id='chord-dialog-save' class='primary'>Save</button>",
        "</div></div></div>",
        "<div class='chord-dialog-backdrop' id='clear-data-backdrop' aria-hidden='true'>",
        "<div class='chord-dialog' role='dialog' aria-modal='true' aria-labelledby='clear-data-title'>",
        "<h3 id='clear-data-title'>Clear saved data?</h3>",
        "<p>This removes comments, complete ticks, ABC edits, transpose/meter overrides, "
        "bad-section marks, source selections, MusicXML uploads, and stable tune ids.</p>",
        "<p><strong>Warning:</strong> clearing ids means the next tunebook import will create "
        "NEW tunes instead of updating existing ones.</p>",
        "<div class='row'>",
        "<button type='button' id='clear-data-cancel'>Cancel</button>",
        "<button type='button' id='clear-data-confirm' class='danger'>Clear saved data</button>",
        "</div></div></div>",
        f"<script id='tunes-data' type='application/json'>{payload_json}</script>",
        f"<script id='meter-options' type='application/json'>{meters_json}</script>",
        "<script>",
        r"""
const STORAGE_KEY = 'eurosession-abc-review-state-v3';
const tunes = JSON.parse(document.getElementById('tunes-data').textContent);
const METER_OPTIONS = JSON.parse(document.getElementById('meter-options').textContent);
const list = document.getElementById('list');
const toc = document.getElementById('toc');
const copyBtn = document.getElementById('copy-btn');
const exportTunebookImportBtn = document.getElementById('export-tunebook-import-btn');
const copyAllChk = document.getElementById('copy-all');
const preferChordsChk = document.getElementById('prefer-chords');
const clearDataBtn = document.getElementById('clear-data-btn');
const commentCountEl = document.getElementById('comment-count');
const IMPORT_BOOK = 'eurosession';

function emptyState() {
  return {
    comments: {},
    selections: {},
    transposeOverrides: {},
    meterOverrides: {},
    badSections: {},
    abcEdits: {},
    abcHistory: {},
    completed: {},
    tuneIds: {},
    customCandidates: {},
    completeFilter: 'all',
    copyAll: false,
    preferChords: true,
  };
}

/** Same shape as abc2book utils.generateObjectId — stable Mongo-style hex ids. */
function generateTuneObjectId() {
  const timestamp = (Date.now() / 1000 | 0).toString(16);
  return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
    return (Math.random() * 16 | 0).toString(16);
  }).toLowerCase();
}

function commentKey(t) {
  return `p${String(t.page).padStart(2,'0')}_t${String(t.tuneIndex).padStart(2,'0')}`;
}

/** Ensure every review tune has a persistent tunebook id in localStorage. */
function ensureTuneIds(stateObj) {
  if (!stateObj.tuneIds || typeof stateObj.tuneIds !== 'object') stateObj.tuneIds = {};
  let changed = false;
  for (let i = 0; i < tunes.length; i++) {
    const key = commentKey(tunes[i]);
    const existing = String(stateObj.tuneIds[key] || '').trim();
    if (!existing) {
      stateObj.tuneIds[key] = generateTuneObjectId();
      changed = true;
    }
  }
  return changed;
}

function getTuneId(t) {
  const key = commentKey(t);
  if (!state.tuneIds || typeof state.tuneIds !== 'object') state.tuneIds = {};
  if (!String(state.tuneIds[key] || '').trim()) {
    state.tuneIds[key] = generateTuneObjectId();
    saveState(state);
  }
  return state.tuneIds[key];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('eurosession-abc-review-state-v2');
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object') return emptyState();
    const base = emptyState();
    const filter = data.completeFilter;
    const allowedFilters = { all: 1, complete: 1, incomplete: 1, omr: 1, abc: 1 };
    return Object.assign(base, data, {
      comments: data.comments && typeof data.comments === 'object' ? data.comments : {},
      selections: data.selections && typeof data.selections === 'object' ? data.selections : {},
      transposeOverrides: data.transposeOverrides && typeof data.transposeOverrides === 'object' ? data.transposeOverrides : {},
      meterOverrides: data.meterOverrides && typeof data.meterOverrides === 'object' ? data.meterOverrides : {},
      badSections: data.badSections && typeof data.badSections === 'object' ? data.badSections : {},
      abcEdits: data.abcEdits && typeof data.abcEdits === 'object' ? data.abcEdits : {},
      abcHistory: data.abcHistory && typeof data.abcHistory === 'object' ? data.abcHistory : {},
      completed: data.completed && typeof data.completed === 'object' ? data.completed : {},
      tuneIds: data.tuneIds && typeof data.tuneIds === 'object' ? data.tuneIds : {},
      customCandidates: data.customCandidates && typeof data.customCandidates === 'object' ? data.customCandidates : {},
      completeFilter: allowedFilters[filter] ? filter : 'all',
      copyAll: Boolean(data.copyAll),
      preferChords: data.preferChords !== false,
    });
  } catch (_) {
    return emptyState();
  }
}
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let state = loadState();
if (ensureTuneIds(state)) saveState(state);
if (!state.customCandidates || typeof state.customCandidates !== 'object') state.customCandidates = {};
copyAllChk.checked = Boolean(state.copyAll);
preferChordsChk.checked = state.preferChords !== false;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function sourceBadge(source) {
  const s = source || 'missing';
  let cls = 'badge warn';
  let label = s;
  if (s === 'omr+' || s === 'omr-plus') {
    cls = 'badge omr';
    label = 'OMR+';
  } else if (s === 'omr-chords') {
    cls = 'badge omr';
    label = 'OMR+chords';
  } else if (s === 'omr' || String(s).toLowerCase().startsWith('omr')) {
    cls = 'badge omr';
  } else if (s.startsWith('thesession') || s.startsWith('search') || s.startsWith('musicxml')) {
    cls = 'badge session';
  } else if (s === 'missing') {
    cls = 'badge missing';
  }
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function mergeCustomCandidates() {
  for (const t of tunes) {
    const key = commentKey(t);
    const extras = state.customCandidates[key];
    if (!Array.isArray(extras) || !extras.length) continue;
    if (!Array.isArray(t.candidates)) t.candidates = [];
    for (const c of extras) {
      if (!c || !c.id || !c.abc) continue;
      const idx = t.candidates.findIndex(x => x && x.id === c.id);
      if (idx >= 0) t.candidates[idx] = Object.assign({}, t.candidates[idx], c);
      else t.candidates.push(c);
    }
  }
}
mergeCustomCandidates();

function fnv1aHex(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ('0000000000' + h.toString(16)).slice(-10);
}

function candidateIdFromAbc(source, abc) {
  const digest = fnv1aHex(String(source || '') + '\n' + String(abc || '').slice(0, 800));
  const safe = String(source || 'src').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 40);
  return safe + '-' + digest;
}

function isMusicXmlText(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 200).toLowerCase();
  return head.indexOf('<?xml') !== -1
    || head.indexOf('<score-partwise') !== -1
    || head.indexOf('<score-timewise') !== -1;
}

function titleFromFileName(fileName) {
  const base = String(fileName || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').trim() || 'Untitled';
}

function findZipEntry(zip, path) {
  if (zip.files[path]) return zip.files[path];
  const normalized = String(path || '').replace(/^\.\//, '');
  if (zip.files[normalized]) return zip.files[normalized];
  const lower = normalized.toLowerCase();
  const key = Object.keys(zip.files).find(k => k.toLowerCase() === lower);
  return key ? zip.files[key] : null;
}

async function extractMusicXmlFromMxl(arrayBuffer) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip failed to load');
  const zip = await JSZip.loadAsync(arrayBuffer);
  let rootPath = 'score.xml';
  const container = findZipEntry(zip, 'META-INF/container.xml');
  if (container) {
    const containerXml = await container.async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(containerXml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid MXL container metadata');
    const rootfile = doc.getElementsByTagName('rootfile')[0];
    const fullPath = rootfile && rootfile.getAttribute('full-path');
    if (!fullPath) throw new Error('MXL archive has no rootfile entry');
    rootPath = fullPath;
  }
  const scoreEntry = findZipEntry(zip, rootPath);
  if (!scoreEntry) throw new Error('Could not find MusicXML file "' + rootPath + '" inside MXL archive');
  const musicXml = await scoreEntry.async('text');
  if (!isMusicXmlText(musicXml)) throw new Error('MXL archive does not contain valid MusicXML');
  return musicXml;
}

function musicXmlTextToAbc(musicXmlText, fileName) {
  const convert = typeof window.vertaal === 'function' ? window.vertaal : null;
  if (!convert) throw new Error('xml2abc failed to load');
  const normalized = String(musicXmlText || '').trim();
  if (!normalized) throw new Error('MusicXML input is empty');
  if (!isMusicXmlText(normalized)) throw new Error('Input is not valid MusicXML');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(normalized, 'text/xml');
  if (xmlDoc.querySelector('parsererror')) throw new Error('MusicXML parse failed');
  const options = {
    u: 0, b: 4, n: 0, c: 0, v: 0, d: 0, m: 1, x: 0, t: 0,
    v1: 0, noped: 0, stm: 0, p: 'f', s: 0, addstavenum: 0, rehparts: 0, addq: 0, q: 100, mnum: -1,
  };
  const result = convert(xmlDoc, options);
  let abcText = result && result[0] ? String(result[0]) : '';
  if (!abcText.trim()) throw new Error('MusicXML conversion produced no ABC output');
  const title = titleFromFileName(fileName);
  abcText = abcText.replace(/T:Title\b/g, 'T:' + title);
  abcText = abcText.replace(/Music21 Fragment/g, title).replace(/Music21/g, '');
  return abcText.trim();
}

async function musicXmlFileToAbc(file) {
  const name = file && file.name ? file.name : 'score.xml';
  const lower = name.toLowerCase();
  let xmlText;
  if (lower.endsWith('.mxl')) {
    xmlText = await extractMusicXmlFromMxl(await file.arrayBuffer());
  } else {
    xmlText = await file.text();
  }
  return musicXmlTextToAbc(xmlText, name);
}

function optionLabelHtml(t, c, selectedId) {
  const checked = c.id === selectedId ? 'checked' : '';
  const chordBadge = c.hasChords
    ? `<span class="badge chords">${c.chords} chords</span>`
    : `<span class="badge">${c.chords||0} chords</span>`;
  const iss = (c.notationIssues || []).length;
  const issBadge = iss ? `<span class="badge warn">${iss} issues</span>` : '';
  return `<label class="opt">
      <input type="radio" name="opt-${t.id}" value="${escapeHtml(c.id)}" ${checked}>
      <div class="meta">
        <div><strong>${escapeHtml(c.matchedTitle || c.source)}</strong> ${sourceBadge(c.source)} ${chordBadge} ${issBadge}</div>
        <div class="sub">score ${c.score ?? '—'} · ${escapeHtml(c.url || '')}</div>
      </div>
    </label>`;
}

function wireOptionRadios(t, root) {
  const key = commentKey(t);
  const scope = root || document.getElementById(t.id) || document;
  scope.querySelectorAll(`input[name="opt-${t.id}"]`).forEach(input => {
    input.addEventListener('change', () => {
      state.selections[key] = input.value;
      delete state.transposeOverrides[key];
      delete state.meterOverrides[key];
      saveState(state);
      renderStaff(t);
      updateCommentUI();
    });
  });
}

function rebuildOptionsList(t) {
  const listEl = document.getElementById('options-list-' + t.id);
  if (!listEl) return;
  const selectedId = getSelectedId(t);
  const html = (t.candidates || []).map(c => optionLabelHtml(t, c, selectedId)).join('');
  listEl.innerHTML = html || '<div class="sub">No alternate sources</div>';
  wireOptionRadios(t, listEl);
}

function persistCustomCandidate(t, candidate) {
  const key = commentKey(t);
  if (!state.customCandidates || typeof state.customCandidates !== 'object') state.customCandidates = {};
  const list = Array.isArray(state.customCandidates[key]) ? state.customCandidates[key].slice() : [];
  const fileSource = String(candidate.source || '');
  // Replace prior MusicXML upload for the same filename source label.
  const filtered = list.filter(c => String(c && c.source || '') !== fileSource);
  filtered.push(candidate);
  state.customCandidates[key] = filtered;
}

async function addMusicXmlSource(t, file, hintEl) {
  if (!file) return;
  if (hintEl) {
    hintEl.className = 'hint';
    hintEl.textContent = 'Converting…';
  }
  try {
    const abc = await musicXmlFileToAbc(file);
    const fileName = file.name || 'score.xml';
    const source = 'musicxml:' + fileName;
    const chordMatches = abc.match(/"\s*[A-G]/gi);
    const candidate = {
      id: candidateIdFromAbc(source, abc),
      source: source,
      matchedTitle: titleFromFileName(fileName),
      url: '',
      score: null,
      chords: chordMatches ? chordMatches.length : 0,
      hasChords: Boolean(chordMatches && chordMatches.length),
      abc: abc,
      notationIssues: [],
    };
    if (!Array.isArray(t.candidates)) t.candidates = [];
    // Drop previous custom candidate with same source filename.
    t.candidates = t.candidates.filter(c => String(c && c.source || '') !== source);
    t.candidates.push(candidate);
    persistCustomCandidate(t, candidate);
    const key = commentKey(t);
    state.selections[key] = candidate.id;
    delete state.transposeOverrides[key];
    delete state.meterOverrides[key];
    saveState(state);
    rebuildOptionsList(t);
    renderStaff(t);
    updateCommentUI();
    if (hintEl) {
      hintEl.className = 'hint is-ok';
      hintEl.textContent = 'Added and selected: ' + fileName;
    }
  } catch (err) {
    if (hintEl) {
      hintEl.className = 'hint is-err';
      hintEl.textContent = (err && err.message) ? err.message : String(err);
    }
  }
}

function getSelectedId(t) {
  const key = commentKey(t);
  if (state.selections[key]) return state.selections[key];
  return t.selectedCandidateId || (t.candidates[0] && t.candidates[0].id) || '';
}

function getSelectedCandidate(t) {
  const id = getSelectedId(t);
  return (t.candidates || []).find(c => c.id === id) || (t.candidates || [])[0] || null;
}

function abcEditKey(t) {
  return commentKey(t) + '::' + getSelectedId(t);
}

function getBaseAbc(t) {
  const cand = getSelectedCandidate(t);
  return (cand && cand.abc) || t.abc || '';
}

function parseAbcbookTranspose(abc) {
  const m = String(abc || '').match(/^%\s*abcbook-transpose\s+(-?\d+)\s*$/m)
    || String(abc || '').match(/^%%MIDI transpose\s+(-?\d+)\s*$/m);
  return m ? parseInt(m[1], 10) : 0;
}

function parseAbcMeter(abc) {
  const m = String(abc || '').match(/^M:\s*(.+)$/m);
  return m ? m[1].trim() : '4/4';
}

function setAbcMeter(abc, meter) {
  const lines = String(abc || '').split('\n');
  let found = false;
  const out = lines.map(line => {
    if (/^M:/i.test(line.trim())) {
      found = true;
      return 'M:' + meter;
    }
    return line;
  });
  if (!found) {
    let insertAt = 0;
    for (let i = 0; i < out.length; i++) {
      const t = out[i].trim();
      if (/^[XT]:/i.test(t)) insertAt = i + 1;
      else if (/^[A-Za-z]:/.test(t) || t.startsWith('%')) insertAt = i + 1;
      else break;
    }
    out.splice(insertAt, 0, 'M:' + meter);
  }
  return out.join('\n');
}

function setAbcTranspose(abc, semis) {
  const n = parseInt(semis, 10) || 0;
  const lines = String(abc || '').split('\n').filter(function(line) {
    const t = line.trim();
    if (/^%%MIDI transpose\s+-?\d+\s*$/i.test(t)) return false;
    if (/^%\s*abcbook-transpose\s+-?\d+\s*$/i.test(t)) return false;
    if (/^%\s*abcbook-playback-transpose\s+-?\d+\s*$/i.test(t)) return false;
    return true;
  });
  let body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (n) body = body + '\n% abcbook-transpose ' + n + '\n%%MIDI transpose ' + n;
  return body + '\n';
}

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}

/** Halve/double written note lengths by scaling L: unit length. */
function scaleAbcUnitLength(abc, factor) {
  const lines = String(abc || '').split('\n');
  let found = false;
  const out = lines.map(line => {
    const m = line.trim().match(/^L:\s*(\d+)\s*\/\s*(\d+)/i);
    if (!m) return line;
    found = true;
    let num = parseInt(m[1], 10);
    let den = parseInt(m[2], 10);
    if (factor === 0.5) {
      den = den * 2;
    } else if (factor === 2) {
      if (den % 2 === 0) den = den / 2;
      else num = num * 2;
    } else {
      return line;
    }
    const g = gcd(num, den);
    num = num / g;
    den = den / g;
    return 'L:' + num + '/' + den;
  });
  if (!found) {
    const def = factor === 0.5 ? 'L:1/16' : 'L:1/4';
    let insertAt = 0;
    for (let i = 0; i < out.length; i++) {
      const t = out[i].trim();
      if (/^[XTM]:/i.test(t)) insertAt = i + 1;
      else if (/^[A-Za-z]:/.test(t) || t.startsWith('%')) insertAt = i + 1;
      else break;
    }
    out.splice(insertAt, 0, def);
  }
  return out.join('\n');
}

/** Move transpose comments to end of tune so they never sit between K: and notes. */
function relocateTransposeComments(abc) {
  const text = String(abc || '');
  const semis = parseAbcbookTranspose(text);
  const lines = text.split('\n').filter(function(line) {
    const t = line.trim();
    if (/^%%MIDI transpose\s+-?\d+\s*$/i.test(t)) return false;
    if (/^%\s*abcbook-transpose\s+-?\d+\s*$/i.test(t)) return false;
    if (/^%\s*abcbook-playback-transpose\s+-?\d+\s*$/i.test(t)) return false;
    return true;
  });
  const out = [];
  let seenMusic = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) {
      if (seenMusic) out.push(lines[i]);
      continue;
    }
    const isHeader = /^[A-Za-z]:/.test(t) || t.startsWith('%');
    if (!seenMusic && !isHeader) seenMusic = true;
    out.push(lines[i]);
  }
  let body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (semis) {
    body = body + '\n% abcbook-transpose ' + semis + '\n%%MIDI transpose ' + semis;
  }
  return body + '\n';
}

function isSkippedRenderLine(t) {
  return /^%%MIDI transpose\s+-?\d+\s*$/i.test(t)
    || /^%\s*abcbook-transpose\s+-?\d+\s*$/i.test(t)
    || /^%\s*abcbook-playback-transpose\s+-?\d+\s*$/i.test(t);
}

/**
 * Build engraving ABC + map render char indices → source (textarea) indices.
 * Render-only: strip transpose comments; expand |1 / :|2 → |[1 / :|[2.
 */
function prepareAbcForRender(abc) {
  const source = String(abc || '');
  let render = '';
  const toSource = [];

  function emitSrc(srcIdx, ch) {
    render += ch;
    toSource.push(srcIdx);
  }
  function emitIns(srcIdx, ch) {
    render += ch;
    toSource.push(srcIdx);
  }

  function emitMusicLine(line, lineStart) {
    let i = 0;
    while (i < line.length) {
      const srcIdx = lineStart + i;
      const ch = line[i];
      if (ch === '|') {
        emitSrc(srcIdx, '|');
        i += 1;
        // "| 1" → "|1" (drop spaces before volta digit)
        let k = i;
        while (k < line.length && /\s/.test(line[k])) k += 1;
        if (k > i && /\d/.test(line[k] || '')) i = k;
        if (/\d/.test(line[i] || '')) emitIns(lineStart + i, '[');
        continue;
      }
      // ":|2" / ":| 2" → ":|[2"
      if (ch === ':' && line[i + 1] === '|') {
        emitSrc(srcIdx, ':');
        emitSrc(lineStart + i + 1, '|');
        i += 2;
        let k = i;
        while (k < line.length && /\s/.test(line[k])) k += 1;
        if (k > i && /\d/.test(line[k] || '')) i = k;
        if (/\d/.test(line[i] || '')) emitIns(lineStart + i, '[');
        continue;
      }
      emitSrc(srcIdx, ch);
      i += 1;
    }
  }

  let pos = 0;
  while (pos <= source.length) {
    const nextNl = source.indexOf('\n', pos);
    const lineEnd = nextNl < 0 ? source.length : nextNl;
    const line = source.slice(pos, lineEnd);
    const t = line.trim();
    if (!isSkippedRenderLine(t)) {
      if (!t || t.charAt(0) === '%' || /^[A-Za-z]:/.test(t)) {
        for (let k = 0; k < line.length; k++) emitSrc(pos + k, line[k]);
      } else {
        emitMusicLine(line, pos);
      }
      if (nextNl >= 0) emitSrc(nextNl, '\n');
    }
    if (nextNl < 0) break;
    pos = nextNl + 1;
  }

  // Match prior abcForRender(...).trim()
  let start = 0;
  let end = render.length;
  while (start < end && /\s/.test(render.charAt(start))) start += 1;
  while (end > start && /\s/.test(render.charAt(end - 1))) end -= 1;
  const text = render.slice(start, end);
  const map = toSource.slice(start, end);

  return {
    text: text,
    mapRange: function(startChar, endChar) {
      if (!map.length) return { start: 0, end: 0 };
      let a = typeof startChar === 'number' ? startChar : 0;
      let b = typeof endChar === 'number' ? endChar : a;
      if (a > b) { const tmp = a; a = b; b = tmp; }
      a = Math.max(0, Math.min(a, map.length - 1));
      b = Math.max(a + 1, Math.min(b, map.length));
      const srcStart = map[a];
      const srcEnd = map[b - 1] + 1;
      return { start: srcStart, end: Math.max(srcStart + 1, srcEnd) };
    },
  };
}

function abcForRender(abc) {
  return prepareAbcForRender(abc).text;
}

/**
 * abcjs visualTranspose crashes on some modal keys (e.g. Dphr → Abphr) when
 * keyAccidentals() returns null. Rewrite modal K: to relative major and fold
 * explicit key accidentals (e.g. ^F) into note spellings for the render pass only.
 */
const MODE_RELATIVE_MAJOR = (function() {
  const table = {
    C: ['C', 'Am', 'Amin', 'GMix', 'DDor', 'EPhr', 'FLyd', 'BLoc'],
    Db: ['Db', 'Bbm', 'Bbmin', 'AbMix', 'EbDor', 'FPhr', 'GbLyd', 'CLoc'],
    D: ['D', 'Bm', 'Bmin', 'AMix', 'EDor', 'F#Phr', 'GLyd', 'C#Loc'],
    Eb: ['Eb', 'Cm', 'Cmin', 'BbMix', 'FDor', 'GPhr', 'AbLyd', 'DLoc'],
    E: ['E', 'C#m', 'C#min', 'BMix', 'F#Dor', 'G#Phr', 'ALyd', 'D#Loc'],
    F: ['F', 'Dm', 'Dmin', 'CMix', 'GDor', 'APhr', 'BbLyd', 'ELoc'],
    Gb: ['Gb', 'Ebm', 'Ebmin', 'DbMix', 'AbDor', 'BbPhr', 'CbLyd', 'FLoc'],
    G: ['G', 'Em', 'Emin', 'DMix', 'ADor', 'BPhr', 'CLyd', 'F#Loc'],
    Ab: ['Ab', 'Fm', 'Fmin', 'EbMix', 'BbDor', 'CPhr', 'DbLyd', 'GLoc'],
    A: ['A', 'F#m', 'F#min', 'EMix', 'BDor', 'C#Phr', 'DLyd', 'G#Loc'],
    Bb: ['Bb', 'Gm', 'Gmin', 'FMix', 'CDor', 'DPhr', 'EbLyd', 'ALoc'],
    B: ['B', 'G#m', 'G#min', 'F#Mix', 'C#Dor', 'D#Phr', 'ELyd', 'A#Loc'],
    'C#': ['C#', 'A#m', 'A#min', 'G#Mix', 'D#Dor', 'E#Phr', 'F#Lyd', 'B#Loc'],
    'F#': ['F#', 'D#m', 'D#min', 'C#Mix', 'G#Dor', 'A#Phr', 'BLyd', 'E#Loc'],
    Cb: ['Cb', 'Abm', 'Abmin', 'GbMix', 'DbDor', 'EbPhr', 'FbLyd', 'BbLoc'],
  };
  const out = {};
  Object.keys(table).forEach(function(maj) {
    out[maj.toLowerCase()] = maj;
    table[maj].forEach(function(modeName) {
      out[String(modeName).toLowerCase()] = maj;
    });
  });
  return out;
})();

function parseKeyExplicitAccidentals(keyBody) {
  const found = [];
  const re = /(\^{1,2}|_{1,2}|={1})([A-Ga-g])/g;
  const s = String(keyBody || '');
  let m;
  while ((m = re.exec(s)) !== null) {
    found.push({ prefix: m[1], letter: m[2] });
  }
  return found;
}

function relativeMajorKeyName(keyBody) {
  const compact = String(keyBody || '').replace(/\s+/g, '');
  const core = compact.replace(/(\^{1,2}|_{1,2}|=)([A-Ga-g])/g, '');
  const m = core.match(/^([A-G][#b]?)(.*)$/i);
  if (!m) return 'C';
  const root = m[1];
  const rest = m[2] || '';
  const modeM = rest.match(/^(maj|ionian|min|aeolian|m|mix|dor|phr|lyd|loc)/i);
  let mode = modeM ? modeM[1].toLowerCase() : '';
  if (mode === 'aeolian') mode = 'min';
  if (mode === 'ionian') mode = '';
  if (mode === 'maj') mode = '';
  const lookup = (root + mode).toLowerCase();
  return MODE_RELATIVE_MAJOR[lookup]
    || MODE_RELATIVE_MAJOR[root.toLowerCase()]
    || root;
}

const MAJOR_PC_ACCIDENTALS = {
  0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: 6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5,
};
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const ROOT_TO_PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

/** Letter → key-signature alteration (-1 flat, +1 sharp). Uses relative major of K: body. */
function keySignatureLetterAlterations(keyBody) {
  const map = {};
  const major = relativeMajorKeyName(String(keyBody || '').trim()) || 'C';
  const m = major.match(/^([A-G])([#b]?)$/i);
  if (!m) return map;
  const root = m[1].toUpperCase() + (m[2] || '');
  const rootPc = ROOT_TO_PC[root];
  if (rootPc == null) return map;
  let count = MAJOR_PC_ACCIDENTALS[rootPc];
  if (typeof count !== 'number') return map;
  if (count === 6 && root.indexOf('b') >= 0) count = -6;
  if (count > 0) {
    for (let i = 0; i < count; i += 1) map[SHARP_ORDER[i]] = 1;
  } else if (count < 0) {
    for (let i = 0; i < -count; i += 1) map[FLAT_ORDER[i]] = -1;
  }
  return map;
}

/** Prefix string for an accidental alteration value. */
function accidentalPrefixFromValue(written) {
  if (written === 2) return '^^';
  if (written === -2) return '__';
  if (written === 1) return '^';
  if (written === -1) return '_';
  if (written === 0) return '=';
  return '';
}

function readAbcAccidentalPrefix(line, start) {
  let j = start;
  let written = null;
  if (line.slice(j, j + 2) === '^^') { written = 2; j += 2; }
  else if (line.slice(j, j + 2) === '__') { written = -2; j += 2; }
  else if (line[j] === '^') { written = 1; j += 1; }
  else if (line[j] === '_') { written = -1; j += 1; }
  else if (line[j] === '=') { written = 0; j += 1; }
  return { written: written, index: j };
}

/**
 * Drop explicit accidentals that duplicate the key signature OR an accidental
 * already applied to the same pitch earlier in the bar (e.g. ^C^C → ^C C).
 * barAcc maps pitchKey (letter+octave) → alteration in force for the current bar.
 */
function rewriteAbcNoteAccidentalAt(line, start, keyBody, barAcc) {
  const acc = readAbcAccidentalPrefix(line, start);
  let j = acc.index;
  if (!/[A-Ga-g]/.test(line[j] || '')) return null;
  const letter = line[j];
  j += 1;
  let octave = '';
  while (j < line.length && (line[j] === ',' || line[j] === "'")) {
    octave += line[j];
    j += 1;
  }
  const pitchKey = letter + octave;
  const keyAcc = (keySignatureLetterAlterations(keyBody)[letter.toUpperCase()] || 0);
  const effective = (barAcc && Object.prototype.hasOwnProperty.call(barAcc, pitchKey))
    ? barAcc[pitchKey]
    : keyAcc;
  if (acc.written == null) {
    return { text: letter + octave, next: j };
  }
  if (barAcc) barAcc[pitchKey] = acc.written;
  if (acc.written === effective) {
    return { text: letter + octave, next: j };
  }
  return {
    text: accidentalPrefixFromValue(acc.written) + letter + octave,
    next: j,
  };
}

function clearBarAccidentals(barAcc) {
  if (!barAcc) return;
  Object.keys(barAcc).forEach(function(k) { delete barAcc[k]; });
}

function clearKeySignatureAccidentalsInMusicLine(line, keyBody, barAcc) {
  if (!keyBody) return line;
  let out = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += 1;
      out += line.slice(i, Math.min(j + 1, line.length));
      i = Math.min(j + 1, line.length);
      continue;
    }
    if (ch === '!') {
      let j = i + 1;
      while (j < line.length && line[j] !== '!') j += 1;
      out += line.slice(i, Math.min(j + 1, line.length));
      i = Math.min(j + 1, line.length);
      continue;
    }
    if (ch === '{') {
      let j = i + 1;
      while (j < line.length && line[j] !== '}') j += 1;
      out += line.slice(i, Math.min(j + 1, line.length));
      i = Math.min(j + 1, line.length);
      continue;
    }
    if (ch === '|') {
      clearBarAccidentals(barAcc);
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '[' && !/^\[\d/.test(line.slice(i))) {
      out += '[';
      i += 1;
      while (i < line.length && line[i] !== ']') {
        const note = rewriteAbcNoteAccidentalAt(line, i, keyBody, barAcc);
        if (note) {
          out += note.text;
          i = note.next;
          continue;
        }
        out += line[i];
        i += 1;
      }
      if (i < line.length && line[i] === ']') {
        out += ']';
        i += 1;
      }
      continue;
    }
    const note = rewriteAbcNoteAccidentalAt(line, i, keyBody, barAcc);
    if (note) {
      out += note.text;
      i = note.next;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function clearKeySignatureAccidentals(abc) {
  const lines = String(abc || '').split('\n');
  let keyBody = '';
  const barAcc = {};
  const out = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const headerK = line.match(/^K:\s*(.*)$/);
    if (headerK) {
      keyBody = headerK[1].trim();
      clearBarAccidentals(barAcc);
      out.push(line);
      continue;
    }
    const inlineK = line.match(/^\[K:\s*([^\]]+)\]/);
    if (inlineK) {
      keyBody = inlineK[1].trim();
      clearBarAccidentals(barAcc);
      out.push(line);
      continue;
    }
    const t = line.trim();
    if (!t || t.charAt(0) === '%' || /^[A-Za-z]:/.test(t)) {
      out.push(line);
      continue;
    }
    out.push(clearKeySignatureAccidentalsInMusicLine(line, keyBody, barAcc));
  }
  return out.join('\n');
}

function applyExplicitAccidentalsToMusicLine(line, explicit) {
  if (!explicit.length) return line;
  const byLetter = {};
  for (let i = 0; i < explicit.length; i++) {
    const letter = explicit[i].letter;
    byLetter[letter.toUpperCase()] = explicit[i].prefix;
    byLetter[letter.toLowerCase()] = explicit[i].prefix;
  }
  let out = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += 1;
      out += line.slice(i, Math.min(j + 1, line.length));
      i = Math.min(j + 1, line.length);
      continue;
    }
    if (ch === '!') {
      let j = i + 1;
      while (j < line.length && line[j] !== '!') j += 1;
      out += line.slice(i, Math.min(j + 1, line.length));
      i = Math.min(j + 1, line.length);
      continue;
    }
    if (ch === '{') {
      let j = i + 1;
      while (j < line.length && line[j] !== '}') j += 1;
      out += line.slice(i, Math.min(j + 1, line.length));
      i = Math.min(j + 1, line.length);
      continue;
    }
    // Already has an accidental — leave alone.
    if (/[_^=]/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    if (/[A-Ga-g]/.test(ch) && byLetter[ch]) {
      out += byLetter[ch] + ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Render-only rewrite so abcjs visualTranspose won't null-deref modal keys. */
function rewriteAbcKeyForVisualTranspose(abcText) {
  const lines = String(abcText || '').split('\n');
  let explicit = [];
  let major = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^K:\s*(.*)$/);
    if (!m) continue;
    const body = m[1].trim();
    explicit = parseKeyExplicitAccidentals(body);
    major = relativeMajorKeyName(body);
    lines[i] = 'K:' + major;
    // Only first K: (header) — inline [K:…] left alone.
    break;
  }
  if (!major) return abcText;
  if (!explicit.length) return lines.join('\n');
  return lines.map(function(line) {
    const t = line.trim();
    if (!t || t.charAt(0) === '%' || /^[A-Za-z]:/.test(t)) return line;
    return applyExplicitAccidentalsToMusicLine(line, explicit);
  }).join('\n');
}

function focusAbcSelection(textarea, start, end) {
  if (!textarea) return;
  const value = textarea.value || '';
  const a = Math.max(0, Math.min(start, value.length));
  const b = Math.max(a, Math.min(end, value.length));
  const details = textarea.closest('details');
  if (details && !details.open) details.open = true;

  function apply() {
    // abcjs mouseUp runs after clickListener and calls svgEl.focus() on selectable notes.
    const active = document.activeElement;
    if (active && active !== textarea && active.closest && active.closest('.staff')) {
      try { active.blur(); } catch (err) { /* ignore */ }
    }
    try {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(a, b);
    } catch (err) { /* ignore */ }
    const lineIdx = value.slice(0, a).split('\n').length - 1;
    const lineCount = Math.max(1, value.split('\n').length);
    const lineHeight = textarea.clientHeight > 0
      ? (textarea.scrollHeight / lineCount)
      : 16;
    textarea.scrollTop = Math.max(0, lineIdx * lineHeight - lineHeight * 2);
    try {
      textarea.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (scrollErr) {
      textarea.scrollIntoView({ block: 'nearest' });
    }
  }

  // Defer until after abcjs finishes mouseUp (which would otherwise steal focus).
  setTimeout(apply, 0);
}

function getRawDisplayAbc(t) {
  const ek = abcEditKey(t);
  let abc;
  if (Object.prototype.hasOwnProperty.call(state.abcEdits, ek)) {
    abc = state.abcEdits[ek];
  } else {
    abc = getBaseAbc(t);
  }
  const relocated = relocateTransposeComments(abc);
  if (relocated.trim() !== String(abc || '').trim()) {
    if (Object.prototype.hasOwnProperty.call(state.abcEdits, ek)) {
      state.abcEdits[ek] = relocated;
      saveState(state);
    }
    const cand = getSelectedCandidate(t);
    if (cand && cand.abc) {
      const cFixed = relocateTransposeComments(cand.abc);
      if (cFixed.trim() !== String(cand.abc).trim()) cand.abc = cFixed;
    }
    if (t.abc) {
      const tFixed = relocateTransposeComments(t.abc);
      if (tFixed.trim() !== String(t.abc).trim()) t.abc = tFixed;
    }
  }
  return relocated;
}

function getDisplayAbc(t) {
  let abc = getRawDisplayAbc(t);
  const key = commentKey(t);
  const detMeter = parseAbcMeter(abc);
  const meterOv = state.meterOverrides[key];
  if (meterOv && meterOv !== detMeter) {
    abc = setAbcMeter(abc, meterOv);
  }
  const baseSemis = parseAbcbookTranspose(getRawDisplayAbc(t));
  let semis = baseSemis;
  if (Object.prototype.hasOwnProperty.call(state.transposeOverrides, key)) {
    semis = parseInt(state.transposeOverrides[key], 10) || 0;
  }
  abc = setAbcTranspose(abc, semis);
  return abc;
}

function ensureExportXHeader(abc, index, title) {
  let text = String(abc || '').trim();
  if (!text) {
    return 'X:' + index + '\nT:' + title + '\nM:4/4\nL:1/8\nK:C\n%% missing abc — needs manual entry';
  }
  if (!/^X:/m.test(text)) {
    text = 'X:' + index + '\nT:' + title + '\n' + text;
  } else {
    text = text.replace(/^X:\s*.*$/m, 'X:' + index);
  }
  if (!/^T:/m.test(text)) {
    text = text.replace(/^(X:.*)$/m, '$1\nT:' + title);
  }
  return text;
}

/** Full tunebook ABC from current UI selections / edits / overrides. */
function buildEurosessionAbc() {
  const blocks = [];
  for (let i = 0; i < tunes.length; i++) {
    const t = tunes[i];
    const idx = i + 1;
    const cand = getSelectedCandidate(t);
    const source = (cand && cand.source) || t.source || 'missing';
    const match = (cand && cand.matchedTitle) || t.match || '';
    let abc = String(getDisplayAbc(t) || '').trim();
    if (!abc || /%% missing abc/.test(abc)) {
      abc = 'X:' + idx + '\nT:' + t.title + '\nM:4/4\nL:1/8\nK:C\n%% missing abc — needs manual entry';
    } else {
      abc = ensureExportXHeader(abc, idx, t.title);
    }
    const comment = '% page=' + t.page + ' tune=' + t.tuneIndex + ' source=' + source + ' match=' + match;
    blocks.push(comment + '\n' + abc.trim());
  }
  return blocks.join('\n\n') + '\n';
}

/** Inject stable tune id + book into ABC for abc2book import/update. */
function prepareAbcForImport(abc, tuneId, book, index, title) {
  let text = String(abc || '').trim();
  if (!text || /%% missing abc/.test(text)) {
    text = 'X:' + index + '\nT:' + title + '\nB:' + book + '\nM:4/4\nL:1/8\nK:C\n%% missing abc — needs manual entry';
  } else {
    text = ensureExportXHeader(text, index, title);
  }
  if (!new RegExp('^B:\\s*' + book + '\\s*$', 'mi').test(text)) {
    if (/^T:/m.test(text)) text = text.replace(/^(T:.*)$/m, '$1\nB:' + book);
    else if (/^X:/m.test(text)) text = text.replace(/^(X:.*)$/m, '$1\nB:' + book);
    else text = 'B:' + book + '\n' + text;
  }
  const idLine = '% abcbook-tune_id ' + tuneId;
  if (/% abcbook-tune_id\s+\S+/.test(text)) {
    text = text.replace(/% abcbook-tune_id\s+\S+/, idLine);
  } else if (/^K:/m.test(text)) {
    text = text.replace(/^(K:.*)$/m, idLine + '\n$1');
  } else {
    text = idLine + '\n' + text;
  }
  return text.trim() + '\n';
}

function isTuneComplete(t) {
  return Boolean(state.completed[commentKey(t)]);
}

/** Package for abc2book "Import Reviewed Images" (updates by stable id on re-import). */
function buildTunebookImportPackage() {
  ensureTuneIds(state);
  saveState(state);
  const outTunes = [];
  for (let i = 0; i < tunes.length; i++) {
    const t = tunes[i];
    const key = commentKey(t);
    const tuneId = getTuneId(t);
    const idx = i + 1;
    let abc = String(getDisplayAbc(t) || '').trim();
    abc = prepareAbcForImport(abc, tuneId, IMPORT_BOOK, idx, t.title);
    outTunes.push({
      key: key,
      id: tuneId,
      title: t.title,
      page: t.page,
      tuneIndex: t.tuneIndex,
      crop: t.crop,
      complete: isTuneComplete(t),
      abc: abc,
    });
  }
  return {
    book: IMPORT_BOOK,
    bookLabel: 'EuroSession',
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    version: 1,
    tunes: outTunes,
  };
}

let tunebookImportBlobUrl = null;
function downloadTunebookImportPackage() {
  const pkg = buildTunebookImportPackage();
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json;charset=utf-8' });
  if (tunebookImportBlobUrl) {
    try { URL.revokeObjectURL(tunebookImportBlobUrl); } catch (_) { /* ignore */ }
  }
  tunebookImportBlobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = tunebookImportBlobUrl;
  a.download = 'eurosession-import.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  const done = pkg.tunes.filter(function(t) { return t.complete; }).length;
  if (commentCountEl) {
    commentCountEl.textContent = 'exported ' + pkg.tunes.length + ' tunes (' + done + ' complete) · ids saved';
  }
}

let eurosessionBlobUrl = null;
function refreshEurosessionAbcLink() {
  const link = document.getElementById('eurosession-abc-link');
  if (!link) return;
  const text = buildEurosessionAbc();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  if (eurosessionBlobUrl) {
    try { URL.revokeObjectURL(eurosessionBlobUrl); } catch (_) { /* ignore */ }
  }
  eurosessionBlobUrl = URL.createObjectURL(blob);
  link.href = eurosessionBlobUrl;
  link.setAttribute('download', 'eurosession.abc');
  const s = completeStats();
  link.title = 'Download ABC from current review selections (' + s.omr + ' OMR · ' + s.abc + ' ABC · ' +
    s.done + '/' + s.total + ' complete)';
}

function hasAbcEdit(t) {
  return Object.prototype.hasOwnProperty.call(state.abcEdits, abcEditKey(t));
}

function getTranspose(t) {
  const key = commentKey(t);
  if (Object.prototype.hasOwnProperty.call(state.transposeOverrides, key)) {
    return parseInt(state.transposeOverrides[key], 10) || 0;
  }
  return parseAbcbookTranspose(getRawDisplayAbc(t));
}

function detectedMeterOf(t) {
  const cand = getSelectedCandidate(t);
  if (cand && cand.detectedMeter) return cand.detectedMeter;
  return parseAbcMeter(getRawDisplayAbc(t));
}

function getKeyMeter(t) {
  const key = commentKey(t);
  const detMeter = detectedMeterOf(t);
  const meterOv = state.meterOverrides[key];
  const transpose = getTranspose(t);
  const baseSemis = parseAbcbookTranspose(getRawDisplayAbc(t));
  return {
    meter: meterOv || detMeter,
    meterFailed: Boolean(meterOv && meterOv !== detMeter),
    detectedMeter: detMeter,
    transpose: transpose,
    transposeFailed: transpose !== baseSemis,
  };
}

/** Convert Session/folktune bare ! line-breaks to newlines; keep !annotation!. */
function convertSessionLineBreaks(abc) {
  const text = String(abc || '');
  const isMusic = (line) => {
    const t = String(line || '').trim();
    if (!t || t.charAt(0) === '%') return false;
    if (/^[A-Za-z]:/.test(t)) return false;
    return true;
  };
  const body = text.split(/\r?\n/).filter(isMusic).join('\n');
  if (!body) return text;
  const protect = (s) => {
    const anns = [];
    const out = s.replace(/!([A-Za-z][A-Za-z0-9_]*)!/g, (m) => {
      anns.push(m);
      return '\x00ABCANN' + (anns.length - 1) + '\x00';
    });
    return { text: out, anns };
  };
  const probe = protect(body);
  if (body.indexOf('|!') < 0 && !/!(?![A-Za-z])/.test(probe.text)) return text;
  return text.split(/(\r?\n)/).map((part) => {
    if (part === '\n' || part === '\r\n') return part;
    if (!isMusic(part)) return part;
    const p = protect(part);
    return p.text.replace(/!/g, '\n').replace(/\x00ABCANN(\d+)\x00/g, (_, i) => p.anns[parseInt(i, 10)] || '');
  }).join('');
}

function ensureFinalBarline(abc) {
  const lines = String(abc || '').split('\n');
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%') || /^[A-Za-z]:/.test(t)) continue;
    last = i;
    break;
  }
  if (last < 0) return String(abc || '');
  const line = lines[last].replace(/\s+$/, '');
  if (/(?:\|\]|\|\|)\s*$/.test(line)) return String(abc || '');
  if (/(?:\|:|:\||::)\s*$/.test(line)) return String(abc || '');
  lines[last] = line.endsWith('|') ? (line + '|') : (line + '||');
  return lines.join('\n');
}

function stripBlankBeforeMusic(abc) {
  const lines = String(abc || '').split('\n');
  const header = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^[A-Za-z]:/.test(t) || t.startsWith('%')) {
      header.push(lines[i]);
      continue;
    }
    break;
  }
  while (i < lines.length && !lines[i].trim()) i++;
  return header.concat(lines.slice(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function safeAutofixAbc(abc) {
  let text = convertSessionLineBreaks(abc);
  text = stripBlankBeforeMusic(text);
  text = ensureFinalBarline(text);
  return relocateTransposeComments(text.trim() + '\n');
}

function isMusicBodyLine(line) {
  const t = String(line || '').trim();
  if (!t || t.charAt(0) === '%') return false;
  if (/^[A-Za-z]:/.test(t)) return false;
  return true;
}

/** Normalise |: :| :: spacing and collapse empty bars between repeats. */
function normalizeRepeatMarksInText(text) {
  return String(text || '')
    .replace(/:\s*\|:\s*/g, ':|:')
    .replace(/\|\s+:(?!\|)/g, '|:')
    .replace(/:\s+\|/g, ':|')
    .replace(/:\|(?:\s*\|)*\s*\|:/g, '::')
    .replace(/\|\|(?:\s*\|)+\s*\|:/g, '|| |:')
    .replace(/:\|\s*:\|/g, '::');
}

/** Insert :| before || when an open |: has not been closed (strain boundary). */
function fixOpenRepeatBeforeDoubleBar(text) {
  let depth = 0;
  let out = '';
  const source = String(text || '');
  const re = /\|:|:\||::|\|\|/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    out += source.slice(lastIndex, match.index);
    const token = match[0];
    if (token === '|:') {
      depth += 1;
      out += token;
    } else if (token === ':|' || token === '::') {
      if (depth > 0) depth -= 1;
      out += token;
    } else if (token === '||') {
      if (depth > 0) {
        out += ':|';
        depth -= 1;
      }
      out += token;
    }
    lastIndex = match.index + token.length;
  }
  out += source.slice(lastIndex);
  return out;
}

function normalizeRepeatsInAbc(abc) {
  return String(abc || '').split(/(\r?\n)/).map(function(part) {
    if (part === '\n' || part === '\r\n') return part;
    if (!isMusicBodyLine(part)) return part;
    return fixOpenRepeatBeforeDoubleBar(normalizeRepeatMarksInText(part));
  }).join('');
}

function barlineVoltaNumber(barline) {
  const m = String(barline || '').match(/^\|(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function contentVoltaNumber(content) {
  const m = String(content || '').match(/^\s*(\d+)\b/);
  return m ? parseInt(m[1], 10) : 0;
}

function isFirstEndingBar(bar) {
  if (barlineVoltaNumber(bar.barline) === 1) return true;
  return /^\s*\[1\b/.test(bar.content || '');
}

function isSecondEndingBar(bar) {
  if (barlineVoltaNumber(bar.barline) === 2) return true;
  // Short form ":|2 notes" tokenizes as barline ":|" + content "2 notes"
  if (contentVoltaNumber(bar.content) === 2) return true;
  return /^\s*\[2\b/.test(bar.content || '');
}

/**
 * Rewrap music body to 4 bars/line.
 * Keeps legal short-form endings (|1 … :|2 …) intact on one line when possible.
 * Does not rewrite |1/|2 to [1/[2 — that short form is valid ABC.
 * Merges a lone last-line bar onto the previous line (avoids orphan last staff).
 */
function rewrapAbcFourBars(abc) {
  const lines = String(abc || '').split('\n');
  const header = [];
  const music = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^%%MIDI transpose\s+-?\d+\s*$/i.test(t)) continue;
    if (/^%\s*abcbook-transpose\s+-?\d+\s*$/i.test(t)) continue;
    if (/^%\s*abcbook-playback-transpose\s+-?\d+\s*$/i.test(t)) continue;
    if (/^[A-Za-z]:/.test(t) || t.startsWith('%')) {
      header.push(lines[i]);
      continue;
    }
    music.push(lines[i]);
  }
  if (!music.length) return abc;

  const flat = music.join('').replace(/\s+/g, ' ').trim();
  // Prefer matching |1 / |2 / [1 / [2 before bare |.
  const BAR_RE = /(\|\]|\[\||\|\||::|:\||\|:|\|\d+(?:[,-]\d+)*|\[\d+(?:[,-]\d+)*:?|\|)/g;
  const tokens = flat.split(BAR_RE);
  const bars = [];
  for (let ti = 0; ti < tokens.length; ti += 2) {
    const content = tokens[ti] != null ? tokens[ti] : '';
    const barline = tokens[ti + 1] != null ? tokens[ti + 1] : '';
    if (!String(content).trim() && !barline) continue;
    bars.push({ content: content, barline: barline });
  }
  if (!bars.length) return abc;

  const barsPerLine = 4;
  const voltaKeepMax = 6;
  const outLines = [];
  let line = '';
  let count = 0;
  let i = 0;
  const hasPickup = Boolean(String(bars[0].content || '').trim()) && Boolean(bars[0].barline);

  function flushLine() {
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed) outLines.push(trimmed);
    line = '';
    count = 0;
  }

  function appendBar(bar) {
    // Keep ":|2" tight — content may be "2 …" after a ":|" barline token.
    let content = bar.content || '';
    if (line.endsWith(':|') && /^\s*\d/.test(content)) {
      content = content.replace(/^\s+/, '');
    }
    line += content + (bar.barline || '');
  }

  function countBarsOnLine(text) {
    const parts = String(text || '').split(BAR_RE);
    let n = 0;
    for (let pi = 0; pi < parts.length; pi += 2) {
      const bl = parts[pi + 1];
      if (bl) n += 1;
    }
    return n;
  }

  while (i < bars.length) {
    if (isFirstEndingBar(bars[i])) {
      let end = -1;
      for (let j = i + 1; j < bars.length && (j - i) < voltaKeepMax; j++) {
        if (isSecondEndingBar(bars[j])) {
          end = j;
          break;
        }
      }
      if (end >= 0) {
        const span = end - i + 1;
        if (span <= voltaKeepMax) {
          if (count > 0 && count + span > barsPerLine + 2) flushLine();
          for (let k = i; k <= end; k++) appendBar(bars[k]);
          count += span;
          i = end + 1;
          if (count >= barsPerLine) flushLine();
          continue;
        }
      }
    }

    appendBar(bars[i]);
    if (!(hasPickup && i === 0) && bars[i].barline) count += 1;
    i += 1;
    if (count >= barsPerLine) flushLine();
  }
  flushLine();

  // Pull a lone last-line bar onto the previous line (Single view uses these newlines).
  while (outLines.length >= 2 && countBarsOnLine(outLines[outLines.length - 1]) <= 1) {
    const last = outLines.pop();
    outLines[outLines.length - 1] = (outLines[outLines.length - 1] + last).replace(/\s+/g, ' ').trim();
  }

  return header.join('\n') + '\n' + outLines.join('\n') + '\n';
}

/** Drop archive S: URLs and FolktuneFinder-style % catalog comments. */
function cullArchiveMetaFromAbc(abc) {
  const dropComment = /^\s*%\s*(Rhythm|Link|Titles|Transcriptions|Movement|Mode|Key|Time_signature|Text|Has_[A-Za-z_]+|History|Origin|Source|Book|Discography)\b/i;
  return String(abc || '').split('\n').filter(function(line) {
    const t = line.trim();
    if (/^S:/i.test(t)) return false;
    if (dropComment.test(t)) return false;
    return true;
  }).join('\n').replace(/\n{3,}/g, '\n\n');
}

const SUPPORTED_GROUPING_METERS = {
  '2/4': 1, '3/4': 1, '4/4': 1, '2/2': 1,
  '3/8': 1, '6/8': 1, '9/8': 1, '12/8': 1,
};

function normalizeGroupingMeter(meterText) {
  const trimmed = String(meterText || '4/4').trim();
  if (trimmed === 'C') return '4/4';
  if (trimmed === 'C|') return '2/2';
  const parts = trimmed.split('/');
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10);
    const den = parseInt(parts[1], 10);
    if (num > 0 && den > 0) return String(num) + '/' + String(den);
  }
  return '4/4';
}

function parseNoteLengthHeader(abc) {
  const m = String(abc || '').match(/^L:\s*(\d+)\s*\/\s*(\d+)/m);
  if (m) return m[1] + '/' + m[2];
  return '1/8';
}

/**
 * Beat model in L: units (may be fractional, e.g. 3/8 with L:1/4 → 1.5/bar, 0.5/beat).
 */
function getGroupingBarModel(meterText, noteLengthText) {
  const meter = normalizeGroupingMeter(meterText);
  const lm = String(noteLengthText || '1/8').match(/(\d+)\s*\/\s*(\d+)/);
  const ln = lm ? parseInt(lm[1], 10) : 1;
  const ld = lm ? parseInt(lm[2], 10) : 8;
  const parts = meter.split('/');
  const mn = parseInt(parts[0], 10) || 4;
  const md = parseInt(parts[1], 10) || 4;
  const unitSlotsPerBar = (mn / md) / (ln / ld);
  const compound = md === 8 && mn >= 6 && mn % 3 === 0;
  const beatCount = compound ? Math.max(1, Math.round(mn / 3)) : Math.max(1, mn);
  const beatUnitSlots = unitSlotsPerBar / beatCount;
  const consistent = Math.abs(beatUnitSlots * beatCount - unitSlotsPerBar) < 0.001
    && beatUnitSlots > 0
    && unitSlotsPerBar > 0;
  return {
    meter: meter,
    noteLength: ln + '/' + ld,
    unitSlotsPerBar: unitSlotsPerBar,
    beatCount: beatCount,
    beatUnitSlots: beatUnitSlots,
    consistent: consistent,
  };
}

function parseAbcDurationUnits(str, start) {
  let i = start;
  if (str[i] === '>') return { units: 1.5, next: i + 1 };
  if (str[i] === '<') return { units: 0.5, next: i + 1 };
  let m = str.slice(i).match(/^(\d+)\/(\d+)/);
  if (m) {
    return { units: parseInt(m[1], 10) / parseInt(m[2], 10), next: i + m[0].length };
  }
  m = str.slice(i).match(/^\/(\d+)/);
  if (m) return { units: 1 / parseInt(m[1], 10), next: i + m[0].length };
  if (str[i] === '/') return { units: 0.5, next: i + 1 };
  m = str.slice(i).match(/^(\d+)/);
  if (m) return { units: parseInt(m[1], 10), next: i + m[0].length };
  return { units: 1, next: i };
}

/**
 * Tokenize one bar's note content (no barlines). spaces ignored.
 * units > 0 => sounding; attach => glue onto following note; structural => volta etc.
 */
function tokenizeBarForGrouping(content) {
  const s = String(content || '');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i += 1; continue; }
    if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += 1;
      tokens.push({ text: s.slice(i, Math.min(j + 1, s.length)), units: 0, attach: true });
      i = Math.min(j + 1, s.length);
      continue;
    }
    if (s[i] === '{') {
      let j = i + 1;
      while (j < s.length && s[j] !== '}') j += 1;
      tokens.push({ text: s.slice(i, Math.min(j + 1, s.length)), units: 0, attach: true });
      i = Math.min(j + 1, s.length);
      continue;
    }
    if (s[i] === '!' ) {
      let j = i + 1;
      while (j < s.length && s[j] !== '!') j += 1;
      tokens.push({ text: s.slice(i, Math.min(j + 1, s.length)), units: 0, attach: true });
      i = Math.min(j + 1, s.length);
      continue;
    }
    if (s[i] === '(' && /\d/.test(s[i + 1] || '')) {
      let j = i + 1;
      while (j < s.length && /[\d:]/.test(s[j])) j += 1;
      tokens.push({ text: s.slice(i, j), units: 0, attach: true });
      i = j;
      continue;
    }
    if (s[i] === '(') {
      tokens.push({ text: '(', units: 0, attach: true });
      i += 1;
      continue;
    }
    if (s[i] === ')') {
      tokens.push({ text: ')', units: 0, attach: true });
      i += 1;
      continue;
    }
    if ('~uMvHSLTx.Y'.indexOf(s[i]) >= 0) {
      tokens.push({ text: s[i], units: 0, attach: true });
      i += 1;
      continue;
    }
    if (s[i] === '[') {
      if (/^\[\d/.test(s.slice(i))) {
        let j = i + 1;
        while (j < s.length && /[\d,\-]/.test(s[j])) j += 1;
        if (s[j] === ':') j += 1;
        if (s[j] === ']') j += 1;
        tokens.push({ text: s.slice(i, j), units: 0, structural: true });
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < s.length && s[j] !== ']') j += 1;
      j = Math.min(j + 1, s.length);
      const dur = parseAbcDurationUnits(s, j);
      j = dur.next;
      let text = s.slice(i, j);
      if (s[j] === '-') { text += '-'; j += 1; }
      tokens.push({ text: text, units: dur.units });
      i = j;
      continue;
    }
    if (tokens.length === 0 && /\d/.test(s[i])) {
      let j = i;
      while (j < s.length && /[\d,\-]/.test(s[j])) j += 1;
      tokens.push({ text: s.slice(i, j), units: 0, structural: true });
      i = j;
      continue;
    }
    if (/[_^=]/.test(s[i]) || /[A-Ga-gzxZ]/.test(s[i])) {
      let j = i;
      while (j < s.length && /[_^=]/.test(s[j])) j += 1;
      if (/[zxZ]/.test(s[j])) {
        j += 1;
      } else if (/[A-Ga-g]/.test(s[j])) {
        j += 1;
        while (s[j] === ',' || s[j] === "'") j += 1;
      } else {
        tokens.push({ text: s[i], units: 0 });
        i += 1;
        continue;
      }
      const dur = parseAbcDurationUnits(s, j);
      j = dur.next;
      let text = s.slice(i, j);
      if (s[j] === '-') { text += '-'; j += 1; }
      tokens.push({ text: text, units: dur.units });
      i = j;
      continue;
    }
    if (s[i] === '\\') { i += 1; continue; }
    tokens.push({ text: s[i], units: 0 });
    i += 1;
  }
  return tokens;
}

function isOnBeatBoundarySlots(slotCursor, beatUnitSlots) {
  if (slotCursor <= 0.001 || beatUnitSlots <= 0) return false;
  const ratio = slotCursor / beatUnitSlots;
  const nearest = Math.round(ratio);
  return Math.abs(ratio - nearest) < 0.001;
}

function groupBarContentByBeats(content, beatUnitSlots) {
  const tokens = tokenizeBarForGrouping(content);
  if (!tokens.length) return String(content || '').trim();
  let out = '';
  let pending = '';
  let slot = 0;
  let prevSounded = false;
  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti];
    if (tok.units > 0) {
      if (prevSounded && isOnBeatBoundarySlots(slot, beatUnitSlots)) out += ' ';
      out += pending + tok.text;
      pending = '';
      slot += tok.units;
      prevSounded = true;
      continue;
    }
    if (tok.structural) {
      out += pending;
      pending = '';
      if (out && !/\s$/.test(out)) out += ' ';
      out += tok.text;
      if (!/\s$/.test(out)) out += ' ';
      prevSounded = false;
      continue;
    }
    if (tok.attach) {
      pending += tok.text;
      continue;
    }
    pending += tok.text;
  }
  out += pending;
  return out.replace(/[ \t]+/g, ' ').trim();
}

/**
 * Insert spaces at beat boundaries for beaming (spacing only).
 * Uses M: + L:; skips unsupported / inconsistent meters.
 * Returns { abc, ok, reason } when asResult is true.
 */
function groupNotesByMeter(abc, asResult) {
  const meter = normalizeGroupingMeter(parseAbcMeter(abc));
  if (!SUPPORTED_GROUPING_METERS[meter]) {
    if (asResult) {
      return {
        abc: abc,
        ok: false,
        reason: 'Meter ' + meter + ' is not supported for beat grouping (use 2/4, 3/4, 3/8, 4/4, 6/8, 9/8, 12/8).',
      };
    }
    return abc;
  }
  const noteLength = parseNoteLengthHeader(abc);
  const model = getGroupingBarModel(meter, noteLength);
  if (!model.consistent) {
    if (asResult) {
      return {
        abc: abc,
        ok: false,
        reason: 'Beat size is unclear for L:' + noteLength + ' in ' + meter + '.',
      };
    }
    return abc;
  }

  const BAR_RE = /(\|\]|\[\||\|\||::|:\||\|:|\|\d+(?:[,-]\d+)*|\[\d+(?:[,-]\d+)*:?|\|)/g;
  const lines = String(abc || '').split('\n');
  const out = lines.map(function(line) {
    const t = line.trim();
    if (!t || t.charAt(0) === '%' || /^[A-Za-z]:/.test(t)) return line;
    const parts = line.split(BAR_RE);
    let rebuilt = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const barline = parts[i];
        if (rebuilt && !/\s$/.test(rebuilt) && barline) rebuilt += ' ';
        rebuilt += barline;
        continue;
      }
      const content = parts[i];
      if (!String(content).trim()) {
        rebuilt += content;
        continue;
      }
      const grouped = groupBarContentByBeats(content, model.beatUnitSlots);
      if (rebuilt.endsWith(':|') && /^\d/.test(grouped)) {
        rebuilt += grouped;
      } else {
        if (rebuilt && !/\s$/.test(rebuilt)) rebuilt += ' ';
        rebuilt += grouped;
      }
    }
    return rebuilt.replace(/[ \t]+/g, ' ').trim();
  });
  const next = out.join('\n');
  if (asResult) return { abc: next, ok: true, reason: '', unchanged: next === String(abc || '') };
  return next;
}

function standardiseAbc(abc, options) {
  const opts = options || {};
  let text = safeAutofixAbc(abc);
  text = cullArchiveMetaFromAbc(text);
  text = normalizeRepeatsInAbc(text);
  if (opts.groupNotes) text = groupNotesByMeter(text);
  text = rewrapAbcFourBars(text);
  text = ensureFinalBarline(text);
  return relocateTransposeComments(text.trim() + '\n');
}

function ensureSelectOptions(select, options, value) {
  const vals = options.slice();
  if (value && !vals.includes(value)) vals.unshift(value);
  select.innerHTML = vals.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  select.value = value || vals[0] || '';
}

function getBadSections(t) {
  const key = commentKey(t);
  return Array.isArray(state.badSections[key]) ? state.badSections[key] : [];
}

function renderBadRects(t) {
  const stage = document.getElementById('crop-stage-' + t.id);
  if (!stage) return;
  stage.querySelectorAll('.bad-rect:not(.drawing)').forEach(el => el.remove());
  for (const box of getBadSections(t)) {
    const el = document.createElement('div');
    el.className = 'bad-rect';
    el.style.left = box.x + '%';
    el.style.top = box.y + '%';
    el.style.width = box.w + '%';
    el.style.height = box.h + '%';
    stage.appendChild(el);
  }
}

function setupBadSectionDrag(t, stage) {
  let drawing = null;
  let start = null;

  function pctFromEvent(ev) {
    const rect = stage.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 100;
    const y = ((ev.clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }

  stage.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const p = pctFromEvent(ev);
    const key = commentKey(t);
    const boxes = getBadSections(t).filter(b => {
      return !(p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    });
    if (boxes.length !== getBadSections(t).length) {
      if (boxes.length) state.badSections[key] = boxes;
      else delete state.badSections[key];
      saveState(state);
      renderBadRects(t);
      updateCommentUI();
    }
  });

  stage.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    start = pctFromEvent(ev);
    drawing = document.createElement('div');
    drawing.className = 'bad-rect drawing';
    drawing.style.left = start.x + '%';
    drawing.style.top = start.y + '%';
    drawing.style.width = '0%';
    drawing.style.height = '0%';
    stage.appendChild(drawing);
  });

  window.addEventListener('mousemove', (ev) => {
    if (!drawing || !start) return;
    const p = pctFromEvent(ev);
    const x = Math.min(start.x, p.x);
    const y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x);
    const h = Math.abs(p.y - start.y);
    drawing.style.left = x + '%';
    drawing.style.top = y + '%';
    drawing.style.width = w + '%';
    drawing.style.height = h + '%';
  });

  window.addEventListener('mouseup', () => {
    if (!drawing || !start) return;
    const box = {
      x: parseFloat(drawing.style.left),
      y: parseFloat(drawing.style.top),
      w: parseFloat(drawing.style.width),
      h: parseFloat(drawing.style.height),
    };
    drawing.remove();
    drawing = null;
    start = null;
    if (box.w < 1.5 || box.h < 1.5) return;
    const key = commentKey(t);
    const boxes = getBadSections(t).slice();
    boxes.push(box);
    state.badSections[key] = boxes;
    saveState(state);
    renderBadRects(t);
    updateCommentUI();
  });
}

function renderIssues(t) {
  const wrap = document.getElementById('issues-' + t.id);
  if (!wrap) return;
  const cand = getSelectedCandidate(t);
  const issues = (cand && cand.notationIssues) || [];
  if (!issues.length) {
    wrap.innerHTML = '<div class="issues-title">Notation checks</div><div class="sub" style="color:var(--muted);font-size:.78rem">No issues</div>';
    return;
  }
  const rows = issues.map(it => {
    const sev = it.severity || 'warning';
    return `<div class="issue ${escapeHtml(sev)}"><span class="sev">${escapeHtml(sev)}</span><span class="code">${escapeHtml(it.code || '')}</span> ${escapeHtml(it.message || '')}</div>`;
  }).join('');
  wrap.innerHTML = `<div class="issues-title">Notation checks (${issues.length})</div>${rows}`;
}

function syncNotationToolbar(t) {
  const km = getKeyMeter(t);
  const meterSel = document.getElementById('meter-' + t.id);
  if (meterSel) {
    ensureSelectOptions(meterSel, METER_OPTIONS, km.meter);
    meterSel.classList.toggle('overridden', km.meterFailed);
  }
  const val = document.getElementById('transpose-val-' + t.id);
  if (val) val.textContent = String(km.transpose);
  const group = document.getElementById('transpose-group-' + t.id);
  if (group) group.classList.toggle('overridden', km.transposeFailed);
}

function commitAbcEdit(t, abc) {
  const ek = abcEditKey(t);
  const base = getBaseAbc(t);
  if (String(abc || '') === String(base || '')) delete state.abcEdits[ek];
  else state.abcEdits[ek] = abc;
  saveState(state);
}

const ABC_HISTORY_MAX = 50;
/** Current ABC snapshot per edit-key — used to debounce typing history pushes. */
const abcTypingSnapshot = {};

function getAbcHistoryEntry(t) {
  if (!state.abcHistory || typeof state.abcHistory !== 'object') state.abcHistory = {};
  const ek = abcEditKey(t);
  let h = state.abcHistory[ek];
  if (!h || typeof h !== 'object') {
    h = { past: [], future: [] };
    state.abcHistory[ek] = h;
  }
  if (!Array.isArray(h.past)) h.past = [];
  if (!Array.isArray(h.future)) h.future = [];
  return h;
}

function updateUndoRedoButtons(t) {
  const h = getAbcHistoryEntry(t);
  const undoBtn = document.getElementById('undo-' + t.id);
  const redoBtn = document.getElementById('redo-' + t.id);
  if (undoBtn) undoBtn.disabled = !h.past.length;
  if (redoBtn) redoBtn.disabled = !h.future.length;
}

function pushAbcHistorySnapshot(t, snapshot) {
  const h = getAbcHistoryEntry(t);
  const s = String(snapshot || '');
  if (h.past.length && h.past[h.past.length - 1] === s) {
    h.future = [];
    saveState(state);
    updateUndoRedoButtons(t);
    return;
  }
  h.past.push(s);
  if (h.past.length > ABC_HISTORY_MAX) h.past.splice(0, h.past.length - ABC_HISTORY_MAX);
  h.future = [];
  saveState(state);
  updateUndoRedoButtons(t);
}

function rememberAbcTypingSnapshot(t, abc) {
  abcTypingSnapshot[abcEditKey(t)] = String(abc || '');
}

function applyAbcFromHistory(t, abc) {
  const abcTa = document.getElementById('abc-' + t.id);
  const next = String(abc || '');
  if (abcTa) abcTa.value = next;
  commitAbcEdit(t, next);
  rememberAbcTypingSnapshot(t, next);
  const key = commentKey(t);
  const typed = parseAbcbookTranspose(next);
  const baseSemis = parseAbcbookTranspose(getBaseAbc(t));
  if (typed === baseSemis) delete state.transposeOverrides[key];
  else state.transposeOverrides[key] = typed;
  saveState(state);
  renderStaff(t, { fromEdit: true });
  updateUndoRedoButtons(t);
  updateCommentUI();
}

function undoAbcEdit(t) {
  const h = getAbcHistoryEntry(t);
  if (!h.past.length) return;
  const abcTa = document.getElementById('abc-' + t.id);
  const current = abcTa ? abcTa.value : getDisplayAbc(t);
  const prev = h.past.pop();
  h.future.push(String(current || ''));
  if (h.future.length > ABC_HISTORY_MAX) h.future.splice(0, h.future.length - ABC_HISTORY_MAX);
  saveState(state);
  applyAbcFromHistory(t, prev);
}

function redoAbcEdit(t) {
  const h = getAbcHistoryEntry(t);
  if (!h.future.length) return;
  const abcTa = document.getElementById('abc-' + t.id);
  const current = abcTa ? abcTa.value : getDisplayAbc(t);
  const next = h.future.pop();
  h.past.push(String(current || ''));
  if (h.past.length > ABC_HISTORY_MAX) h.past.splice(0, h.past.length - ABC_HISTORY_MAX);
  saveState(state);
  applyAbcFromHistory(t, next);
}

/** Apply a rewritten ABC string, pushing the previous value onto the undo stack. */
function applyAbcRewrite(t, abcTa, nextAbc, opts) {
  const options = opts || {};
  const before = abcTa ? (abcTa.value || getDisplayAbc(t)) : getDisplayAbc(t);
  const next = String(nextAbc || '');
  if (before === next) {
    if (options.onSame && typeof options.onSame === 'function') options.onSame(before, next);
    return false;
  }
  pushAbcHistorySnapshot(t, before);
  if (abcTa) abcTa.value = next;
  commitAbcEdit(t, next);
  rememberAbcTypingSnapshot(t, next);
  renderStaff(t, { fromEdit: true });
  updateCommentUI();
  if (options.onChanged && typeof options.onChanged === 'function') options.onChanged(before, next);
  return true;
}

function syncCompareHeights(t) {
  const article = document.getElementById(t.id);
  const crop = article ? article.querySelector('.crop-wrap') : null;
  const staff = document.getElementById('staff-' + t.id);
  const spacer = document.getElementById('align-' + t.id);
  if (!crop || !staff) return;
  if (spacer) spacer.style.height = '0px';
  crop.style.height = '';
  staff.style.height = '';
  void crop.offsetHeight;
  // Pad notation column so staff top lines up with crop (image header is taller).
  if (spacer && window.matchMedia('(min-width: 721px)').matches) {
    const delta = crop.getBoundingClientRect().top - staff.getBoundingClientRect().top;
    if (delta > 0) spacer.style.height = Math.round(delta) + 'px';
    void crop.offsetHeight;
  }
  const cropH = crop.scrollHeight;
  const staffH = staff.scrollHeight;
  const cap = Math.round(window.innerHeight * 0.7);
  const h = Math.min(Math.max(cropH, staffH, 80), cap);
  crop.style.height = h + 'px';
  staff.style.height = h + 'px';
  crop.style.overflow = 'auto';
  staff.style.overflow = 'auto';
}

let compareHeightResizeTimer = null;
function syncAllCompareHeights() {
  for (let i = 0; i < tunes.length; i++) {
    const article = document.getElementById(tunes[i].id);
    if (!article || article.classList.contains('is-filtered-out')) continue;
    syncCompareHeights(tunes[i]);
  }
}

/** ---- Staff chord edit (align-tab style: drag labels, + to add) ---- */
let chordDialogCtx = null;
let chordDragState = null;

function normalizeChordSymbolName(name) {
  return String(name || '')
    .trim()
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/"/g, '');
}

const CHORD_SHARP_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function parseAbcKeyBody(abc) {
  const m = String(abc || '').match(/^K:\s*(.*)$/m);
  return m ? m[1].trim() : '';
}

function keyBodyPrefersFlats(keyBody) {
  const major = relativeMajorKeyName(String(keyBody || '').trim()) || 'C';
  const alts = keySignatureLetterAlterations(major);
  for (const letter of Object.keys(alts)) {
    if (alts[letter] < 0) return true;
  }
  return false;
}

function transposeChordRootName(root, semis, preferFlats) {
  const raw = String(root || '');
  if (!raw) return raw;
  const names = preferFlats ? CHORD_FLAT_ROOTS : CHORD_SHARP_ROOTS;
  let idx = CHORD_SHARP_ROOTS.indexOf(raw);
  if (idx < 0) idx = CHORD_FLAT_ROOTS.indexOf(raw);
  if (idx < 0) return raw;
  let steps = Number(semis) || 0;
  while (steps < 0) steps += 12;
  steps = steps % 12;
  return names[(idx + steps) % 12];
}

/**
 * Transpose a chord symbol by semitones (root and optional /bass).
 * Keeps quality/extensions; supports optional wrapping parens like "(D)".
 */
function transposeChordSymbol(name, semis, preferFlats) {
  const cleaned = normalizeChordSymbolName(name);
  if (!cleaned) return '';
  const amount = Number(semis) || 0;
  if (!amount) return cleaned;
  const wrapped = /^\((.*)\)$/.exec(cleaned);
  const core = wrapped ? wrapped[1].trim() : cleaned;
  const m = core.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?)(.*))?$/i);
  if (!m) return cleaned;
  const root = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  const mid = m[2] || '';
  const bassRaw = m[3] || '';
  const bassTail = m[4] || '';
  let out = transposeChordRootName(root, amount, !!preferFlats) + mid;
  if (bassRaw) {
    const bass = bassRaw.charAt(0).toUpperCase() + bassRaw.slice(1);
    out += '/' + transposeChordRootName(bass, amount, !!preferFlats) + bassTail;
  }
  return wrapped ? ('(' + out + ')') : out;
}

function chordDisplayTransposeInfo(abc) {
  const semis = parseAbcbookTranspose(abc) || 0;
  const keyBody = parseAbcKeyBody(abc);
  // Prefer flats/sharps for the sounding (visually transposed) key.
  const preferFlats = keyBodyPrefersFlats(keyBody); // approx; refined below when semis≠0
  if (!semis) return { semis: 0, preferFlats: preferFlats, sourcePreferFlats: preferFlats };
  // Transpose relative-major root to pick spelling for display chords.
  const major = relativeMajorKeyName(keyBody) || 'C';
  const majRoot = (major.match(/^([A-G][#b]?)/i) || [])[1] || 'C';
  const rooted = majRoot.charAt(0).toUpperCase() + majRoot.slice(1);
  // Temporary prefer from source; then recompute from transposed major name.
  const soundingMajor = transposeChordRootName(rooted, semis, preferFlats);
  const displayPreferFlats = keyBodyPrefersFlats(soundingMajor);
  return {
    semis: semis,
    preferFlats: displayPreferFlats,
    sourcePreferFlats: preferFlats,
  };
}

/** Remove ABC chord symbols for safety comparisons. */
function stripAbcChordSymbols(abc) {
  return String(abc || '').replace(/"[^"]*"/g, '');
}

/**
 * Enumerate sounding notes/rests in source ABC with absolute offsets.
 * Index order matches abcjs note selectables when both skip grace notes.
 */
function enumerateAbcNotes(abc) {
  const text = String(abc || '');
  const notes = [];
  let offset = 0;
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineStart = offset;
    const trimmed = line.trim();
    const isHeader = !trimmed || trimmed.charAt(0) === '%' || /^[A-Za-z]:/.test(trimmed);
    if (!isHeader) {
      let i = 0;
      let pendingChord = null;
      while (i < line.length) {
        const abs = lineStart + i;
        const ch = line[i];
        if (/\s/.test(ch)) { i += 1; continue; }
        if (ch === '"') {
          let j = i + 1;
          while (j < line.length && line[j] !== '"') j += 1;
          const end = Math.min(j + 1, line.length);
          pendingChord = {
            name: normalizeChordSymbolName(line.slice(i + 1, Math.min(j, line.length))),
            start: abs,
            end: lineStart + end,
          };
          i = end;
          continue;
        }
        if (ch === '{') {
          let j = i + 1;
          while (j < line.length && line[j] !== '}') j += 1;
          i = Math.min(j + 1, line.length);
          pendingChord = null;
          continue;
        }
        if (ch === '!') {
          let j = i + 1;
          while (j < line.length && line[j] !== '!') j += 1;
          i = Math.min(j + 1, line.length);
          continue;
        }
        if (ch === '(' && /\d/.test(line[i + 1] || '')) {
          let j = i + 1;
          while (j < line.length && /[\d:]/.test(line[j])) j += 1;
          i = j;
          continue;
        }
        if (ch === '(' || ch === ')') { i += 1; continue; }
        if ('~uMvHSLTx.Y'.indexOf(ch) >= 0) { i += 1; continue; }
        if (ch === '[') {
          if (/^\[\d/.test(line.slice(i))) {
            let j = i + 1;
            while (j < line.length && /[\d,\-]/.test(line[j])) j += 1;
            if (line[j] === ':') j += 1;
            if (line[j] === ']') j += 1;
            i = j;
            continue;
          }
          // Chordal note [CEG]
          let j = i + 1;
          while (j < line.length && line[j] !== ']') j += 1;
          j = Math.min(j + 1, line.length);
          while (j < line.length && /[\d\/><]/.test(line[j])) j += 1;
          if (line[j] === '-') j += 1;
          notes.push({
            index: notes.length,
            noteStart: abs,
            noteEnd: lineStart + j,
            chord: pendingChord,
          });
          pendingChord = null;
          i = j;
          continue;
        }
        if (/[_^=]/.test(ch) || /[A-Ga-gzxZ]/.test(ch)) {
          let j = i;
          while (j < line.length && /[_^=]/.test(line[j])) j += 1;
          if (/[zxZ]/.test(line[j])) {
            j += 1;
          } else if (/[A-Ga-g]/.test(line[j])) {
            j += 1;
            while (line[j] === ',' || line[j] === "'") j += 1;
          } else {
            i += 1;
            continue;
          }
          // duration
          if (line[j] === '>' || line[j] === '<') j += 1;
          else {
            const rest = line.slice(j);
            let dm = rest.match(/^(\d+)\/(\d+)/) || rest.match(/^\/(\d+)/) || (rest.charAt(0) === '/' ? ['/'] : null) || rest.match(/^(\d+)/);
            if (dm) j += dm[0].length;
          }
          if (line[j] === '-') j += 1;
          notes.push({
            index: notes.length,
            noteStart: abs,
            noteEnd: lineStart + j,
            chord: pendingChord,
          });
          pendingChord = null;
          i = j;
          continue;
        }
        // barlines / digits / other — clear pending chord (orphan)
        if (ch === '|' || ch === ':' || ch === '\\') {
          pendingChord = null;
          i += 1;
          continue;
        }
        i += 1;
      }
    }
    offset += line.length + 1;
  }
  return notes;
}

function setChordOnNoteIndex(sourceAbc, noteIndex, chordName) {
  const text = String(sourceAbc || '');
  const notes = enumerateAbcNotes(text);
  const note = notes[noteIndex];
  if (!note) return text;
  const next = normalizeChordSymbolName(chordName);
  if (note.chord) {
    if (!next) return text.slice(0, note.chord.start) + text.slice(note.chord.end);
    return text.slice(0, note.chord.start) + '"' + next + '"' + text.slice(note.chord.end);
  }
  if (!next) return text;
  return text.slice(0, note.noteStart) + '"' + next + '"' + text.slice(note.noteStart);
}

function moveChordBetweenNoteIndices(sourceAbc, fromIndex, toIndex) {
  const text = String(sourceAbc || '');
  if (fromIndex === toIndex) return text;
  const notes = enumerateAbcNotes(text);
  const from = notes[fromIndex];
  const to = notes[toIndex];
  if (!from || !to || !from.chord) return text;
  const name = from.chord.name;
  // Remove from source first.
  let next = text.slice(0, from.chord.start) + text.slice(from.chord.end);
  const notes2 = enumerateAbcNotes(next);
  const dest = notes2[toIndex];
  if (!dest) return text; // refuse if re-enumeration failed
  if (dest.chord) {
    next = next.slice(0, dest.chord.start) + '"' + name + '"' + next.slice(dest.chord.end);
  } else {
    next = next.slice(0, dest.noteStart) + '"' + name + '"' + next.slice(dest.noteStart);
  }
  return next;
}

/**
 * Chord edits may only add/remove/replace "Chord" tokens.
 * If anything else changes, refuse and keep the previous ABC.
 */
function safeChordOnlyEdit(previousAbc, nextAbc) {
  const prev = String(previousAbc || '');
  const next = String(nextAbc || '');
  if (next === prev) return { ok: true, abc: prev, unchanged: true };
  if (!next) return { ok: false, abc: prev, reason: 'Refused empty ABC after chord edit.' };
  if (stripAbcChordSymbols(prev) !== stripAbcChordSymbols(next)) {
    return {
      ok: false,
      abc: prev,
      reason: 'Refused chord edit that would change notes/barlines.',
    };
  }
  const prevNotes = enumerateAbcNotes(prev).length;
  const nextNotes = enumerateAbcNotes(next).length;
  if (prevNotes !== nextNotes) {
    return {
      ok: false,
      abc: prev,
      reason: 'Refused chord edit that changed note count (' + prevNotes + ' → ' + nextNotes + ').',
    };
  }
  return { ok: true, abc: next, unchanged: false };
}

function applyChordSourceEdit(t, abcTa, nextAbc) {
  const prev = abcTa.value || '';
  const checked = safeChordOnlyEdit(prev, nextAbc);
  if (!checked.ok) {
    const hint = document.getElementById('abc-hint-' + t.id);
    if (hint) hint.textContent = checked.reason || 'Chord edit refused';
    console.warn(checked.reason, { prevLen: prev.length, nextLen: String(nextAbc || '').length });
    return false;
  }
  if (checked.unchanged) return true;
  applyAbcRewrite(t, abcTa, checked.abc);
  return true;
}

function closeChordDialog() {
  const backdrop = document.getElementById('chord-dialog-backdrop');
  if (backdrop) {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  chordDialogCtx = null;
}

function openChordDialog(ctx) {
  chordDialogCtx = ctx;
  const backdrop = document.getElementById('chord-dialog-backdrop');
  const input = document.getElementById('chord-dialog-input');
  const title = document.getElementById('chord-dialog-title');
  const removeBtn = document.getElementById('chord-dialog-remove');
  if (!backdrop || !input) return;
  if (title) title.textContent = ctx.chordName ? 'Edit chord' : 'Add chord';
  input.value = ctx.chordName || '';
  if (removeBtn) removeBtn.style.display = ctx.chordName ? '' : 'none';
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  setTimeout(function() {
    input.focus();
    input.select();
  }, 0);
}

function saveChordDialog() {
  if (!chordDialogCtx) return;
  const input = document.getElementById('chord-dialog-input');
  const displayName = normalizeChordSymbolName(input && input.value);
  const ctx = chordDialogCtx;
  // Prefer live transpose from the tune (override), not a stale dialog snapshot.
  const semis = (ctx.tune && typeof getTranspose === 'function')
    ? getTranspose(ctx.tune)
    : (Number(ctx.chordTranspose) || 0);
  const keyBody = parseAbcKeyBody((ctx.abcTa && ctx.abcTa.value) || '');
  const sourcePreferFlats = keyBodyPrefersFlats(keyBody);
  // Dialog is in sounding pitch; ABC stores concert pitch.
  const name = semis
    ? transposeChordSymbol(displayName, -semis, sourcePreferFlats)
    : displayName;
  const live = ctx.abcTa.value || '';
  const next = setChordOnNoteIndex(live, ctx.noteIndex, name);
  closeChordDialog();
  applyChordSourceEdit(ctx.tune, ctx.abcTa, next);
}

function removeChordDialog() {
  if (!chordDialogCtx) return;
  const ctx = chordDialogCtx;
  const live = ctx.abcTa.value || '';
  const next = setChordOnNoteIndex(live, ctx.noteIndex, '');
  closeChordDialog();
  applyChordSourceEdit(ctx.tune, ctx.abcTa, next);
}

function noteHeadRect(svgEl) {
  if (!svgEl || !svgEl.getBoundingClientRect) return null;
  // Prefer the notehead/rest glyph — the full selectable often includes a tall stem
  // which would push chord markers far above the written pitch.
  const head = svgEl.querySelector
    ? (svgEl.querySelector('.abcjs-notehead')
      || svgEl.querySelector('.abcjs-rest')
      || svgEl.querySelector('.abcjs-grace-notehead'))
    : null;
  const el = head || svgEl;
  const r = el.getBoundingClientRect();
  if (!(r.width || r.height)) return null;
  return r;
}

function noteSelectableList(visual) {
  const engraver = visual && visual[0] && visual[0].engraver;
  const sels = (engraver && engraver.selectables) || [];
  const out = [];
  for (let i = 0; i < sels.length; i++) {
    const sel = sels[i];
    const abcelem = sel && sel.absEl && sel.absEl.abcelem;
    if (!abcelem || abcelem.el_type !== 'note') continue;
    if (!sel.svgEl) continue;
    out.push(sel);
  }
  return out;
}

function clearChordDragListeners() {
  if (!chordDragState) return;
  if (chordDragState._onMove) {
    window.removeEventListener('pointermove', chordDragState._onMove);
    window.removeEventListener('pointerup', chordDragState._onUp);
    window.removeEventListener('pointercancel', chordDragState._onUp);
  }
  if (chordDragState.ghost && chordDragState.ghost.parentNode) {
    chordDragState.ghost.parentNode.removeChild(chordDragState.ghost);
  }
}

/** Prefer abcjs staff-line id, then engraver staffPos.zero, else Y clustering. */
function noteSystemKey(sel, noteTop) {
  const svgEl = sel && sel.svgEl;
  if (svgEl && svgEl.classList) {
    const classes = svgEl.className && svgEl.className.baseVal != null
      ? String(svgEl.className.baseVal)
      : String(svgEl.getAttribute('class') || '');
    const m = classes.match(/(?:^|\s)abcjs-l(\d+)(?:\s|$)/);
    if (m) return 'l' + m[1];
  }
  if (sel && sel.staffPos && typeof sel.staffPos.zero === 'number') {
    return 'z' + Math.round(sel.staffPos.zero);
  }
  // Fallback: coarse Y bucket (systems are usually > ~40px apart at note tops).
  return 'y' + Math.round(noteTop / 40);
}

/**
 * Shared chord/add row Y per staff system: just above the five-line staff.
 * staffTopByLine maps systemKey (e.g. "l0") → Y of .abcjs-staff top in staff coords.
 */
function chordRowYByNote(noteInfos, staffTopByLine) {
  const GAP = 32; // px between label bottom (after -100% translate) and staff top line
  const fallbackMin = {};
  for (let i = 0; i < noteInfos.length; i++) {
    const key = noteInfos[i].systemKey != null ? String(noteInfos[i].systemKey) : ('i' + i);
    if (fallbackMin[key] == null || noteInfos[i].noteTop < fallbackMin[key]) {
      fallbackMin[key] = noteInfos[i].noteTop;
    }
  }
  const rowY = new Array(noteInfos.length);
  for (let i = 0; i < noteInfos.length; i++) {
    const key = noteInfos[i].systemKey != null ? String(noteInfos[i].systemKey) : ('i' + i);
    const staffTop = staffTopByLine && staffTopByLine[key];
    if (typeof staffTop === 'number') {
      rowY[i] = staffTop - GAP;
    } else {
      rowY[i] = fallbackMin[key] - GAP;
    }
  }
  return rowY;
}

/** Top of the engraved staff lines per abcjs line id (l0, l1, …). */
function staffTopYByLine(target, staffRect) {
  const map = {};
  if (!target || !staffRect) return map;
  const nodes = target.querySelectorAll('.abcjs-staff');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const cls = (el.className && el.className.baseVal != null)
      ? String(el.className.baseVal)
      : String(el.getAttribute('class') || '');
    const m = cls.match(/(?:^|\s)abcjs-l(\d+)(?:\s|$)/);
    if (!m) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width || r.height)) continue;
    const key = 'l' + m[1];
    const top = r.top - staffRect.top + target.scrollTop;
    if (map[key] == null || top < map[key]) map[key] = top;
  }
  return map;
}

function clearStaffChordOverlay(target) {
  if (!target) return;
  if (target._chordOverlayTimer) {
    clearTimeout(target._chordOverlayTimer);
    target._chordOverlayTimer = null;
  }
  if (target._chordOverlayRaf1 != null) {
    cancelAnimationFrame(target._chordOverlayRaf1);
    target._chordOverlayRaf1 = null;
  }
  if (target._chordOverlayRaf2 != null) {
    cancelAnimationFrame(target._chordOverlayRaf2);
    target._chordOverlayRaf2 = null;
  }
  target.querySelectorAll('.staff-chord-layer').forEach(function(el) { el.remove(); });
  target.classList.remove('chord-edit-active');
}

function queueStaffChordOverlay(t, target, visual, sourceAbc, abcTa, gen) {
  if (!target || target._renderGen !== gen) return;
  // Cancel pending work but do not strip a good overlay until the replacement is ready.
  if (target._chordOverlayTimer) {
    clearTimeout(target._chordOverlayTimer);
    target._chordOverlayTimer = null;
  }
  if (target._chordOverlayRaf1 != null) {
    cancelAnimationFrame(target._chordOverlayRaf1);
    target._chordOverlayRaf1 = null;
  }
  if (target._chordOverlayRaf2 != null) {
    cancelAnimationFrame(target._chordOverlayRaf2);
    target._chordOverlayRaf2 = null;
  }

  function runAttempt(retry) {
    if (target._renderGen !== gen) return;
    try {
      setupChordOverlay(t, target, visual, sourceAbc, abcTa);
    } catch (overlayErr) {
      console.warn('chord overlay failed', overlayErr);
      target.classList.remove('chord-edit-active');
      return;
    }
    if (target._renderGen !== gen) return;
    const layer = target.querySelector('.staff-chord-layer');
    if (layer && layer.dataset.layoutReady !== '1' && retry < 3) {
      target._chordOverlayTimer = setTimeout(function() { runAttempt(retry + 1); }, 50 + retry * 40);
    }
  }

  target._chordOverlayRaf1 = requestAnimationFrame(function() {
    target._chordOverlayRaf1 = null;
    if (target._renderGen !== gen) return;
    target._chordOverlayRaf2 = requestAnimationFrame(function() {
      target._chordOverlayRaf2 = null;
      if (target._renderGen !== gen) return;
      runAttempt(0);
    });
  });
}

function setupChordOverlay(t, target, visual, sourceAbc, abcTa) {
  if (!target || !visual) return false;
  // Use the ABC that was actually engraved (sourceAbc), not a possibly-stale textarea.
  const liveSource = sourceAbc || (abcTa && abcTa.value) || '';
  target._chordSourceAbc = liveSource;
  const chordTx = (typeof getTranspose === 'function')
    ? (function() {
        const semis = getTranspose(t) || 0;
        const keyBody = parseAbcKeyBody(liveSource);
        const sourcePreferFlats = keyBodyPrefersFlats(keyBody);
        if (!semis) return { semis: 0, preferFlats: sourcePreferFlats, sourcePreferFlats: sourcePreferFlats };
        const major = relativeMajorKeyName(keyBody) || 'C';
        const majRoot = (major.match(/^([A-G][#b]?)/i) || [])[1] || 'C';
        const rooted = majRoot.charAt(0).toUpperCase() + majRoot.slice(1);
        const soundingMajor = transposeChordRootName(rooted, semis, sourcePreferFlats);
        return {
          semis: semis,
          preferFlats: keyBodyPrefersFlats(soundingMajor),
          sourcePreferFlats: sourcePreferFlats,
        };
      })()
    : chordDisplayTransposeInfo(liveSource);
  target._chordTranspose = chordTx;

  const sels = noteSelectableList(visual);
  const sourceNotes = enumerateAbcNotes(liveSource);
  if (!sels.length || !sourceNotes.length) {
    target.querySelectorAll('.staff-chord-layer').forEach(function(el) { el.remove(); });
    target.classList.remove('chord-edit-active');
    return false;
  }

  // Align by min length so a small engraver/source mismatch still shows controls.
  const n = Math.min(sels.length, sourceNotes.length);
  if (sels.length !== sourceNotes.length) {
    const hint = document.getElementById('abc-hint-' + t.id);
    if (hint) {
      hint.textContent = 'Chord overlay partial (svg ' + sels.length + ' vs abc ' + sourceNotes.length + ')';
    }
  }

  target.querySelectorAll('.staff-chord-layer').forEach(function(el) { el.remove(); });

  const layer = document.createElement('div');
  layer.className = 'staff-chord-layer';
  target.appendChild(layer);

  const staffRect = target.getBoundingClientRect();
  const noteInfos = [];
  let layoutReady = true;

  for (let index = 0; index < n; index++) {
    const sel = sels[index];
    const svgEl = sel.svgEl;
    if (!svgEl) continue;
    const headR = noteHeadRect(svgEl);
    if (!headR) {
      layoutReady = false;
      continue;
    }
    // Keep X centred on the full note (stem+head); Y from the notehead only.
    const fullR = svgEl.getBoundingClientRect();
    const x = (fullR.width || fullR.height
      ? fullR.left + fullR.width / 2
      : headR.left + headR.width / 2) - staffRect.left + target.scrollLeft;
    const noteTop = headR.top - staffRect.top + target.scrollTop;
    const noteMidY = noteTop + headR.height / 2;
    if (index > 0 && noteInfos.length && Math.abs(x - noteInfos[noteInfos.length - 1].x) < 0.5
        && Math.abs(noteMidY - noteInfos[noteInfos.length - 1].noteMidY) < 0.5) {
      layoutReady = false;
    }
    const src = sourceNotes[index];
    const chordName = (src && src.chord && src.chord.name) ? src.chord.name : '';
    const displayChordName = chordName
      ? transposeChordSymbol(chordName, chordTx.semis, chordTx.preferFlats)
      : '';
    noteInfos.push({
      noteIndex: index,
      x: x,
      noteTop: noteTop,
      noteMidY: noteMidY,
      systemKey: noteSystemKey(sel, noteTop),
      chordName: chordName,
      displayChordName: displayChordName,
    });
  }

  if (!noteInfos.length) {
    layer.remove();
    target.classList.remove('chord-edit-active');
    return false;
  }

  // Only hide native abcjs chords once our overlay is actually populated.
  target.classList.add('chord-edit-active');
  layer.dataset.layoutReady = layoutReady ? '1' : '0';
  const staffTopByLine = staffTopYByLine(target, staffRect);
  const rowYs = chordRowYByNote(noteInfos, staffTopByLine);
  const hits = [];
  const addButtons = [];
  const chordLabels = [];

  noteInfos.forEach(function(info, idx) {
    const chordY = rowYs[idx];
    const hit = document.createElement('div');
    hit.className = 'review-chord-hit';
    hit.style.left = info.x + 'px';
    hit.style.top = info.noteMidY + 'px';
    layer.appendChild(hit);

    hits.push({
      noteIndex: info.noteIndex,
      x: info.x,
      y: info.noteMidY,
      el: hit,
      chordName: info.chordName,
    });

    if (info.chordName) {
      const label = document.createElement('div');
      label.className = 'review-chord review-chord--draggable';
      label.textContent = info.displayChordName || info.chordName;
      label.style.left = info.x + 'px';
      label.style.top = chordY + 'px';
      label.title = 'Drag to another note, or click to edit';
      label.draggable = false;

      label.addEventListener('click', function(ev) {
        if (label.dataset.didDrag === '1') {
          label.dataset.didDrag = '';
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        openChordDialog({
          tune: t,
          abcTa: abcTa,
          noteIndex: info.noteIndex,
          chordName: info.displayChordName || info.chordName,
          chordTranspose: chordTx.semis,
          sourcePreferFlats: chordTx.sourcePreferFlats,
        });
      });

      label.addEventListener('pointerdown', function(ev) {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        clearChordDragListeners();

        const startX = ev.clientX;
        const startY = ev.clientY;
        const ghost = document.createElement('div');
        ghost.className = 'review-chord review-chord--ghost';
        ghost.textContent = info.displayChordName || info.chordName;
        ghost.style.left = startX + 'px';
        ghost.style.top = startY + 'px';
        ghost.style.display = 'none';
        document.body.appendChild(ghost);

        chordDragState = {
          tune: t,
          abcTa: abcTa,
          fromIndex: info.noteIndex,
          fromName: info.chordName,
          label: label,
          ghost: ghost,
          hits: hits,
          dragging: false,
          targetHit: -1,
          pointerId: ev.pointerId,
        };

        function onMove(e) {
          if (!chordDragState) return;
          if (chordDragState.pointerId != null && e.pointerId !== chordDragState.pointerId) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (!chordDragState.dragging && (dx * dx + dy * dy) > 25) {
            chordDragState.dragging = true;
            label.dataset.didDrag = '1';
            label.classList.add('review-chord--source');
            ghost.style.display = '';
          }
          if (!chordDragState.dragging) return;
          ghost.style.left = e.clientX + 'px';
          ghost.style.top = e.clientY + 'px';

          const staffR = target.getBoundingClientRect();
          const lx = e.clientX - staffR.left + target.scrollLeft;
          const ly = e.clientY - staffR.top + target.scrollTop;
          let best = -1;
          let bestScore = Infinity;
          for (let i = 0; i < hits.length; i++) {
            const h = hits[i];
            const score = Math.abs(h.x - lx) + Math.abs(h.y - ly) * 0.35;
            if (score < bestScore && score < 48) {
              bestScore = score;
              best = i;
            }
          }
          chordDragState.targetHit = best;
          hits.forEach(function(h, i) {
            h.el.classList.toggle('is-target', i === best);
          });
        }

        function onUp(e) {
          if (chordDragState && chordDragState.pointerId != null && e && e.pointerId !== chordDragState.pointerId) {
            return;
          }
          const st = chordDragState;
          clearChordDragListeners();
          chordDragState = null;
          if (st && st.label) st.label.classList.remove('review-chord--source');
          hits.forEach(function(h) { h.el.classList.remove('is-target'); });
          if (!st || !st.dragging || st.targetHit < 0) return;
          const dest = st.hits[st.targetHit];
          if (!dest || dest.noteIndex === st.fromIndex) return;
          const live = st.abcTa.value || '';
          const next = moveChordBetweenNoteIndices(live, st.fromIndex, dest.noteIndex);
          applyChordSourceEdit(st.tune, st.abcTa, next);
        }

        chordDragState._onMove = onMove;
        chordDragState._onUp = onUp;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });

      chordLabels.push(label);
    } else {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'review-chord review-chord--add';
      addBtn.textContent = '+';
      addBtn.setAttribute('aria-label', 'Add chord');
      addBtn.title = 'Add chord';
      addBtn.style.left = info.x + 'px';
      addBtn.style.top = chordY + 'px';
      addBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openChordDialog({
          tune: t,
          abcTa: abcTa,
          noteIndex: info.noteIndex,
          chordName: '',
          chordTranspose: chordTx.semis,
          sourcePreferFlats: chordTx.sourcePreferFlats,
        });
      });
      addButtons.push(addBtn);
    }
  });

  // Plus buttons first, chord labels last — chords must paint on top when positions overlap.
  addButtons.forEach(function(btn) { layer.appendChild(btn); });
  chordLabels.forEach(function(label) { layer.appendChild(label); });
  return layoutReady;
}

(function wireChordDialog() {
  const backdrop = document.getElementById('chord-dialog-backdrop');
  const input = document.getElementById('chord-dialog-input');
  const saveBtn = document.getElementById('chord-dialog-save');
  const cancelBtn = document.getElementById('chord-dialog-cancel');
  const removeBtn = document.getElementById('chord-dialog-remove');
  if (saveBtn) saveBtn.addEventListener('click', saveChordDialog);
  if (cancelBtn) cancelBtn.addEventListener('click', closeChordDialog);
  if (removeBtn) removeBtn.addEventListener('click', removeChordDialog);
  if (backdrop) {
    backdrop.addEventListener('click', function(ev) {
      if (ev.target === backdrop) closeChordDialog();
    });
  }
  if (input) {
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        saveChordDialog();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        closeChordDialog();
      }
    });
  }
})();

const SOUNDFONT_URL = 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/';
let activePlayback = null; // { tuneId, synth, voiceIndex, gen }

function listAbcVoiceDefs(abc) {
  const ids = [];
  const labels = {};
  String(abc || '').split('\n').forEach(function(line) {
    const m = line.match(/^V:(\S+)(.*)$/);
    if (!m) return;
    const id = m[1];
    if (ids.indexOf(id) < 0) ids.push(id);
    const rest = String(m[2] || '');
    const nm = rest.match(/\bnm="([^"]+)"/i) || rest.match(/\bname="([^"]+)"/i);
    if (nm && nm[1] && !labels[id]) labels[id] = nm[1].trim();
  });
  if (!ids.length) {
    return [{ index: 0, id: '1', label: 'Melody' }];
  }
  return ids.map(function(id, index) {
    return { index: index, id: id, label: labels[id] || ('Voice ' + id) };
  });
}

function countVisualVoices(visualObj) {
  if (!visualObj || !visualObj.lines) return 0;
  let count = 0;
  for (let i = 0; i < visualObj.lines.length; i++) {
    const staffs = visualObj.lines[i] && visualObj.lines[i].staff;
    if (!staffs) continue;
    for (let j = 0; j < staffs.length; j++) {
      const staff = staffs[j];
      if (!staff || !staff.voices) continue;
      if (staff.clef && staff.clef.type === 'TAB') continue;
      count += staff.voices.length;
      // Only the first system defines the voice set for MIDI sequencing.
      return count;
    }
  }
  return 0;
}

function listPlaybackVoices(t) {
  const abc = getDisplayAbc(t);
  const defs = listAbcVoiceDefs(abc);
  const target = document.getElementById('staff-' + t.id);
  const visualObj = target && target._abcVisual && target._abcVisual[0];
  const visualCount = countVisualVoices(visualObj);
  if (visualCount > 0 && visualCount !== defs.length) {
    // Prefer engraved voice count when ABC V: headers disagree.
    const out = [];
    for (let i = 0; i < visualCount; i++) {
      out.push(defs[i] || { index: i, id: String(i + 1), label: 'Voice ' + (i + 1) });
      out[i].index = i;
    }
    return out;
  }
  return defs;
}

function closeAllPlayMenus(exceptId) {
  document.querySelectorAll('.play-menu.open').forEach(function(menu) {
    if (exceptId && menu.id === 'play-menu-panel-' + exceptId) return;
    menu.classList.remove('open');
  });
}

function setPlayHint(t, text, isErr) {
  const hint = document.getElementById('play-hint-' + t.id);
  if (!hint) return;
  hint.className = 'play-hint' + (isErr ? ' is-err' : '');
  hint.textContent = text || '';
}

function syncPlayButtonUI(t) {
  const group = document.getElementById('play-group-' + t.id);
  const btn = document.getElementById('play-' + t.id);
  if (!group || !btn) return;
  const playing = activePlayback && activePlayback.tuneId === t.id;
  const loading = playing && activePlayback.loading;
  group.classList.toggle('is-playing', Boolean(playing) && !loading);
  group.classList.toggle('is-loading', Boolean(loading));
  if (loading) btn.textContent = '…';
  else if (playing) btn.textContent = 'Stop';
  else btn.textContent = 'Play';
  btn.title = playing
    ? 'Stop playback'
    : 'Play MIDI (all voices)';
}

function syncAllPlayButtons() {
  for (const t of tunes) syncPlayButtonUI(t);
}

function rebuildPlayMenu(t) {
  const menu = document.getElementById('play-menu-panel-' + t.id);
  if (!menu) return;
  const voices = listPlaybackVoices(t);
  const parts = [];
  parts.push('<button type="button" data-voice="all" class="is-active">All voices</button>');
  voices.forEach(function(v) {
    parts.push(
      '<button type="button" data-voice="' + v.index + '">' +
      escapeHtml(v.label) +
      (v.id && v.label.indexOf(v.id) < 0 ? ' <span class="sub">(' + escapeHtml(v.id) + ')</span>' : '') +
      '</button>'
    );
  });
  menu.innerHTML = parts.join('');
  menu.querySelectorAll('button[data-voice]').forEach(function(b) {
    b.addEventListener('click', function() {
      menu.classList.remove('open');
      const raw = b.getAttribute('data-voice');
      if (raw === 'all') playTuneMidi(t, null);
      else playTuneMidi(t, parseInt(raw, 10));
    });
  });
}

function stopActivePlayback() {
  if (!activePlayback) return;
  const prev = activePlayback;
  activePlayback = null;
  try {
    if (prev.synth && typeof prev.synth.stop === 'function') prev.synth.stop();
  } catch (e) { /* ignore */ }
  const prevTune = tunes.find(function(x) { return x.id === prev.tuneId; });
  if (prevTune) {
    syncPlayButtonUI(prevTune);
    setPlayHint(prevTune, '');
  } else {
    syncAllPlayButtons();
  }
}

async function playTuneMidi(t, voiceIndex) {
  if (activePlayback && activePlayback.tuneId === t.id && !activePlayback.loading
      && ((activePlayback.voiceIndex == null && voiceIndex == null)
        || activePlayback.voiceIndex === voiceIndex)) {
    stopActivePlayback();
    return;
  }
  stopActivePlayback();
  closeAllPlayMenus();
  setPlayHint(t, 'Loading soundfont…');
  activePlayback = { tuneId: t.id, synth: null, voiceIndex: voiceIndex, loading: true, gen: Date.now() };
  const gen = activePlayback.gen;
  syncPlayButtonUI(t);

  try {
    if (typeof ABCJS === 'undefined' || !ABCJS.synth || !ABCJS.synth.CreateSynth) {
      throw new Error('abcjs synth unavailable');
    }
    let target = document.getElementById('staff-' + t.id);
    if (!target || !target._abcVisual || !target._abcVisual[0]) {
      renderStaff(t);
      target = document.getElementById('staff-' + t.id);
    }
    const visualObj = target && target._abcVisual && target._abcVisual[0];
    if (!visualObj) throw new Error('No rendered notation to play');

    const voices = listPlaybackVoices(t);
    const voiceCount = Math.max(voices.length, countVisualVoices(visualObj) || 1);
    let voicesOff = false;
    if (voiceIndex != null && Number.isFinite(voiceIndex)) {
      if (voiceIndex < 0 || voiceIndex >= voiceCount) throw new Error('Unknown voice');
      voicesOff = [];
      for (let i = 0; i < voiceCount; i++) {
        if (i !== voiceIndex) voicesOff.push(i);
      }
    }

    const audioContext = (ABCJS.synth.activeAudioContext && ABCJS.synth.activeAudioContext())
      || new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();

    const synth = new ABCJS.synth.CreateSynth();
    const msPerMeasure = typeof visualObj.millisecondsPerMeasure === 'function'
      ? visualObj.millisecondsPerMeasure()
      : 1000;
    await synth.init({
      audioContext: audioContext,
      visualObj: visualObj,
      millisecondsPerMeasure: msPerMeasure,
      options: {
        soundFontUrl: SOUNDFONT_URL,
        voicesOff: voicesOff,
        chordsOff: false,
      },
      onEnded: function() {
        if (!activePlayback || activePlayback.gen !== gen) return;
        activePlayback = null;
        syncPlayButtonUI(t);
        setPlayHint(t, '');
      },
    });
    if (!activePlayback || activePlayback.gen !== gen) {
      try { synth.stop(); } catch (e) { /* ignore */ }
      return;
    }
    await synth.prime();
    if (!activePlayback || activePlayback.gen !== gen) {
      try { synth.stop(); } catch (e) { /* ignore */ }
      return;
    }
    activePlayback.synth = synth;
    activePlayback.loading = false;
    syncPlayButtonUI(t);
    const label = voiceIndex == null
      ? 'Playing all voices'
      : ('Playing ' + ((voices[voiceIndex] && voices[voiceIndex].label) || ('voice ' + (voiceIndex + 1))));
    setPlayHint(t, label);
    synth.start();
  } catch (err) {
    activePlayback = null;
    syncPlayButtonUI(t);
    setPlayHint(t, (err && err.message) ? err.message : String(err), true);
  }
}

function wirePlayControls(t, root) {
  const el = root || document.getElementById(t.id);
  if (!el) return;
  const mainBtn = el.querySelector('#play-' + t.id);
  const caretBtn = el.querySelector('#play-menu-' + t.id);
  const menu = el.querySelector('#play-menu-panel-' + t.id);
  if (!mainBtn || !caretBtn || !menu) return;
  rebuildPlayMenu(t);
  mainBtn.addEventListener('click', function() {
    closeAllPlayMenus();
    if (activePlayback && activePlayback.tuneId === t.id && !activePlayback.loading) {
      stopActivePlayback();
      return;
    }
    playTuneMidi(t, null);
  });
  caretBtn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    const willOpen = !menu.classList.contains('open');
    closeAllPlayMenus();
    if (willOpen) {
      rebuildPlayMenu(t);
      menu.classList.add('open');
    }
  });
}

document.addEventListener('click', function() {
  closeAllPlayMenus();
});

function renderStaff(t, opts) {
  const options = opts || {};
  // Don't cancel an in-progress prime that triggered this render for a missing visual.
  if (activePlayback && activePlayback.tuneId === t.id && !activePlayback.loading) {
    stopActivePlayback();
  }
  const target = document.getElementById('staff-' + t.id);
  const abcTa = document.getElementById('abc-' + t.id);
  let abc = options.fromEdit && abcTa ? abcTa.value : getDisplayAbc(t);
  // Keep engraved ABC + textarea on the same transpose as the toolbar.
  abc = setAbcTranspose(abc, getTranspose(t));
  if (abcTa) {
    if (!options.fromEdit || document.activeElement !== abcTa) {
      abcTa.value = abc;
    }
    abcTa.classList.toggle('is-edited', hasAbcEdit(t));
  }
  if (!options.fromEdit) rememberAbcTypingSnapshot(t, abc);
  const hint = document.getElementById('abc-hint-' + t.id);
  if (hint) {
    hint.textContent = hasAbcEdit(t)
      ? 'local edit · click note · drag/add chords above staff'
      : 'live preview · click note · drag/add chords above staff';
  }
  renderIssues(t);
  syncNotationToolbar(t);
  updateUndoRedoButtons(t);
  if (!target) return;
  const renderGen = (target._renderGen || 0) + 1;
  target._renderGen = renderGen;
  clearStaffChordOverlay(target);
  if (target._chordOverlayObserver) {
    target._chordOverlayObserver.disconnect();
    target._chordOverlayObserver = null;
  }
  if (target._chordOverlayResizeTimer) {
    clearTimeout(target._chordOverlayResizeTimer);
    target._chordOverlayResizeTimer = null;
  }
  target.innerHTML = '';
  try {
    if (typeof ABCJS === 'undefined') throw new Error('abcjs failed to load');
    if (!abc || /%% missing abc/.test(abc)) {
      target.innerHTML = '<div class="err">No ABC for this tune</div>';
      requestAnimationFrame(function() { syncCompareHeights(t); });
      return;
    }
    const visualTranspose = getTranspose(t);
    const prepared = prepareAbcForRender(abc);
    let renderText = prepared.text;
    if (visualTranspose) {
      renderText = rewriteAbcKeyForVisualTranspose(prepared.text);
    }
    const optsRender = {
      // Match Music Single: honour ABC source newlines (no abcjs wrap reflow).
      responsive: 'resize',
      add_classes: true,
      paddingleft: 0,
      paddingright: 0,
      staffwidth: 640,
      clickListener: function(abcelem) {
        if (!abcTa || !abcelem || abcelem.startChar == null) return;
        const prep = target._abcPrepared || prepared;
        const renderSrc = target._abcRenderText || renderText;
        if (renderSrc && prep && renderSrc !== prep.text) {
          const slice = String(renderSrc).slice(abcelem.startChar, abcelem.endChar);
          if (slice) {
            const hay = abcTa.value || '';
            let idx = hay.indexOf(slice);
            if (idx < 0) {
              const loose = slice.replace(/\^/g, '');
              idx = hay.indexOf(loose);
              if (idx >= 0) {
                focusAbcSelection(abcTa, idx, idx + loose.length);
                return;
              }
            } else {
              focusAbcSelection(abcTa, idx, idx + slice.length);
              return;
            }
          }
        }
        const range = prep.mapRange(abcelem.startChar, abcelem.endChar);
        focusAbcSelection(abcTa, range.start, range.end);
      },
    };
    if (visualTranspose) optsRender.visualTranspose = visualTranspose;
    target._abcPrepared = prepared;
    target._abcRenderText = renderText;
    let visual;
    try {
      visual = ABCJS.renderAbc(target, renderText, optsRender);
    } catch (err) {
      if (target._renderGen !== renderGen) return;
      // Retry once with key rewrite if we somehow skipped it.
      const retry = rewriteAbcKeyForVisualTranspose(prepared.text);
      if (retry === renderText) throw err;
      renderText = retry;
      target._abcRenderText = renderText;
      visual = ABCJS.renderAbc(target, renderText, optsRender);
    }
    if (target._renderGen !== renderGen) return;
    target._abcVisual = visual;
    target._chordSourceAbc = abc;
    queueStaffChordOverlay(t, target, visual, abc, abcTa, renderGen);
    const warnings = (visual && visual[0] && visual[0].warnings) || [];
    if (warnings.length && /Unknown decoration/.test(String(warnings[0]))) {
      const note = document.createElement('div');
      note.className = 'err';
      note.textContent = 'Render warning: Session “!” line-breaks may be truncating the tune — click Safe autofix.';
      target.appendChild(note);
    }
  } catch (err) {
    target.innerHTML = '<div class="err">Render failed: ' + escapeHtml(err.message || String(err)) + '</div>';
  }
  requestAnimationFrame(function() { syncCompareHeights(t); });
}

function isSelectedOmr(t) {
  return isOmrCandidate(getSelectedCandidate(t));
}

function completeStats() {
  const total = tunes.length;
  let done = 0;
  let omr = 0;
  let abc = 0;
  for (const t of tunes) {
    if (isTuneComplete(t)) done += 1;
    if (isSelectedOmr(t)) omr += 1;
    else abc += 1;
  }
  return {
    total: total,
    done: done,
    left: total - done,
    omr: omr,
    abc: abc,
    pct: total ? Math.round((100 * done) / total) : 0,
  };
}

function tuneMatchesListFilter(t) {
  const mode = state.completeFilter || 'all';
  if (mode === 'complete') return isTuneComplete(t);
  if (mode === 'incomplete') return !isTuneComplete(t);
  if (mode === 'omr') return isSelectedOmr(t);
  if (mode === 'abc') return !isSelectedOmr(t);
  return true;
}

function applyCompleteFilter() {
  const mode = state.completeFilter || 'all';
  document.querySelectorAll('#complete-filter-bar [data-filter]').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === mode);
  });

  const visibleByPage = {};
  for (const t of tunes) {
    const show = tuneMatchesListFilter(t);
    const article = document.getElementById(t.id);
    if (article) article.classList.toggle('is-filtered-out', !show);
    if (show) visibleByPage[t.page] = true;
  }
  document.querySelectorAll('.page-head').forEach(function(head) {
    const page = parseInt(head.getAttribute('data-page'), 10);
    head.classList.toggle('is-filtered-out', !visibleByPage[page]);
  });
  requestAnimationFrame(syncAllCompareHeights);
}

function updateCompleteUI() {
  const s = completeStats();
  const tallyAll = document.getElementById('tally-all');
  const tallyDone = document.getElementById('tally-complete');
  const tallyLeft = document.getElementById('tally-incomplete');
  const tallyOmr = document.getElementById('tally-omr');
  const tallyAbc = document.getElementById('tally-abc');
  const pctEl = document.getElementById('complete-pct');
  if (tallyAll) tallyAll.textContent = String(s.total);
  if (tallyDone) tallyDone.textContent = String(s.done);
  if (tallyLeft) tallyLeft.textContent = String(s.left);
  if (tallyOmr) tallyOmr.textContent = String(s.omr);
  if (tallyAbc) tallyAbc.textContent = String(s.abc);
  if (pctEl) pctEl.textContent = s.done + ' / ' + s.total + ' complete (' + s.pct + '%)';

  for (const t of tunes) {
    const done = isTuneComplete(t);
    const article = document.getElementById(t.id);
    if (article) article.classList.toggle('is-complete', done);
    const chk = document.getElementById('done-' + t.id);
    if (chk) chk.checked = done;
    const label = document.getElementById('done-label-' + t.id);
    if (label) label.classList.toggle('is-on', done);
  }
  applyCompleteFilter();
  refreshEurosessionAbcLink();
}

function hasTuneFeedback(t) {
  const key = commentKey(t);
  return Boolean(
    (state.comments[key] || '').trim() ||
    state.meterOverrides[key] ||
    Object.prototype.hasOwnProperty.call(state.transposeOverrides, key) ||
    (state.badSections[key] || []).length ||
    hasAbcEdit(t)
  );
}

function updateCommentUI() {
  let n = 0;
  for (const t of tunes) {
    const key = commentKey(t);
    const text = (state.comments[key] || '').trim();
    const unresolved = Boolean(
      text ||
      state.meterOverrides[key] ||
      Object.prototype.hasOwnProperty.call(state.transposeOverrides, key) ||
      (state.badSections[key] || []).length ||
      hasAbcEdit(t)
    );
    if (text) n += 1;
    const article = document.getElementById(t.id);
    if (article) article.classList.toggle('has-comment', unresolved);
    const ta = document.getElementById('c-' + t.id);
    if (ta) ta.classList.toggle('has-text', Boolean(text));
    const tocLink = toc.querySelector(`a[data-page="${t.page}"]`);
    if (tocLink) {
      const pageHas = tunes.some(x => {
        if (x.page !== t.page) return false;
        const k = commentKey(x);
        return Boolean(
          (state.comments[k] || '').trim() ||
          state.meterOverrides[k] ||
          Object.prototype.hasOwnProperty.call(state.transposeOverrides, k) ||
          (state.badSections[k] || []).length ||
          hasAbcEdit(x)
        );
      });
      tocLink.classList.toggle('has-comment', pageHas);
    }
  }
  const chordedSel = tunes.filter(t => {
    const c = getSelectedCandidate(t);
    return c && c.hasChords;
  }).length;
  const edited = tunes.filter(hasAbcEdit).length;
  commentCountEl.textContent = `${n} comment${n===1?'':'s'} · ${chordedSel} chorded · ${edited} ABC edit${edited===1?'':'s'}`;
  copyBtn.textContent = n ? `Copy comments for Copilot (${n})` : 'Copy comments for Copilot';
  updateCompleteUI();
}

function isOmrCandidate(c) {
  const s = String((c && c.source) || '').toLowerCase();
  return s === 'omr' || s.startsWith('omr');
}

function nonOmrCandidates(list) {
  return (list || []).filter(c => !isOmrCandidate(c));
}

function applyPreferChordsDefaults() {
  if (!preferChordsChk.checked) return;
  for (const t of tunes) {
    const key = commentKey(t);
    if (state.selections[key]) continue;
    // Prefer chorded archive/session sources only — never auto-pick omr / omr-chords.
    const chorded = nonOmrCandidates(t.candidates).filter(c => c.hasChords);
    if (chorded.length) {
      state.selections[key] = chorded[0].id;
    }
  }
  saveState(state);
}

const pages = [...new Set(tunes.map(t => t.page))];
for (const p of pages) {
  const a = document.createElement('a');
  a.href = '#p' + String(p).padStart(2,'0');
  a.textContent = String(p).padStart(2,'0');
  a.dataset.page = String(p);
  toc.appendChild(a);
}

applyPreferChordsDefaults();

let lastPage = null;
for (const t of tunes) {
  if (t.page !== lastPage) {
    lastPage = t.page;
    const h = document.createElement('div');
    h.id = 'p' + String(t.page).padStart(2,'0');
    h.className = 'page-head';
    h.dataset.page = String(t.page);
    h.style.cssText = 'color:var(--muted);font-size:.85rem;margin:1.1rem 0 .45rem;letter-spacing:.04em;text-transform:uppercase';
    h.textContent = 'Page ' + String(t.page).padStart(2,'0');
    list.appendChild(h);
  }
  const key = commentKey(t);
  const saved = state.comments[key] || '';
  const selectedId = getSelectedId(t);
  const el = document.createElement('article');
  el.className = 'tune';
  el.id = t.id;

  const optionsHtml = (t.candidates || []).map(c => optionLabelHtml(t, c, selectedId)).join('');

  const done = isTuneComplete(t);
  const tuneBookId = getTuneId(t);
  el.innerHTML = `
    <div class="tune-head">
      <label class="complete-chk${done ? ' is-on' : ''}" id="done-label-${t.id}">
        <input type="checkbox" id="done-${t.id}" ${done ? 'checked' : ''} title="Mark this tune complete when you are happy with the music">
        <span>Complete</span>
      </label>
      <div class="tune-head-actions">
        <span class="play-hint" id="play-hint-${t.id}"></span>
        <div class="play-group" id="play-group-${t.id}">
          <button type="button" class="play-main" id="play-${t.id}" title="Play MIDI (all voices)">Play</button>
          <button type="button" class="play-caret" id="play-menu-${t.id}" title="Choose voice to play" aria-haspopup="true" aria-expanded="false">▾</button>
          <div class="play-menu" id="play-menu-panel-${t.id}" role="menu"></div>
        </div>
      </div>
    </div>
    <div class="col-image">
      <div class="label">crop · tune ${String(t.tuneIndex).padStart(2,'0')} ${sourceBadge(t.source)}</div>
      <h2>${escapeHtml(t.title)}</h2>
      <div class="tune-id" title="Stable tunebook id — kept in this browser so re-import updates instead of duplicating">${escapeHtml(tuneBookId)}</div>
      <div class="crop-hint">Drag on crop to mark a bad section · right-click a rect to clear it</div>
      <div class="crop-wrap"><div class="crop-stage" id="crop-stage-${t.id}"><img src="tunes/${escapeHtml(t.crop)}" alt="${escapeHtml(t.title)}" loading="lazy"></div></div>
      <div class="options" id="options-${t.id}">
        <div class="options-title">ABC source options (OMR / OMR+chords / OMR+ listed last)</div>
        <div class="options-list" id="options-list-${t.id}">${optionsHtml || '<div class="sub">No alternate sources</div>'}</div>
        <div class="options-add">
          <button type="button" id="add-mxml-${t.id}" title="Convert a MusicXML / MXL file to ABC and add it as a selectable source">Add MusicXML…</button>
          <input type="file" id="mxml-file-${t.id}" accept=".xml,.musicxml,.mxl,application/xml,text/xml" hidden>
          <span class="hint" id="mxml-hint-${t.id}"></span>
        </div>
      </div>
    </div>
    <div class="col-notation">
      <div class="notation-align-spacer" id="align-${t.id}" aria-hidden="true"></div>
      <div class="label">selected notation</div>
      <div class="staff" id="staff-${t.id}"></div>
    </div>
    <div class="col-abc">
      <div class="label">ABC tools</div>
      <div class="notation-actions">
        <button type="button" id="search-abc-${t.id}" title="Open a Google search for this tune title plus &quot;abc notation&quot; in a new window">Search ABC</button>
        <button type="button" id="clear-key-acc-${t.id}" title="Remove ^ _ = marks that duplicate the K: key signature or an accidental already used on that pitch in the same bar (e.g. ^C^C → ^C C)">Clear key accidentals</button>
        <button type="button" id="standardise-${t.id}" title="Normalise repeats, wrap to 4 bars/line; for OMR also group notes by time signature">Standardise</button>
        <button type="button" id="group-notes-${t.id}" title="Insert spaces at beat boundaries so beams/groups match the time signature (ABC spacing — not stem direction)">Group notes</button>
        <button type="button" id="autofix-${t.id}">Safe autofix</button>
        <button type="button" id="undo-${t.id}" title="Undo last ABC change">Undo</button>
        <button type="button" id="redo-${t.id}" title="Redo last undone ABC change">Redo</button>
      </div>
      <div class="issues" id="issues-${t.id}"></div>
      <div class="notation-toolbar">
        <span class="tb-label">Meter</span>
        <select id="meter-${t.id}" title="Override M: (useful when OMR time signature mismatches notes)"></select>
        <span class="tb-label">Transpose</span>
        <div class="btn-group" id="transpose-group-${t.id}">
          <button type="button" id="transpose-down-${t.id}" title="Transpose down 1 semitone">−</button>
          <button type="button" class="btn-value" id="transpose-val-${t.id}">0</button>
          <button type="button" id="transpose-up-${t.id}" title="Transpose up 1 semitone">+</button>
        </div>
        <button type="button" id="halve-${t.id}" title="Halve note lengths (scale L:)">Halve lengths</button>
        <button type="button" id="double-${t.id}" title="Double note lengths (scale L:)">Double lengths</button>
      </div>
      <div class="comment-box">
        <label for="c-${t.id}">Review comment / error notes</label>
        <textarea id="c-${t.id}" data-key="${escapeHtml(key)}" placeholder="e.g. wrong key, missing B part, bad rhythm in bar 3…">${escapeHtml(saved)}</textarea>
      </div>
      <div class="abc-toolbar">
        <span class="hint" id="abc-hint-${t.id}">edit ABC — live preview</span>
      </div>
      <details open>
        <summary>Editable ABC</summary>
        <textarea class="abc-edit" id="abc-${t.id}" spellcheck="false"></textarea>
      </details>
    </div>`;
  list.appendChild(el);

  const stage = el.querySelector('#crop-stage-' + t.id);
  setupBadSectionDrag(t, stage);
  renderBadRects(t);
  const cropImg = stage && stage.querySelector('img');
  if (cropImg) {
    if (cropImg.complete) {
      requestAnimationFrame(function() { syncCompareHeights(t); });
    } else {
      cropImg.addEventListener('load', function() { syncCompareHeights(t); });
    }
  }

  el.querySelector('#done-' + t.id).addEventListener('change', (ev) => {
    if (ev.target.checked) state.completed[key] = true;
    else delete state.completed[key];
    saveState(state);
    updateCommentUI();
  });

  wirePlayControls(t, el);

  wireOptionRadios(t, el);

  const addMxmlBtn = el.querySelector('#add-mxml-' + t.id);
  const mxmlFile = el.querySelector('#mxml-file-' + t.id);
  const mxmlHint = el.querySelector('#mxml-hint-' + t.id);
  if (addMxmlBtn && mxmlFile) {
    addMxmlBtn.addEventListener('click', () => mxmlFile.click());
    mxmlFile.addEventListener('change', async () => {
      const file = mxmlFile.files && mxmlFile.files[0];
      mxmlFile.value = '';
      await addMusicXmlSource(t, file, mxmlHint);
    });
  }

  const abcTa = el.querySelector('#abc-' + t.id);

  const meterSel = el.querySelector('#meter-' + t.id);
  meterSel.addEventListener('change', () => {
    const det = detectedMeterOf(t);
    if (meterSel.value === det) delete state.meterOverrides[key];
    else state.meterOverrides[key] = meterSel.value;
    saveState(state);
    renderStaff(t);
    updateCommentUI();
  });

  function bumpTranspose(delta) {
    const next = getTranspose(t) + delta;
    const baseSemis = parseAbcbookTranspose(getRawDisplayAbc(t));
    if (next === baseSemis) delete state.transposeOverrides[key];
    else state.transposeOverrides[key] = next;
    saveState(state);
    renderStaff(t);
    updateCommentUI();
  }
  el.querySelector('#transpose-down-' + t.id).addEventListener('click', () => bumpTranspose(-1));
  el.querySelector('#transpose-up-' + t.id).addEventListener('click', () => bumpTranspose(1));

  function scaleLengths(factor) {
    const next = scaleAbcUnitLength(abcTa.value || getDisplayAbc(t), factor);
    applyAbcRewrite(t, abcTa, next);
  }
  el.querySelector('#halve-' + t.id).addEventListener('click', () => scaleLengths(0.5));
  el.querySelector('#double-' + t.id).addEventListener('click', () => scaleLengths(2));

  el.querySelector('#clear-key-acc-' + t.id).addEventListener('click', () => {
    const hint = document.getElementById('abc-hint-' + t.id);
    const before = abcTa.value || getDisplayAbc(t);
    const fixed = clearKeySignatureAccidentals(before);
    const changed = applyAbcRewrite(t, abcTa, fixed);
    if (hint) {
      hint.textContent = !changed
        ? 'no redundant accidentals found'
        : 'cleared key-signature and within-bar duplicate accidentals';
    }
  });

  el.querySelector('#search-abc-' + t.id).addEventListener('click', () => {
    const title = String(t.title || '').trim() || 'untitled';
    const q = title + ' abc notation';
    window.open(
      'https://www.google.com/search?q=' + encodeURIComponent(q),
      '_blank',
      'noopener,noreferrer'
    );
  });

  const commentTa = el.querySelector('#c-' + t.id);
  commentTa.addEventListener('input', () => {
    const v = commentTa.value;
    if (v.trim()) state.comments[key] = v;
    else delete state.comments[key];
    saveState(state);
    updateCommentUI();
  });

  let abcTimer = null;
  let abcHistoryTimer = null;
  rememberAbcTypingSnapshot(t, abcTa.value || getDisplayAbc(t));
  abcTa.addEventListener('input', () => {
    commitAbcEdit(t, abcTa.value);
    abcTa.classList.toggle('is-edited', hasAbcEdit(t));
    // Keep transpose override in sync with typed abcbook-transpose lines.
    const typed = parseAbcbookTranspose(abcTa.value);
    const baseSemis = parseAbcbookTranspose(getBaseAbc(t));
    if (typed === baseSemis) delete state.transposeOverrides[key];
    else state.transposeOverrides[key] = typed;
    saveState(state);
    clearTimeout(abcTimer);
    abcTimer = setTimeout(() => renderStaff(t, { fromEdit: true }), 180);
    clearTimeout(abcHistoryTimer);
    abcHistoryTimer = setTimeout(() => {
      const ek = abcEditKey(t);
      const prev = Object.prototype.hasOwnProperty.call(abcTypingSnapshot, ek)
        ? abcTypingSnapshot[ek]
        : null;
      const now = abcTa.value || '';
      if (prev != null && prev !== now) {
        pushAbcHistorySnapshot(t, prev);
        rememberAbcTypingSnapshot(t, now);
      }
    }, 450);
    updateCommentUI();
  });

  el.querySelector('#standardise-' + t.id).addEventListener('click', () => {
    const groupNotes = isOmrCandidate(getSelectedCandidate(t));
    const fixed = standardiseAbc(abcTa.value || getDisplayAbc(t), { groupNotes: groupNotes });
    applyAbcRewrite(t, abcTa, fixed);
  });

  el.querySelector('#group-notes-' + t.id).addEventListener('click', () => {
    const hint = document.getElementById('abc-hint-' + t.id);
    const result = groupNotesByMeter(abcTa.value || getDisplayAbc(t), true);
    if (!result.ok) {
      if (hint) hint.textContent = result.reason || 'Could not group notes';
      return;
    }
    const changed = applyAbcRewrite(t, abcTa, result.abc);
    if (hint) {
      hint.textContent = !changed || result.unchanged
        ? 'notes already grouped for ' + parseAbcMeter(result.abc)
        : 'grouped notes by beat for ' + parseAbcMeter(result.abc);
    }
  });

  el.querySelector('#autofix-' + t.id).addEventListener('click', () => {
    const fixed = safeAutofixAbc(abcTa.value || getDisplayAbc(t));
    applyAbcRewrite(t, abcTa, fixed);
  });

  el.querySelector('#undo-' + t.id).addEventListener('click', () => undoAbcEdit(t));
  el.querySelector('#redo-' + t.id).addEventListener('click', () => redoAbcEdit(t));

  renderStaff(t);
}

preferChordsChk.addEventListener('change', () => {
  state.preferChords = preferChordsChk.checked;
  if (preferChordsChk.checked) {
    for (const t of tunes) {
      const key = commentKey(t);
      // Only fill defaults when unset — never yank an explicit choice; never auto-pick OMR.
      if (state.selections[key]) continue;
      const chorded = nonOmrCandidates(t.candidates).filter(c => c.hasChords);
      if (chorded.length) {
        state.selections[key] = chorded[0].id;
        const radio = document.querySelector(`input[name="opt-${t.id}"][value="${CSS.escape(chorded[0].id)}"]`);
        if (radio) radio.checked = true;
        renderStaff(t);
      }
    }
  }
  saveState(state);
  updateCommentUI();
});

copyAllChk.addEventListener('change', () => {
  state.copyAll = copyAllChk.checked;
  saveState(state);
});

clearDataBtn.addEventListener('click', () => {
  const backdrop = document.getElementById('clear-data-backdrop');
  if (!backdrop) return;
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  const confirmBtn = document.getElementById('clear-data-confirm');
  if (confirmBtn) confirmBtn.focus();
});

function closeClearDataDialog() {
  const backdrop = document.getElementById('clear-data-backdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
}

function performClearSavedData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('eurosession-abc-review-state-v2');
  state = emptyState();
  copyAllChk.checked = false;
  preferChordsChk.checked = true;
  window.location.reload();
}

(function wireClearDataDialog() {
  const backdrop = document.getElementById('clear-data-backdrop');
  const cancelBtn = document.getElementById('clear-data-cancel');
  const confirmBtn = document.getElementById('clear-data-confirm');
  if (cancelBtn) cancelBtn.addEventListener('click', closeClearDataDialog);
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function() {
      closeClearDataDialog();
      performClearSavedData();
    });
  }
  if (backdrop) {
    backdrop.addEventListener('click', function(ev) {
      if (ev.target === backdrop) closeClearDataDialog();
    });
  }
  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape') return;
    if (!backdrop || !backdrop.classList.contains('open')) return;
    ev.preventDefault();
    closeClearDataDialog();
  });
})();

if (exportTunebookImportBtn) {
  exportTunebookImportBtn.addEventListener('click', () => {
    downloadTunebookImportPackage();
  });
}

document.querySelectorAll('#complete-filter-bar [data-filter]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const next = btn.getAttribute('data-filter') || 'all';
    state.completeFilter = next;
    saveState(state);
    applyCompleteFilter();
  });
});

function buildReport(includeAll) {
  const selectedTunes = includeAll
    ? tunes
    : tunes.filter(hasTuneFeedback);

  const lines = [];
  lines.push('EuroSession ABC review — please repair these OMR / lookup errors.');
  lines.push('Work dir: /home/stever/Downloads/eurosession-work');
  lines.push('ABC file: eurosession.abc');
  lines.push(`Tunes in report: ${selectedTunes.length} (of ${tunes.length})`);
  lines.push('');
  lines.push('For each item: honour the selected ABC source option (prefer chorded `"Am"` style when chosen), fix ABC to match the crop, update manifest.json + eurosession.abc, regenerate review_abc.html.');
  lines.push('Honour transpose (semitones), meter override, and note-length scaling reflected in the ABC block.');
  lines.push('');

  if (!selectedTunes.length) {
    lines.push('(No comments yet — add notes on tunes that need repair.)');
    return lines.join('\n');
  }

  selectedTunes.forEach((t, i) => {
    const key = commentKey(t);
    const note = (state.comments[key] || '').trim();
    const cand = getSelectedCandidate(t);
    const km = getKeyMeter(t);
    const bad = getBadSections(t);
    const issues = (cand && cand.notationIssues) || [];
    const abcText = getDisplayAbc(t);
    lines.push(`## ${i + 1}. page ${t.page} tune ${t.tuneIndex} — ${t.title}`);
    lines.push(`- id: ${key}`);
    lines.push(`- crop: tunes/${t.crop}`);
    lines.push(`- selected source: ${(cand && cand.source) || t.source || 'missing'}`);
    lines.push(`- selected candidate id: ${(cand && cand.id) || getSelectedId(t)}`);
    if (cand && cand.matchedTitle) lines.push(`- selected match: ${cand.matchedTitle}`);
    if (cand) lines.push(`- selected hasChords: ${Boolean(cand.hasChords)} (chords=${cand.chords || 0})`);
    if (cand && cand.url) lines.push(`- selected url: ${cand.url}`);
    lines.push(`- abcEditedLocally: ${hasAbcEdit(t)}`);
    lines.push(`- detected meter: ${km.detectedMeter}`);
    lines.push(`- selected meter: ${km.meter}`);
    lines.push(`- transposeSemitones: ${km.transpose}`);
    lines.push(`- detectionFailed: meter=${km.meterFailed} transpose=${km.transposeFailed}`);
    if (bad.length) {
      lines.push(`- badSections: ${JSON.stringify(bad)}`);
    } else {
      lines.push('- badSections: []');
    }
    if (issues.length) {
      lines.push('- notationIssues:');
      for (const it of issues.slice(0, 12)) {
        lines.push(`  - [${it.severity || 'warning'}] ${it.code}: ${it.message}`);
      }
      if (issues.length > 12) lines.push(`  - … +${issues.length - 12} more`);
    } else {
      lines.push('- notationIssues: []');
    }
    lines.push(`- comment: ${note || '(none)'}`);
    if ((t.candidates || []).length) {
      lines.push('- available options:');
      for (const c of t.candidates) {
        const mark = (cand && c.id === cand.id) ? ' [SELECTED]' : '';
        lines.push(`  - ${c.id}${mark}: ${c.source} | chords=${c.chords||0} | issues=${(c.notationIssues||[]).length} | ${c.matchedTitle || ''}`);
      }
    }
    lines.push('');
    lines.push('```abc');
    lines.push((abcText || '').trim());
    lines.push('```');
    lines.push('');
  });
  return lines.join('\n');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

copyBtn.addEventListener('click', async () => {
  const includeAll = copyAllChk.checked;
  const commented = tunes.filter(hasTuneFeedback);
  if (!includeAll && !commented.length) {
    commentCountEl.textContent = 'Add at least one comment / override / bad-section / ABC edit first (or tick “Include all tunes”)';
    return;
  }
  const report = buildReport(includeAll);
  try {
    await copyText(report);
    copyBtn.classList.add('copied');
    copyBtn.textContent = 'Copied — paste into Copilot';
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      updateCommentUI();
    }, 1800);
  } catch (err) {
    commentCountEl.textContent = 'Copy failed: ' + (err.message || String(err));
  }
});

window.addEventListener('resize', function() {
  clearTimeout(compareHeightResizeTimer);
  compareHeightResizeTimer = setTimeout(syncAllCompareHeights, 120);
});

updateCommentUI();
""",
        "</script>",
        "</body></html>",
    ]
    out_path.write_text("\n".join(parts), encoding="utf-8")
    script_src = Path(__file__).resolve().parent / "xml2abc-review.js"
    script_dst = out_path.parent / "xml2abc-review.js"
    if not script_src.exists():
        raise SystemExit(f"missing companion script: {script_src}")
    shutil.copy2(script_src, script_dst)
    print(f"wrote {out_path} ({len(tunes)} tunes, {resolved} resolved, {chorded} with chord options)")
    print(f"copied {script_dst.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
