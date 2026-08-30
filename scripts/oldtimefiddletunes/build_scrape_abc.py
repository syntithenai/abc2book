#!/usr/bin/env python3
"""Build scrape/oldtimefiddletunes.abc from enrich package / reviewed selections."""

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
    PACKAGE_PATH,
    SCRAPE_ABC_PATH,
    SITE_TAG,
    SRC_URL,
    TUNES_ABC_PATH,
    TUNE_ID_RE,
    load_json,
    norm_title,
    now_ms,
    parse_youtube_start,
    pick_best_candidate,
    primary_title,
    split_tunes,
)


def load_existing_ids(abc_path: Path) -> dict[str, str]:
    """slug or title → tune_id from an existing ABC file."""
    out: dict[str, str] = {}
    if not abc_path.is_file():
        return out
    text = abc_path.read_text(encoding="utf-8", errors="replace")
    for tune in split_tunes(text):
        m = TUNE_ID_RE.search(tune)
        if not m:
            continue
        tid = m.group(1)
        title = norm_title(primary_title(tune))
        slug_m = re.search(r"^% abcbook-oldtime-slug\s+(\S+)", tune, re.M)
        if slug_m:
            out[f"slug:{slug_m.group(1)}"] = tid
        if title and f"title:{title}" not in out:
            out[f"title:{title}"] = tid
    return out


def load_tunes_abc_title_ids() -> dict[str, str]:
    out: dict[str, str] = {}
    if not TUNES_ABC_PATH.is_file():
        return out
    text = TUNES_ABC_PATH.read_text(encoding="utf-8", errors="replace")
    for tune in split_tunes(text):
        title = norm_title(primary_title(tune))
        m = TUNE_ID_RE.search(tune)
        if title and m and title not in out:
            out[title] = m.group(1)
    return out


def resolve_tune_id(record: dict, prior: dict[str, str], tunes_map: dict[str, str]) -> str:
    slug = record.get("slug") or ""
    if f"slug:{slug}" in prior:
        return prior[f"slug:{slug}"]
    title = norm_title(record.get("title") or "")
    if f"title:{title}" in prior:
        return prior[f"title:{title}"]
    if title and title in tunes_map:
        return tunes_map[title]
    return f"oldtimefiddle-{slug}"


def strip_body_headers(abc: str) -> str:
    """Return note body lines (drop leading headers we will rewrite)."""
    lines = str(abc or "").replace("\r\n", "\n").split("\n")
    body_start = 0
    header_prefixes = (
        "X:", "T:", "C:", "R:", "M:", "L:", "Q:", "K:", "B:", "N:", "S:", "Z:",
        "P:", "G:", "H:", "O:", "A:", "F:", "W:", "w:", "I:", "V:", "%%", "%",
    )
    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue
        if s.startswith("%"):
            continue
        if any(s.startswith(p) for p in ("X:", "T:", "C:", "R:", "M:", "L:", "Q:", "K:", "B:", "N:", "S:", "Z:", "P:", "G:", "H:", "O:", "A:", "F:", "I:", "V:")):
            body_start = i + 1
            continue
        # first music line
        body_start = i
        break
    else:
        return ""
    # Keep W: lyrics if present in remainder
    return "\n".join(lines[body_start:]).strip()


def extract_header_field(abc: str, field: str) -> str:
    m = re.search(rf"^{field}:(.*)$", abc or "", re.M)
    return m.group(1).strip() if m else ""


def build_links(record: dict) -> list[str]:
    lines: list[str] = []
    idx = 0

    def add(url: str, title: str, *, media_kind: str | None = None, start_at: int | None = None):
        nonlocal idx
        if not url:
            return
        lines.append(f"% abcbook-link-{idx} {url}")
        if title:
            lines.append(f"% abcbook-link-title-{idx} {title}")
        if start_at is not None and start_at >= 0:
            lines.append(f"% abcbook-link-start-at-{idx} {start_at}")
        if media_kind:
            lines.append(f"% abcbook-link-media-kind-{idx} {media_kind}")
        idx += 1

    for url in record.get("audioUrls") or []:
        add(url, "Audio")
    for url in record.get("backingUrls") or []:
        add(url, "Backing")
    midi = record.get("midiUrl") or ""
    if midi:
        add(midi, "MIDI", media_kind="midi")
    for url in record.get("youtubeUrls") or []:
        start = parse_youtube_start(url)
        add(url, "YouTube", start_at=start)
    return lines


