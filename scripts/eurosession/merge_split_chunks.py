#!/usr/bin/env python3
"""Merge parallel milliner-koken chunk work dirs into one eurosession-style work dir."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="Parent containing chunk-*/work")
    parser.add_argument("--out", required=True, help="Merged work directory")
    args = parser.parse_args()
    base = Path(args.base)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "pages").mkdir(exist_ok=True)
    (out / "tunes").mkdir(exist_ok=True)

    chunks = sorted(base.glob("chunk-*/work"))
    if not chunks:
        raise SystemExit(f"no chunk-*/work under {base}")

    all_tunes: list[dict] = []
    page_offset = 0
    for chunk in chunks:
        manifest_path = chunk / "manifest.json"
        if not manifest_path.is_file():
            raise SystemExit(f"missing {manifest_path}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        # Remap pages so chunks don't collide: keep original page from filename when possible
        for page_file in sorted((chunk / "pages").glob("*.jpg")):
            dest = out / "pages" / f"c{chunk.parent.name[-1]}_{page_file.name}"
            if not dest.exists():
                shutil.copy2(page_file, dest)
        for tune in manifest.get("tunes") or []:
            crop = Path(tune.get("cropPath") or "")
            if crop.is_file():
                new_name = f"c{chunk.parent.name[-1]}_{crop.name}"
                dest = out / "tunes" / new_name
                if not dest.exists():
                    shutil.copy2(crop, dest)
                tune = dict(tune)
                tune["cropPath"] = str(dest)
                tune["page"] = int(tune.get("page") or 0) + page_offset
                all_tunes.append(tune)
        # Advance offset by max page in this chunk
        max_p = max((int(t.get("page") or 0) for t in (manifest.get("tunes") or [])), default=0)
        page_offset += max_p

    all_tunes.sort(key=lambda t: (int(t.get("page") or 0), int(t.get("tuneIndex") or 0)))
    # Reindex tuneIndex within page for cleanliness
    by_page: dict[int, list[dict]] = {}
    for t in all_tunes:
        by_page.setdefault(int(t.get("page") or 0), []).append(t)
    remapped = []
    for page in sorted(by_page):
        for i, t in enumerate(by_page[page], start=1):
            t = dict(t)
            t["tuneIndex"] = i
            remapped.append(t)

    out_manifest = {
        "source": "milliner-koken-merged",
        "tunes": remapped,
    }
    (out / "manifest.json").write_text(json.dumps(out_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"merged {len(chunks)} chunks → {len(remapped)} tunes into {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
