#!/usr/bin/env python3
"""Stamp % abcbook-lastupdated on each tune in an import ABC file.

Makes abc2book file import treat existing tunes as updates (not skipped) so
link-only changes in % abcbook-link-* comments are merged onto the library.
"""

from __future__ import annotations

import argparse
import re
import time
from pathlib import Path

LASTUPDATED_RE = re.compile(r"^% abcbook-lastupdated\s+\S+", re.M)


def stamp_abc_lastupdated(abc: str, *, base_ms: int | None = None) -> tuple[str, int]:
    """Return (text, count) of tunes stamped."""
    text = str(abc or "")
    if not text.strip():
        return text, 0
    now = int(base_ms if base_ms is not None else time.time() * 1000)
    parts = re.split(r"(?=^% key=)", text, flags=re.M)
    if len(parts) <= 1 and "% key=" not in text:
        parts = re.split(r"(?=^X:\d+)", text, flags=re.M)
    out_parts: list[str] = []
    stamped = 0
    for part in parts:
        if not part.strip():
            continue
        if not re.search(r"^% abcbook-tune_id\s+\S+", part, re.M):
            out_parts.append(part)
            continue
        line = f"% abcbook-lastupdated {now + stamped}"
        if LASTUPDATED_RE.search(part):
            part = LASTUPDATED_RE.sub(line, part, count=1)
        else:
            part = re.sub(
                r"(^% abcbook-tune_id\s+\S+[^\n]*\n)",
                r"\1" + line + "\n",
                part,
                count=1,
                flags=re.M,
            )
        stamped += 1
        out_parts.append(part)
    return "".join(out_parts), stamped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "abc",
        nargs="?",
        default="/home/stever/Downloads/eurosession-work/eurosession-final.abc",
    )
    parser.add_argument(
        "--out",
        help="Output path (default: overwrite input)",
    )
    parser.add_argument(
        "--copy",
        action="append",
        default=[],
        help="Additional output paths (e.g. ~/Downloads/eurosession-final.abc)",
    )
    args = parser.parse_args()
    src = Path(args.abc).expanduser()
    text = src.read_text(encoding="utf-8")
    stamped_text, count = stamp_abc_lastupdated(text)
    targets = [Path(args.out).expanduser()] if args.out else [src]
    for extra in args.copy or []:
        targets.append(Path(extra).expanduser())
    seen: set[str] = set()
    for path in targets:
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(stamped_text, encoding="utf-8")
        print(f"wrote {path} ({count} tunes stamped)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
