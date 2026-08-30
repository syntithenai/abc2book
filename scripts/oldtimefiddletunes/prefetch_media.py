#!/usr/bin/env python3
"""Prefetch MIDI + PDF files for offline review (eurosession-style local assets).

Downloads into data/media/{slug}.mid and data/media/{slug}.pdf, then patches
enrich_package.json with localMidiPath / localPdfPath relative paths.

  python3 scripts/oldtimefiddletunes/prefetch_media.py
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common import (  # noqa: E402
    INDEX_PATH,
    MEDIA_DIR,
    PACKAGE_PATH,
    USER_AGENT,
    ensure_dir,
    load_json,
    save_json,
    utc_now_iso,
)


def download(url: str, dest: Path, *, force: bool = False) -> str:
    """Return status: ok|skip|fail."""
    if dest.is_file() and dest.stat().st_size > 0 and not force:
        return "skip"
    ensure_dir(dest.parent)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        print(f"  FAIL {url}: {exc}", file=sys.stderr)
        return "fail"
    if not data:
        print(f"  FAIL empty {url}", file=sys.stderr)
        return "fail"
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return "ok"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.15)
    parser.add_argument("--midi-only", action="store_true")
    parser.add_argument("--pdf-only", action="store_true")
    args = parser.parse_args(argv)

    index = load_json(INDEX_PATH, {})
    tunes = list(index.get("tunes") or [])
    if not tunes:
        # Fall back to package
        pkg = load_json(PACKAGE_PATH, {})
        tunes = list(pkg.get("tunes") or [])
    if not tunes:
        print("No tunes in index/package; run scrape_index.py first", file=sys.stderr)
        return 1
    if args.limit is not None:
        tunes = tunes[: args.limit]

    ensure_dir(MEDIA_DIR)
    stats = {"midi_ok": 0, "midi_skip": 0, "midi_fail": 0, "pdf_ok": 0, "pdf_skip": 0, "pdf_fail": 0}
    local_by_slug: dict[str, dict] = {}

    for i, tune in enumerate(tunes):
        slug = str(tune.get("slug") or "").strip()
        if not slug:
            continue
        title = tune.get("title") or slug
        print(f"[{i+1}/{len(tunes)}] {title}")
        entry = local_by_slug.setdefault(slug, {})
        midi_url = str(tune.get("midiUrl") or "").strip()
        pdf_url = str(tune.get("pdfUrl") or "").strip()

        if midi_url and not args.pdf_only:
            dest = MEDIA_DIR / f"{slug}.mid"
            st = download(midi_url, dest, force=args.force)
            stats[f"midi_{st}"] = stats.get(f"midi_{st}", 0) + 1
            if dest.is_file() and dest.stat().st_size > 0:
                entry["localMidiPath"] = f"media/{slug}.mid"

        if pdf_url and not args.midi_only:
            dest = MEDIA_DIR / f"{slug}.pdf"
            st = download(pdf_url, dest, force=args.force)
            stats[f"pdf_{st}"] = stats.get(f"pdf_{st}", 0) + 1
            if dest.is_file() and dest.stat().st_size > 0:
                entry["localPdfPath"] = f"media/{slug}.pdf"

        if args.delay > 0:
            time.sleep(args.delay)

    # Patch enrich package if present
    pkg = load_json(PACKAGE_PATH, {})
    if pkg.get("tunes"):
        for t in pkg["tunes"]:
            slug = t.get("slug")
            loc = local_by_slug.get(slug) or {}
            if loc.get("localMidiPath"):
                t["localMidiPath"] = loc["localMidiPath"]
            if loc.get("localPdfPath"):
                t["localPdfPath"] = loc["localPdfPath"]
        pkg["media_prefetched_at"] = utc_now_iso()
        save_json(PACKAGE_PATH, pkg)
        print(f"Patched {PACKAGE_PATH}")

    print(
        "Done:",
        f"midi ok={stats['midi_ok']} skip={stats['midi_skip']} fail={stats['midi_fail']};",
        f"pdf ok={stats['pdf_ok']} skip={stats['pdf_skip']} fail={stats['pdf_fail']}",
    )
    print(f"Media dir: {MEDIA_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
