#!/usr/bin/env python3
"""Normalize mirrored packs into abcresources abc_tune_* layouts."""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    ABCRESOURCES,
    INCOMING,
    ensure_dir,
    extract_title,
    split_abc_tunes,
)

PRE_RE = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def extract_abc_from_maybe_html(text: str) -> list[str]:
    if "<html" in text.lower() or "<pre" in text.lower():
        blocks = []
        for pre in PRE_RE.findall(text):
            plain = TAG_RE.sub("", pre)
            plain = plain.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
            blocks.extend(split_abc_tunes(plain))
        if blocks:
            return blocks
    return split_abc_tunes(text)


def write_split_tunes(tunes: list[str], out_dir: Path, prefix: str, start_id: int = 1) -> int:
    ensure_dir(out_dir)
    # Clear old numbered files for a clean replace when requested by caller.
    n = start_id
    for abc in tunes:
        if "K:" not in abc.upper():
            continue
        # Ensure X: header
        body = abc.strip()
        if not re.search(r"^X:\s*\d+", body, re.M):
            body = f"X:{n}\n" + body
        path = out_dir / f"{prefix}{n}.abc"
        path.write_text(body + "\n", encoding="utf-8")
        n += 1
    return n - start_id


def normalize_norbeck(*, replace: bool) -> int:
    staging = INCOMING / "norbeck"
    out_dir = ABCRESOURCES / "norbeck"
    if replace and out_dir.exists():
        # Keep a backup once
        bak = ABCRESOURCES / "norbeck_backup_pre_mirror"
        if not bak.exists():
            shutil.copytree(out_dir, bak)
        for old in out_dir.glob("abc_tune_norbeck_*.abc"):
            old.unlink()
    ensure_dir(out_dir)

    sources: list[Path] = []
    unzipped = staging / "unzipped"
    packs = staging / "packs"
    if unzipped.is_dir():
        sources.extend(sorted(unzipped.rglob("*.abc")))
        sources.extend(sorted(unzipped.rglob("*.txt")))
    if packs.is_dir():
        sources.extend(sorted(packs.glob("*.abc")))
        sources.extend(sorted(packs.glob("*.txt")))

    all_tunes: list[str] = []
    for path in sources:
        try:
            text = read_text(path)
        except OSError:
            continue
        all_tunes.extend(extract_abc_from_maybe_html(text))

    # Deduplicate by title+first 80 note chars
    seen = set()
    unique = []
    for abc in all_tunes:
        title = extract_title(abc).lower()
        key = title + "|" + re.sub(r"\s+", "", abc)[:120]
        if key in seen:
            continue
        seen.add(key)
        unique.append(abc)

    count = write_split_tunes(unique, out_dir, "abc_tune_norbeck_", start_id=1)
    print(f"norbeck: wrote {count} tunes from {len(sources)} source files")
    return count


def normalize_jc_regional() -> int:
    staging = INCOMING / "jc_regional" / "files"
    out_dir = ensure_dir(ABCRESOURCES / "jc_regional")
    # Stable numeric ids from sorted relative paths
    files = sorted(staging.rglob("*.abc")) if staging.is_dir() else []
    files += sorted(staging.rglob("*.abc.txt")) if staging.is_dir() else []
    # Clear previous normalized set
    for old in out_dir.glob("abc_tune_jc_regional_*.abc"):
        old.unlink()

    n = 0
    for path in files:
        try:
            text = read_text(path)
        except OSError:
            continue
        tunes = extract_abc_from_maybe_html(text)
        if not tunes:
            continue
        # One file may contain multiple tunes; keep as separate outputs
        for abc in tunes:
            if "K:" not in abc.upper():
                continue
            n += 1
            body = abc.strip()
            if not re.search(r"^X:\s*\d+", body, re.M):
                body = f"X:{n}\n" + body
            # Annotate source path
            rel = path.relative_to(staging).as_posix()
            if "S:" not in body:
                body += f"\nS:https://trillian.mit.edu/~jc/music/abc/{rel}\n"
            (out_dir / f"abc_tune_jc_regional_{n}.abc").write_text(body + "\n", encoding="utf-8")
    print(f"jc_regional: wrote {n} tunes from {len(files)} files")
    return n


def normalize_robinson() -> int:
    staging = INCOMING / "robinson"
    out_dir = ensure_dir(ABCRESOURCES / "robinson")
    for old in out_dir.glob("abc_tune_robinson_*.abc"):
        old.unlink()

    files: list[Path] = []
    for sub in ("files", "embedded", "pages"):
        folder = staging / sub
        if folder.is_dir():
            files.extend(sorted(folder.rglob("*")))

    n = 0
    for path in files:
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".abc", ".txt", ".html", ""}:
            continue
        try:
            text = read_text(path)
        except OSError:
            continue
        tunes = extract_abc_from_maybe_html(text)
        for abc in tunes:
            if "K:" not in abc.upper():
                continue
            n += 1
            body = abc.strip()
            if not re.search(r"^X:\s*\d+", body, re.M):
                body = f"X:{n}\n" + body
            (out_dir / f"abc_tune_robinson_{n}.abc").write_text(body + "\n", encoding="utf-8")
    print(f"robinson: wrote {n} tunes")
    return n


def normalize_ftf_staging() -> int:
    staging = INCOMING / "ftf" / "new"
    live = ABCRESOURCES / "folktunefinder"
    if not staging.is_dir():
        print("ftf: no staging new/ dir")
        return 0
    ensure_dir(live)
    copied = 0
    for path in staging.glob("abc_tune_folktunefinder_*.txt"):
        dest = live / path.name
        if dest.exists():
            continue
        shutil.copy2(path, dest)
        copied += 1
    print(f"ftf: copied {copied} new files into folktunefinder/")
    return copied


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sources",
        default="norbeck,jc_regional,robinson,ftf",
        help="Comma list: norbeck,jc_regional,robinson,ftf",
    )
    parser.add_argument("--replace-norbeck", action="store_true", default=True)
    parser.add_argument("--no-replace-norbeck", action="store_true")
    args = parser.parse_args()
    replace = args.replace_norbeck and not args.no_replace_norbeck
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    total = 0
    if "norbeck" in sources:
        total += normalize_norbeck(replace=replace)
    if "jc_regional" in sources:
        total += normalize_jc_regional()
    if "robinson" in sources:
        total += normalize_robinson()
    if "ftf" in sources:
        total += normalize_ftf_staging()
    print(f"normalize total items touched≈{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
