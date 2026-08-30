#!/usr/bin/env python3
"""Later-phase merge: oldtimefiddletunes.abc → scrape/tunes.abc.

Not run as part of the initial scrape. Strategy:

1. Match by % abcbook-tune_id when present in both files.
2. Else match by normalized primary title (unique titles only).
3. On match:
   - Ensure B: old time is present (keep other B: lines).
   - Append tag oldtimefiddletunes.net without dropping existing tags.
   - Merge missing % abcbook-link-* media URLs (by URL).
   - Notation: fill empty body only unless --overwrite-abc.
4. On no match: append the oldtime tune as a new X: block (renumber X:).

Usage:
  python3 scripts/oldtimefiddletunes/merge_into_tunes_abc.py --dry-run
  python3 scripts/oldtimefiddletunes/merge_into_tunes_abc.py --write
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common import (  # noqa: E402
    BOOK_NAME,
    SCRAPE_ABC_PATH,
    SITE_TAG,
    TUNES_ABC_PATH,
    TUNE_ID_RE,
    norm_title,
    primary_title,
    split_tunes,
)

TAGS_RE = re.compile(r"^% abcbook-tags\s+(.*)$", re.M)
LINK_URL_RE = re.compile(r"^% abcbook-link-(\d+)\s+(\S+)", re.M)
BOOK_RE = re.compile(r"^B:\s*(.+)$", re.M)


def books_of(tune: str) -> list[str]:
    return [m.group(1).strip().lower() for m in BOOK_RE.finditer(tune)]


def tags_of(tune: str) -> list[str]:
    m = TAGS_RE.search(tune)
    if not m:
        return []
    return [t.strip() for t in m.group(1).split(",") if t.strip()]


def link_urls(tune: str) -> set[str]:
    return {m.group(2).strip() for m in LINK_URL_RE.finditer(tune)}


def has_note_body(tune: str) -> bool:
    lines = tune.splitlines()
    for line in lines:
        s = line.strip()
        if not s or s.startswith("%") or re.match(r"^[A-Z]:", s) or s.startswith("%%"):
            continue
        return True
    return False


def ensure_book(tune: str, book: str) -> str:
    books = books_of(tune)
    if book.lower() in books:
        return tune
    # insert after K: if possible
    m = re.search(r"^K:.*$", tune, re.M)
    line = f"B: {book}\n"
    if m:
        return tune[: m.end()] + "\n" + line + tune[m.end() :].lstrip("\n")
    return tune.rstrip() + "\n" + line


def ensure_tag(tune: str, tag: str) -> str:
    tags = tags_of(tune)
    if tag in tags:
        return tune
    tags.append(tag)
    line = "% abcbook-tags " + ",".join(tags)
    if TAGS_RE.search(tune):
        return TAGS_RE.sub(line, tune, count=1)
    # after tune_id / lastupdated
    m = re.search(r"^% abcbook-lastupdated.*$", tune, re.M)
    if m:
        return tune[: m.end()] + "\n" + line + tune[m.end() :]
    return tune.rstrip() + "\n" + line + "\n"


def extract_link_blocks(tune: str) -> list[str]:
    """Return full multi-line link comment blocks grouped by index."""
    blocks: dict[int, list[str]] = {}
    for line in tune.splitlines():
        m = re.match(r"^% abcbook-link(?:-([a-z0-9-]+))?-(\d+)\s*(.*)$", line)
        if not m:
            continue
        idx = int(m.group(2))
        blocks.setdefault(idx, []).append(line)
    # preserve order by index
    return ["\n".join(blocks[i]) for i in sorted(blocks)]


def merge_links(dest: str, src: str) -> str:
    existing = link_urls(dest)
    to_add = []
    for block in extract_link_blocks(src):
        m = LINK_URL_RE.search(block)
        if not m:
            continue
        url = m.group(2).strip()
        if url in existing:
            continue
        to_add.append(block)
        existing.add(url)
    if not to_add:
        return dest
    # renumber added links starting after max dest index
    max_idx = -1
    for m in LINK_URL_RE.finditer(dest):
        max_idx = max(max_idx, int(m.group(1)))
    rewritten = []
    next_idx = max_idx + 1
    for block in to_add:
        new_lines = []
        for line in block.splitlines():
            new_lines.append(re.sub(r"^(% abcbook-link(?:-[a-z0-9-]+)?-)(\d+)", rf"\g<1>{next_idx}", line))
        rewritten.append("\n".join(new_lines))
        next_idx += 1
    insert = "\n".join(rewritten) + "\n"
    # before first music line / end
    return dest.rstrip() + "\n" + insert


def replace_body(dest: str, src: str) -> str:
    """Replace dest note body with src body (keep dest headers/meta)."""
    # simplistic: keep everything through last % abcbook- / B: / K: header run
    dest_lines = dest.splitlines()
    header_end = 0
    for i, line in enumerate(dest_lines):
        s = line.strip()
        if (
            not s
            or s.startswith("%")
            or re.match(r"^[A-Za-z]:", s)
            or s.startswith("%%")
        ):
            header_end = i + 1
            continue
        break
    src_lines = src.splitlines()
    body_start = 0
    for i, line in enumerate(src_lines):
        s = line.strip()
        if (
            not s
            or s.startswith("%")
            or re.match(r"^[A-Za-z]:", s)
            or s.startswith("%%")
        ):
            body_start = i + 1
            continue
        body_start = i
        break
    body = "\n".join(src_lines[body_start:]).strip()
    head = "\n".join(dest_lines[:header_end]).rstrip()
    if body:
        return head + "\n" + body + "\n"
    return head + "\n"


def index_tunes(tunes: list[str]) -> tuple[dict[str, int], dict[str, list[int]]]:
    by_id: dict[str, int] = {}
    by_title: dict[str, list[int]] = {}
    for i, tune in enumerate(tunes):
        m = TUNE_ID_RE.search(tune)
        if m:
            by_id[m.group(1)] = i
        title = norm_title(primary_title(tune))
        if title:
            by_title.setdefault(title, []).append(i)
    return by_id, by_title


def renumber(tunes: list[str]) -> list[str]:
    out = []
    for i, tune in enumerate(tunes, start=1):
        out.append(re.sub(r"^X:\s*\d+", f"X:{i}", tune, count=1, flags=re.M))
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oldtime", type=Path, default=SCRAPE_ABC_PATH)
    parser.add_argument("--tunes", type=Path, default=TUNES_ABC_PATH)
    parser.add_argument("--write", action="store_true", help="Write tunes.abc in place")
    parser.add_argument("--dry-run", action="store_true", help="Report only (default)")
    parser.add_argument("--overwrite-abc", action="store_true")
    args = parser.parse_args(argv)
    if not args.write:
        args.dry_run = True

    if not args.oldtime.is_file():
        print(f"Missing {args.oldtime}", file=sys.stderr)
        return 1
    if not args.tunes.is_file():
        print(f"Missing {args.tunes}", file=sys.stderr)
        return 1

    old_text = args.oldtime.read_text(encoding="utf-8", errors="replace")
    tunes_text = args.tunes.read_text(encoding="utf-8", errors="replace")
    old_tunes = split_tunes(old_text)
    dest_tunes = split_tunes(tunes_text)
    by_id, by_title = index_tunes(dest_tunes)

    merged = updated = inserted = 0
    for src in old_tunes:
        m = TUNE_ID_RE.search(src)
        tid = m.group(1) if m else ""
        title = norm_title(primary_title(src))
        dest_idx = None
        if tid and tid in by_id:
            dest_idx = by_id[tid]
        elif title and len(by_title.get(title) or []) == 1:
            dest_idx = by_title[title][0]

        if dest_idx is None:
            inserted += 1
            if not args.dry_run:
                dest_tunes.append(src)
                if tid:
                    by_id[tid] = len(dest_tunes) - 1
                if title:
                    by_title.setdefault(title, []).append(len(dest_tunes) - 1)
            continue

        dest = dest_tunes[dest_idx]
        next_tune = ensure_book(dest, BOOK_NAME)
        next_tune = ensure_tag(next_tune, SITE_TAG)
        next_tune = merge_links(next_tune, src)
        if args.overwrite_abc or not has_note_body(next_tune):
            if has_note_body(src):
                next_tune = replace_body(next_tune, src)
        if next_tune != dest:
            updated += 1
            if not args.dry_run:
                dest_tunes[dest_idx] = next_tune
        merged += 1

    print(
        f"oldtime={len(old_tunes)} matched={merged} updated={updated} "
        f"insert={inserted} overwrite_abc={args.overwrite_abc}"
    )
    if args.dry_run:
        print("Dry run only; pass --write to modify scrape/tunes.abc")
        return 0

    # Preserve preamble before first X:
    preamble = ""
    m = re.search(r"^X:\s*\d+", tunes_text, re.M)
    if m and m.start() > 0:
        preamble = tunes_text[: m.start()]
    body = "\n".join(renumber(dest_tunes))
    if not body.endswith("\n"):
        body += "\n"
    args.tunes.write_text(preamble + body, encoding="utf-8")
    print(f"Wrote {args.tunes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
