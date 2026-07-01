#!/usr/bin/env python3
"""Extract Brooke Marshal songbook PDF into intermediate JSON for ABC import.

Each table row is one block:
  lyrics column(s) + section label + chords
Column order varies by page; cells are classified by content.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("Install pdfplumber: pip install pdfplumber", file=sys.stderr)
    sys.exit(1)

PDF_PATH = Path("/home/stever/Downloads/brookesongs.pdf")
OUT_DIR = Path(__file__).resolve().parent / "brooke-marshal-output" / "json"
COMPOSER = "Brooke Marshal"
BOOK = "brooke marshal"
TAG = "brooke marshal originals"

SMALL_WORDS = {
    "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to",
    "from", "by", "in", "of", "de", "if", "as",
}

APOSTROPHE_FIXES = {
    "DONT": "Don't", "CANT": "Can't", "IVE": "I've", "YOURE": "You're",
    "ILL": "I'll", "IM": "I'm", "WONT": "Won't", "ISNT": "Isn't",
    "THATS": "That's", "WHOS": "Who's", "ITS": "It's",
}

KNOWN_CAPO = {10: 2, 20: 4, 25: 3, 26: 3}


def title_case(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"\s*–\s*\d+\s*BPM\s*$", "", raw, flags=re.I)
    raw = re.sub(r"\s+\d+(?:st|nd|rd|th)\s+capo\s*$", "", raw, flags=re.I)
    words = re.split(r"(\s+)", raw)
    out = []
    word_index = 0
    for part in words:
        if not part.strip():
            out.append(part)
            continue
        w = part
        upper = w.upper().strip("?.,!'\"")
        if upper in APOSTROPHE_FIXES:
            out.append(APOSTROPHE_FIXES[upper] + ("?" if w.endswith("?") else ""))
            word_index += 1
            continue
        lower = w.lower()
        if word_index > 0 and lower.strip("?.,!'\"'") in SMALL_WORDS:
            out.append(lower)
        else:
            out.append(w[:1].upper() + w[1:].lower() if w else w)
        word_index += 1
    return "".join(out).strip()


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "untitled"


def normalize_chord_token(token: str) -> str:
    t = re.sub(r"[(),.:|]", "", token.strip())
    t = re.sub(r"^([A-G])flat", r"\1b", t, flags=re.I)
    t = re.sub(r"^([A-G])sharp", r"\1#", t, flags=re.I)
    return t


def normalize_chord_line(text: str) -> str:
    t = split_chord_blob(text.strip())
    m = re.match(r"^\(([^)]+)\)\s*x\s*\d+$", t, re.I)
    if m:
        return " ".join(normalize_chord_token(tok) for tok in m.group(1).split())
    m = re.match(r"^(.+?)\s+[xX]\s*\d+$", t)
    if m:
        parts = m.group(1).split()
        if parts and all(is_chord_token(p) for p in parts):
            return " ".join(normalize_chord_token(p) for p in parts)
    if is_chord_line(t):
        return " ".join(normalize_chord_token(tok) for tok in t.split())
    return t


ANNOTATION_PATTERNS = [
    re.compile(r"^am up \d+$", re.I),
    re.compile(r"^then \d+$", re.I),
    re.compile(r"^frets$|^stop$|^single$|^double$|^half\s+time$", re.I),
    re.compile(r"^[xX]\s*\d+$"),
    re.compile(r"^(chorus|verse|intro|bridge|solo|break)\s*x\s*$", re.I),
    re.compile(r"^\d+$"),
    re.compile(r"^solos bass x \d+$", re.I),
    re.compile(r"^\(extended\)$", re.I),
    re.compile(r"^fade build stop$", re.I),
    re.compile(r"^elonga$", re.I),
    re.compile(r"^scatty", re.I),
    re.compile(r"^extra gap", re.I),
    re.compile(r"^calling x \d+$", re.I),
    re.compile(r"^and they play it out again x \d+$", re.I),
]


def is_annotation_line(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    return any(p.match(t) for p in ANNOTATION_PATTERNS)


def try_normalize_to_chord_line(text: str) -> str | None:
    t = split_chord_blob(text.strip())
    if not t or t.startswith("#"):
        return None
    normalized = normalize_chord_line(t)
    if is_chord_line(normalized):
        return normalized
    return None


def postprocess_sheet_lines(sheet: list[str]) -> list[str]:
    out: list[str] = []
    for line in sheet:
        if not line.strip():
            out.append(line)
            continue
        if is_annotation_line(line):
            continue
        chord = try_normalize_to_chord_line(line)
        if chord:
            out.append(chord)
            continue
        if line.startswith("#"):
            out.append(line)
            continue
        out.append(line)
    return out


def split_chord_blob(text: str) -> str:
    t = text.strip()
    if not t:
        return t
    if " " in t:
        return re.sub(r"\s+", " ", t)
    parts = re.findall(r"[A-G](?:#|b|flat)?(?:maj|min|m|dim|aug|sus|add)?[0-9]*", t, re.I)
    if parts and len(parts) >= 2:
        compact = re.sub(r"[^A-Ga-g#b]", "", t)
        joined = "".join(parts)
        if joined.replace("b", "").replace("#", "") == compact.replace("b", "").replace("#", ""):
            return " ".join(parts)
    return t


def is_chord_token(token: str) -> bool:
    t = token.strip().replace("flat", "b").replace("sharp", "#")
    t = re.sub(r"[(),.:|/]", "", t)
    if not t:
        return False
    if re.match(r"^[a-g]$", t):
        return False
    if re.match(r"^[A-G][#b]?m?$", t):
        return True
    if re.match(r"^[A-G][#b]?(?:maj|min|dim|aug|sus|add)?[0-9]*$", t):
        return True
    if re.match(r"^bflat[0-9]?$", t, re.I):
        return True
    return False


def is_chord_line(text: str) -> bool:
    t = split_chord_blob(text.strip())
    if not t or t.startswith("#"):
        return False
    if re.search(r"\)\s*x\s*\d+", t):
        return True
    if "/" in t and all(is_chord_token(p) or p.lower() == "x" for p in t.split("/")):
        return True
    tokens = [tok for tok in t.split() if tok.lower() not in {"x", "up", "then", "frets", "stop"}]
    return bool(tokens) and all(is_chord_token(tok) for tok in tokens)


def normalize_section(text: str) -> str | None:
    t = re.sub(r"\s+", " ", text.strip())
    if not t:
        return None
    patterns = [
        (re.compile(r"^intro(?:\s*=\s*v)?\s*(?:x\s*(\d+))?$", re.I), "# Intro"),
        (re.compile(r"^interlude(?:\s*\(same as verse\))?\s*(?:x\s*(\d+))?$", re.I), "# Interlude"),
        (re.compile(r"^v\s*interlude$", re.I), "# Interlude"),
        (re.compile(r"^interlude\s+short$", re.I), "# Interlude"),
        (re.compile(r"^v\.?\s*(\d+)(?:\s*x\s*(\d+))?$", re.I), "# Verse"),
        (re.compile(r"^verse\s*(\d+)(?:\s*x\s*(\d+))?$", re.I), "# Verse"),
        (re.compile(r"^v(\d+)(?:\s*x\s*(\d+))?$", re.I), "# Verse"),
        (re.compile(r"^v\s*(\d+)?(?:\s*solo)?(?:\s*x\s*(\d+))?$", re.I), "# Verse"),
        (re.compile(r"^v$", re.I), "# Verse"),
        (re.compile(r"^ch(?:orus)?\s*(\d+)?(?:\s*\*)?(?:\s*x\s*(\d+))?$", re.I), "# Chorus"),
        (re.compile(r"^ch(\d+)(?:\s*\*)?$", re.I), "# Chorus"),
        (re.compile(r"^chorus\s*x\s+(\d+)$", re.I), "# Chorus"),
        (re.compile(r"^interlude\s*x?\s*/?\s*(\d+)$", re.I), "# Interlude"),
        (re.compile(r"^pre\s*ch(?:orus)?$", re.I), "# Pre-Chorus"),
        (re.compile(r"^bridge(?:\s+.*)?$", re.I), "# Bridge"),
        (re.compile(r"^b$", re.I), "# Bridge"),
        (re.compile(r"^outro$", re.I), "# Outro"),
        (re.compile(r"^solo(?:\s+.*)?$", re.I), "# Solo"),
        (re.compile(r"^break(?:\s+x\s*(\d+))?$", re.I), "# Break"),
        (re.compile(r"^guitar\s+verse$", re.I), "# Guitar Verse"),
        (re.compile(r"^into\s+bass$", re.I), "# Intro"),
        (re.compile(r"^intro\s+flute$", re.I), "# Intro"),
        (re.compile(r"^intro$", re.I), "# Intro"),
        (re.compile(r"^roundy\s+hook$", re.I), "# Hook"),
        (re.compile(r"^hard\s+c$", re.I), "# Hard Stop"),
        (re.compile(r"^echo\s*\((.+)\)$", re.I), "# Echo"),
        (re.compile(r"^pre\s*ch$", re.I), "# Pre-Chorus"),
        (re.compile(r"^ch$", re.I), "# Chorus"),
        (re.compile(r"^CH$"), "# Chorus"),
        (re.compile(r"^ch\s*x\s*(\d+)$", re.I), "# Chorus"),
    ]
    for pat, label in patterns:
        m = pat.match(t)
        if not m:
            continue
        if label == "# Echo":
            return f"# Echo ({m.group(1).strip()})"
        groups = [g for g in m.groups() if g]
        if label == "# Verse" and groups:
            header = f"# Verse {groups[0]}"
            if len(groups) > 1:
                header += f" (x {groups[1]})"
            return header
        if label == "# Chorus" and groups:
            if re.match(r"^chorus\s*x", t, re.I):
                return f"# Chorus (x {groups[0]})"
            if str(groups[0]).isdigit():
                return f"{label} {groups[0]}"
        if label in {"# Intro", "# Interlude", "# Break", "# Chorus"} and groups:
            if str(groups[0]).isdigit():
                return f"{label} (x {groups[0]})" if label != "# Chorus" else f"{label} {groups[0]}"
            return f"{label} (x {groups[0]})"
        return label
    if re.match(r"^verse\s*\d+:$", t, re.I):
        return "# " + t.replace(":", "").strip().title()
    return None


def parse_capo_tempo(text: str) -> tuple[int | None, int | None]:
    capo = tempo = None
    m = re.search(r"capo\s*(?:on\s*)?(\d+)(?:st|nd|rd|th)?\s*fret", text, re.I)
    if m:
        capo = int(m.group(1))
    m = re.search(r"(\d+)(?:st|nd|rd|th)\s+fret", text, re.I)
    if m and capo is None:
        capo = int(m.group(1))
    m = re.search(r"(\d+)(?:st|nd|rd|th)\s+capo", text, re.I)
    if m:
        capo = int(m.group(1))
    m = re.search(r"(\d+)\s*bpm", text, re.I)
    if m:
        tempo = int(m.group(1))
    return capo, tempo


def clean_title_text(raw: str) -> str:
    t = raw.strip()
    t = re.sub(r"\s+\d+(?:st|nd|rd|th)\s+capo.*$", "", t, flags=re.I)
    t = re.sub(r"\s*–\s*\d+\s*BPM.*$", "", t, flags=re.I)
    t = re.sub(r"\s+\d+(?:st|nd|rd|th)\s+fret.*$", "", t, flags=re.I)
    if is_chord_line(t):
        return ""
    return t.strip()


def parse_toc(page) -> list[dict]:
    songs = []
    for line in (page.extract_text() or "").splitlines():
        m = re.match(r"^\s*(\d+)\.\s+(.+?)\s*$", line.strip())
        if not m:
            continue
        num = int(m.group(1))
        raw_title = m.group(2).strip()
        capo, tempo = parse_capo_tempo(raw_title)
        raw_title = re.sub(r"\s*–\s*\d+\s*BPM\s*$", "", raw_title, flags=re.I)
        songs.append({
            "num": num, "rawTitle": raw_title,
            "name": title_case(raw_title), "capo": capo, "tempo": tempo,
        })
    return songs


def row_texts(row) -> list[str]:
    return [(c or "").strip() for c in row if (c or "").strip()]


def parse_title_from_row(row) -> tuple[int, str] | None:
    cells = row_texts(row)
    if not cells:
        return None
    combined = " ".join(c.replace("\n", " ") for c in cells)

    m = re.match(r"^(\d+)\.\s*(.+)$", combined)
    if m and m.group(2).strip():
        title = clean_title_text(m.group(2).strip())
        if title:
            return int(m.group(1)), title

    m = re.match(r"^(\d+)\.([A-Za-z].+)$", combined.replace(" ", ""))
    if m:
        title = clean_title_text(m.group(2).strip())
        if title:
            return int(m.group(1)), title

    if len(cells) >= 2 and re.match(r"^\d+\.?$", cells[0]):
        title = clean_title_text(" ".join(cells[1:]))
        if title:
            return int(cells[0].rstrip(".")), title

    if len(cells) == 1:
        parts = cells[0].split("\n")
        m = re.match(r"^(\d+)\.?$", parts[0].strip())
        if m and len(parts) > 1:
            title = clean_title_text(" ".join(p.strip() for p in parts[1:]))
            if title:
                return int(m.group(1)), title
        m = re.match(r"^(\d+)\.\s*(.+)$", cells[0].replace("\n", " "), re.I)
        if m:
            title = clean_title_text(m.group(2).strip())
            if title:
                return int(m.group(1)), title

    return None


def classify_cell(text: str) -> str:
    t = text.strip()
    if not t:
        return "empty"
    lines = [ln.strip() for ln in t.split("\n") if ln.strip()]
    if len(lines) == 1 and len(t) < 35:
        if normalize_section(t):
            return "section"
        if is_chord_line(t):
            return "chords"
        if re.match(r"^(x\s*\d+|x\d+)$", t, re.I):
            return "annotation"
    chord_lines = [ln for ln in lines if is_chord_line(ln)]
    section_lines = [ln for ln in lines if normalize_section(ln)]
    lyric_lines = [ln for ln in lines if not is_chord_line(ln) and not normalize_section(ln)
                   and not re.match(r"^(x\s*\d+|x\d+)$", ln, re.I)]
    if chord_lines and not lyric_lines and not section_lines:
        return "chords"
    if section_lines and not lyric_lines and len(t) < 40:
        return "section"
    if lyric_lines:
        return "lyrics"
    if section_lines:
        return "section"
    if chord_lines:
        return "chords"
    return "lyrics"


def parse_row_to_block(row) -> list[str]:
    if parse_title_from_row(row):
        return []

    cells = [(c or "").strip() for c in row]
    non_empty = [(i, c) for i, c in enumerate(cells) if c]
    if not non_empty:
        return []

    headers: list[str] = []
    chord_lines: list[str] = []
    lyrics: list[str] = []

    for _i, text in non_empty:
        normalized = re.sub(r"\s*/\s*", " ", text)
        for line in normalized.split("\n"):
            line = line.strip()
            if not line:
                continue
            if re.match(r"^\d+\.", line):
                continue
            if re.match(r"^(x\s*\d+|x\d+)$", line, re.I):
                continue
            if is_annotation_line(line):
                continue
            if re.match(r"^(single|with|solo|double|half\s+time)$", line, re.I):
                continue
            if re.match(r"^\d+:$", line):
                continue
            sec = normalize_section(line)
            if sec and len(line) < 50:
                headers.append(sec)
                continue
            chord = try_normalize_to_chord_line(line)
            if chord:
                chord_lines.append(chord)
                continue
            if sec:
                headers.append(sec)
            else:
                lyrics.append(line)

    block: list[str] = []
    block.extend(headers)
    block.extend(chord_lines)
    block.extend(lyrics)
    return block


def collect_all_rows(pdf) -> list[tuple[int, int, list]]:
    out = []
    for page_index in range(1, len(pdf.pages)):
        tables = sorted(pdf.pages[page_index].find_tables(), key=lambda t: t.bbox[1])
        for table_index, table in enumerate(tables):
            for row in table.extract() or []:
                out.append((page_index, table_index, row))
    return out


def segment_rows_by_song(all_rows: list[tuple[int, int, list]], toc: list[dict]) -> dict[int, list[tuple[int, int, list]]]:
    toc_by_num = {s["num"]: s for s in toc}
    segments: dict[int, list[tuple[int, int, list]]] = {}
    current_num: int | None = None
    buffer: list[tuple[int, int, list]] = []

    def assign_buffer_to_song(num: int, rows: list[tuple[int, int, list]]) -> None:
        if rows:
            segments[num] = rows[:]

    def split_buffer_before(end_num: int) -> None:
        nonlocal buffer, current_num
        if current_num is None or not buffer:
            return
        if end_num <= current_num + 1:
            assign_buffer_to_song(current_num, buffer)
            buffer = []
            return
        keys = sorted({(pi, ti) for pi, ti, _ in buffer})
        if len(keys) <= 1:
            assign_buffer_to_song(current_num, buffer)
            buffer = []
            return
        first_key = keys[0]
        assign_buffer_to_song(
            current_num,
            [(pi, ti, row) for pi, ti, row in buffer if (pi, ti) == first_key],
        )
        for missing_num in range(current_num + 1, end_num):
            key = keys[min(missing_num - current_num, len(keys) - 1)]
            assign_buffer_to_song(
                missing_num,
                [(pi, ti, row) for pi, ti, row in buffer if (pi, ti) == key],
            )
        buffer = []

    for page_i, table_i, row in all_rows:
        title = parse_title_from_row(row)
        if title:
            num, _raw_title = title
            if num not in toc_by_num:
                continue
            if current_num is not None:
                if num == current_num + 1:
                    assign_buffer_to_song(current_num, buffer)
                elif num > current_num + 1:
                    split_buffer_before(num)
                else:
                    assign_buffer_to_song(current_num, buffer)
                buffer = []
            current_num = num
            continue
        if current_num is not None:
            buffer.append((page_i, table_i, row))

    if current_num is not None and buffer:
        assign_buffer_to_song(current_num, buffer)

    for meta in toc:
        segments.setdefault(meta["num"], [])

    if 28 in segments and len(segments.get(28, [])) < 5:
        segments[28] = [
            (pi, ti, row) for pi, ti, row in all_rows
            if (pi == 29 and ti >= 1) or pi == 30
        ]

    return segments


def rows_to_sheet_lines(rows: list[tuple[int, int, list]]) -> list[str]:
    sheet: list[str] = []
    for _page_i, _table_i, row in rows:
        block = parse_row_to_block(row)
        if not block:
            continue
        if sheet:
            sheet.append("")
        sheet.extend(block)
    return sheet


def build_song(meta: dict, rows: list[tuple[int, int, list]]) -> dict:
    capo = KNOWN_CAPO.get(meta["num"], meta.get("capo"))
    tempo = meta.get("tempo")
    for _p, _t, row in rows[:8]:
        c, t = parse_capo_tempo(" ".join(row_texts(row)))
        if c is not None and meta["num"] not in KNOWN_CAPO:
            capo = c
        if t is not None:
            tempo = t
    return {
        "num": meta["num"],
        "name": meta["name"],
        "composer": COMPOSER,
        "books": [BOOK],
        "tags": [TAG],
        "capo": capo,
        "tempo": tempo,
        "sheetLines": postprocess_sheet_lines(rows_to_sheet_lines(rows)),
    }


def extract_songs_from_pdf(pdf) -> list[dict]:
    toc = parse_toc(pdf.pages[0])
    all_rows = collect_all_rows(pdf)
    segments = segment_rows_by_song(all_rows, toc)
    toc_by_num = {s["num"]: s for s in toc}
    songs = []
    for meta in toc:
        rows = segments.get(meta["num"], [])
        songs.append(build_song(meta, rows))
    return songs


def main() -> int:
    if not PDF_PATH.exists():
        print(f"PDF not found: {PDF_PATH}", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.json"):
        old.unlink()

    with pdfplumber.open(PDF_PATH) as pdf:
        songs_out = extract_songs_from_pdf(pdf)

    for song in songs_out:
        path = OUT_DIR / f"{song['num']:02d}-{slugify(song['name'])}.json"
        path.write_text(json.dumps(song, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    (OUT_DIR / "_summary.json").write_text(
        json.dumps(songs_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Wrote {len(songs_out)} songs to {OUT_DIR}")
    print(f"{'#':>3}  {'Title':<32}  {'Lines':>5}  {'Hdrs':>4}  {'Chrd':>4}  Capo  Tempo")
    print("-" * 72)
    for song in songs_out:
        lines = song["sheetLines"]
        chords = sum(1 for ln in lines if is_chord_line(ln))
        headers = sum(1 for ln in lines if str(ln).startswith("#"))
        print(
            f"{song['num']:3d}  {song['name'][:32]:<32}  {len(lines):5d}  {headers:4d}  {chords:4d}  "
            f"{str(song.get('capo') or '-'):>4}  {str(song.get('tempo') or '-'):>5}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
