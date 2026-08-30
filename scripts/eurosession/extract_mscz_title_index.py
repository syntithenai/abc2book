#!/usr/bin/env python3
"""Extract title→measure spans from eurosessions-tunebook.mscz.

MusicXML export drops MuseScore Title frames; the .mscz keeps them on staff 1
aligned with MXL measure numbers (1–1704).

Also fuzzy-matches EuroSession import titles onto the index.

Examples:
  python3 scripts/eurosession/extract_mscz_title_index.py
  python3 scripts/eurosession/extract_mscz_title_index.py --join-import \\
    --import-json /home/stever/Downloads/eurosession-import.json
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
import zipfile
from difflib import SequenceMatcher
from pathlib import Path
from xml.etree import ElementTree as ET

# Manual aliases: import/manifest title → MSCZ title substring or exact.
TITLE_ALIASES: dict[str, str] = {
    "mazomenos": "mazemenos",
    "menexedes kai zoumpoulia": "menexedes",
    "bourree du morvan hcb (g)": "bourree du morvan - hcb",
    "bourrée du morvan hcb (g)": "bourree du morvan - hcb",
    "bourree du morvan hcb g": "bourree du morvan - hcb",
    "bourée de concours (gm)": "bouree de concours",
    "lule malesore": "lule malesore",
    "scottische a virmoux": "scottische a virmoux",
    "schottische urbaine": "schottische urbaine",
    "o cabalo azul": "o cabalo azul",
    "ukrainian dance nign": "ukrainian dance nign",
    "maltese melody #16": "maltese melody #16",
    "parata (maltese sword dance)": "parata",
    # PDF/import name ≠ MSCZ main title (subtitle or spelling).
    "moshe emes": "moshe emes",  # matched via MSCZ subtitle on "Nigun"
    "rue des pres stephane durand": "rue de pres",
    "chapelloise set": "t smidje",
}

# Import titles that map to a composite PDF crop but only the first MSCZ span is oracle-backed.
COMPOSITE_IMPORT_NOTES: dict[str, str] = {
    "Chapelloise Set": (
        "PDF page is t'Smidje + Zelda; MSCZ oracle is t Smidje mm501–509 only "
        "(Zelda is not in the tunebook; Hellebore follows at mm510)."
    ),
}


def _strip_accents(s: str) -> str:
    nk = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nk if not unicodedata.combining(c))


def normalize_title(title: str) -> str:
    """Lowercase, strip accents/punct, drop trailing (Key) suffixes for matching."""
    s = _strip_accents(title or "")
    s = s.lower().strip()
    # Drop parenthetical key/mode tags: (Dm), (G), (Am/Dm), (Am dorian/G)
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s)
    s = re.sub(r"[^\w\s#]+", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _clean_text_el(text_el: ET.Element | None) -> str:
    if text_el is None:
        return ""
    return re.sub(r"\s+", " ", "".join(text_el.itertext())).strip()


def extract_title_spans(mscz: Path) -> list[dict]:
    """Return [{title, m0, m1}, ...] from staff id=1 Title boxes."""
    with zipfile.ZipFile(mscz) as zf:
        score_name = next(n for n in zf.namelist() if n.endswith(".mscx"))
        raw = zf.read(score_name).decode("utf-8", errors="replace")
    raw = re.sub(r"<!DOCTYPE[^>]*>", "", raw)
    root = ET.fromstring(raw)
    scores = list(root.iter("Score"))
    score = scores[-1] if scores else root
    staves = list(score.findall("Staff"))
    staff = next((s for s in staves if s.get("id") == "1"), None)
    if staff is None:
        staff = max(staves, key=lambda s: len(s.findall("Measure"))) if staves else None
    if staff is None:
        raise RuntimeError("No Staff with measures found in MSCZ")

    starts: list[tuple[int, str, str | None, str | None]] = []
    pending: list[dict[str, str | None]] = []
    mnum = 0
    for el in staff:
        if el.tag in {"VBox", "HBox", "TBox", "FBox"}:
            for te in el.findall("Text"):
                style = (te.findtext("style") or "").lower()
                tit = _clean_text_el(te.find("text"))
                if not tit:
                    continue
                if style == "title":
                    pending.append({"title": tit, "subtitle": None, "composer": None})
                elif style == "subtitle" and pending:
                    pending[-1]["subtitle"] = tit
                elif style == "composer" and pending:
                    if tit.lower() not in {"composer / arranger", "composer/arranger"}:
                        pending[-1]["composer"] = tit
        elif el.tag == "Measure":
            mnum += 1
            if pending:
                for block in pending:
                    starts.append(
                        (
                            mnum,
                            str(block["title"]),
                            block.get("subtitle"),
                            block.get("composer"),
                        )
                    )
                pending = []

    if mnum < 1:
        raise RuntimeError("Staff has no measures")

    out: list[dict] = []
    for i, (m0, title, subtitle, composer) in enumerate(starts):
        m1 = starts[i + 1][0] - 1 if i + 1 < len(starts) else mnum
        row = {"title": title, "m0": m0, "m1": m1, "norm": normalize_title(title)}
        if subtitle:
            row["subtitle"] = subtitle
            row["subtitle_norm"] = normalize_title(subtitle)
        if composer:
            row["composer"] = composer
        out.append(row)
    return out


def index_entry_for_span(index: list[dict], m0: int, m1: int) -> dict | None:
    """Return index row whose span exactly matches m0..m1."""
    for entry in index:
        if int(entry.get("m0") or -1) == int(m0) and int(entry.get("m1") or -1) == int(m1):
            return entry
    return None


def best_index_match(
    import_title: str,
    index: list[dict],
    *,
    min_score: float = 0.55,
) -> dict | None:
    """Fuzzy-match an import title to the MSCZ index."""
    raw = (import_title or "").strip()
    if not raw or not index:
        return None
    norm = normalize_title(raw)
    alias_target = TITLE_ALIASES.get(norm, "")

    best: dict | None = None
    best_score = 0.0
    for entry in index:
        cand = str(entry.get("norm") or normalize_title(str(entry.get("title") or "")))
        sub = str(entry.get("subtitle_norm") or normalize_title(str(entry.get("subtitle") or "")))
        score = SequenceMatcher(None, norm, cand).ratio()
        if sub:
            if norm == sub:
                score = max(score, 1.0)
            else:
                score = max(score, SequenceMatcher(None, norm, sub).ratio())
                if len(sub) >= 5 and sub in norm:
                    score = max(score, 0.95)
        if norm and cand:
            if norm == cand:
                score = 1.0
            else:
                # Containment only when the shorter side is long enough to be
                # meaningful (avoids Amazone⊂Mazomenos, es⊂emes).
                shorter, longer = (norm, cand) if len(norm) <= len(cand) else (cand, norm)
                if len(shorter) >= 8 and shorter in longer:
                    score = max(score, 0.92)
            ta, tb = set(norm.split()), set(cand.split())
            if ta and tb:
                # Require at least one meaningful shared token (≥4 chars).
                shared = {t for t in (ta & tb) if len(t) >= 4}
                if shared:
                    overlap = len(shared) / max(1, len(ta | tb))
                    score = max(score, 0.55 + 0.45 * overlap)
        if alias_target and alias_target in cand:
            score = max(score, 0.95)
        if alias_target and alias_target == sub:
            score = max(score, 0.98)
        # Exact MSCZ main title when alias names a distinct tune (e.g. t smidje).
        if alias_target and cand == alias_target:
            score = max(score, 0.98)
        # Latin name inside Greek / bilingual titles, e.g. (Mazemenos).
        latin = re.findall(r"[A-Za-z][A-Za-z '#-]{3,}", str(entry.get("title") or ""))
        for lat in latin:
            ln = normalize_title(lat)
            if len(ln) < 5:
                continue
            if ln == norm:
                score = max(score, 1.0)
            else:
                score = max(score, SequenceMatcher(None, norm, ln).ratio())
        if score > best_score:
            best_score = score
            best = {
                "import_title": raw,
                "mscz_title": entry["title"],
                "mscz_subtitle": entry.get("subtitle"),
                "mscz_composer": entry.get("composer"),
                "m0": entry["m0"],
                "m1": entry["m1"],
                "match_score": round(score, 3),
            }
    if best is None or best_score < min_score:
        return None
    return best


def enrich_spans_with_mxl(spans: list[dict], mxl: Path) -> list[dict]:
    """Attach MXL key/meter at each span's m0 (offline oracle metadata)."""
    if not mxl.is_file():
        return spans
    # Local import — match_mxl_spans lives beside this script.
    from match_mxl_spans import load_score, mxl_key_meter_at  # noqa: WPS433

    root = load_score(mxl)
    out: list[dict] = []
    for s in spans:
        key, meter = mxl_key_meter_at(root, int(s["m0"]))
        row = dict(s)
        row["mxlKey"] = key
        row["mxlMeter"] = meter
        out.append(row)
    return out


