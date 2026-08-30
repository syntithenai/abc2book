#!/usr/bin/env python3
"""Side-by-side dubious join review: crop | OMR | contour-ranked MXL candidates."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "local-resolver"))

from abc_contour import abc_to_contour  # noqa: E402

from extract_mscz_title_index import index_entry_for_span  # noqa: E402
from make_abc_review_html import ensure_renderable_abc  # noqa: E402
from match_mxl_spans import (  # noqa: E402
    load_score,
    load_title_index,
    mxl_midi_by_measure,
    rank_contour_hits,
)
from mxl_span_to_abc import span_to_abc  # noqa: E402


def load_omr_abc(entry: dict, title: str) -> str:
    for key in ("omrPlusAbc", "omrAbc", "abc"):
        text = str(entry.get(key) or "").strip()
        if text and "%% missing abc" not in text:
            return ensure_renderable_abc(text, title)
    for c in entry.get("candidates") or []:
        src = str(c.get("source") or "").lower()
        if src in {"omr+", "omr-plus", "omr"}:
            abc = str(c.get("abc") or "").strip()
            if abc:
                return ensure_renderable_abc(abc, title)
    return ensure_renderable_abc("", title)


def span_abc(
    mxl: Path,
    hit: dict,
    *,
    import_title: str,
    score_root,
) -> str:
    meta = hit
    return span_to_abc(
        mxl,
        int(hit["m0"]),
        int(hit["m1"]),
        title=import_title,
        key=str(hit.get("key") or "C"),
        meter=str(hit.get("meter") or "4/4"),
        subtitle=str(hit.get("mscz_subtitle") or "") or None,
        composer=str(hit.get("mscz_composer") or "") or None,
        root=score_root,
    )


def build_index_options(index: list[dict]) -> list[dict]:
    opts = []
    for entry in index:
        label = str(entry.get("title") or "")
        sub = str(entry.get("subtitle") or "").strip()
        comp = str(entry.get("composer") or "").strip()
        if sub:
            label += f" / {sub}"
        if comp:
            label += f" — {comp}"
        opts.append(
            {
                "m0": int(entry["m0"]),
                "m1": int(entry["m1"]),
                "label": label,
                "mscz_title": entry.get("title") or "",
                "mscz_subtitle": entry.get("subtitle"),
                "mscz_composer": entry.get("composer"),
                "key": entry.get("mxlKey"),
                "meter": entry.get("mxlMeter"),
            }
        )
    return opts


def main() -> int:
    parser = argparse.ArgumentParser(description="Make dubious join comparison HTML")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument("--out", default="")
    parser.add_argument("--top", type=int, default=5, help="Contour candidates per tune")
    args = parser.parse_args()

    work = Path(args.work)
    mxl = Path(args.mxl)
    dubious_path = work / "dubious_joins.json"
    manifest_path = work / "manifest.json"
    index_path = work / "mxl_title_index.json"
    if not dubious_path.is_file():
        raise SystemExit(f"missing {dubious_path} — run finalize_eurosession.py first")
    if not manifest_path.is_file():
        raise SystemExit(f"missing {manifest_path}")

    dubious = json.loads(dubious_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    index = load_title_index(index_path)
    index_options = build_index_options(index)

    by_key = {
        f"p{int(t.get('page') or 0):02d}_t{int(t.get('tuneIndex') or 0):02d}": t
        for t in manifest.get("tunes") or []
        if t.get("cropPath")
    }

    score_root = load_score(mxl) if mxl.is_file() else None
    midi_by_m = mxl_midi_by_measure(score_root) if score_root is not None else {}

    cards = []
    for row in dubious:
        import_key = str(row.get("import_key") or "")
        title = str(row.get("import_title") or "")
        title_match = dict(row.get("match") or {})
        entry = by_key.get(import_key) or {}
        crop_name = Path(str(row.get("cropPath") or entry.get("cropPath") or "")).name
        omr_abc = load_omr_abc(entry, title)

        contour = abc_to_contour(omr_abc, max_notes=48)
        hits: list[dict] = []
        if score_root is not None and len(contour.get("pitches") or []) >= 12:
            hits = rank_contour_hits(
                contour,
                midi_by_m=midi_by_m,
                root=score_root,
                index=index,
                title=title,
                top=max(3, int(args.top)),
                min_score=30.0,
                min_name_score=0.99,  # force global contour, not title gate
            )

        # Always include the fuzzy title join as an explicit (usually wrong) option.
        if title_match.get("m0") is not None:
            tm0, tm1 = int(title_match["m0"]), int(title_match["m1"])
            meta = index_entry_for_span(index, tm0, tm1) or {}
            title_guess = {
                "m0": tm0,
                "m1": tm1,
                "contour_score": None,
                "gate": "title-fuzzy",
                "mscz_title": title_match.get("mscz_title") or meta.get("title") or "",
                "mscz_subtitle": title_match.get("mscz_subtitle") or meta.get("subtitle"),
                "mscz_composer": title_match.get("mscz_composer") or meta.get("composer"),
                "name_score": title_match.get("match_score"),
                "key": str(title_match.get("seedKey") or title_match.get("mxlKey") or meta.get("mxlKey") or "C"),
                "meter": str(title_match.get("seedMeter") or title_match.get("mxlMeter") or meta.get("mxlMeter") or "4/4"),
            }
            if contour.get("pitches"):
                from match_mxl_spans import window_contour, contour_similarity  # noqa: WPS433

                wc = window_contour(midi_by_m, tm0, tm1)
                title_guess["contour_score"] = round(float(contour_similarity(contour, wc)), 1)
            if not any(h["m0"] == tm0 and h["m1"] == tm1 for h in hits):
                hits.append(title_guess)

        candidates = []
        for hit in hits:
            abc_text = ""
            err = ""
            try:
                abc_text = span_abc(mxl, hit, import_title=title, score_root=score_root)
            except Exception as exc:
                err = str(exc)
            candidates.append({**hit, "abc": abc_text, "abcError": err})

        candidates.sort(
            key=lambda h: (
                0 if h.get("gate") != "title-fuzzy" else 1,
                -(float(h.get("contour_score") or 0)),
            )
        )
        best = candidates[0] if candidates else None
        title_guess_contour = next(
            (c.get("contour_score") for c in candidates if c.get("gate") == "title-fuzzy"),
            None,
        )

        cards.append(
            {
                "importKey": import_key,
                "title": title,
                "crop": crop_name,
                "titleMatch": title_match,
                "titleGuessContour": title_guess_contour,
                "omrAbc": omr_abc,
                "candidates": candidates,
                "defaultCandidateIdx": 0,
                "likelyNotInTunebook": (
                    (best is None or float(best.get("contour_score") or 0) < 45.0)
                    and (title_guess_contour is None or float(title_guess_contour) < 45.0)
                ),
            }
        )

    cards_json = json.dumps(cards, ensure_ascii=False).replace("<", "\\u003c")
    index_json = json.dumps(index_options, ensure_ascii=False).replace("<", "\\u003c")
    out_path = Path(args.out) if args.out else work / "review_dubious.html"

    html = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EuroSession dubious joins</title>
<script src="https://cdn.jsdelivr.net/npm/abcjs@6.4.4/dist/abcjs-basic.min.js"></script>
<style>
:root{{--bg:#12141a;--card:#1b1f2a;--line:#2c3344;--text:#e8ecf4;--muted:#9aa3b5;--accent:#7eb6ff;--ok:#6dcea0;--warn:#e0b35a;--bad:#e07a7a}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:var(--bg);color:var(--text)}}
header{{padding:1rem 1.1rem;border-bottom:1px solid var(--line)}}
header h1{{margin:0;font-size:1.15rem}}
header p{{margin:.35rem 0 0;color:var(--muted);font-size:.88rem;max-width:56rem;line-height:1.45}}
header a{{color:var(--accent)}}
main{{padding:1rem;max-width:1680px;margin:0 auto}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem;margin:0 0 1rem}}
.card.not-in-book{{border-color:#6a5530;box-shadow:inset 3px 0 0 var(--warn)}}
.card-head{{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.55rem}}
.card-head h2{{margin:0;font-size:1rem;flex:1 1 100%}}
.warn-box{{background:#2a2218;border:1px solid #6a5530;border-radius:8px;padding:.55rem .65rem;font-size:.82rem;color:#ffe8c8;margin-bottom:.65rem;line-height:1.4}}
.badge{{display:inline-block;border-radius:999px;padding:.1rem .5rem;border:1px solid var(--line);font-size:.72rem;color:var(--muted)}}
.badge.warn{{color:var(--warn);border-color:#6a5530}}
.badge.bad{{color:var(--bad);border-color:#6a3a3a}}
.badge.ok{{color:var(--ok);border-color:#3d7a5c}}
.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}}
@media (max-width:900px){{.grid{{grid-template-columns:1fr}}}}
.col .label{{font-size:.78rem;color:var(--muted);margin-bottom:.35rem}}
.col img{{width:100%;border:1px solid var(--line);border-radius:8px;background:#0d0f14}}
.staff{{background:#0d0f14;border:1px solid var(--line);border-radius:8px;padding:.35rem;overflow:auto;min-height:8rem}}
.pick-row{{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;margin:.55rem 0}}
.pick-row label{{font-size:.78rem;color:var(--muted)}}
.actions{{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.75rem}}
button{{appearance:none;border:1px solid var(--line);background:#252b38;color:var(--text);border-radius:8px;padding:.45rem .75rem;font:inherit;font-size:.86rem;cursor:pointer}}
button.primary{{background:#2a4a72;border-color:#3d6aa0}}
button:hover{{border-color:#5a6780}}
select{{background:#0d0f14;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:.35rem .5rem;font:inherit;max-width:100%}}
.status{{font-size:.82rem;color:var(--muted);margin-top:.5rem}}
.meta-line{{font-size:.78rem;color:var(--muted);margin:.15rem 0 .35rem}}
</style></head><body>
<header>
<h1>Dubious MXL joins ({len(cards)})</h1>
<p>
  Title-only matches (0.55–0.71) are often <strong>wrong tunes</strong> — the old “MXL oracle” column showed those guesses.
  This page ranks spans by <strong>melody contour</strong> vs your OMR+ instead. Low contour scores (&lt;45) usually mean
  the photo tune is <strong>not in the tunebook</strong>; keep unmatched and polish OMR+.
  Composer/subtitle lines come from MSCZ title frames when present.
</p>
<p><a href="review_abc.html">← ABC review</a></p>
</header>
<main id="list"></main>
<script id="cards-data" type="application/json">{cards_json}</script>
<script id="index-data" type="application/json">{index_json}</script>
<script>
const STORAGE_KEY = 'eurosession-dubious-overrides-v1';
const cards = JSON.parse(document.getElementById('cards-data').textContent);
const indexOptions = JSON.parse(document.getElementById('index-data').textContent);
const list = document.getElementById('list');

function loadOverrides() {{
  try {{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }} catch (_) {{ return []; }}
}}
function saveOverrides(rows) {{ localStorage.setItem(STORAGE_KEY, JSON.stringify(rows, null, 2)); }}
function upsertOverride(row) {{
  const rows = loadOverrides().filter(r => r.import_title !== row.import_title);
  rows.push(row);
  saveOverrides(rows);
}}
function downloadOverrides() {{
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(loadOverrides(), null, 2)], {{ type: 'application/json' }}));
  a.download = 'mxl_join_overrides.json';
  a.click();
}}

function renderAbc(el, abc) {{
  el.innerHTML = '';
  if (!abc || !abc.trim()) {{ el.textContent = '(no ABC)'; return; }}
  try {{ ABCJS.renderAbc(el, abc, {{ responsive: 'resize', staffwidth: 340 }}); }}
  catch (err) {{ el.textContent = 'Render error: ' + (err.message || String(err)); }}
}}

function candidateLabel(c, i) {{
  const cs = c.contour_score != null ? ('contour ' + c.contour_score) : 'contour ?';
  const gate = c.gate === 'title-fuzzy' ? 'title guess' : 'contour pick';
  const comp = c.mscz_composer ? (' · ' + c.mscz_composer) : '';
  return (i + 1) + '. ' + gate + ' · ' + cs + ' · ' + (c.mscz_title || 'span') + ' mm' + c.m0 + '–' + c.m1 + comp;
}}

const dlBtn = document.createElement('button');
dlBtn.textContent = 'Download overrides';
dlBtn.className = 'primary';
dlBtn.style.margin = '0 0 1rem';
dlBtn.onclick = downloadOverrides;
list.before(dlBtn);

for (const c of cards) {{
  const article = document.createElement('article');
  article.className = 'card' + (c.likelyNotInTunebook ? ' not-in-book' : '');
  const tm = c.titleMatch || {{}};
  const tg = c.titleGuessContour;
  let warn = '';
  if (c.likelyNotInTunebook) {{
    warn = '<div class="warn-box"><strong>Likely not in tunebook.</strong> Neither title guess nor contour picks align with OMR+. '
      + 'Prefer <em>Keep unmatched</em> and refine OMR+ in the main review page.</div>';
  }} else if (tg != null && tg < 50 && tm.match_score != null) {{
    warn = '<div class="warn-box">Title fuzzy match <strong>' + (tm.mscz_title || '') + '</strong> (name '
      + Number(tm.match_score).toFixed(2) + ', contour ' + tg + ') is probably wrong. '
      + 'Compare contour-ranked candidates below.</div>';
  }}
  article.innerHTML = warn + `
    <div class="card-head">
      <h2>${{c.title}}</h2>
      <span class="badge">${{c.importKey}}</span>
      ${{c.likelyNotInTunebook ? '<span class="badge warn">not in book?</span>' : ''}}
      ${{tm.match_score != null ? '<span class="badge warn">title ' + Number(tm.match_score).toFixed(2) + '</span>' : ''}}
      ${{tg != null ? '<span class="badge bad">title contour ' + tg + '</span>' : ''}}
    </div>
    <div class="pick-row">
      <label for="mxl-pick-${{c.importKey}}">MXL candidate</label>
      <select id="mxl-pick-${{c.importKey}}"></select>
      <label for="index-pick-${{c.importKey}}">Or pick tunebook index</label>
      <select id="index-pick-${{c.importKey}}"><option value="">Browse index…</option></select>
    </div>
    <div class="meta-line" id="meta-${{c.importKey}}"></div>
    <div class="grid">
      <div class="col"><div class="label">Crop</div>${{c.crop ? `<img src="tunes/${{c.crop}}" alt="">` : '(missing)'}}</div>
      <div class="col"><div class="label">OMR+ (from photo)</div><div class="staff" id="omr-${{c.importKey}}"></div></div>
      <div class="col"><div class="label">MXL span (selected candidate)</div><div class="staff" id="mxl-${{c.importKey}}"></div></div>
    </div>
    <div class="actions">
      <button type="button" data-act="accept">Accept selected span</button>
      <button type="button" data-act="unmatched">Keep unmatched</button>
    </div>
    <div class="status" id="status-${{c.importKey}}"></div>
  `;
  list.appendChild(article);
  renderAbc(document.getElementById('omr-' + c.importKey), c.omrAbc);

  const pick = document.getElementById('mxl-pick-' + c.importKey);
  const meta = document.getElementById('meta-' + c.importKey);
  const mxlEl = document.getElementById('mxl-' + c.importKey);
  const status = document.getElementById('status-' + c.importKey);
  (c.candidates || []).forEach((hit, i) => {{
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = candidateLabel(hit, i);
    pick.appendChild(opt);
  }});

  const indexPick = document.getElementById('index-pick-' + c.importKey);
  indexOptions.forEach((entry, i) => {{
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = entry.label + ' mm' + entry.m0 + '–' + entry.m1;
    indexPick.appendChild(opt);
  }});

  function showCandidate(idx) {{
    const hit = (c.candidates || [])[idx];
    if (!hit) return;
    const bits = [];
    if (hit.mscz_title) bits.push(hit.mscz_title);
    if (hit.mscz_subtitle) bits.push('subtitle: ' + hit.mscz_subtitle);
    if (hit.mscz_composer) bits.push('composer: ' + hit.mscz_composer);
    if (hit.name_score != null) bits.push('name score ' + hit.name_score);
    if (hit.contour_score != null) bits.push('contour ' + hit.contour_score);
    meta.textContent = bits.join(' · ');
    if (hit.abcError) mxlEl.textContent = hit.abcError;
    else renderAbc(mxlEl, hit.abc);
    c._selected = hit;
  }}

  pick.addEventListener('change', () => showCandidate(Number(pick.value) || 0));
  indexPick.addEventListener('change', () => {{
    const raw = indexPick.value;
    if (raw === '') return;
    const entry = indexOptions[Number(raw)];
    if (!entry) return;
    const manual = {{
      m0: entry.m0, m1: entry.m1,
      mscz_title: entry.mscz_title,
      mscz_subtitle: entry.mscz_subtitle,
      mscz_composer: entry.mscz_composer,
      key: entry.key || 'C', meter: entry.meter || '4/4',
      gate: 'manual-index', contour_score: null,
      abc: '', abcError: 'Re-generate review page after manual index pick (or accept to save span only)',
    }};
    c._selected = manual;
    meta.textContent = entry.label + ' (manual index pick — re-run make_dubious_review_html for ABC preview)';
    mxlEl.textContent = manual.abcError;
    status.textContent = 'Manual index span selected — accept saves mm' + entry.m0 + '–' + entry.m1;
  }});

  if ((c.candidates || []).length) showCandidate(0);

  article.querySelectorAll('button[data-act]').forEach(btn => {{
    btn.addEventListener('click', () => {{
      const act = btn.getAttribute('data-act');
      if (act === 'accept') {{
        const hit = c._selected;
        if (!hit) {{ status.textContent = 'Pick a candidate first'; return; }}
        upsertOverride({{
          import_title: c.title,
          action: 'accept',
          match: {{
            import_title: c.title,
            mscz_title: hit.mscz_title,
            mscz_subtitle: hit.mscz_subtitle,
            mscz_composer: hit.mscz_composer,
            m0: hit.m0, m1: hit.m1,
            match_score: hit.name_score || hit.contour_score,
            seedKey: hit.key,
            seedMeter: hit.meter,
          }},
        }});
        status.textContent = 'Saved accept mm' + hit.m0 + '–' + hit.m1 + ' (' + (hit.mscz_title || '') + ')';
      }} else if (act === 'unmatched') {{
        upsertOverride({{ import_title: c.title, action: 'reject' }});
        status.textContent = 'Saved: keep unmatched (OMR only)';
      }}
    }});
  }});
}}
</script>
</body></html>
"""
    out_path.write_text(html, encoding="utf-8")
    script_src = Path(__file__).resolve().parent / "xml2abc-review.js"
    script_dst = out_path.parent / "xml2abc-review.js"
    if script_src.is_file() and script_dst.resolve() != script_src.resolve():
        shutil.copy2(script_src, script_dst)
    not_in_book = sum(1 for c in cards if c.get("likelyNotInTunebook"))
    print(f"wrote {out_path} ({len(cards)} cards, {not_in_book} likely not in tunebook)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
