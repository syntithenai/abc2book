#!/usr/bin/env python3
"""Build side-by-side crop image + ABC notation review HTML."""

from __future__ import annotations

import argparse
import json
import re
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


KEY_OPTIONS = [
    "C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F",
    "Am", "Em", "Bm", "F#m", "C#m", "G#m", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm",
    "Dorian", "Mixolydian",
]

METER_OPTIONS = ["2/4", "3/4", "4/4", "6/8", "9/8", "12/8", "3/8", "2/2", "5/4", "7/8"]


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
        selected_id = str(tune.get("selectedCandidateId") or "")
        if selected_id and not any(c["id"] == selected_id for c in candidates) and candidates:
            selected_id = candidates[0]["id"]
        if not selected_id and candidates:
            chorded_c = [c for c in candidates if c.get("hasChords")]
            selected_id = (chorded_c or candidates)[0]["id"]
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
    keys_json = json.dumps(KEY_OPTIONS)
    meters_json = json.dumps(METER_OPTIONS)

    parts = [
        "<!DOCTYPE html>",
        "<html lang='en'><head>",
        "<meta charset='utf-8'>",
        "<meta name='viewport' content='width=device-width, initial-scale=1'>",
        "<title>EuroSession ABC review</title>",
        "<script src='https://cdn.jsdelivr.net/npm/abcjs@6.4.4/dist/abcjs-basic.min.js'></script>",
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
        "main{padding:1rem;max-width:1400px;margin:0 auto}",
        ".tune{display:grid;grid-template-columns:minmax(220px,36%) minmax(0,1fr);gap:1rem;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem;margin:0 0 1rem}",
        ".tune.has-comment{border-color:#6a5530;box-shadow:inset 3px 0 0 var(--warn)}",
        "@media (max-width:720px){.tune{grid-template-columns:1fr}}",
        ".left,.right{min-width:0}",
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
        ".feedback-row{display:flex;flex-wrap:wrap;gap:.55rem;align-items:center;margin:.55rem 0 .2rem}",
        ".feedback-row label{font-size:.78rem;color:var(--muted);display:flex;gap:.3rem;align-items:center}",
        ".feedback-row select{background:#0d0f14;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:.25rem .4rem;font:inherit;font-size:.82rem}",
        ".feedback-row select.overridden{border-color:var(--warn);color:var(--warn)}",
        ".staff{background:#fff;color:#111;border-radius:8px;border:1px solid var(--line);padding:.4rem .55rem;overflow:auto;min-height:80px}",
        ".staff .abcjs-container{max-width:100%}",
        ".err{color:var(--bad);font-size:.85rem;padding:.4rem}",
        ".issues{margin-top:.55rem;border:1px solid var(--line);border-radius:8px;background:#141824;padding:.45rem .55rem}",
        ".issues-title{font-size:.78rem;color:var(--muted);margin-bottom:.3rem}",
        ".issue{font-size:.78rem;line-height:1.35;padding:.2rem 0;border-bottom:1px solid #222836}",
        ".issue:last-child{border-bottom:0}",
        ".issue .sev{font-weight:600;margin-right:.35rem}",
        ".issue.error .sev{color:var(--bad)}",
        ".issue.warning .sev,.issue.info .sev{color:var(--warn)}",
        ".issue .code{color:var(--muted);font-family:ui-monospace,monospace;font-size:.72rem}",
        "details{margin-top:.55rem}",
        "summary{cursor:pointer;color:var(--muted);font-size:.82rem}",
        "pre{margin:.4rem 0 0;padding:.6rem;background:#0d0f14;border:1px solid var(--line);border-radius:8px;overflow:auto;font-size:.75rem;line-height:1.35;white-space:pre-wrap}",
        "textarea.abc-edit{width:100%;min-height:14rem;resize:vertical;border:1px solid var(--line);border-radius:8px;background:#0d0f14;color:var(--text);padding:.55rem .65rem;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;line-height:1.4;tab-size:2}",
        "textarea.abc-edit:focus{outline:2px solid #3d6aa0;outline-offset:1px;border-color:#3d6aa0}",
        "textarea.abc-edit.is-edited{border-color:var(--warn)}",
        ".abc-toolbar{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:.45rem 0 .35rem}",
        ".abc-toolbar .hint{color:var(--muted);font-size:.72rem}",
        ".comment-box{margin-top:.7rem}",
        ".comment-box label{display:block;font-size:.78rem;color:var(--muted);margin-bottom:.3rem}",
        ".comment-box textarea{width:100%;min-height:4.5rem;resize:vertical;border:1px solid var(--line);border-radius:8px;background:#0d0f14;color:var(--text);padding:.55rem .65rem;font:inherit;font-size:.88rem;line-height:1.35}",
        ".comment-box textarea:focus{outline:2px solid #3d6aa0;outline-offset:1px;border-color:#3d6aa0}",
        ".comment-box textarea.has-text{border-color:#6a5530}",
        ".options{margin-top:.75rem;border:1px solid var(--line);border-radius:8px;background:#141824;padding:.45rem .55rem}",
        ".options-title{font-size:.78rem;color:var(--muted);margin-bottom:.35rem}",
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
        f"<a href='eurosession.abc'>eurosession.abc</a></div>",
        "<div class='toolbar'>",
        "<button type='button' class='primary' id='copy-btn'>Copy comments for Copilot</button>",
        "<label class='chk'><input type='checkbox' id='copy-all'> Include all tunes (not just commented)</label>",
        "<label class='chk'><input type='checkbox' id='prefer-chords' checked> Prefer chorded when picking defaults</label>",
        "<button type='button' class='danger' id='clear-data-btn' title='Clear all saved review data in this browser'>Clear saved data</button>",
        "<span class='hint' id='comment-count'>0 comments saved</span>",
        "</div>",
        "<nav id='toc'></nav>",
        "</header>",
        "<main id='list'></main>",
        f"<script id='tunes-data' type='application/json'>{payload_json}</script>",
        f"<script id='key-options' type='application/json'>{keys_json}</script>",
        f"<script id='meter-options' type='application/json'>{meters_json}</script>",
        "<script>",
        r"""
const STORAGE_KEY = 'eurosession-abc-review-state-v2';
const tunes = JSON.parse(document.getElementById('tunes-data').textContent);
const KEY_OPTIONS = JSON.parse(document.getElementById('key-options').textContent);
const METER_OPTIONS = JSON.parse(document.getElementById('meter-options').textContent);
const list = document.getElementById('list');
const toc = document.getElementById('toc');
const copyBtn = document.getElementById('copy-btn');
const copyAllChk = document.getElementById('copy-all');
const preferChordsChk = document.getElementById('prefer-chords');
const clearDataBtn = document.getElementById('clear-data-btn');
const commentCountEl = document.getElementById('comment-count');

function emptyState() {
  return {
    comments: {},
    selections: {},
    keyOverrides: {},
    meterOverrides: {},
    badSections: {},
    abcEdits: {},
    copyAll: false,
    preferChords: true,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object') return emptyState();
    const base = emptyState();
    return Object.assign(base, data, {
      comments: data.comments && typeof data.comments === 'object' ? data.comments : {},
      selections: data.selections && typeof data.selections === 'object' ? data.selections : {},
      keyOverrides: data.keyOverrides && typeof data.keyOverrides === 'object' ? data.keyOverrides : {},
      meterOverrides: data.meterOverrides && typeof data.meterOverrides === 'object' ? data.meterOverrides : {},
      badSections: data.badSections && typeof data.badSections === 'object' ? data.badSections : {},
      abcEdits: data.abcEdits && typeof data.abcEdits === 'object' ? data.abcEdits : {},
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
copyAllChk.checked = Boolean(state.copyAll);
preferChordsChk.checked = state.preferChords !== false;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function sourceBadge(source) {
  const s = source || 'missing';
  let cls = 'badge warn';
  if (s === 'omr' || s.startsWith('omr')) cls = 'badge omr';
  else if (s.startsWith('thesession') || s.startsWith('search')) cls = 'badge session';
  else if (s === 'missing') cls = 'badge missing';
  return `<span class="${cls}">${escapeHtml(s)}</span>`;
}

function commentKey(t) {
  return `p${String(t.page).padStart(2,'0')}_t${String(t.tuneIndex).padStart(2,'0')}`;
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

function abcForRender(abc) {
  // Strip transpose directives we apply via visualTranspose. Removing a line must
  // not leave a blank line — abcjs treats a blank line as a new tune and drops
  // the melody body that follows.
  const relocated = relocateTransposeComments(abc);
  const lines = String(relocated || '').split('\n').filter(function(line) {
    const t = line.trim();
    if (/^%%MIDI transpose\s+-?\d+\s*$/i.test(t)) return false;
    if (/^%\s*abcbook-transpose\s+-?\d+\s*$/i.test(t)) return false;
    if (/^%\s*abcbook-playback-transpose\s+-?\d+\s*$/i.test(t)) return false;
    return true;
  });
  return lines.join('\n').trim();
}

function getDisplayAbc(t) {
  const ek = abcEditKey(t);
  let abc;
  if (Object.prototype.hasOwnProperty.call(state.abcEdits, ek)) {
    abc = state.abcEdits[ek];
  } else {
    abc = getBaseAbc(t);
  }
  // Migrate old mid-header transpose comments (and localStorage edits) to trailing form.
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

function hasAbcEdit(t) {
  return Object.prototype.hasOwnProperty.call(state.abcEdits, abcEditKey(t));
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

function ensureSelectOptions(select, options, value) {
  const vals = options.slice();
  if (value && !vals.includes(value)) vals.unshift(value);
  select.innerHTML = vals.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  select.value = value || vals[0] || '';
}

function detectedKeyMeter(t) {
  const cand = getSelectedCandidate(t);
  return {
    key: (cand && cand.detectedKey) || 'C',
    meter: (cand && cand.detectedMeter) || '4/4',
  };
}

function getKeyMeter(t) {
  const key = commentKey(t);
  const det = detectedKeyMeter(t);
  const keyOv = state.keyOverrides[key];
  const meterOv = state.meterOverrides[key];
  return {
    key: keyOv || det.key,
    meter: meterOv || det.meter,
    keyFailed: Boolean(keyOv && keyOv !== det.key),
    meterFailed: Boolean(meterOv && meterOv !== det.meter),
    detectedKey: det.key,
    detectedMeter: det.meter,
  };
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

function syncKeyMeterUI(t) {
  const km = getKeyMeter(t);
  const keySel = document.getElementById('key-' + t.id);
  const meterSel = document.getElementById('meter-' + t.id);
  if (keySel) {
    ensureSelectOptions(keySel, KEY_OPTIONS, km.key);
    keySel.classList.toggle('overridden', km.keyFailed);
  }
  if (meterSel) {
    ensureSelectOptions(meterSel, METER_OPTIONS, km.meter);
    meterSel.classList.toggle('overridden', km.meterFailed);
  }
}

function renderStaff(t, opts) {
  const options = opts || {};
  const target = document.getElementById('staff-' + t.id);
  const abcTa = document.getElementById('abc-' + t.id);
  const abc = options.fromEdit && abcTa ? abcTa.value : getDisplayAbc(t);
  if (abcTa && !options.fromEdit) {
    if (document.activeElement !== abcTa) abcTa.value = abc;
    abcTa.classList.toggle('is-edited', hasAbcEdit(t));
  }
  const hint = document.getElementById('abc-hint-' + t.id);
  if (hint) {
    hint.textContent = hasAbcEdit(t) ? 'local edit (saved in this browser)' : 'edit ABC — live preview';
  }
  renderIssues(t);
  syncKeyMeterUI(t);
  if (!target) return;
  target.innerHTML = '';
  try {
    if (typeof ABCJS === 'undefined') throw new Error('abcjs failed to load');
    if (!abc || /%% missing abc/.test(abc)) {
      target.innerHTML = '<div class="err">No ABC for this tune</div>';
      return;
    }
    const visualTranspose = parseAbcbookTranspose(abc);
    const optsRender = {
      responsive: 'resize',
      add_classes: true,
      paddingleft: 0,
      paddingright: 0,
      staffwidth: 640,
      wrap: { minSpacing: 1.4, maxSpacing: 2.4, preferredMeasuresPerLine: 4 },
    };
    if (visualTranspose) optsRender.visualTranspose = visualTranspose;
    const visual = ABCJS.renderAbc(target, abcForRender(abc), optsRender);
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
}

function updateCommentUI() {
  let n = 0;
  for (const t of tunes) {
    const key = commentKey(t);
    const text = (state.comments[key] || '').trim();
    const hasFeedback = text || state.keyOverrides[key] || state.meterOverrides[key] || (state.badSections[key] || []).length || hasAbcEdit(t);
    if (text) n += 1;
    const article = document.getElementById(t.id);
    if (article) article.classList.toggle('has-comment', Boolean(hasFeedback));
    const ta = document.getElementById('c-' + t.id);
    if (ta) ta.classList.toggle('has-text', Boolean(text));
    const tocLink = toc.querySelector(`a[data-page="${t.page}"]`);
    if (tocLink) {
      const pageHas = tunes.some(x => {
        const k = commentKey(x);
        return x.page === t.page && (
          (state.comments[k] || '').trim() ||
          state.keyOverrides[k] ||
          state.meterOverrides[k] ||
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
}

function applyPreferChordsDefaults() {
  if (!preferChordsChk.checked) return;
  for (const t of tunes) {
    const key = commentKey(t);
    if (state.selections[key]) continue;
    const chorded = (t.candidates || []).filter(c => c.hasChords);
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

  const optionsHtml = (t.candidates || []).map(c => {
    const checked = c.id === selectedId ? 'checked' : '';
    const chordBadge = c.hasChords ? `<span class="badge chords">${c.chords} chords</span>` : `<span class="badge">${c.chords||0} chords</span>`;
    const iss = (c.notationIssues || []).length;
    const issBadge = iss ? `<span class="badge warn">${iss} issues</span>` : '';
    return `<label class="opt">
      <input type="radio" name="opt-${t.id}" value="${escapeHtml(c.id)}" ${checked}>
      <div class="meta">
        <div><strong>${escapeHtml(c.matchedTitle || c.source)}</strong> ${sourceBadge(c.source)} ${chordBadge} ${issBadge}</div>
        <div class="sub">score ${c.score ?? '—'} · ${escapeHtml(c.url || '')}</div>
      </div>
    </label>`;
  }).join('');

  el.innerHTML = `
    <div class="left">
      <div class="label">crop · tune ${String(t.tuneIndex).padStart(2,'0')} ${sourceBadge(t.source)}</div>
      <h2>${escapeHtml(t.title)}</h2>
      <div class="crop-hint">Drag on crop to mark a bad section · right-click a rect to clear it</div>
      <div class="crop-wrap"><div class="crop-stage" id="crop-stage-${t.id}"><img src="tunes/${escapeHtml(t.crop)}" alt="${escapeHtml(t.title)}" loading="lazy"></div></div>
      <div class="feedback-row">
        <label>Key <select id="key-${t.id}"></select></label>
        <label>Meter <select id="meter-${t.id}"></select></label>
      </div>
      <div class="options">
        <div class="options-title">ABC source options (prefer chords)</div>
        ${optionsHtml || '<div class="sub">No alternate sources</div>'}
      </div>
      <div class="comment-box">
        <label for="c-${t.id}">Review comment / error notes</label>
        <textarea id="c-${t.id}" data-key="${escapeHtml(key)}" placeholder="e.g. wrong key, missing B part, bad rhythm in bar 3…">${escapeHtml(saved)}</textarea>
      </div>
    </div>
    <div class="right">
      <div class="label">selected notation</div>
      <div class="staff" id="staff-${t.id}"></div>
      <div class="issues" id="issues-${t.id}"></div>
      <div class="abc-toolbar">
        <button type="button" id="autofix-${t.id}">Safe autofix</button>
        <button type="button" id="reset-abc-${t.id}">Reset ABC</button>
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

  el.querySelectorAll(`input[name="opt-${t.id}"]`).forEach(input => {
    input.addEventListener('change', () => {
      state.selections[key] = input.value;
      saveState(state);
      renderStaff(t);
      updateCommentUI();
    });
  });

  const keySel = el.querySelector('#key-' + t.id);
  const meterSel = el.querySelector('#meter-' + t.id);
  keySel.addEventListener('change', () => {
    const det = detectedKeyMeter(t);
    if (keySel.value === det.key) delete state.keyOverrides[key];
    else state.keyOverrides[key] = keySel.value;
    saveState(state);
    syncKeyMeterUI(t);
    updateCommentUI();
  });
  meterSel.addEventListener('change', () => {
    const det = detectedKeyMeter(t);
    if (meterSel.value === det.meter) delete state.meterOverrides[key];
    else state.meterOverrides[key] = meterSel.value;
    saveState(state);
    syncKeyMeterUI(t);
    updateCommentUI();
  });

  const commentTa = el.querySelector('#c-' + t.id);
  commentTa.addEventListener('input', () => {
    const v = commentTa.value;
    if (v.trim()) state.comments[key] = v;
    else delete state.comments[key];
    saveState(state);
    updateCommentUI();
  });

  const abcTa = el.querySelector('#abc-' + t.id);
  let abcTimer = null;
  abcTa.addEventListener('input', () => {
    const ek = abcEditKey(t);
    const base = getBaseAbc(t);
    if (abcTa.value === base) delete state.abcEdits[ek];
    else state.abcEdits[ek] = abcTa.value;
    saveState(state);
    abcTa.classList.toggle('is-edited', hasAbcEdit(t));
    clearTimeout(abcTimer);
    abcTimer = setTimeout(() => renderStaff(t, { fromEdit: true }), 180);
    updateCommentUI();
  });

  el.querySelector('#autofix-' + t.id).addEventListener('click', () => {
    const fixed = safeAutofixAbc(abcTa.value || getDisplayAbc(t));
    abcTa.value = fixed;
    const ek = abcEditKey(t);
    if (fixed === getBaseAbc(t)) delete state.abcEdits[ek];
    else state.abcEdits[ek] = fixed;
    saveState(state);
    renderStaff(t, { fromEdit: true });
    updateCommentUI();
  });

  el.querySelector('#reset-abc-' + t.id).addEventListener('click', () => {
    delete state.abcEdits[abcEditKey(t)];
    saveState(state);
    renderStaff(t);
    updateCommentUI();
  });

  renderStaff(t);
}

preferChordsChk.addEventListener('change', () => {
  state.preferChords = preferChordsChk.checked;
  if (preferChordsChk.checked) {
    for (const t of tunes) {
      const key = commentKey(t);
      const chorded = (t.candidates || []).filter(c => c.hasChords);
      if (chorded.length && !state.selections[key]) {
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
  const ok = window.confirm(
    'Clear all saved review data in this browser?\n\n' +
    'This removes comments, ABC edits, key/meter overrides, bad-section marks, and source selections.'
  );
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = emptyState();
  copyAllChk.checked = false;
  preferChordsChk.checked = true;
  // Reload so radios/textareas/rects rebuild from clean defaults.
  window.location.reload();
});

function buildReport(includeAll) {
  const selectedTunes = includeAll
    ? tunes
    : tunes.filter(t => {
        const key = commentKey(t);
        return (state.comments[key] || '').trim() ||
          state.keyOverrides[key] ||
          state.meterOverrides[key] ||
          (state.badSections[key] || []).length ||
          hasAbcEdit(t);
      });

  const lines = [];
  lines.push('EuroSession ABC review — please repair these OMR / lookup errors.');
  lines.push('Work dir: /home/stever/Downloads/eurosession-work');
  lines.push('ABC file: eurosession.abc');
  lines.push(`Tunes in report: ${selectedTunes.length} (of ${tunes.length})`);
  lines.push('');
  lines.push('For each item: honour the selected ABC source option (prefer chorded `"Am"` style when chosen), fix ABC to match the crop, update manifest.json + eurosession.abc, regenerate review_abc.html.');
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
    lines.push(`- detected key/meter: ${km.detectedKey} / ${km.detectedMeter}`);
    lines.push(`- selected key/meter: ${km.key} / ${km.meter}`);
    lines.push(`- detectionFailed: key=${km.keyFailed} meter=${km.meterFailed}`);
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
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

copyBtn.addEventListener('click', async () => {
  const includeAll = copyAllChk.checked;
  const commented = tunes.filter(t => {
    const key = commentKey(t);
    return (state.comments[key] || '').trim() ||
      state.keyOverrides[key] ||
      state.meterOverrides[key] ||
      (state.badSections[key] || []).length ||
      hasAbcEdit(t);
  });
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

updateCommentUI();
""",
        "</script>",
        "</body></html>",
    ]
    out_path.write_text("\n".join(parts), encoding="utf-8")
    print(f"wrote {out_path} ({len(tunes)} tunes, {resolved} resolved, {chorded} with chord options)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
