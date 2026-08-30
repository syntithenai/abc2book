#!/usr/bin/env python3
"""Stamp Australian Bush Traditions ABC with tunebook import metadata.

Adds stable % abcbook-tune_id, % abcbook-lastupdated, and % abcbook-src-url so
curated import can update in place on re-import. Tunes whose primary title
matches scrape/tunes.abc reuse that file's tune_id (prefer ABT versions on import).
"""

from __future__ import annotations

import argparse
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ABT_PATH = ROOT / "scrape/australiabushtraditions.abc"
DEFAULT_TUNES_PATH = ROOT / "scrape/tunes.abc"
SRC_URL = "https://tunebook.net/scrape/australiabushtraditions.abc"

TUNE_SPLIT = re.compile(r"\n(?=X:\s*\d+)")
TUNE_ID_RE = re.compile(r"^% abcbook-tune_id\s+(\S+)", re.M)
LASTUPDATED_RE = re.compile(r"^% abcbook-lastupdated\s+(\S+)", re.M)
SRC_URL_RE = re.compile(r"^% abcbook-src-url\s+.*$", re.M)
COMPILATION_DATE_RE = re.compile(
    r"gen_allabc\s+(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\w+\s+\d+)",
    re.I,
)


def norm_title(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^\w\s#]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def split_tunes(text: str) -> list[str]:
    chunks = TUNE_SPLIT.split(text)
    out: list[str] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if re.match(r"^X:\s*\d+", chunk):
            out.append(chunk)
    return out


def primary_title(tune: str) -> str:
    m = re.search(r"^T:(.*)$", tune, re.M)
    return m.group(1).strip() if m else ""


def x_number(tune: str) -> str:
    m = re.search(r"^X:\s*(\d+)", tune, re.M)
    return m.group(1) if m else "0"


def recording_id(tune: str) -> str | None:
    m = re.search(r"^F:(.*)$", tune, re.M)
    if not m:
        return None
    field = m.group(1).strip()
    if not field:
        return None
    token = field.split()[0]
    base = token.split("/")[-1]
    base = re.sub(r"\.(mp3|wav|ogg|m4a)$", "", base, flags=re.I)
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "_", base).strip("_").lower()
    return slug or None


def build_tunes_abc_title_map(tunes_path: Path) -> dict[str, str]:
    text = tunes_path.read_text(encoding="utf-8", errors="replace")
    title_to_id: dict[str, str] = {}
    for tune in split_tunes(text):
        title = norm_title(primary_title(tune))
        if not title:
            continue
        m = TUNE_ID_RE.search(tune)
        if m and title not in title_to_id:
            title_to_id[title] = m.group(1)
    return title_to_id


def parse_compilation_ms(text: str) -> int:
    m = COMPILATION_DATE_RE.search(text)
    if not m:
        raise SystemExit("Could not find gen_allabc compilation date in ABC header")
    raw = m.group(1)
    try:
        dt = datetime.strptime(raw, "%a %b %d %H:%M:%S %Z %Y")
    except ValueError:
        dt = datetime.strptime(raw.replace(" AEST", ""), "%a %b %d %H:%M:%S %Y")
    return int(dt.timestamp() * 1000)


def upsert_metadata_line(tune: str, pattern: re.Pattern[str], line: str) -> str:
    if pattern.search(tune):
        return pattern.sub(line.rstrip(), tune, count=1)
    insert_at = None
    for marker in (
        r"^% abcbook-json ",
        r"^% abcbook-link-",
        r"^% abcbook-",
    ):
        m = re.search(marker, tune, re.M)
        if m:
            insert_at = m.start()
            break
    if insert_at is None:
        return tune.rstrip() + "\n" + line
    return tune[:insert_at] + line + tune[insert_at:]


