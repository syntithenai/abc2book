#!/usr/bin/env python3
"""Build local ABC contour index for OMR / melody matching.

Default: FolkTuneFinder + Norbeck + JC collections from textsearch_index.json.

  python3 local-resolver/scripts/build_abc_contour_index.py
  python3 local-resolver/scripts/build_abc_contour_index.py --limit 5000
  docker exec -w /app abc2book-local-resolver python3 /static/www/local-resolver/scripts/build_abc_contour_index.py
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

repo = ROOT.parent
if (repo / "abcresources").is_dir():
    os.environ.setdefault("ABC2BOOK_ROOT", str(repo))

from local_abc_resources import (  # noqa: E402
    build_contour_index,
    contour_index_path,
    local_abc_resources_enabled,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--collections",
        default="0,4,6",
        help="Comma-separated collection indexes (default 0=FTF,4=Norbeck,6=JC)",
    )
    parser.add_argument("--limit", type=int, default=None, help="Max tunes to index")
    args = parser.parse_args()
    if not local_abc_resources_enabled():
        print(
            "Local ABC resources not available (need abcresources/ + textsearch_index.json)",
            file=sys.stderr,
        )
        return 1
    collections = tuple(int(part.strip()) for part in args.collections.split(",") if part.strip())
    print("Building contour index for collections", collections, "…", flush=True)
    data = build_contour_index(collections=collections, limit=args.limit)
    path = contour_index_path()
    print("Wrote", path, "tunes=", len((data or {}).get("byId") or {}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
