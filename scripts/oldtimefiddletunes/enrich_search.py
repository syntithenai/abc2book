#!/usr/bin/env python3
"""Phase A search enrichment for oldtimefiddletunes (no MIDI/OMR).

Sources: local abcresources, The Session, known ABC sites / general web via
notation_fetch.collect_web_abc_candidates (and local collectors).

Writes per-tune JSON under data/enrich/ and data/enrich_package.json for the
review UI. Resume-friendly: skips existing enrich files unless --force.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
RESOLVER_DIR = REPO_ROOT / "local-resolver"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(RESOLVER_DIR) not in sys.path:
    sys.path.insert(0, str(RESOLVER_DIR))

from common import (  # noqa: E402
    BOOK_NAME,
    ENRICH_DIR,
    INDEX_PATH,
    PACKAGE_PATH,
    SITE_TAG,
    candidate_id,
    chord_count,
    ensure_dir,
    load_json,
    pick_best_candidate,
    save_json,
    title_similarity,
    utc_now_iso,
)

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None


def _normalize_candidate(raw: dict, query_title: str, source_prefix: str = "") -> dict | None:
    if not isinstance(raw, dict):
        return None
    abc = str(raw.get("abc") or raw.get("notation") or raw.get("text") or "").strip()
    if not abc or "K:" not in abc:
        return None
    matched = str(raw.get("title") or raw.get("name") or "").strip()
    host = str(raw.get("source") or raw.get("provider") or "search").strip()
    if source_prefix:
        source = f"{source_prefix}:{host}"
    else:
        source = host
    score = float(raw.get("score") or 0)
    # notation_fetch often uses 0–100 match scores
    if score > 1.5:
        score = min(1.0, score / 100.0)
    sim = title_similarity(query_title, matched or query_title)
    score = max(score, sim)
    url = str(raw.get("url") or raw.get("sourceUrl") or "").strip()
    return {
        "id": candidate_id(source, abc),
        "source": source,
        "abc": abc,
        "score": round(score, 4),
        "title": matched or query_title,
        "url": url,
        "hasChords": chord_count(abc) >= 3,
    }


def _dedupe(cands: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for c in cands:
        if not c or c["id"] in seen:
            continue
        seen.add(c["id"])
        out.append(c)
    out.sort(key=lambda c: float(c.get("score") or 0), reverse=True)
    return out


async def enrich_one(
    client,
    tune: dict,
    *,
    do_local: bool,
    do_session: bool,
    do_web: bool,
    max_candidates: int,
) -> dict:
    title = str(tune.get("title") or "").strip()
    notes = str(tune.get("notes") or "").strip()
    artist = ""
    # crude artist hint from notes ("Bruce Greene from …")
    if notes:
        artist = notes.split(" from ")[0].strip()[:80]

    candidates: list[dict] = []
    errors: list[str] = []

    if do_local:
        try:
            from local_abc_resources import collect_local_abc_candidates

            local = await collect_local_abc_candidates(title, artist=artist, limit=6)
            for raw in local or []:
                c = _normalize_candidate(raw, title, source_prefix="local")
                if c:
                    candidates.append(c)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"local:{exc}")

    if do_session and client is not None:
        try:
            from notation_fetch import collect_thesession_candidates, filter_notation_candidates

            session = await collect_thesession_candidates(client, title, artist)
            session = filter_notation_candidates(session or [], title, artist)
            for raw in session or []:
                c = _normalize_candidate(raw, title, source_prefix="")
                if c:
                    # keep thesession.org as source label
                    if not str(c["source"]).startswith("thesession"):
                        c["source"] = "thesession.org"
                        c["id"] = candidate_id(c["source"], c["abc"])
                    candidates.append(c)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"session:{exc}")

    if do_web and client is not None:
        try:
            from notation_fetch import collect_web_abc_candidates, filter_notation_candidates

            web = await collect_web_abc_candidates(
                client,
                title,
                "traditional_tune",
                artist,
            )
            web = filter_notation_candidates(web or [], title, artist)
            for raw in web or []:
                c = _normalize_candidate(raw, title, source_prefix="search-notation")
                if c:
                    candidates.append(c)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"web:{exc}")

    candidates = _dedupe(candidates)[:max_candidates]
    best = pick_best_candidate(candidates)
    tags = [SITE_TAG]
    section_tag = str(tune.get("sectionTag") or "").strip()
    if section_tag and section_tag not in tags:
        tags.append(section_tag)

    record = {
        "id": f"oldtime-{tune['slug']}",
        "slug": tune["slug"],
        "title": title,
        "key": tune.get("key") or "",
        "notes": notes,
        "section": tune.get("section") or "",
        "sectionTag": section_tag,
        "book": BOOK_NAME,
        "tags": tags,
        "pdfUrl": tune.get("pdfUrl") or "",
        "midiUrl": tune.get("midiUrl") or "",
        "audioUrls": list(tune.get("audioUrls") or []),
        "youtubeUrls": list(tune.get("youtubeUrls") or []),
        "backingUrls": list(tune.get("backingUrls") or []),
        "fingerprint": tune.get("fingerprint") or "",
        "candidates": candidates,
        "selectedCandidateId": (best or {}).get("id") or "",
        "abc": (best or {}).get("abc") or "",
        "abcSource": (best or {}).get("source") or "",
        "status": "has_candidates" if candidates else "needs_notation",
        "reviewed": False,
        "errors": errors,
        "enriched_at": utc_now_iso(),
        "enrich_phase": "search",
    }
    return record


def build_package(records: list[dict]) -> dict:
    with_cand = sum(1 for r in records if r.get("candidates"))
    needs = sum(1 for r in records if not r.get("candidates"))
    midi_avail = sum(1 for r in records if r.get("midiUrl"))
    pdf_avail = sum(1 for r in records if r.get("pdfUrl"))
    return {
        "kind": "oldtimefiddletunes-enrich",
        "version": 1,
        "book": BOOK_NAME,
        "siteTag": SITE_TAG,
        "built_at": utc_now_iso(),
        "tune_count": len(records),
        "tallies": {
            "with_candidates": with_cand,
            "needs_notation": needs,
            "midi_available": midi_avail,
            "pdf_available": pdf_avail,
        },
        "tunes": records,
    }


async def run_async(args: argparse.Namespace) -> int:
    index = load_json(INDEX_PATH, {})
    tunes = list(index.get("tunes") or [])
    if not tunes:
        print(f"No tunes in {INDEX_PATH}; run scrape_index.py first", file=sys.stderr)
        return 1

    if args.offset:
        tunes = tunes[args.offset :]
    if args.limit is not None:
        tunes = tunes[: args.limit]

    ensure_dir(ENRICH_DIR)
    sources = {s.strip().lower() for s in (args.sources or "local,session,web").split(",") if s.strip()}
    do_local = "local" in sources
    do_session = "session" in sources
    do_web = "web" in sources

    if (do_session or do_web) and httpx is None:
        print("httpx is required for session/web enrich", file=sys.stderr)
        return 1

    records_by_slug: dict[str, dict] = {}
    # Load prior package for resume merge
    prior = load_json(PACKAGE_PATH, {})
    for t in prior.get("tunes") or []:
        if t.get("slug"):
            records_by_slug[t["slug"]] = t
    # Also load any per-tune files
    for path in ENRICH_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("slug"):
            records_by_slug[data["slug"]] = data

    client = None
    if do_session or do_web:
        client = httpx.AsyncClient(timeout=60.0, headers={"User-Agent": "abc2book-oldtimefiddletunes/1.0"})

    try:
        total = len(tunes)
        for i, tune in enumerate(tunes):
            slug = tune["slug"]
            out_path = ENRICH_DIR / f"{slug}.json"
            if out_path.is_file() and not args.force:
                existing = load_json(out_path, {})
                if existing.get("enrich_phase") == "search" and "candidates" in existing:
                    records_by_slug[slug] = existing
                    print(f"[{i+1}/{total}] skip {slug}")
                    continue

            print(f"[{i+1}/{total}] enrich {tune.get('title')} ({slug})")
            record = await enrich_one(
                client,
                tune,
                do_local=do_local,
                do_session=do_session,
                do_web=do_web,
                max_candidates=args.max_candidates,
            )
            # Preserve any midi/omr candidates from a prior UI pass
            prev = records_by_slug.get(slug) or {}
            prev_cands = [
                c
                for c in (prev.get("candidates") or [])
                if str(c.get("source") or "").startswith(("midi", "omr"))
            ]
            if prev_cands:
                record["candidates"] = _dedupe(list(record["candidates"]) + prev_cands)
                best = pick_best_candidate(record["candidates"])
                if best and not record.get("reviewed"):
                    record["selectedCandidateId"] = best.get("id") or ""
                    record["abc"] = best.get("abc") or ""
                    record["abcSource"] = best.get("source") or ""
            save_json(out_path, record)
            records_by_slug[slug] = record
            if args.delay > 0:
                await asyncio.sleep(args.delay)
    finally:
        if client is not None:
            await client.aclose()

    # Package strictly in index order (drop orphan enrich files from prior runs)
    ordered = []
    for tune in index.get("tunes") or []:
        slug = tune["slug"]
        if slug in records_by_slug:
            ordered.append(records_by_slug[slug])
        else:
            # Stub so review still lists the tune
            ordered.append({
                "id": f"oldtime-{slug}",
                "slug": slug,
                "title": tune.get("title") or slug,
                "key": tune.get("key") or "",
                "notes": tune.get("notes") or "",
                "section": tune.get("section") or "",
                "sectionTag": tune.get("sectionTag") or "",
                "book": BOOK_NAME,
                "tags": [SITE_TAG] + ([tune["sectionTag"]] if tune.get("sectionTag") else []),
                "pdfUrl": tune.get("pdfUrl") or "",
                "midiUrl": tune.get("midiUrl") or "",
                "audioUrls": list(tune.get("audioUrls") or []),
                "youtubeUrls": list(tune.get("youtubeUrls") or []),
                "backingUrls": list(tune.get("backingUrls") or []),
                "fingerprint": tune.get("fingerprint") or "",
                "candidates": [],
                "selectedCandidateId": "",
                "abc": "",
                "abcSource": "",
                "status": "needs_notation",
                "reviewed": False,
                "errors": ["not_enriched"],
                "enriched_at": utc_now_iso(),
                "enrich_phase": "pending",
            })

    package = build_package(ordered)
    save_json(PACKAGE_PATH, package)
    # Also copy to public for optional static load during review
    public_dir = ensure_dir(REPO_ROOT / "public" / "oldtimefiddletunes")
    save_json(public_dir / "enrich_package.json", package)

    # Auto-build standalone review HTML with package embedded
    try:
        from make_enrich_review_html import (
            DEFAULT_OUT,
            attach_local_media_paths,
            build_html,
            ensure_vendor_abcjs,
        )

        ensure_vendor_abcjs()
        pkg_for_html = attach_local_media_paths(dict(package))
        review_path = DEFAULT_OUT
        review_path.write_text(build_html(pkg_for_html), encoding="utf-8")
        print(f"Review HTML → {review_path}")
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: could not build review HTML: {exc}", file=sys.stderr)

    tallies = package["tallies"]
    print(
        f"Package {PACKAGE_PATH}: {package['tune_count']} tunes "
        f"(candidates={tallies['with_candidates']} needs={tallies['needs_notation']})"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--sources",
        default="local,session,web",
        help="Comma list: local,session,web",
    )
    parser.add_argument("--max-candidates", type=int, default=12)
    parser.add_argument("--delay", type=float, default=0.25)
    args = parser.parse_args(argv)
    return asyncio.run(run_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