def render_tune(record: dict, x_num: int, tune_id: str, lastupdated: int) -> str:
    title = str(record.get("title") or "Untitled").strip() or "Untitled"
    notes = str(record.get("notes") or "").strip()
    key = str(record.get("key") or "").strip()
    tags = list(record.get("tags") or [])
    if SITE_TAG not in tags:
        tags.insert(0, SITE_TAG)
    tags_str = ",".join(dict.fromkeys(t for t in tags if t))

    selected_id = record.get("selectedCandidateId") or ""
    candidates = list(record.get("candidates") or [])
    chosen = None
    if selected_id:
        chosen = next((c for c in candidates if c and c.get("id") == selected_id), None)
    if not chosen and record.get("abc"):
        chosen = {
            "abc": record.get("abc"),
            "source": record.get("abcSource") or "selected",
        }
    if not chosen:
        chosen = pick_best_candidate(candidates)

    abc_src = (chosen or {}).get("abc") or ""
    source_label = (chosen or {}).get("source") or "none"
    body = strip_body_headers(abc_src) if abc_src else ""
    if not key:
        key = extract_header_field(abc_src, "K") or "C"
    meter = extract_header_field(abc_src, "M") or ""
    note_len = extract_header_field(abc_src, "L") or "1/8"
    rhythm = extract_header_field(abc_src, "R") or ""

    lines = [
        f"X:{x_num}",
        f"T:{title}",
    ]
    if notes:
        lines.append(f"C:{notes}")
    if rhythm:
        lines.append(f"R:{rhythm}")
    if meter:
        lines.append(f"M:{meter}")
    lines.append(f"L:{note_len}")
    lines.append(f"K:{key}")
    lines.append(f"B: {BOOK_NAME}")
    lines.append(f"% abcbook-tune_id {tune_id}")
    lines.append(f"% abcbook-lastupdated {lastupdated}")
    lines.append(f"% abcbook-src-url {SRC_URL}")
    lines.append(f"% abcbook-oldtime-slug {record.get('slug')}")
    lines.append(f"% abcbook-tags {tags_str}")
    lines.append(f"% abcbook-notation-source {source_label}")
    lines.extend(build_links(record))
    if body:
        lines.append(body)
    else:
        lines.append("% no notation selected")
    return "\n".join(lines).rstrip() + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--package",
        type=Path,
        default=PACKAGE_PATH,
        help="Enrich / review package JSON",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=SCRAPE_ABC_PATH,
        help="Output ABC path",
    )
    parser.add_argument(
        "--only-reviewed",
        action="store_true",
        help="Only include tunes marked reviewed=true",
    )
    args = parser.parse_args(argv)

    package = load_json(args.package, {})
    tunes = list(package.get("tunes") or [])
    if not tunes:
        print(f"No tunes in {args.package}", file=sys.stderr)
        return 1

    prior = load_existing_ids(args.out)
    tunes_map = load_tunes_abc_title_ids()
    lastupdated = now_ms()

    blocks = []
    x_num = 1
    for record in tunes:
        if args.only_reviewed and not record.get("reviewed"):
            continue
        tune_id = resolve_tune_id(record, prior, tunes_map)
        blocks.append(render_tune(record, x_num, tune_id, lastupdated))
        x_num += 1

    header = (
        "%abc-2.1\n"
        "% oldtimefiddletunes.net → abc2book scrape\n"
        f"% generated for book: {BOOK_NAME}\n"
        f"% tune_count: {len(blocks)}\n\n"
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(header + "\n".join(blocks), encoding="utf-8")
    print(f"Wrote {len(blocks)} tunes → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