def preferred_seed_key(title: str, mxl_key: str) -> str:
    """Prefer title (Gm)/minor hints over relative-major MXL attributes."""
    from repair_abc import abc_key_header, parse_title_key  # noqa: WPS433

    hint = parse_title_key(title)
    if hint:
        return abc_key_header(*hint)
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
    }
    low = (title or "").lower()
    norm = normalize_title(title)
    # Titles without (Am) that are known minor in this book / folk practice.
    force_minor = {
        "amazone",
        "ukrainian dance nign",
        "freylekhs",
        "o cabalo azul",
        "mazomenos",
        "menexedes kai zoumpoulia",
        "lule malesore",
        "lule malesore my mountain flower",
    }
    force = norm in force_minor or any(norm.startswith(f + " ") for f in force_minor)
    if force or any(
        tok in low for tok in ("(am", "(dm", "(em", "(gm", "(cm", "nign", "freylekh", "nigun")
    ):
        if mxl_key.endswith("m"):
            return mxl_key
        return rel.get(mxl_key, mxl_key)
    return mxl_key or "C"


def join_import_titles(
    import_json: Path,
    index: list[dict],
    *,
    min_score: float = 0.55,
) -> list[dict]:
    data = json.loads(import_json.read_text(encoding="utf-8"))
    rows: list[dict] = []
    seen: set[str] = set()
    for tune in data.get("tunes") or []:
        title = str(tune.get("title") or "").strip()
        if not title or title in seen:
            continue
        seen.add(title)
        hit = best_index_match(title, index, min_score=min_score)
        if hit:
            # Carry MXL key/meter onto the join row when index was enriched.
            entry = next((e for e in index if e.get("m0") == hit["m0"] and e.get("title") == hit["mscz_title"]), None)
            if entry:
                hit = dict(hit)
                if entry.get("mxlKey"):
                    hit["mxlKey"] = entry["mxlKey"]
                    hit["seedKey"] = preferred_seed_key(title, str(entry["mxlKey"]))
                if entry.get("mxlMeter"):
                    hit["mxlMeter"] = entry["mxlMeter"]
                    hit["seedMeter"] = entry["mxlMeter"]
        rows.append(
            {
                "import_title": title,
                "import_key": tune.get("key"),
                "complete": bool(tune.get("complete")),
                "match": hit,
                **(
                    {"composite_note": COMPOSITE_IMPORT_NOTES[title]}
                    if title in COMPOSITE_IMPORT_NOTES
                    else {}
                ),
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mscz", default="/home/stever/Downloads/eurosessions-tunebook.mscz")
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument(
        "--out",
        default="/home/stever/Downloads/eurosession-work/mxl_title_index.json",
        help="Write title span index JSON",
    )
    parser.add_argument("--join-import", action="store_true", help="Also fuzzy-join import titles")
    parser.add_argument("--import-json", default="/home/stever/Downloads/eurosession-import.json")
    parser.add_argument(
        "--join-out",
        default="/home/stever/Downloads/eurosession-work/mxl_title_join.json",
    )
    parser.add_argument("--min-join-score", type=float, default=0.55)
    args = parser.parse_args()

    spans = extract_title_spans(Path(args.mscz))
    spans = enrich_spans_with_mxl(spans, Path(args.mxl))
    payload = {
        "source": str(Path(args.mscz).resolve()),
        "mxl": str(Path(args.mxl).resolve()) if Path(args.mxl).is_file() else None,
        "measureCount": spans[-1]["m1"] if spans else 0,
        "titleCount": len(spans),
        "titles": [
            {
                "title": s["title"],
                "m0": s["m0"],
                "m1": s["m1"],
                **({"subtitle": s["subtitle"]} if s.get("subtitle") else {}),
                **({"composer": s["composer"]} if s.get("composer") else {}),
                **({"mxlKey": s["mxlKey"]} if s.get("mxlKey") else {}),
                **({"mxlMeter": s["mxlMeter"]} if s.get("mxlMeter") else {}),
            }
            for s in spans
        ],
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(spans)} titles, measures 1–{payload['measureCount']})", flush=True)
    for s in spans[:8]:
        km = f" K:{s.get('mxlKey','?')} M:{s.get('mxlMeter','?')}" if s.get("mxlKey") else ""
        print(f"  {s['m0']:4d}-{s['m1']:<4d} {s['title']}{km}", flush=True)
    if len(spans) > 8:
        print(f"  … {len(spans) - 8} more", flush=True)

    if args.join_import:
        rows = join_import_titles(
            Path(args.import_json), spans, min_score=float(args.min_join_score)
        )
        overrides_path = Path(args.join_out).parent / "mxl_join_overrides.json"
        if overrides_path.is_file():
            from finalize_eurosession import apply_join_overrides  # noqa: WPS433

            rows = apply_join_overrides(rows, overrides_path)
            print(f"applied join overrides from {overrides_path}", flush=True)
        matched = [r for r in rows if r.get("match")]
        join_path = Path(args.join_out)
        join_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(
            f"wrote {join_path} ({len(matched)}/{len(rows)} import titles matched ≥{args.min_join_score})",
            flush=True,
        )
        for r in matched[:15]:
            m = r["match"]
            seed = ""
            if m.get("seedMeter") or m.get("seedKey"):
                seed = f" seed K:{m.get('seedKey','?')} M:{m.get('seedMeter','?')}"
            print(
                f"  {m['match_score']:.2f} {r['import_title'][:40]:40} → "
                f"mm{m['m0']}-{m['m1']} {m['mscz_title'][:36]}{seed}",
                flush=True,
            )
        weak = [r for r in rows if not r.get("match")]
        if weak:
            print(f"unmatched ({len(weak)}):", flush=True)
            for r in weak[:20]:
                print(f"  — {r['import_title']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
