#!/usr/bin/env python3
"""Apply review_edits.json to EuroSession crops/manifest."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

from PIL import Image

TITLE_KEY_HINT_RE = re.compile(
    r"\s*\(([A-G][#b]?(?:m|maj|min|dim|aug)?(?:\d)?(?:/[A-G][#b]?)?)\)\s*$",
    re.I,
)


def slugify(title: str) -> str:
    text = TITLE_KEY_HINT_RE.sub("", title or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text, flags=re.I)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text[:80] or "untitled"


def rewrite_page_files(work: Path, page: int, page_tunes: list[dict]) -> list[dict]:
    tunes_dir = work / "tunes"
    pages_dir = work / "pages"
    page_path = pages_dir / f"p{page:02d}.jpg"
    # Remove old crops for page
    for old in tunes_dir.glob(f"p{page:02d}_*.jpg"):
        old.unlink(missing_ok=True)

    rewritten: list[dict] = []
    with Image.open(page_path) as page_img:
        width, height = page_img.size
        rgb = page_img.convert("RGB")
        for index, tune in enumerate(sorted(page_tunes, key=lambda t: int(t.get("tuneIndex") or 0)), start=1):
            title = str(tune.get("title") or f"untitled-p{page:02d}-{index:02d}")
            top = max(0, int(tune.get("top") or 0))
            bottom = min(height, int(tune.get("bottom") or height))
            if bottom <= top:
                bottom = min(height, top + 1)
            crop = rgb.crop((0, top, width, bottom))
            slug = slugify(title)
            name = f"p{page:02d}_{index:02d}_{slug}.jpg"
            crop_path = tunes_dir / name
            crop.save(crop_path, format="JPEG", quality=92)
            entry = dict(tune)
            entry.update({
                "page": page,
                "tuneIndex": index,
                "title": title,
                "slug": slug,
                "cropPath": str(crop_path),
                "pagePath": str(page_path),
                "top": top,
                "bottom": bottom,
            })
            rewritten.append(entry)
    return rewritten


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply EuroSession review edits")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--edits", default="", help="Path to review_edits.json")
    args = parser.parse_args()

    work = Path(args.work)
    edits_path = Path(args.edits) if args.edits else work / "review_edits.json"
    manifest_path = work / "manifest.json"
    if not edits_path.exists():
        raise SystemExit(f"missing edits file: {edits_path}")
    if not manifest_path.exists():
        raise SystemExit(f"missing {manifest_path}")

    edits = json.loads(edits_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = [dict(t) for t in manifest.get("tunes") or [] if t.get("cropPath")]

    by_page: dict[int, list[dict]] = {}
    for tune in tunes:
        page = int(tune.get("page") or 0)
        by_page.setdefault(page, []).append(tune)

    # Deletes
    for item in edits.get("deletes") or []:
        page = int(item["page"])
        idx = int(item["tuneIndex"])
        by_page[page] = [t for t in by_page.get(page, []) if int(t.get("tuneIndex") or 0) != idx]

    # Renames
    for item in edits.get("renames") or []:
        page = int(item["page"])
        idx = int(item["tuneIndex"])
        title = str(item.get("title") or "").strip()
        for tune in by_page.get(page, []):
            if int(tune.get("tuneIndex") or 0) == idx and title:
                tune["title"] = title

    # Merges: combine vertical ranges of listed tuneIndexes into the first
    for item in edits.get("merges") or []:
        page = int(item["page"])
        idxs = sorted(int(i) for i in (item.get("tuneIndexes") or []))
        if len(idxs) < 2:
            continue
        page_tunes = by_page.get(page, [])
        keep = None
        drop = set()
        for tune in page_tunes:
            ti = int(tune.get("tuneIndex") or 0)
            if ti == idxs[0]:
                keep = tune
            elif ti in idxs:
                drop.add(ti)
                if keep is not None:
                    keep["bottom"] = max(int(keep.get("bottom") or 0), int(tune.get("bottom") or 0))
                    keep["top"] = min(int(keep.get("top") or 0), int(tune.get("top") or 0))
                    if item.get("title"):
                        keep["title"] = str(item["title"])
        by_page[page] = [t for t in page_tunes if int(t.get("tuneIndex") or 0) not in drop]

    # Splits: replace all crops on a page with two (or N) ranges at given Y cut(s)
    for item in edits.get("splits") or []:
        page = int(item["page"])
        page_path = work / "pages" / f"p{page:02d}.jpg"
        if not page_path.exists():
            continue
        with Image.open(page_path) as img:
            height = img.size[1]
        if "atYs" in item:
            cuts = list(item.get("atYs") or [])
        elif item.get("atY") is not None:
            cuts = [item["atY"]]
        else:
            cuts = []
        cuts = sorted(int(y) for y in cuts)
        bounds = [0] + cuts + [height]
        titles = list(item.get("titles") or [])
        new_tunes = []
        for i in range(len(bounds) - 1):
            title = titles[i] if i < len(titles) else f"untitled-p{page:02d}-{i+1:02d}"
            new_tunes.append({
                "page": page,
                "tuneIndex": i + 1,
                "title": title,
                "top": bounds[i],
                "bottom": bounds[i + 1],
                "pagePath": str(page_path),
                "sourcePath": (by_page.get(page) or [{}])[0].get("sourcePath", ""),
            })
        by_page[page] = new_tunes

    # Rewrite affected pages (all pages that appear in edits, plus always rewrite all for consistency)
    touched = set()
    for key in ("deletes", "renames", "merges", "splits"):
        for item in edits.get(key) or []:
            touched.add(int(item["page"]))

    new_all: list[dict] = []
    for page in sorted(by_page):
        page_tunes = by_page[page]
        if page in touched or True:
            # Always rewrite to keep filenames/indexes consistent after edits
            page_tunes = rewrite_page_files(work, page, page_tunes)
        new_all.extend(page_tunes)

    # If some pages had all tunes deleted, still keep other pages
    manifest["tunes"] = new_all
    manifest["tuneCount"] = len(new_all)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"applied {edits_path}")
    print(f"wrote {manifest_path} ({manifest['tuneCount']} tunes)")

    # Refresh review html if helper exists
    review_script = Path(__file__).with_name("make_review_html.py")
    if review_script.exists():
        import subprocess
        subprocess.run([shutil.which("python3") or "python3", str(review_script), "--work", str(work)], check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
