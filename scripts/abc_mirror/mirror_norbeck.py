#!/usr/bin/env python3
"""Mirror Henrik Norbeck's official ABC packs (zip + individual files)."""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    INCOMING,
    ensure_dir,
    extract_hrefs,
    fetch_to_file,
    load_manifest,
    request,
    save_manifest,
)

NORBECK_BASE = "https://norbeck.nu/abc/"
DOWNLOAD_PAGE = NORBECK_BASE + "download.asp"
ZIP_NAME = "hn202601.zip"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--delay", type=float, default=0.4)
    args = parser.parse_args()

    staging = ensure_dir(INCOMING / "norbeck")
    packs_dir = ensure_dir(staging / "packs")
    zip_dir = ensure_dir(staging / "zip")
    manifest = load_manifest("norbeck")
    entries = manifest.setdefault("entries", {})

    print("Fetching Norbeck download page…")
    status, _meta, body = request(DOWNLOAD_PAGE)
    if status >= 400:
        print(f"ERROR download page HTTP {status}", file=sys.stderr)
        return 1
    html = body.decode("utf-8", errors="replace")
    (staging / "download.asp.html").write_text(html, encoding="utf-8")

    hrefs = extract_hrefs(html, DOWNLOAD_PAGE)
    abc_packs = []
    zip_urls = []
    for url in hrefs:
        lower = url.lower()
        if lower.endswith(".zip"):
            zip_urls.append(url)
        elif re.search(r"/[ism]/[^/]+\.abc$", lower) or lower.endswith(".abc"):
            # Packs under i/, s/, m/ (and any other .abc on download page)
            path = url.split("norbeck.nu/abc/", 1)[-1]
            if "/" in path and path.count("/") == 1:
                abc_packs.append(url)

    if not zip_urls:
        zip_urls = [NORBECK_BASE + ZIP_NAME]

    # Prefer official zip first.
    for zip_url in zip_urls[:1]:
        name = Path(urllib_name(zip_url))
        dest = zip_dir / name.name
        print(f"ZIP {zip_url}")
        result = fetch_to_file(
            zip_url,
            dest,
            manifest_entry=entries.get(zip_url),
            delay=args.delay,
            force=args.force,
        )
        entries[zip_url] = {k: v for k, v in result.items() if k != "error"}
        print(f"  -> {result.get('status')} {result.get('bytes')} bytes")
        if result.get("status") == "fetched" and dest.is_file():
            extract_dir = ensure_dir(staging / "unzipped")
            with zipfile.ZipFile(dest, "r") as zf:
                zf.extractall(extract_dir)
            print(f"  extracted to {extract_dir}")

    # Also fetch individual packs listed on the page (cheap + updateable).
    abc_packs = sorted(set(abc_packs))
    print(f"Fetching {len(abc_packs)} pack .abc files…")
    fetched = skipped = errors = 0
    for url in abc_packs:
        rel = url.split("/abc/", 1)[-1]
        dest = packs_dir / rel.replace("/", "__")
        result = fetch_to_file(
            url,
            dest,
            manifest_entry=entries.get(url),
            delay=args.delay,
            force=args.force,
        )
        entries[url] = {k: v for k, v in result.items() if k != "error"}
        st = result.get("status")
        if st == "fetched":
            fetched += 1
        elif st == "not_modified":
            skipped += 1
        else:
            errors += 1
            print(f"  ERR {url}: {result}")
    print(f"packs fetched={fetched} not_modified={skipped} errors={errors}")

    save_manifest("norbeck", manifest)
    print("Wrote", manifest_path_str())
    return 0 if errors == 0 else 2


def urllib_name(url: str) -> str:
    from urllib.parse import urlparse

    return Path(urlparse(url).path).name or "download.bin"


def manifest_path_str() -> str:
    from common import manifest_path

    return str(manifest_path("norbeck"))


if __name__ == "__main__":
    raise SystemExit(main())
