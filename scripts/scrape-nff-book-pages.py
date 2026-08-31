#!/usr/bin/env python3
"""
Scrape real PDF page layout for NFF year books from ATMA set2pdf and stamp
bookPages onto scrape/australian bush dance.abc.

ATMA set2pdf PDFs encode music as:
  pN
  1.  Title
  2.  Title
on each music page (cover/TOC skipped). Existing ABC bookPages store
{page:1, tuneIndex:<catalog slot>}; this replaces them with
{page:<pdf page>, tuneIndex:<on-page order>} while keeping other bookPages keys.

Usage:
  python3 scripts/scrape-nff-book-pages.py --dry-run
  python3 scripts/scrape-nff-book-pages.py --write
  python3 scripts/scrape-nff-book-pages.py --write --years 2020,2009
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # pragma: no cover
    raise SystemExit("PyMuPDF required: pip install pymupdf") from exc

REPO = Path(__file__).resolve().parent.parent
DEFAULT_ABC = REPO / "scrape" / "australian bush dance.abc"
DEFAULT_PDF_DIR = Path.home() / "Downloads" / "nff-books"
SET2PDF = "https://austradmusic.au/sets/set2pdf.php?name=NFF_Book_{year}"

# Years published on ATMA (no 2011, 2012, 2021, 2025).
NFF_YEARS = [
    2006, 2007, 2008, 2009, 2010,
    2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020,
    2022, 2023, 2024, 2026,
]

# Music pages use two+ spaces after "N." (TOC uses a single space).
TITLE_RE = re.compile(r"^(\d+)\.\s{2,}(.+)$")
PRINTED_PAGE_RE = re.compile(r"^p(\d+)$", re.I)
BOOKPAGES_LINE_RE = re.compile(r"^% abcbook-json bookPages\s+(\d+)/(\d+)\s+(.*)$")
TAG_LINE_RE = re.compile(r"^% abcbook-tags\s+(.+)$", re.M)


def nff_key(year: int) -> str:
    return f"nff book {year}"


def norm_title(s: str) -> str:
    s = (s or "").lower().strip()
    s = s.replace("’", "'").replace("`", "'")
    s = re.sub(r"_\(([^)]+)\)", r" (\1)", s)  # Miner_(The) → miner (the)
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"\s*\(([^)]+)\)\s*$", r" \1", s)
    s = re.sub(r"[^\w\s#]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def split_tunes(text: str) -> tuple[str, list[str]]:
    parts = re.split(r"(?=^X:\s*)", text, flags=re.M)
    prefix = parts[0] if parts and not re.match(r"^X:\s*", parts[0]) else ""
    tunes = [p for p in parts if re.match(r"^X:\s*", p)]
    return prefix, tunes


def parse_x(tune: str) -> str | None:
    m = re.search(r"^X:\s*(\S+)", tune, re.M)
    return m.group(1) if m else None


def parse_titles(tune: str) -> list[str]:
    return [t.strip() for t in re.findall(r"^T:(.+)$", tune, re.M)]


def parse_bookpages(tune: str) -> dict:
    """Merge chunked abcbook-json bookPages lines into one object."""
    chunks: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
    for line in tune.splitlines():
        m = BOOKPAGES_LINE_RE.match(line)
        if not m:
            continue
        idx, total, data = int(m.group(1)), int(m.group(2)), m.group(3)
        chunks["bookPages"].append((idx, total, data))
    if not chunks["bookPages"]:
        return {}
    parts = sorted(chunks["bookPages"], key=lambda t: t[0])
    raw = "".join(p[2] for p in parts)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def strip_bookpages(tune: str) -> str:
    return re.sub(r"^% abcbook-json bookPages.*\n?", "", tune, flags=re.M)


def insert_bookpages(tune: str, book_pages: dict) -> str:
    if not book_pages:
        return strip_bookpages(tune)
    payload = json.dumps(book_pages, separators=(",", ":"), ensure_ascii=False)
    # Keep single-chunk form used throughout this scrape file (payloads are small).
    line = f"% abcbook-json bookPages 1/1 {payload}\n"
    tune = strip_bookpages(tune)
    for marker in (r"^(% abcbook-link-)", r"^(% abcbook-tune_id)", r"^(% abcbook-tags)"):
        m = re.search(marker, tune, re.M)
        if m:
            return tune[: m.start()] + line + tune[m.start() :]
    return tune.rstrip() + "\n" + line


def ensure_nff_tag(tune: str, year: int) -> str:
    key = nff_key(year)
    m = TAG_LINE_RE.search(tune)
    if not m:
        line = f"% abcbook-tags {key}\n"
        m2 = re.search(r"^(% abcbook-)", tune, re.M)
        if m2:
            return tune[: m2.start()] + line + tune[m2.start() :]
        return tune.rstrip() + "\n" + line
    tags = [t.strip() for t in m.group(1).split(",") if t.strip()]
    lower = {t.lower() for t in tags}
    if key in lower:
        return tune
    tags.append(key)
    return TAG_LINE_RE.sub(f"% abcbook-tags {','.join(tags)}", tune, count=1)


def bump_lastupdated(tune: str, when_ms: int) -> str:
    if re.search(r"^% abcbook-lastupdated", tune, re.M):
        return re.sub(
            r"^% abcbook-lastupdated .*$",
            f"% abcbook-lastupdated {when_ms}",
            tune,
            flags=re.M,
        )
    m = re.search(r"^(% abcbook-)", tune, re.M)
    line = f"% abcbook-lastupdated {when_ms}\n"
    if m:
        return tune[: m.start()] + line + tune[m.start() :]
    return tune.rstrip() + "\n" + line


def download_pdf(year: int, pdf_dir: Path, force: bool = False) -> Path:
    pdf_dir.mkdir(parents=True, exist_ok=True)
    path = pdf_dir / f"NFF_Book_{year}.pdf"
    if path.exists() and path.stat().st_size > 1000 and not force:
        return path
    url = SET2PDF.format(year=year)
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "abc2book-nff-scrape/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    if len(data) < 1000 or not data[:5].startswith(b"%PDF"):
        raise SystemExit(f"Bad PDF for {year}: {len(data)} bytes from {url}")
    path.write_bytes(data)
    return path


def parse_pdf_entries(pdf_path: Path) -> list[dict]:
    """
    Return [{catalog, title, page, tuneIndex}, ...] for music pages.
    Uses two-space "N.  Title" lines so single-space TOC pages are ignored.
    """
    doc = fitz.open(pdf_path)
    entries: list[dict] = []
    for i in range(doc.page_count):
        text = doc[i].get_text() or ""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        hits: list[tuple[int, str]] = []
        for ln in lines:
            m = TITLE_RE.match(ln)
            if m:
                hits.append((int(m.group(1)), m.group(2).strip()))
        printed = None
        for ln in lines:
            m = PRINTED_PAGE_RE.match(ln)
            if m:
                printed = int(m.group(1))
                break
        if not hits:
            continue
        page_num = printed if printed and printed > 0 else (i + 1)
        for on_page, (catalog, title) in enumerate(hits, 1):
            entries.append(
                {
                    "catalog": catalog,
                    "title": title,
                    "page": page_num,
                    "tuneIndex": on_page,
                }
            )
    doc.close()
    # If a catalog somehow appears twice, keep the later (music) page.
    by_catalog: dict[int, dict] = {}
    for pe in entries:
        prev = by_catalog.get(pe["catalog"])
        if not prev or pe["page"] >= prev["page"]:
            by_catalog[pe["catalog"]] = pe
    return [by_catalog[c] for c in sorted(by_catalog)]


def index_abc_by_nff(tunes: list[str], year: int) -> dict[int, list[tuple[int, str]]]:
    """catalog tuneIndex -> [(tune_list_index, tune_text), ...]"""
    key = nff_key(year)
    by_catalog: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for idx, tune in enumerate(tunes):
        bp = parse_bookpages(tune)
        entry = bp.get(key)
        if not entry or not isinstance(entry, dict):
            continue
        catalog = int(entry.get("tuneIndex") or 0)
        if catalog > 0:
            by_catalog[catalog].append((idx, tune))
    return by_catalog


def pick_candidate(
    candidates: list[tuple[int, str]],
    pdf_title: str,
    used: set[int],
) -> tuple[int, str] | None:
    available = [(i, t) for i, t in candidates if i not in used]
    if not available:
        return None
    want = norm_title(pdf_title)
    if want:
        for idx, tune in available:
            titles = [norm_title(t) for t in parse_titles(tune)]
            if want in titles or any(want in t or t in want for t in titles if t):
                return idx, tune
    return available[0]


def find_title_fallback(
    tunes: list[str],
    year: int,
    pdf_title: str,
    used: set[int],
) -> tuple[int, str] | None:
    """Match by title among tunes not already claimed for this year."""
    key = nff_key(year)
    want = norm_title(pdf_title)
    if not want:
        return None
    hits: list[tuple[int, str]] = []
    for idx, tune in enumerate(tunes):
        if idx in used:
            continue
        bp = parse_bookpages(tune)
        if key in bp:
            continue
        titles = [norm_title(t) for t in parse_titles(tune)]
        if want in titles or any(want in t or t in want for t in titles if t):
            hits.append((idx, tune))
    if len(hits) == 1:
        return hits[0]
    return None


def apply_year(
    tunes: list[str],
    year: int,
    pdf_entries: list[dict],
    stamp_base: int,
) -> tuple[list[str], dict]:
    key = nff_key(year)
    by_catalog = index_abc_by_nff(tunes, year)
    report = {
        "year": year,
        "pdf_count": len(pdf_entries),
        "abc_catalogs": sorted(by_catalog.keys()),
        "updated": 0,
        "unmatched_pdf": [],
        "ambiguous": [],
        "title_fallback": [],
        "unchanged": 0,
    }

    out = list(tunes)
    used_tune_idxs: set[int] = set()

    for pe in pdf_entries:
        catalog = pe["catalog"]
        candidates = by_catalog.get(catalog) or []
        picked = pick_candidate(candidates, pe["title"], used_tune_idxs) if candidates else None
        via = "catalog"
        if not picked:
            picked = find_title_fallback(out, year, pe["title"], used_tune_idxs)
            via = "title"
            if picked:
                report["title_fallback"].append((catalog, pe["title"], pe["page"]))
        if not picked:
            report["unmatched_pdf"].append((catalog, pe["title"], pe["page"]))
            continue
        if len(candidates) > 1:
            report["ambiguous"].append((catalog, pe["title"], len(candidates)))

        tune_idx, tune = picked
        used_tune_idxs.add(tune_idx)

        bp = parse_bookpages(tune)
        prev = bp.get(key) if isinstance(bp.get(key), dict) else {}
        next_entry = {"page": pe["page"], "tuneIndex": pe["tuneIndex"]}
        if (
            prev.get("page") == next_entry["page"]
            and prev.get("tuneIndex") == next_entry["tuneIndex"]
            and via == "catalog"
        ):
            report["unchanged"] += 1
            continue
        bp[key] = next_entry
        tune = insert_bookpages(tune, bp)
        if via == "title":
            tune = ensure_nff_tag(tune, year)
        tune = bump_lastupdated(tune, stamp_base + report["updated"])
        out[tune_idx] = tune
        report["updated"] += 1

    abc_only = sorted(set(by_catalog.keys()) - {pe["catalog"] for pe in pdf_entries})
    report["abc_only"] = [(c, parse_titles(by_catalog[c][0][1])[:1]) for c in abc_only]

    # Duplicate ABC rows sharing a catalog slot: copy the winner's page onto leftovers
    # still stuck at page:1 so they don't form a fake "page 1" group.
    page_by_catalog = {pe["catalog"]: pe for pe in pdf_entries}
    synced = 0
    for catalog, candidates in by_catalog.items():
        pe = page_by_catalog.get(catalog)
        if not pe:
            continue
        for tune_idx, tune in candidates:
            if tune_idx in used_tune_idxs:
                continue
            bp = parse_bookpages(out[tune_idx] if tune_idx < len(out) else tune)
            prev = bp.get(key) if isinstance(bp.get(key), dict) else {}
            if int(prev.get("page") or 0) != 1:
                continue
            bp[key] = {"page": pe["page"], "tuneIndex": pe["tuneIndex"]}
            nxt = insert_bookpages(out[tune_idx], bp)
            nxt = bump_lastupdated(nxt, stamp_base + report["updated"] + synced)
            out[tune_idx] = nxt
            used_tune_idxs.add(tune_idx)
            synced += 1
    report["synced_duplicates"] = synced
    report["updated"] += synced
    return out, report


def print_report(report: dict) -> None:
    year = report["year"]
    print(
        f"NFF {year}: pdf={report['pdf_count']} "
        f"updated={report['updated']} unchanged={report['unchanged']} "
        f"unmatched_pdf={len(report['unmatched_pdf'])} "
        f"abc_only={len(report.get('abc_only') or [])} "
        f"ambiguous={len(report['ambiguous'])} "
        f"dup_sync={report.get('synced_duplicates') or 0}"
    )
    for catalog, title, page in report["unmatched_pdf"][:12]:
        print(f"  unmatched PDF #{catalog} p{page}: {title}")
    for catalog, title, page in (report.get("title_fallback") or [])[:12]:
        print(f"  title-fallback #{catalog} p{page}: {title}")
    for catalog, titles in (report.get("abc_only") or [])[:12]:
        print(f"  ABC-only catalog #{catalog}: {titles}")
    for catalog, title, n in report["ambiguous"][:8]:
        print(f"  ambiguous catalog #{catalog} ({n} tunes): {title}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--abc", type=Path, default=DEFAULT_ABC)
    parser.add_argument("--pdf-dir", type=Path, default=DEFAULT_PDF_DIR)
    parser.add_argument("--force-download", action="store_true")
    parser.add_argument(
        "--years",
        default="",
        help="Comma-separated years (default: all NFF years)",
    )
    args = parser.parse_args()
    if not args.dry_run and not args.write:
        parser.error("Specify --dry-run or --write")

    years = NFF_YEARS
    if args.years.strip():
        years = [int(y.strip()) for y in args.years.split(",") if y.strip()]
        bad = [y for y in years if y not in NFF_YEARS]
        if bad:
            parser.error(f"Unknown NFF years: {bad}")

    if not args.abc.exists():
        raise SystemExit(f"ABC not found: {args.abc}")

    text = args.abc.read_text(encoding="utf-8", errors="replace")
    prefix, tunes = split_tunes(text)
    stamp_base = int(time.time() * 1000)
    all_reports = []

    for year in years:
        print(f"\n=== {nff_key(year)} ===")
        pdf_path = download_pdf(year, args.pdf_dir, force=args.force_download)
        print(f"  pdf: {pdf_path} ({pdf_path.stat().st_size} bytes)")
        entries = parse_pdf_entries(pdf_path)
        if not entries:
            raise SystemExit(f"No music entries parsed from {pdf_path}")
        pages = sorted({e["page"] for e in entries})
        print(f"  parsed {len(entries)} tunes across pages {pages[0]}-{pages[-1]}")
        tunes, report = apply_year(tunes, year, entries, stamp_base + year * 1000)
        print_report(report)
        all_reports.append(report)

    total_updated = sum(r["updated"] for r in all_reports)
    total_unmatched = sum(len(r["unmatched_pdf"]) for r in all_reports)
    print(f"\nTOTAL updated={total_updated} unmatched_pdf={total_unmatched}")

    if args.dry_run:
        print("Dry run — ABC not written.")
        return

    backup = args.abc.with_suffix(args.abc.suffix + ".bak-nff-pages")
    shutil.copy2(args.abc, backup)
    out_text = prefix.rstrip() + ("\n" if prefix.strip() else "")
    out_text += "".join(t.rstrip() + "\n" for t in tunes)
    args.abc.write_text(out_text, encoding="utf-8")
    print(f"Wrote {args.abc}")
    print(f"Backup: {backup}")


if __name__ == "__main__":
    main()
