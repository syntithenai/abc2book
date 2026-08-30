#!/usr/bin/env python3
"""Build final EuroSession import package: photo tunes + MusicXML-only extras.

- Marks remaining incomplete photo tunes complete with a photo-only ABC stub
  (crop filename kept so the image stays associated on import).
- Appends tunebook spans from mxl_title_index.json that were not covered by
  good photo↔MXL joins (notationOnly / mxl_only).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from finalize_eurosession import GOOD_THRESHOLD, load_join_rows  # noqa: E402
from match_mxl_spans import load_score  # noqa: E402
from mxl_span_to_abc import MXL_SOURCE, span_to_abc  # noqa: E402

BOOK = "eurosession"


def stable_object_id(seed: str) -> str:
    """24-hex id in the same shape as review-page ObjectIds."""
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return "6a8ee7a9" + digest[:16]


def ensure_x_header(abc: str, index: int, title: str) -> str:
    text = (abc or "").strip()
    if not text:
        text = f"X:{index}\nT:{title}\nM:4/4\nL:1/8\nK:C\n"
    if not text.startswith("X:"):
        text = f"X:{index}\nT:{title}\n" + text
    else:
        text = re.sub(r"^X:\s*\d+", f"X:{index}", text, count=1, flags=re.M)
        if not re.search(r"^T:", text, re.M):
            text = re.sub(r"^(X:\d+)\n", rf"\1\nT:{title}\n", text, count=1, flags=re.M)
    return text


def prepare_abc_for_import(abc: str, tune_id: str, index: int, title: str) -> str:
    text = ensure_x_header(abc, index, title)
    if not re.search(rf"^B:\s*{re.escape(BOOK)}\s*$", text, re.M | re.I):
        if re.search(r"^T:", text, re.M):
            text = re.sub(r"^(T:.*)$", rf"\1\nB:{BOOK}", text, count=1, flags=re.M)
        elif re.search(r"^X:", text, re.M):
            text = re.sub(r"^(X:.*)$", rf"\1\nB:{BOOK}", text, count=1, flags=re.M)
        else:
            text = f"B:{BOOK}\n" + text
    id_line = f"% abcbook-tune_id {tune_id}"
    if re.search(r"% abcbook-tune_id\s+\S+", text):
        text = re.sub(r"% abcbook-tune_id\s+\S+", id_line, text, count=1)
    elif re.search(r"^K:", text, re.M):
        text = re.sub(r"^(K:.*)$", id_line + r"\n\1", text, count=1, flags=re.M)
    else:
        text = id_line + "\n" + text
    if not re.search(r"% abcbook-repeats\s+\S+", text, re.I):
        if re.search(r"^K:", text, re.M):
            text = re.sub(r"^(K:.*)$", r"% abcbook-repeats 3\n\1", text, count=1, flags=re.M)
        else:
            text = text.rstrip() + "\n% abcbook-repeats 3\n"
    return text.strip() + "\n"


def photo_only_stub(title: str) -> str:
    # Headers (X/T/B/id/repeats) are applied by prepare_abc_for_import.
    return (
        "M:4/4\n"
        "L:1/8\n"
        "K:C\n"
        "%% photo only — ABC not transcribed; see associated crop image\n"
        "z8 |]\n"
    )


def good_join_spans(join_rows: list[dict]) -> set[tuple[int, int]]:
    out: set[tuple[int, int]] = set()
    for row in join_rows:
        match = row.get("match")
        if not match:
            continue
        if float(match.get("match_score") or 0) < GOOD_THRESHOLD:
            continue
        out.add((int(match["m0"]), int(match["m1"])))
    return out


def find_join_match(title: str, key: str, join_by_key: dict[str, dict], join_by_title: dict[str, dict]) -> dict | None:
    row = join_by_key.get(key) or join_by_title.get(title) or {}
    match = row.get("match")
    if not match or float(match.get("match_score") or 0) < GOOD_THRESHOLD:
        return None
    return match


def refresh_abc_from_mxl(
    title: str,
    match: dict,
    *,
    mxl: Path,
    score_root,
) -> str:
    return span_to_abc(
        mxl,
        int(match["m0"]),
        int(match["m1"]),
        title=title,
        key=str(match.get("seedKey") or match.get("mxlKey") or "") or None,
        meter=str(match.get("seedMeter") or match.get("mxlMeter") or "") or None,
        subtitle=str(match.get("mscz_subtitle") or "") or None,
        composer=str(match.get("mscz_composer") or "") or None,
        root=score_root,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--import-json",
        default="/home/stever/.cursor/projects/home-stever-projects-abc2book/attachments/3ee343f9-2d75-40a1-a2ac-a4d30d354441/eurosession-import__6_.json",
    )
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--mxl", default="/home/stever/Downloads/eurosessions-tunebook.mxl")
    parser.add_argument(
        "--out-json",
        default="/home/stever/Downloads/eurosession-work/eurosession-import-final.json",
    )
    parser.add_argument(
        "--out-abc",
        default="/home/stever/Downloads/eurosession-work/eurosession-final.abc",
    )
    args = parser.parse_args()

    work = Path(args.work)
    import_path = Path(args.import_json)
    mxl = Path(args.mxl)
    index_path = work / "mxl_title_index.json"
    join_path = work / "mxl_title_join.json"

    pkg = json.loads(import_path.read_text(encoding="utf-8"))
    tunes = list(pkg.get("tunes") or [])
    if not tunes:
        raise SystemExit("import package has no tunes")

    join_rows = load_join_rows(work, join_path)
    join_by_key = {str(r.get("import_key") or ""): r for r in join_rows}
    join_by_title = {str(r.get("import_title") or ""): r for r in join_rows}
    covered = good_join_spans(join_rows)
    score_root = load_score(mxl)

    incomplete_keys = [str(t.get("key") or "") for t in tunes if not t.get("complete")]
    print(f"photo tunes: {len(tunes)}; incomplete → photo-only: {incomplete_keys}", flush=True)

    zero_fixed = 0
    for t in tunes:
        title = str(t.get("title") or "Untitled")
        key = str(t.get("key") or "")
        tune_id = str(t.get("id") or "").strip() or stable_object_id(f"photo:{key}:{title}")
        t["id"] = tune_id

        if not t.get("complete"):
            t["complete"] = True
            t["joinTier"] = "photo_only"
            t["abc"] = photo_only_stub(title)
            if not t.get("crop"):
                raise SystemExit(f"incomplete tune missing crop: {key} {title}")
            continue

        # Refresh any leftover /0 MusicXML ABC from the fixed slicer.
        if re.search(r"/0(?!\d)", str(t.get("abc") or "")):
            match = find_join_match(title, key, join_by_key, join_by_title)
            if match:
                print(f"  refresh /0 → MXL {key} {title}", flush=True)
                t["abc"] = refresh_abc_from_mxl(title, match, mxl=mxl, score_root=score_root)
                t["joinTier"] = "good"
                zero_fixed += 1

    print(f"refreshed /0 from MXL: {zero_fixed}", flush=True)

    idx = json.loads(index_path.read_text(encoding="utf-8"))
    remaining = [
        span
        for span in (idx.get("titles") or [])
        if (int(span["m0"]), int(span["m1"])) not in covered
    ]
    remaining.sort(key=lambda s: (int(s["m0"]), int(s["m1"])))
    print(f"MXL extras to append: {len(remaining)} (index={len(idx.get('titles') or [])}, covered={len(covered)})", flush=True)

    extras: list[dict] = []
    for i, span in enumerate(remaining, start=1):
        m0, m1 = int(span["m0"]), int(span["m1"])
        title = str(span.get("title") or f"MXL tune {i}")
        key = str(span.get("mxlKey") or "C")
        meter = str(span.get("mxlMeter") or "4/4")
        subtitle = str(span.get("subtitle") or "") or None
        composer = str(span.get("composer") or "") or None
        print(f"  [{i}/{len(remaining)}] mm{m0}–{m1} {title}", flush=True)
        abc = span_to_abc(
            mxl,
            m0,
            m1,
            title=title,
            key=key,
            meter=meter,
            subtitle=subtitle,
            composer=composer,
            root=score_root,
        )
        import_key = f"mxl_t{i:02d}"
        tune_id = stable_object_id(f"mxl_only:{m0}:{m1}:{title}")
        extras.append(
            {
                "key": import_key,
                "id": tune_id,
                "title": title,
                "page": max(1, m0 // 24 + 1),
                "tuneIndex": i,
                "crop": "",
                "complete": True,
                "abc": abc,
                "joinTier": "mxl_only",
                "notationOnly": True,
            }
        )

    all_tunes = list(tunes) + extras
    # Re-number X: and inject import headers for every tune.
    for i, t in enumerate(all_tunes, start=1):
        title = str(t.get("title") or f"Tune {i}")
        tune_id = str(t.get("id") or "").strip() or stable_object_id(f"tune:{t.get('key')}:{title}")
        t["id"] = tune_id
        t["abc"] = prepare_abc_for_import(str(t.get("abc") or ""), tune_id, i, title)
        t["complete"] = True

    out_pkg = {
        "book": BOOK,
        "bookLabel": str(pkg.get("bookLabel") or "EuroSession"),
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "storageKey": pkg.get("storageKey") or "eurosession-abc-review-state-v3",
        "version": 1,
        "tunes": all_tunes,
        "finalSummary": {
            "photoTunes": len(tunes),
            "photoOnlyStubs": incomplete_keys,
            "zeroDurationRefreshed": zero_fixed,
            "mxlOnlyExtras": len(extras),
            "total": len(all_tunes),
        },
    }

    out_json = Path(args.out_json)
    out_json.write_text(json.dumps(out_pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    blocks = []
    for t in all_tunes:
        key = t.get("key") or ""
        tier = t.get("joinTier") or ""
        blocks.append(f"% key={key} tier={tier} id={t.get('id')}\n" + str(t.get("abc") or "").rstrip())
    out_abc = Path(args.out_abc)
    out_abc.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")

    print(
        f"wrote {out_json} ({len(all_tunes)} tunes: "
        f"{len(tunes)} photo + {len(extras)} mxl-only)",
        flush=True,
    )
    print(f"wrote {out_abc}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
