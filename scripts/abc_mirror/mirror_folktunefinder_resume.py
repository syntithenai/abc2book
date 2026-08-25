#!/usr/bin/env python3
"""Resume FolkTuneFinder ID scrape from LAST_SEARCH (new IDs only).

Expect Cloudflare friction; use --limit for short runs. Skips IDs that already
exist under abcresources/folktunefinder/.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    ABCRESOURCES,
    INCOMING,
    ensure_dir,
    load_manifest,
    polite_sleep,
    request,
    save_manifest,
    utc_now_iso,
)

FTF_TUNE = "https://www.folktunefinder.com/tunes/{id}"
PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")


def read_last_search() -> int:
    path = ABCRESOURCES / "LAST_SEARCH_folktunefinder.txt"
    if not path.is_file():
        return 1
    text = path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"INDEX:\s*(\d+)", text)
    return int(match.group(1)) if match else 1


def existing_ids() -> set[int]:
    folder = ABCRESOURCES / "folktunefinder"
    ids: set[int] = set()
    if not folder.is_dir():
        return ids
    for path in folder.glob("abc_tune_folktunefinder_*.txt"):
        match = re.match(r"abc_tune_folktunefinder_(\d+)\.txt$", path.name)
        if match:
            ids.add(int(match.group(1)))
    return ids


def extract_abc(html: str) -> str | None:
    for pre in PRE_RE.findall(html or ""):
        text = TAG_RE.sub("", pre)
        text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        if "X:" in text and re.search(r"^K:", text, re.M):
            return text.strip()
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, default=0, help="Start ID (0=resume from LAST_SEARCH)")
    parser.add_argument("--limit", type=int, default=200, help="Max new IDs to attempt")
    parser.add_argument("--max-empty", type=int, default=80)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--write-live", action="store_true", help="Write into abcresources/folktunefinder (default: staging)")
    args = parser.parse_args()

    start = args.start or (read_last_search() + 1)
    have = existing_ids()
    staging = ensure_dir(INCOMING / "ftf")
    out_dir = (ABCRESOURCES / "folktunefinder") if args.write_live else ensure_dir(staging / "new")
    ensure_dir(out_dir)

    manifest = load_manifest("ftf")
    entries = manifest.setdefault("entries", {})
    print(f"FTF resume start={start} existing={len(have)} limit={args.limit}")

    empty = 0
    fetched = 0
    skipped = 0
    blocked = 0
    tune_id = start
    attempted = 0

    while attempted < args.limit and empty < args.max_empty:
        attempted += 1
        if tune_id in have:
            skipped += 1
            tune_id += 1
            continue
        url = FTF_TUNE.format(id=tune_id)
        status, meta, body = request(url, timeout=40.0)
        polite_sleep(args.delay)
        ctype = (meta.get("content-type") or "").lower()
        text = body.decode("utf-8", errors="replace")
        if status == 403 or "cloudflare" in text.lower() or "cf-challenge" in text.lower():
            blocked += 1
            print(f"  blocked/challenged at id={tune_id} HTTP {status}")
            entries[url] = {"status": "blocked", "http_status": status, "fetched_at": utc_now_iso()}
            # Stop early on sustained blocks
            if blocked >= 5:
                print("Too many Cloudflare blocks; stopping. Re-run later or with browser cookies.")
                break
            tune_id += 1
            continue
        if status == 404 or status >= 400:
            empty += 1
            entries[url] = {"status": "empty", "http_status": status, "fetched_at": utc_now_iso()}
            tune_id += 1
            continue
        abc = extract_abc(text)
        if not abc:
            empty += 1
            entries[url] = {"status": "empty_html", "http_status": status, "fetched_at": utc_now_iso()}
            tune_id += 1
            continue
        empty = 0
        dest = out_dir / f"abc_tune_folktunefinder_{tune_id}.txt"
        payload = abc + f"\nS:https://www.folktunefinder.com/tunes/{tune_id}\n"
        dest.write_text(payload, encoding="utf-8")
        entries[url] = {
            "status": "fetched",
            "local_path": str(dest),
            "fetched_at": utc_now_iso(),
            "bytes": dest.stat().st_size,
            "http_status": status,
            "content_type": ctype,
        }
        fetched += 1
        if fetched % 25 == 0:
            print(f"  fetched {fetched} (at id {tune_id})")
        tune_id += 1

    # Update LAST_SEARCH pointer in staging (and optionally live)
    last_path = staging / "LAST_SEARCH_folktunefinder.txt"
    last_path.write_text(f"INDEX:{tune_id - 1}\nERR:0\nEMPTY:{empty}\n", encoding="utf-8")
    if args.write_live:
        (ABCRESOURCES / "LAST_SEARCH_folktunefinder.txt").write_text(
            f"INDEX:{tune_id - 1}\nERR:0\nEMPTY:{empty}\n",
            encoding="utf-8",
        )

    save_manifest("ftf", manifest)
    print(f"FTF done fetched={fetched} skipped_existing={skipped} empty={empty} blocked={blocked} next_id={tune_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
