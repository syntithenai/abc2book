#!/usr/bin/env bash
# Rebuild textsearch + contour indexes after mirroring.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== textsearch_index.json =="
python3 scripts/abc_mirror/rebuild_indexes.py --out "$ROOT/textsearch_index.json"

echo "== contour index (FTF + Norbeck + JC + jc_regional) =="
export ABC2BOOK_ROOT="$ROOT"
# Collections 0=FTF, 4=Norbeck, 6=JC, 7=jc_regional (when wired)
python3 local-resolver/scripts/build_abc_contour_index.py --collections 0,4,6,7 || \
  python3 local-resolver/scripts/build_abc_contour_index.py --collections 0,4,6

echo "Done."
