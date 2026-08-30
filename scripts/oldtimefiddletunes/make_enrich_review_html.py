#!/usr/bin/env python3
"""Build a throwaway standalone enrich-review HTML (eurosession-style).

Embeds enrich_package.json. Prefetch MIDI/PDF into data/media/ and vendor abcjs
so browse/select works from file://. Convert MIDI/OMR uses serve_review.py
(local files only — no internet, no resolver login).

  python3 scripts/oldtimefiddletunes/prefetch_media.py
  python3 scripts/oldtimefiddletunes/make_enrich_review_html.py
  # browse offline:
  xdg-open scripts/oldtimefiddletunes/data/review.html
  # convert MIDI/OMR:
  python3 scripts/oldtimefiddletunes/serve_review.py
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common import (  # noqa: E402
    MEDIA_DIR,
    PACKAGE_PATH,
    REVIEW_HTML_PATH,
    USER_AGENT,
    VENDOR_DIR,
    ensure_dir,
    load_json,
)

DEFAULT_OUT = REVIEW_HTML_PATH
ABCJS_URL = "https://cdn.jsdelivr.net/npm/abcjs@6.4.4/dist/abcjs-basic.min.js"
ABCJS_NAME = "abcjs-basic.min.js"


def ensure_vendor_abcjs() -> Path:
    ensure_dir(VENDOR_DIR)
    dest = VENDOR_DIR / ABCJS_NAME
    if dest.is_file() and dest.stat().st_size > 1000:
        return dest
    print(f"Downloading {ABCJS_URL} → {dest}")
    req = urllib.request.Request(ABCJS_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())
    return dest


def attach_local_media_paths(package: dict) -> dict:
    """Fill localMidiPath/localPdfPath from data/media when present."""
    tunes = list(package.get("tunes") or [])
    for t in tunes:
        slug = str(t.get("slug") or "").strip()
        if not slug:
            continue
        mid = MEDIA_DIR / f"{slug}.mid"
        pdf = MEDIA_DIR / f"{slug}.pdf"
        if mid.is_file() and mid.stat().st_size > 0:
            t["localMidiPath"] = f"media/{slug}.mid"
        if pdf.is_file() and pdf.stat().st_size > 0:
            t["localPdfPath"] = f"media/{slug}.pdf"
    package["tunes"] = tunes
    return package


def build_html(package: dict) -> str:
    payload = json.dumps(package, ensure_ascii=False)
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Old Time Fiddle Tunes — enrich review</title>
<script src="vendor/{ABCJS_NAME}"></script>
<style>
  :root {{
    --bg: #f4f1ea;
    --ink: #1c1917;
    --muted: #78716c;
    --line: #d6d3d1;
    --accent: #9a3412;
    --ok: #166534;
    --warn: #a16207;
    --card: #fffef9;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    font: 14px/1.4 system-ui, sans-serif;
    color: var(--ink);
    background: var(--bg);
  }}
  header {{
    position: sticky; top: 0; z-index: 5;
    background: var(--card);
    border-bottom: 1px solid var(--line);
    padding: 0.75rem 1rem;
    display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
    justify-content: space-between;
  }}
  header h1 {{ margin: 0; font-size: 1.1rem; }}
  .tallies span {{
    display: inline-block; margin-right: 0.5rem;
    padding: 0.15rem 0.45rem; border-radius: 999px;
    background: #e7e5e4; font-size: 12px;
  }}
  .tallies .ok {{ background: #dcfce7; color: var(--ok); }}
  .tallies .need {{ background: #fef3c7; color: var(--warn); }}
  .actions button, .detail button, select, input[type=search] {{
    font: inherit; padding: 0.35rem 0.6rem;
    border: 1px solid var(--line); border-radius: 6px; background: #fff;
    cursor: pointer;
  }}
  .actions button.primary {{ background: var(--accent); color: #fff; border-color: var(--accent); }}
  .layout {{
    display: grid;
    grid-template-columns: minmax(240px, 320px) 1fr;
    min-height: calc(100vh - 64px);
  }}
  .list {{
    border-right: 1px solid var(--line);
    background: var(--card);
    display: flex; flex-direction: column;
    max-height: calc(100vh - 64px);
  }}
  .list-filters {{ padding: 0.5rem; display: grid; gap: 0.4rem; }}
  .tune-list {{ overflow: auto; flex: 1; }}
  .tune-row {{
    display: block; width: 100%; text-align: left;
    border: 0; border-bottom: 1px solid var(--line);
    padding: 0.55rem 0.75rem; background: transparent; cursor: pointer;
  }}
  .tune-row:hover {{ background: #fafaf9; }}
  .tune-row.active {{ background: #ffedd5; }}
  .tune-row .title {{ font-weight: 600; }}
  .tune-row .meta {{ color: var(--muted); font-size: 12px; }}
  .flags {{ float: right; display: flex; gap: 0.2rem; }}
  .flag {{
    font-size: 10px; padding: 0.1rem 0.3rem; border-radius: 4px;
    background: #e7e5e4;
  }}
  .flag.abc {{ background: #bbf7d0; }}
  .flag.midi {{ background: #bae6fd; }}
  .flag.pdf {{ background: #e7e5e4; }}
  .detail {{ padding: 1rem; overflow: auto; max-height: calc(100vh - 64px); }}
  .detail h2 {{ margin: 0 0 0.25rem; font-size: 1.25rem; }}
  .detail .notes {{ color: var(--muted); margin-bottom: 0.75rem; }}
  .cand {{
    border: 1px solid var(--line); border-radius: 8px; padding: 0.5rem 0.75rem;
    margin-bottom: 0.4rem; cursor: pointer; background: #fff;
  }}
  .cand.selected {{ border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }}
  .cand .src {{ font-size: 12px; color: var(--muted); }}
  #abcPreview {{
    background: #fff; border: 1px solid var(--line); border-radius: 8px;
    padding: 0.75rem; margin: 0.75rem 0; min-height: 100px; overflow: auto;
  }}
  textarea {{
    width: 100%; min-height: 180px; font: 12px/1.35 ui-monospace, monospace;
    border: 1px solid var(--line); border-radius: 8px; padding: 0.5rem;
  }}
  .hint {{
    background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;
    padding: 0.6rem 0.75rem; margin-bottom: 0.75rem; font-size: 13px;
  }}
  .busy {{ opacity: 0.6; pointer-events: none; }}
  @media (max-width: 860px) {{
    .layout {{ grid-template-columns: 1fr; }}
    .list {{ max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--line); }}
  }}
</style>
</head>
<body>
<header>
  <div>
    <h1>Old Time Fiddle Tunes — enrich review</h1>
    <div class="tallies" id="tallies"></div>
  </div>
  <div class="actions">
    <button type="button" id="btnBulkStrong">Bulk accept strong (≥72%)</button>
    <button type="button" id="btnExport">Download reviewed package JSON</button>
    <button type="button" class="primary" id="btnMarkReviewed">Mark current reviewed</button>
  </div>
</header>
<div class="layout">
  <aside class="list">
    <div class="list-filters">
      <input type="search" id="q" placeholder="Filter title…"/>
      <select id="filter">
        <option value="all">All</option>
        <option value="needs_notation">Needs notation</option>
        <option value="has_candidates">Has candidates</option>
        <option value="unreviewed">Unreviewed</option>
        <option value="reviewed">Reviewed</option>
        <option value="midi_available">No ABC + MIDI available</option>
        <option value="pdf_available">No ABC + PDF available</option>
      </select>
    </div>
    <div class="tune-list" id="tuneList"></div>
  </aside>
  <main class="detail" id="detail">
    <p class="hint">Search candidates are embedded. Convert MIDI / OMR only after you see coverage. Progress saves in localStorage.</p>
    <p>Select a tune.</p>
  </main>
</div>
<script>
const PACKAGE = {payload};
const STORAGE_KEY = 'oldtimefiddletunes-enrich-review-v1';
const CONVERT_BASE = (function() {{
  // When opened via serve_review.py, same origin. file:// cannot convert.
  if (String(location.protocol || '') === 'file:') return '';
  return '';
}})();

function isFileOrigin() {{
  return String(location.protocol || '') === 'file:';
}}

function localMidi(t) {{ return (t && t.localMidiPath) || ''; }}
function localPdf(t) {{ return (t && t.localPdfPath) || ''; }}
function hasLocalMidi(t) {{ return !!localMidi(t); }}
function hasLocalPdf(t) {{ return !!localPdf(t); }}

function clone(x) {{ return JSON.parse(JSON.stringify(x)); }}

function hasAbc(t) {{
  return !!(t.selectedCandidateId || String(t.abc || '').trim());
}}

function isOmr(src) {{
  return String(src || '').toLowerCase().indexOf('omr') === 0;
}}

function loadState() {{
  try {{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }} catch (e) {{ return null; }}
}}

function saveState() {{
  const slim = tunes.map(function(t) {{
    return {{
      id: t.id,
      selectedCandidateId: t.selectedCandidateId || '',
      abc: t.abc || '',
      abcSource: t.abcSource || '',
      reviewed: !!t.reviewed,
      candidates: t.candidates || [],
    }};
  }});
  localStorage.setItem(STORAGE_KEY, JSON.stringify({{ tunes: slim, savedAt: new Date().toISOString() }}));
}}

function applySavedState(baseTunes) {{
  const saved = loadState();
  if (!saved || !Array.isArray(saved.tunes)) return baseTunes;
  const byId = {{}};
  saved.tunes.forEach(function(t) {{ if (t && t.id) byId[t.id] = t; }});
  return baseTunes.map(function(t) {{
    const s = byId[t.id];
    if (!s) return t;
    const next = Object.assign({{}}, t, {{
      selectedCandidateId: s.selectedCandidateId || t.selectedCandidateId,
      abc: s.abc != null ? s.abc : t.abc,
      abcSource: s.abcSource || t.abcSource,
      reviewed: !!s.reviewed,
    }});
    if (Array.isArray(s.candidates) && s.candidates.length) {{
      const seen = {{}};
      const merged = [];
      (t.candidates || []).concat(s.candidates).forEach(function(c) {{
        if (!c || !c.id || seen[c.id]) return;
        seen[c.id] = true;
        merged.push(c);
      }});
      next.candidates = merged;
    }}
    return next;
  }});
}}

let tunes = applySavedState(clone(PACKAGE.tunes || []));
let activeId = tunes[0] && tunes[0].id;
let busy = false;

function tallies() {{
  let total = tunes.length, selected = 0, needs = 0, midi = 0, pdf = 0, reviewed = 0;
  tunes.forEach(function(t) {{
    if (hasAbc(t)) selected += 1; else needs += 1;
    if (t.midiUrl || hasLocalMidi(t)) midi += 1;
    if (t.pdfUrl || hasLocalPdf(t)) pdf += 1;
    if (t.reviewed) reviewed += 1;
  }});
  return {{ total, selected, needs, midi, pdf, reviewed }};
}}

function renderTallies() {{
  const t = tallies();
  document.getElementById('tallies').innerHTML =
    '<span>' + t.total + ' tunes</span>' +
    '<span class="ok">' + t.selected + ' with ABC</span>' +
    '<span class="need">' + t.needs + ' need notation</span>' +
    '<span>' + t.midi + ' midi</span>' +
    '<span>' + t.pdf + ' pdf</span>' +
    '<span>' + t.reviewed + ' reviewed</span>';
}}

function visibleTunes() {{
  const q = (document.getElementById('q').value || '').trim().toLowerCase();
  const f = document.getElementById('filter').value;
  return tunes.filter(function(t) {{
    if (q) {{
      const hay = (t.title + ' ' + (t.notes || '') + ' ' + (t.section || '')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }}
    const abc = hasAbc(t);
    const cands = (t.candidates || []).length;
    if (f === 'needs_notation') return !abc;
    if (f === 'has_candidates') return cands > 0;
    if (f === 'reviewed') return !!t.reviewed;
    if (f === 'unreviewed') return !t.reviewed;
    if (f === 'midi_available') return !!(t.midiUrl || hasLocalMidi(t)) && !abc;
    if (f === 'pdf_available') return !!(t.pdfUrl || hasLocalPdf(t)) && !abc;
    return true;
  }});
}}

function activeTune() {{
  return tunes.find(function(t) {{ return t.id === activeId; }}) || visibleTunes()[0] || null;
}}

function sortCands(cands) {{
  return (cands || []).slice().sort(function(a, b) {{
    const ao = isOmr(a.source) ? 1 : 0;
    const bo = isOmr(b.source) ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return (Number(b.score) || 0) - (Number(a.score) || 0);
  }});
}}

function renderList() {{
  const list = document.getElementById('tuneList');
  const rows = visibleTunes();
  list.innerHTML = rows.map(function(t) {{
    const abc = hasAbc(t);
    return '<button type="button" class="tune-row' + (t.id === activeId ? ' active' : '') + '" data-id="' + t.id + '">' +
      '<span class="flags">' +
        (abc ? '<span class="flag abc">ABC</span>' : '<span class="flag">—</span>') +
        (t.midiUrl || hasLocalMidi(t) ? '<span class="flag midi">M</span>' : '') +
        (t.pdfUrl || hasLocalPdf(t) ? '<span class="flag pdf">P</span>' : '') +
        (t.reviewed ? '<span class="flag">✓</span>' : '') +
      '</span>' +
      '<div class="title"></div><div class="meta"></div></button>';
  }}).join('');
  Array.prototype.forEach.call(list.querySelectorAll('.tune-row'), function(btn, i) {{
    const t = rows[i];
    btn.querySelector('.title').textContent = t.title;
    btn.querySelector('.meta').textContent = (t.section || '') + (t.candidates && t.candidates.length ? (' · ' + t.candidates.length + ' cand') : '');
    btn.addEventListener('click', function() {{
      activeId = t.id;
      render();
    }});
  }});
}}

function selectCandidate(tune, cand) {{
  tune.selectedCandidateId = cand.id;
  tune.abc = cand.abc;
  tune.abcSource = cand.source;
  tune.reviewed = true;
  saveState();
  render();
}}

function clearNotation(tune) {{
  tune.selectedCandidateId = '';
  tune.abc = '';
  tune.abcSource = '';
  tune.reviewed = true;
  saveState();
  render();
}}

function renderPreview(abc) {{
  const el = document.getElementById('abcPreview');
  if (!el) return;
  el.innerHTML = '';
  if (!abc || !String(abc).trim()) {{
    el.textContent = 'No ABC selected';
    return;
  }}
  try {{
    if (typeof ABCJS === 'undefined') throw new Error('abcjs missing');
    ABCJS.renderAbc(el, abc, {{ responsive: 'resize', add_classes: true }});
  }} catch (e) {{
    el.textContent = 'Preview error: ' + (e && e.message ? e.message : e);
  }}
}}

function renderDetail() {{
  const t = activeTune();
  const root = document.getElementById('detail');
  if (!t) {{
    root.innerHTML = '<p>No tunes match filter.</p>';
    return;
  }}
  activeId = t.id;
  const cands = sortCands(t.candidates);
  root.innerHTML =
    (isFileOrigin()
      ? '<div class="hint">Offline file:// mode — browse/select/export work. For Convert MIDI/OMR run <code>python3 scripts/oldtimefiddletunes/serve_review.py</code> → <code>http://127.0.0.1:8766/</code></div>'
      : '<div class="hint">Offline review server — Convert MIDI/OMR use local prefetched media (no internet, no resolver login).</div>') +
    '<h2></h2><div class="notes"></div>' +
    '<div class="actions" style="margin-bottom:0.75rem;display:flex;flex-wrap:wrap;gap:0.4rem">' +
      (hasLocalMidi(t) || t.midiUrl ? '<button type="button" id="btnMidi">Convert MIDI</button>' : '') +
      (hasLocalPdf(t) || t.pdfUrl ? '<button type="button" id="btnOmr">OMR PDF</button>' : '') +
      '<button type="button" id="btnClear">Clear notation</button>' +
      (localMidi(t) ? '<a target="_blank" rel="noreferrer" href="' + localMidi(t) + '">Open MIDI</a>' : '') +
      (localPdf(t) ? '<a target="_blank" rel="noreferrer" href="' + localPdf(t) + '">Open PDF</a>' : '') +
    '</div>' +
    '<div class="meta" style="margin-bottom:0.5rem;color:var(--muted);font-size:12px"></div>' +
    '<h3>Candidates</h3><div id="cands"></div>' +
    '<div id="abcPreview"></div>' +
    '<textarea id="abcEdit" spellcheck="false"></textarea>';

  root.querySelector('h2').textContent = t.title;
  root.querySelector('.notes').textContent = (t.notes || '—') + (t.key ? (' · K:' + t.key) : '');
  const mediaBits = [];
  if (t.audioUrls && t.audioUrls.length) mediaBits.push(t.audioUrls.length + ' audio');
  if (t.youtubeUrls && t.youtubeUrls.length) mediaBits.push(t.youtubeUrls.length + ' youtube');
  if (t.midiUrl || hasLocalMidi(t)) mediaBits.push(hasLocalMidi(t) ? 'MIDI local' : 'MIDI remote');
  if (t.pdfUrl || hasLocalPdf(t)) mediaBits.push(hasLocalPdf(t) ? 'PDF local' : 'PDF remote');
  root.querySelector('.meta').textContent = mediaBits.join(' · ') || 'No media';

  const box = root.querySelector('#cands');
  if (!cands.length) {{
    box.innerHTML = '<p style="color:var(--muted)">No search candidates yet</p>';
  }} else {{
    cands.forEach(function(c) {{
      const div = document.createElement('div');
      div.className = 'cand' + (c.id === t.selectedCandidateId ? ' selected' : '');
      div.innerHTML = '<div class="src"></div><div class="ttl"></div>';
      div.querySelector('.src').textContent = c.source + ' · ' + Math.round((Number(c.score) || 0) * 100) + '%' + (c.hasChords ? ' · chords' : '');
      div.querySelector('.ttl').textContent = c.title || t.title;
      div.addEventListener('click', function() {{ selectCandidate(t, c); }});
      box.appendChild(div);
    }});
  }}

  const abc = t.abc || '';
  root.querySelector('#abcEdit').value = abc;
  renderPreview(abc);
  root.querySelector('#abcEdit').addEventListener('input', function(e) {{
    t.abc = e.target.value;
    t.abcSource = 'edited';
    t.reviewed = true;
    saveState();
    renderPreview(t.abc);
  }});

  const clearBtn = root.querySelector('#btnClear');
  if (clearBtn) clearBtn.addEventListener('click', function() {{ clearNotation(t); }});
  const midiBtn = root.querySelector('#btnMidi');
  if (midiBtn) midiBtn.addEventListener('click', function() {{ convertMidi(t); }});
  const omrBtn = root.querySelector('#btnOmr');
  if (omrBtn) omrBtn.addEventListener('click', function() {{ convertOmr(t); }});
}}

function candId(source, abc) {{
  let h = 0;
  const seed = String(source || '') + '\\n' + String(abc || '').slice(0, 800);
  for (let i = 0; i < seed.length; i++) {{ h = ((h << 5) - h) + seed.charCodeAt(i); h |= 0; }}
  return String(source || 'src').replace(/[^a-zA-Z0-9:_-]+/g, '-').slice(0, 40) + '-' + Math.abs(h).toString(16).slice(0, 10);
}}

async function postConvert(path, payload, label) {{
  if (isFileOrigin()) {{
    throw new Error(
      'Convert needs the local review server. Run:\\n'
      + 'python3 scripts/oldtimefiddletunes/serve_review.py\\n'
      + 'then open http://127.0.0.1:8766/'
    );
  }}
  let res;
  try {{
    res = await fetch(path, {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
      body: JSON.stringify(payload),
    }});
  }} catch (e) {{
    throw new Error(
      'Could not reach ' + path + '. Is serve_review.py running? (' + ((e && e.message) || e) + ')'
    );
  }}
  const body = await res.json().catch(function() {{ return {{}}; }});
  if (!res.ok) throw new Error(body.error || (label + ' failed (' + res.status + ')'));
  return body;
}}

async function convertMidi(t) {{
  if ((!hasLocalMidi(t) && !t.midiUrl) || busy) return;
  if (!hasLocalMidi(t)) {{
    alert('Local MIDI missing for this tune. Run: python3 scripts/oldtimefiddletunes/prefetch_media.py');
    return;
  }}
  busy = true; document.body.classList.add('busy');
  try {{
    const body = await postConvert('/convert-midi', {{ slug: t.slug, title: t.title }}, 'MIDI');
    const abc = String(body.abc || '').trim();
    if (!abc) throw new Error('No ABC from MIDI');
    const c = {{ id: candId('midi', abc), source: 'midi', abc: abc, score: 0.45, title: t.title, url: localMidi(t), hasChords: /"[A-G]/.test(abc) }};
    t.candidates = (t.candidates || []).concat([c]);
    t.selectedCandidateId = c.id;
    t.abc = abc;
    t.abcSource = 'midi';
    saveState();
    render();
  }} catch (e) {{
    alert((e && e.message) || String(e));
  }} finally {{
    busy = false; document.body.classList.remove('busy');
  }}
}}

async function convertOmr(t) {{
  if ((!hasLocalPdf(t) && !t.pdfUrl) || busy) return;
  if (!hasLocalPdf(t)) {{
    alert('Local PDF missing for this tune. Run: python3 scripts/oldtimefiddletunes/prefetch_media.py');
    return;
  }}
  busy = true; document.body.classList.add('busy');
  try {{
    const body = await postConvert('/convert-omr', {{ slug: t.slug, title: t.title }}, 'OMR');
    const abc = String(body.abc || '').trim();
    if (!abc) throw new Error('No melody ABC from OMR');
    const c = {{ id: candId('omr', abc), source: 'omr', abc: abc, score: 0.4, title: t.title, url: localPdf(t), hasChords: /"[A-G]/.test(abc) }};
    t.candidates = (t.candidates || []).concat([c]);
    if (!hasAbc(t)) {{
      t.selectedCandidateId = c.id;
      t.abc = abc;
      t.abcSource = 'omr';
    }}
    saveState();
    render();
  }} catch (e) {{
    alert((e && e.message) || String(e));
  }} finally {{
    busy = false; document.body.classList.remove('busy');
  }}
}}

function bulkAcceptStrong() {{
  const threshold = 0.72;
  tunes.forEach(function(t) {{
    if (t.reviewed && t.selectedCandidateId) return;
    const pool = sortCands(t.candidates || []).filter(function(c) {{
      return c && !isOmr(c.source) && (Number(c.score) || 0) >= threshold;
    }});
    if (!pool.length) return;
    const best = pool[0];
    t.selectedCandidateId = best.id;
    t.abc = best.abc;
    t.abcSource = best.source;
    t.reviewed = true;
  }});
  saveState();
  render();
}}

function exportPackage() {{
  const pkg = Object.assign({{}}, PACKAGE, {{
    built_at: new Date().toISOString(),
    tune_count: tunes.length,
    tunes: tunes,
  }});
  const blob = new Blob([JSON.stringify(pkg, null, 2)], {{ type: 'application/json' }});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oldtimefiddletunes-enrich_package.json';
  a.click();
  URL.revokeObjectURL(a.href);
}}

function render() {{
  renderTallies();
  renderList();
  renderDetail();
}}

document.getElementById('q').addEventListener('input', render);
document.getElementById('filter').addEventListener('change', render);
document.getElementById('btnBulkStrong').addEventListener('click', bulkAcceptStrong);
document.getElementById('btnExport').addEventListener('click', exportPackage);
document.getElementById('btnMarkReviewed').addEventListener('click', function() {{
  const t = activeTune();
  if (!t) return;
  t.reviewed = true;
  saveState();
  render();
}});

render();
</script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, default=PACKAGE_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    if not args.package.is_file():
        print(f"Missing package {args.package}; run enrich_search.py first", file=sys.stderr)
        return 1

    package = load_json(args.package, {})
    if package.get("kind") != "oldtimefiddletunes-enrich":
        print("Not an oldtimefiddletunes enrich package", file=sys.stderr)
        return 1

    ensure_vendor_abcjs()
    package = attach_local_media_paths(package)
    local_midi = sum(1 for t in package.get("tunes") or [] if t.get("localMidiPath"))
    local_pdf = sum(1 for t in package.get("tunes") or [] if t.get("localPdfPath"))

    ensure_dir(args.out.parent)
    html = build_html(package)
    args.out.write_text(html, encoding="utf-8")
    print(f"Wrote {args.out} ({len(package.get('tunes') or [])} tunes embedded)")
    print(f"Local media attached: midi={local_midi} pdf={local_pdf}")
    print(f"Browse file://{args.out.resolve()}")
    print("Convert: python3 scripts/oldtimefiddletunes/serve_review.py → http://127.0.0.1:8766/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
