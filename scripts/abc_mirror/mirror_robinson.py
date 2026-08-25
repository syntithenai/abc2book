#!/usr/bin/env python3
"""Mirror ABC files from Richard Robinson's Tunebook via Tunelist pagination."""

from __future__ import annotations

import argparse
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    INCOMING,
    ensure_dir,
    extract_hrefs,
    fetch_to_file,
    load_manifest,
    polite_sleep,
    save_manifest,
)

BASE = "http://richardrobinson.tunebook.org.uk/"
TUNELIST = urljoin(BASE, "scripts/Tunelist.py")
TUNE_HTML_RE = re.compile(r"/tunes/+(\d+)/+(\d+)/+(\d+)_([^\"'>\s]+)\.html", re.I)


def same_host(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return "richardrobinson.tunebook.org.uk" in host or host.endswith("tunebook.org.uk")


def html_to_abc_url(html_url: str) -> str | None:
    if html_url.lower().endswith(".html"):
        return html_url[:-5] + ".abc"
    return None


def local_path_for(abc_url: str, staging: Path) -> Path:
    # /tunes//20/57//20573_Name.abc → 20573_Name.abc
    name = Path(urlparse(abc_url).path).name
    match = re.match(r"(\d+)_", name)
    sub = match.group(1)[:2] if match else "xx"
    return staging / "files" / sub / name


def collect_tune_html_urls(max_pages: int, delay: float, pagesize: int = 1000) -> list[str]:
    """Walk Tunelist via POST pageoffset pagination."""
    import urllib.parse
    import urllib.request

    from common import USER_AGENT

    found: list[str] = []
    seen: set[str] = set()

    def harvest(page_html: str) -> None:
        for href in extract_hrefs(page_html, TUNELIST):
            absolute = urljoin(BASE, href)
            if not same_host(absolute):
                continue
            if ".html" not in absolute.lower() or "/tunes/" not in absolute.lower():
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            found.append(absolute)

    def fetch_offset(offset: int) -> str:
        data = urllib.parse.urlencode({
            "pagesize": str(pagesize),
            "pageoffset": str(offset),
        }).encode()
        req = urllib.request.Request(
            TUNELIST,
            data=data,
            headers={"User-Agent": USER_AGENT},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            return resp.read().decode("utf-8", errors="replace")

    try:
        first = fetch_offset(0)
    except Exception as exc:
        print(f"Tunelist failed: {exc}")
        return []
    polite_sleep(delay)
    inst = re.search(r"(\d+)\s+instances", first, re.I)
    total_instances = int(inst.group(1)) if inst else pagesize
    offsets = list(range(0, total_instances, pagesize))
    if max_pages > 0:
        offsets = offsets[:max_pages]
    print(
        f"Tunelist: {total_instances} instances, pagesize={pagesize}, "
        f"fetching {len(offsets)} pages",
        flush=True,
    )
    harvest(first)
    for i, offset in enumerate(offsets[1:], start=2):
        try:
            html = fetch_offset(offset)
        except Exception as exc:
            print(f"  offset {offset} failed: {exc}", flush=True)
            continue
        polite_sleep(delay)
        before = len(found)
        harvest(html)
        if i % 2 == 0 or len(found) == before:
            print(
                f"  list page {i}/{len(offsets)} offset={offset} tunes={len(found)}",
                flush=True,
            )
        if len(found) == before and i > 2:
            break
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--delay", type=float, default=0.15)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--max-pages", type=int, default=20, help="Max Tunelist pages (pagesize 1000)")
    parser.add_argument("--pagesize", type=int, default=1000)
    parser.add_argument("--limit", type=int, default=0, help="Max ABC downloads (0=all)")
    parser.add_argument("--workers", type=int, default=6, help="Parallel ABC download workers")
    args = parser.parse_args()

    staging = ensure_dir(INCOMING / "robinson")
    manifest = load_manifest("robinson")
    entries = manifest.setdefault("entries", {})

    print("Collecting Robinson tune HTML URLs from Tunelist…", flush=True)
    html_urls = collect_tune_html_urls(args.max_pages, args.delay, pagesize=args.pagesize)
    abc_urls = []
    seen = set()
    for html_url in html_urls:
        abc = html_to_abc_url(html_url)
        if not abc or abc in seen:
            continue
        seen.add(abc)
        abc_urls.append(abc)
    print(f"Derived {len(abc_urls)} ABC URLs from {len(html_urls)} tune pages", flush=True)
    if args.limit:
        abc_urls = abc_urls[: args.limit]

    lock = threading.Lock()
    counters = {"fetched": 0, "skipped": 0, "errors": 0, "done": 0}

    def one(url: str) -> None:
        dest = local_path_for(url, staging)
        with lock:
            entry = entries.get(url)
        result = fetch_to_file(
            url,
            dest,
            manifest_entry=entry,
            delay=args.delay,
            force=args.force,
        )
        st = result.get("status")
        with lock:
            entries[url] = {k: v for k, v in result.items() if k != "error"}
            if st == "fetched":
                if dest.is_file():
                    head = dest.read_bytes()[:120].decode("utf-8", errors="replace")
                    if "<html" in head.lower() and "X:" not in head:
                        counters["errors"] += 1
                        dest.unlink(missing_ok=True)
                    else:
                        counters["fetched"] += 1
                else:
                    counters["errors"] += 1
            elif st == "not_modified":
                counters["skipped"] += 1
            else:
                counters["errors"] += 1
            counters["done"] += 1
            if counters["done"] % 100 == 0:
                print(
                    f"  {counters['done']}/{len(abc_urls)} "
                    f"fetched={counters['fetched']} skip={counters['skipped']} "
                    f"err={counters['errors']}",
                    flush=True,
                )
                save_manifest("robinson", manifest)

    workers = max(1, args.workers)
    print(f"Downloading with workers={workers} delay={args.delay}s", flush=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, url) for url in abc_urls]
        for fut in as_completed(futures):
            exc = fut.exception()
            if exc:
                with lock:
                    counters["errors"] += 1
                print(f"  worker error: {exc}", flush=True)

    save_manifest("robinson", manifest)
    print(
        f"Robinson done fetched={counters['fetched']} "
        f"not_modified={counters['skipped']} errors={counters['errors']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
