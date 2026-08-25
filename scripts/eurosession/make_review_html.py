#!/usr/bin/env python3
"""Build a contact-sheet HTML for reviewing EuroSession tune crops."""

from __future__ import annotations

import argparse
import html
import json
from collections import defaultdict
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Make EuroSession split review HTML")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--out", default="", help="Output HTML path (default: work/review.html)")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = [t for t in manifest.get("tunes") or [] if t.get("cropPath")]
    by_page: dict[int, list[dict]] = defaultdict(list)
    for tune in tunes:
        by_page[int(tune.get("page") or 0)].append(tune)

    out_path = Path(args.out) if args.out else work / "review.html"
    edits_example = work / "review_edits.example.json"
    edits_example.write_text(
        json.dumps(
            {
                "renames": [{"page": 1, "tuneIndex": 2, "title": "Corrected Title"}],
                "merges": [{"page": 19, "tuneIndexes": [2, 3]}],
                "splits": [{"page": 4, "atY": 1200, "titles": ["Tune A", "Tune B"]}],
                "deletes": [{"page": 46, "tuneIndex": 1}],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    parts = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        "<title>EuroSession split review</title>",
        "<style>",
        "body{font-family:system-ui,sans-serif;margin:1rem;background:#111;color:#eee}",
        "h1,h2{margin:0.6rem 0}",
        ".page{border:1px solid #333;margin:1rem 0;padding:0.8rem;border-radius:8px}",
        ".row{display:flex;flex-wrap:wrap;gap:0.8rem;align-items:flex-start}",
        ".thumb{max-width:220px;max-height:320px;border:1px solid #555;background:#222}",
        ".crop{max-width:280px;max-height:420px;border:1px solid #666;background:#1a1a1a}",
        ".meta{font-size:0.85rem;color:#bbb;margin:0.2rem 0 0.5rem}",
        ".card{max-width:300px}",
        "code{color:#9cf}",
        "</style></head><body>",
        "<h1>EuroSession split review</h1>",
        f"<p class='meta'>{len(by_page)} pages · {len(tunes)} crops · "
        f"edit <code>review_edits.json</code> (see example) then run "
        f"<code>apply_review.py</code></p>",
    ]

    for page in sorted(by_page):
        page_tunes = sorted(by_page[page], key=lambda t: int(t.get("tuneIndex") or 0))
        page_path = page_tunes[0].get("pagePath") or ""
        rel_page = Path(page_path).name if page_path else ""
        parts.append(f"<section class='page' id='p{page:02d}'>")
        parts.append(f"<h2>Page {page:02d} · {len(page_tunes)} tune(s)</h2>")
        parts.append("<div class='row'>")
        if rel_page:
            parts.append(
                f"<div class='card'><div class='meta'>full page</div>"
                f"<a href='pages/{html.escape(rel_page)}' target='_blank'>"
                f"<img class='thumb' src='pages/{html.escape(rel_page)}' loading='lazy'></a></div>"
            )
        for tune in page_tunes:
            crop = Path(tune["cropPath"]).name
            title = html.escape(str(tune.get("title") or ""))
            idx = int(tune.get("tuneIndex") or 0)
            parts.append(
                "<div class='card'>"
                f"<div class='meta'>tune {idx:02d}</div>"
                f"<div><strong>{title}</strong></div>"
                f"<a href='tunes/{html.escape(crop)}' target='_blank'>"
                f"<img class='crop' src='tunes/{html.escape(crop)}' loading='lazy'></a>"
                f"<div class='meta'>{html.escape(crop)}</div>"
                "</div>"
            )
        parts.append("</div></section>")

    parts.append("</body></html>")
    out_path.write_text("\n".join(parts), encoding="utf-8")
    print(f"wrote {out_path}")
    print(f"wrote {edits_example}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