def stamp_tune(
    tune: str,
    *,
    title_map: dict[str, str],
    compilation_ms: int,
    preserve_ids: bool,
) -> tuple[str, str]:
    existing_id = None
    m = TUNE_ID_RE.search(tune)
    if m:
        existing_id = m.group(1)

    if preserve_ids and existing_id:
        tune_id = existing_id
        source = "preserved"
    else:
        title_key = norm_title(primary_title(tune))
        if title_key and title_key in title_map:
            tune_id = title_map[title_key]
            source = "tunes.abc"
        else:
            rec = recording_id(tune)
            tune_id = f"abt-{rec}" if rec else f"abt-x{x_number(tune)}"
            source = "abt"
        tune = upsert_metadata_line(tune, TUNE_ID_RE, f"% abcbook-tune_id {tune_id}\n")

    tune = upsert_metadata_line(
        tune, LASTUPDATED_RE, f"% abcbook-lastupdated {compilation_ms}\n"
    )
    tune = upsert_metadata_line(tune, SRC_URL_RE, f"% abcbook-src-url {SRC_URL}\n")
    return tune, source


def stamp_file(
    abt_path: Path,
    tunes_path: Path,
    *,
    backup: bool,
    preserve_ids: bool,
    dry_run: bool,
) -> None:
    text = abt_path.read_text(encoding="utf-8", errors="replace")
    compilation_ms = parse_compilation_ms(text)
    title_map = build_tunes_abc_title_map(tunes_path)

    first_tune = re.search(r"^X:\s*\d+", text, re.M)
    if not first_tune:
        raise SystemExit("No tune blocks found in ABT ABC")
    prefix = text[: first_tune.start()]
    suffix_text = text[first_tune.start() :]

    stats = {"preserved": 0, "tunes.abc": 0, "abt": 0, "disambiguated": 0}
    used_ids: set[str] = set()
    stamped_tunes: list[str] = []
    for tune in split_tunes(suffix_text):
        stamped, source = stamp_tune(
            tune,
            title_map=title_map,
            compilation_ms=compilation_ms,
            preserve_ids=preserve_ids,
        )
        m = TUNE_ID_RE.search(stamped)
        if m:
            tune_id = m.group(1)
            if tune_id in used_ids:
                disambig = f"{tune_id}-x{x_number(stamped)}"
                stamped = upsert_metadata_line(
                    stamped, TUNE_ID_RE, f"% abcbook-tune_id {disambig}\n"
                )
                stats["disambiguated"] += 1
                tune_id = disambig
            used_ids.add(tune_id)
        stats[source] += 1
        stamped_tunes.append(stamped.rstrip() + "\n")

    out = prefix + "\n".join(stamped_tunes)
    if not out.endswith("\n"):
        out += "\n"

    print(f"Compilation lastupdated: {compilation_ms}")
    print(f"Stamped {len(stamped_tunes)} tunes")
    print(
        "IDs: "
        f"{stats['preserved']} preserved, "
        f"{stats['tunes.abc']} from tunes.abc overlap, "
        f"{stats['abt']} new abt-*, "
        f"{stats['disambiguated']} disambiguated"
    )

    if dry_run:
        print("Dry run — no file written")
        return

    if backup:
        bak = abt_path.with_suffix(abt_path.suffix + ".bak")
        shutil.copy2(abt_path, bak)
        print(f"Backup: {bak}")

    abt_path.write_text(out, encoding="utf-8")
    print(f"Wrote {abt_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--abt",
        type=Path,
        default=DEFAULT_ABT_PATH,
        help="Path to australiabushtraditions.abc",
    )
    parser.add_argument(
        "--tunes",
        type=Path,
        default=DEFAULT_TUNES_PATH,
        help="Path to tunes.abc for title overlap mapping",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not write a .bak backup before overwriting",
    )
    parser.add_argument(
        "--regenerate-ids",
        action="store_true",
        help="Replace existing abcbook-tune_id values (default: preserve)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print stats without writing",
    )
    args = parser.parse_args()

    stamp_file(
        args.abt,
        args.tunes,
        backup=not args.no_backup,
        preserve_ids=not args.regenerate_ids,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
