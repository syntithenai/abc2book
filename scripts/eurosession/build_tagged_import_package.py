#!/usr/bin/env python3
"""Build a tunebook import JSON (+ optional ABC) from a eurosession-style work dir.

Stamps B:<book>, % abcbook-tune_id, % abcbook-tags, and % abcbook-repeats on each
tune so headless runs (Milliner–Koken, etc.) do not require the review browser.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def stable_object_id(seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return "6a8ee7a9" + digest[:16]


def ensure_x_header(abc: str, index: int, title: str) -> str:
    text = (abc or "").strip()
    if not text:
        text = f"X:{index}\nT:{title}\nM:4/4\nL:1/8\nK:C\n%% missing abc — needs manual entry\n"
    if not re.search(r"^X:", text, re.M):
        text = f"X:{index}\nT:{title}\n" + text
    else:
        text = re.sub(r"^X:\s*\d+", f"X:{index}", text, count=1, flags=re.M)
        if not re.search(r"^T:", text, re.M):
            text = re.sub(r"^(X:\d+)\n", rf"\1\nT:{title}\n", text, count=1, flags=re.M)
    return text


def ensure_book(abc: str, book: str) -> str:
    text = abc
    if re.search(rf"^B:\s*{re.escape(book)}\s*$", text, re.M | re.I):
        return text
    if re.search(r"^T:", text, re.M):
        return re.sub(r"^(T:.*)$", rf"\1\nB:{book}", text, count=1, flags=re.M)
    if re.search(r"^X:", text, re.M):
        return re.sub(r"^(X:.*)$", rf"\1\nB:{book}", text, count=1, flags=re.M)
    return f"B:{book}\n" + text


def ensure_meta_line(abc: str, pattern: str, line: str) -> str:
    text = abc
    if re.search(pattern, text, re.I):
        return re.sub(pattern, line, text, count=1, flags=re.I)
    if re.search(r"^K:", text, re.M):
        return re.sub(r"^(K:.*)$", line + r"\n\1", text, count=1, flags=re.M)
    return text.rstrip() + "\n" + line + "\n"


def prepare_abc(abc: str, *, tune_id: str, book: str, tags: list[str], index: int, title: str) -> str:
    text = ensure_x_header(abc, index, title)
    text = ensure_book(text, book)
    text = ensure_meta_line(text, r"%\s*abcbook-tune_id\s+\S+", f"% abcbook-tune_id {tune_id}")
    if tags:
        tag_line = "% abcbook-tags " + ",".join(tags)
        text = ensure_meta_line(text, r"%\s*abcbook-tags\s+[^\n]*", tag_line)
    text = ensure_meta_line(text, r"%\s*abcbook-repeats\s+\S+", "% abcbook-repeats 3")
    return text.strip() + "\n"


def pick_abc(tune: dict) -> str:
    selected = str(tune.get("selectedCandidateId") or "")
    for c in tune.get("candidates") or []:
        if selected and str(c.get("id") or "") == selected:
            return str(c.get("abc") or "")
    if tune.get("abc"):
        return str(tune.get("abc") or "")
    for c in tune.get("candidates") or []:
        src = str(c.get("source") or "").lower()
        if not src.startswith("omr") and c.get("abc"):
            return str(c.get("abc") or "")
    for c in tune.get("candidates") or []:
        if c.get("abc"):
            return str(c.get("abc") or "")
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Build tagged tunebook import package from work dir")
    parser.add_argument("--work", required=True)
    parser.add_argument("--book", default="old time")
    parser.add_argument("--book-label", default="")
    parser.add_argument("--tags", default="milliner koken,old time tunes")
    parser.add_argument("--out-json", default="")
    parser.add_argument("--out-abc", default="")
    parser.add_argument(
        "--id-prefix",
        default="milliner-koken",
        help="Seed prefix for stable tune ids (page/tuneIndex appended)",
    )
    parser.add_argument(
        "--mark-complete",
        action="store_true",
        help="Mark every tune complete in the package (default: incomplete unless abc looks usable)",
    )
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    book = str(args.book or "").strip().lower() or "old time"
    book_label = str(args.book_label or "").strip() or book.title()
    tags = [p.strip() for p in str(args.tags or "").split(",") if p.strip()]
    id_prefix = str(args.id_prefix or "tune").strip() or "tune"

    tunes_in = [t for t in (manifest.get("tunes") or []) if t.get("cropPath") or t.get("notationOnly")]
    tunes_in = sorted(tunes_in, key=lambda t: (int(t.get("page") or 0), int(t.get("tuneIndex") or 0)))

    out_tunes = []
    abc_chunks = []
    for i, tune in enumerate(tunes_in, start=1):
        title = str(tune.get("title") or f"Tune {i}").strip() or f"Tune {i}"
        page = int(tune.get("page") or 0)
        tune_index = int(tune.get("tuneIndex") or 0)
        seed = f"{id_prefix}:p{page:04d}:t{tune_index:02d}:{title}"
        tune_id = stable_object_id(seed)
        raw_abc = pick_abc(tune)
        abc = prepare_abc(raw_abc, tune_id=tune_id, book=book, tags=tags, index=i, title=title)
        looks_ok = bool(raw_abc.strip()) and "%% missing abc" not in raw_abc
        complete = bool(args.mark_complete) or looks_ok
        crop = Path(tune["cropPath"]).name if tune.get("cropPath") else ""
        out_tunes.append(
            {
                "key": f"p{page:02d}_t{tune_index:02d}",
                "id": tune_id,
                "title": title,
                "page": page,
                "tuneIndex": tune_index,
                "crop": crop,
                "complete": complete,
                "abc": abc,
                "joinTier": tune.get("joinTier") or "",
                "notationOnly": bool(tune.get("notationOnly")),
            }
        )
        abc_chunks.append(abc.rstrip() + "\n")

    pkg = {
        "book": book,
        "bookLabel": book_label,
        "tags": tags,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "storageKey": f"{re.sub(r'[^a-z0-9]+', '-', book)}-abc-review-state-v3",
        "version": 1,
        "tunes": out_tunes,
    }

    out_json = Path(args.out_json) if args.out_json else work / f"{re.sub(r'[^a-z0-9]+', '-', book)}-import.json"
    out_json.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out_json} ({len(out_tunes)} tunes)")

    out_abc = Path(args.out_abc) if args.out_abc else work / f"{re.sub(r'[^a-z0-9]+', '-', book)}.abc"
    header = (
        "%abc-2.1\n"
        f"% {book_label} import package\n"
        f"% book: {book}\n"
        f"% tags: {', '.join(tags)}\n"
        f"% tune_count: {len(out_tunes)}\n\n"
    )
    out_abc.write_text(header + "\n".join(abc_chunks), encoding="utf-8")
    print(f"wrote {out_abc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
