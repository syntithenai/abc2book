#!/usr/bin/env python3
"""Mirror John Chambers regional ABC directories (Sweden, Klezmer, Balkan, …)."""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    INCOMING,
    ensure_dir,
    extract_hrefs,
    fetch_to_file,
    load_manifest,
    polite_sleep,
    request,
    save_manifest,
)

DEFAULT_JC_ROOT = "http://trillian.mit.edu/~jc/music/abc/"
DEFAULT_REGIONS = (
    "Sweden",
    "Klezmer",
    "Balkan",
    "Scand",
    "Intl",
    "Italy",
)
# Map local May-2023 jc/ dump folders → regional staging names when live host is down.
DUMP_SEED_MAP = {
    "allklez": "Klezmer",
    "balk1": "Balkan/balk1",
    "balk2": "Balkan/balk2",
    "intl": "Intl",
    "isra": "Intl/isra",
}


def local_path_for(url: str, staging: Path) -> Path:
    parsed = urlparse(url)
    rel = parsed.path
    marker = "/music/abc/"
    if marker in rel:
        rel = rel.split(marker, 1)[1]
    rel = rel.lstrip("/")
    return staging / "files" / rel


def seed_from_jc_dump(staging: Path) -> dict:
    """Copy continental folders from abcresources/jc into staging (offline fallback)."""
    import shutil

    from common import ABCRESOURCES

    jc = ABCRESOURCES / "jc"
    stats = {"copied": 0, "skipped": 0, "missing": []}
    files_root = ensure_dir(staging / "files")
    for src_name, dest_rel in DUMP_SEED_MAP.items():
        src = jc / src_name
        if not src.is_dir():
            stats["missing"].append(src_name)
            continue
        dest = files_root / dest_rel
        ensure_dir(dest)
        for path in src.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".abc", ".txt"} and ".abc" not in path.name.lower():
                continue
            rel = path.relative_to(src)
            out = dest / rel
            ensure_dir(out.parent)
            if out.exists() and out.stat().st_size == path.stat().st_size:
                stats["skipped"] += 1
                continue
            shutil.copy2(path, out)
            stats["copied"] += 1
    print(f"seed_from_jc_dump: {stats}")
    return stats


def crawl_region(
    region: str,
    staging: Path,
    entries: dict,
    *,
    jc_root: str,
    delay: float,
    force: bool,
    limit: int = 0,
) -> dict:
    root = jc_root.rstrip("/") + "/" + region.strip("/") + "/"
    queue: deque[str] = deque([root])
    seen_pages: set[str] = set()
    stats = {"pages": 0, "fetched": 0, "not_modified": 0, "errors": 0, "abc_links": 0}

    def under_region(href: str) -> bool:
        h = href.replace("https://", "http://")
        r = root.replace("https://", "http://")
        return h.startswith(r.rstrip("/"))

    while queue:
        page = queue.popleft()
        if page in seen_pages:
            continue
        seen_pages.add(page)
        status, _meta, body = request(page)
        polite_sleep(delay)
        stats["pages"] += 1
        if status == 0 or status >= 400:
            stats["errors"] += 1
            print(f"  page ERR {status} {page}")
            continue
        html = body.decode("utf-8", errors="replace")
        for href in extract_hrefs(html, page):
            if not under_region(href):
                continue
            lower = href.lower()
            if lower.endswith("/"):
                if href not in seen_pages:
                    queue.append(href if href.endswith("/") else href + "/")
                continue
            if not (lower.endswith(".abc") or lower.endswith(".abc.txt")):
                continue
            stats["abc_links"] += 1
            dest = local_path_for(href, staging)
            try:
                result = fetch_to_file(
                    href,
                    dest,
                    manifest_entry=entries.get(href),
                    delay=delay,
                    force=force,
                )
            except Exception as exc:
                stats["errors"] += 1
                print(f"  fetch exception {href}: {exc}")
                continue
            entries[href] = {k: v for k, v in result.items() if k != "error"}
            st = result.get("status")
            if st == "fetched":
                stats["fetched"] += 1
                if stats["fetched"] % 50 == 0:
                    print(f"  [{region}] fetched {stats['fetched']}…")
            elif st == "not_modified":
                stats["not_modified"] += 1
            else:
                stats["errors"] += 1
            if limit and (stats["fetched"] + stats["not_modified"]) >= limit:
                return stats
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--regions",
        default=",".join(DEFAULT_REGIONS),
        help="Comma-separated region folder names under ~jc/music/abc/",
    )
    parser.add_argument("--base-url", default=DEFAULT_JC_ROOT, help="JC abc root URL")
    parser.add_argument("--delay", type=float, default=0.55)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Max ABC files per region (0=all)")
    parser.add_argument(
        "--seed-from-dump",
        action="store_true",
        help="Copy allklez/balk*/intl/isra from abcresources/jc into staging first",
    )
    parser.add_argument(
        "--skip-crawl",
        action="store_true",
        help="Only seed from dump (no live crawl)",
    )
    args = parser.parse_args()

    staging = ensure_dir(INCOMING / "jc_regional")
    manifest = load_manifest("jc_regional")
    entries = manifest.setdefault("entries", {})
    regions = [part.strip() for part in args.regions.split(",") if part.strip()]
    jc_root = args.base_url.rstrip("/") + "/"

    if args.seed_from_dump or args.skip_crawl:
        seed_from_jc_dump(staging)
        manifest["seeded_from_dump_at"] = __import__("common", fromlist=["utc_now_iso"]).utc_now_iso()
        save_manifest("jc_regional", manifest)

    if args.skip_crawl:
        print("Skip crawl; staging ready for normalize.")
        return 0

    for region in regions:
        print(f"=== JC region {region} ({jc_root}) ===")
        stats = crawl_region(
            region,
            staging,
            entries,
            jc_root=jc_root,
            delay=args.delay,
            force=args.force,
            limit=args.limit,
        )
        print(f"  done {region}: {stats}")
        save_manifest("jc_regional", manifest)

    save_manifest("jc_regional", manifest)
    print("Wrote", INCOMING / "jc_regional" / "manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
