#!/usr/bin/env python3
"""Build a searchable index for the personal music collection library."""

from __future__ import annotations

import argparse
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from music_collection import (  # noqa: E402
    MUSIC_COLLECTION_INDEX_NAME,
    MUSIC_COLLECTION_STATS_NAME,
)
from music_collection_indexer import (  # noqa: E402
    IndexBuildOptions,
    run_build,
)


def main():
    parser = argparse.ArgumentParser(description="Build music_collection_index.json")
    parser.add_argument(
        "root",
        nargs="?",
        default=os.getenv(
            "MUSIC_COLLECTION_DIR",
            os.path.abspath(os.path.join(ROOT, "music-collection")),
        ),
        help="Music collection root directory",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output index path (default: <metadata-dir>/music_collection_index.json)",
    )
    parser.add_argument(
        "--no-art",
        action="store_true",
        help="Skip embedded album art extraction",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from checkpoint when available",
    )
    parser.add_argument(
        "--no-lock",
        action="store_true",
        help="Do not acquire build.lock (used when spawned by API)",
    )
    args = parser.parse_args()

    root_dir = os.path.abspath(args.root)
    if not os.path.isdir(root_dir):
        print("Music collection directory not found:", root_dir, file=sys.stderr)
        return 1

    metadata_dir = os.path.abspath(
        os.getenv("MUSIC_COLLECTION_INDEX_DIR", "").strip() or root_dir
    )
    opts = IndexBuildOptions(
        root_dir=root_dir,
        metadata_dir=metadata_dir,
        extract_art=not args.no_art,
        resume=args.resume,
    )
    output_path = os.path.abspath(args.output or os.path.join(metadata_dir, MUSIC_COLLECTION_INDEX_NAME))
    stats_path = os.path.join(metadata_dir, MUSIC_COLLECTION_STATS_NAME)

    try:
        index = run_build(
            opts,
            index_output_path=output_path,
            stats_output_path=stats_path,
            acquire_lock=not args.no_lock,
        )
    except Exception as exc:
        print("Build failed:", exc, file=sys.stderr)
        return 1

    print("Wrote", output_path)
    print("Wrote", stats_path)
    print("Entries:", index.get("count", 0))
    print("Tokens:", len(index.get("tokens") or {}))
    stats = index.get("stats") or {}
    metadata = stats.get("metadata") or {}
    duplicates = stats.get("duplicates") or {}
    print("Tagged title:", metadata.get("taggedTitle"), "/", metadata.get("tracks"))
    print("Read errors:", stats.get("readErrors", 0))
    print("Skipped (resume):", stats.get("skipped", 0))
    print("Exact duplicate extras:", (duplicates.get("exact") or {}).get("extraCopies"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
