#!/usr/bin/env python3
"""Rebuild textsearch_index.json from abcresources collections (Python port).

Does not require abcjs — uses simple T: header extraction and token split,
compatible enough with local_abc_resources / frontend token search.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ABCRESOURCES, REPO_ROOT, split_abc_tunes  # noqa: E402

# Keep order aligned with local_abc_resources.COLLECTION_SPECS / frontend.
COLLECTIONS = (
    ("folktunefinder", "abc_tune_folktunefinder_", ".txt"),
    ("thesession", "abc_tune_thesession_", ".abc"),
    ("jimsroots", "abc_tune_jimsroots_", ".abc"),
    ("misc", "abc_tune_misc_", ".abc"),
    ("norbeck", "abc_tune_norbeck_", ".abc"),
    ("folkinfo", "abc_tune_folkinfo_", ".abc"),
    ("jc", "abc_tune_jc_", ".abc"),
    ("jc_regional", "abc_tune_jc_regional_", ".abc"),
    ("robinson", "abc_tune_robinson_", ".abc"),
)

COMMON = frozenset({
    "a", "also", "am", "an", "and", "any", "are", "as", "at", "be", "but", "by",
    "can", "could", "did", "do", "does", "each", "for", "had", "has", "have",
    "how", "i", "if", "in", "is", "it", "its", "me", "my", "nor", "not", "of",
    "oh", "ok", "the", "who", "whom", "will", "with", "would", "yes", "yet",
    "you", "your",
})


def fold(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def strip_text(text: str) -> str:
    # Match indexes_from_files.js stripText closely (letters/spaces), plus fold.
    text = fold(text).lower()
    text = re.sub(r"[^a-z ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def extract_title(abc: str) -> str:
    for line in abc.splitlines():
        if line.upper().startswith("T:"):
            title = line[2:].strip()
            low = title.lower()
            if low.endswith(", the"):
                title = "The " + title[:-5]
            elif low.endswith(" the"):
                title = "The " + title[:-4]
            return title
    return ""


def file_id_from_name(name: str, prefix: str) -> str | None:
    if not name.startswith(prefix):
        return None
    stem = name[len(prefix) :]
    stem = re.sub(r"\.(abc|txt)$", "", stem, flags=re.I)
    return stem if stem else None


def index_collection(folder_index: int, folder: Path, prefix: str, ext: str, index: dict) -> int:
    if not folder.is_dir():
        return 0
    count = 0
    pattern = prefix + "*" + ext
    for path in sorted(folder.glob(pattern)):
        file_id = file_id_from_name(path.name, prefix)
        if file_id is None:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        tunes = split_abc_tunes(text)
        if not tunes and text.strip():
            tunes = [text]
        for tune_key, abc in enumerate(tunes):
            title = extract_title(abc)
            if not title:
                continue
            tk = f"{folder_index}-{file_id}-{tune_key}"
            index["lookups"][tk] = title
            for token in strip_text(title).split():
                if len(token) < 2 or token in COMMON:
                    continue
                index["tokens"].setdefault(token, []).append(tk)
            count += 1
        if count and count % 20000 == 0:
            print(f"  … {folder.name} {count} tunes", flush=True)
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "textsearch_index.json"),
        help="Output path for textsearch_index.json",
    )
    parser.add_argument(
        "--only-new",
        action="store_true",
        help="Only index jc_regional + robinson + norbeck (merge into existing index)",
    )
    args = parser.parse_args()

    out_path = Path(args.out)
    if args.only_new and out_path.is_file():
        index = json.loads(out_path.read_text(encoding="utf-8"))
        index.setdefault("tokens", {})
        index.setdefault("lookups", {})
        # Drop prior entries for collections we rebuild
        drop_prefixes = ("4-", "7-", "8-")  # norbeck, jc_regional, robinson
        index["lookups"] = {
            k: v for k, v in index["lookups"].items() if not str(k).startswith(drop_prefixes)
        }
        # Rebuild tokens from remaining lookups is expensive; for only-new we
        # rebuild token lists for dropped collections by full re-token of kept
        # lookups — simpler to full rebuild unless file is huge.
        print("only-new requested → performing targeted reindex of norbeck/jc_regional/robinson")
        collections = [c for i, c in enumerate(COLLECTIONS) if i in (4, 7, 8)]
        # Remove tokens pointing at dropped ids
        for token, ids in list(index["tokens"].items()):
            kept = [i for i in ids if not str(i).startswith(drop_prefixes)]
            if kept:
                index["tokens"][token] = kept
            else:
                del index["tokens"][token]
        for folder_index, (name, prefix, ext) in ((4, COLLECTIONS[4]), (7, COLLECTIONS[7]), (8, COLLECTIONS[8])):
            folder = ABCRESOURCES / name
            print(f"Indexing {name} ({folder_index})…")
            n = index_collection(folder_index, folder, prefix, ext, index)
            print(f"  {name}: {n}")
    else:
        index = {"tokens": {}, "lookups": {}, "settings": {}}
        for folder_index, (name, prefix, ext) in enumerate(COLLECTIONS):
            folder = ABCRESOURCES / name
            print(f"Indexing {name} ({folder_index})…", flush=True)
            n = index_collection(folder_index, folder, prefix, ext, index)
            print(f"  {name}: {n} tunes", flush=True)

    out_path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {out_path} lookups={len(index['lookups'])} tokens={len(index['tokens'])} "
        f"size_mb={out_path.stat().st_size / 1e6:.1f}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
