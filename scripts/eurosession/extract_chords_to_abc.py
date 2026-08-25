#!/usr/bin/env python3
"""OCR chord symbols above staves and align them into melody ABC as quote-chords.

Adds/updates a candidate with source `omr-chords` when confidence gates pass.
Does not overwrite a selected Session chorded setting unless it ranks higher.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "local-resolver"))

from omr_and_lookup import ensure_x_header, looks_weak_abc  # noqa: E402
from repair_abc import normalize_transpose_in_abc, rebuild_abc_file  # noqa: E402
from sheet_image_staff_detect import detect_staff_regions  # noqa: E402
from split_by_titles import find_tesseract, tesseract_ocr_boxes  # noqa: E402

# Chord grammar: Am, D7, G/B, F#m, Bbmaj7, Csus4, etc.
CHORD_TOKEN_RE = re.compile(
    r"^[A-G](?:#|b|♯|♭)?(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:/[A-G](?:#|b|♯|♭)?)?$",
    re.I,
)
QUOTE_CHORD_RE = re.compile(r'"[^"\n]*"')
NOTE_START_RE = re.compile(r"(?:\^[A-Ga-g]|_[A-Ga-g]|=[A-Ga-g]|[A-Ga-gzZ])")


def chord_count(abc: str) -> int:
    return len(re.findall(r'"\s*[A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:/[A-G][#b]?)?\s*"', abc or "", re.I))


def candidate_id(source: str, abc: str) -> str:
    digest = hashlib.sha1((source + "\n" + (abc or "")[:800]).encode("utf-8", errors="replace")).hexdigest()[:10]
    safe = re.sub(r"[^a-zA-Z0-9:_-]+", "-", (source or "src"))[:40]
    return f"{safe}-{digest}"


def normalize_chord_token(text: str) -> str | None:
    raw = (text or "").strip().replace("♯", "#").replace("♭", "b")
    raw = re.sub(r"\s+", "", raw)
    # OCR often reads | as I or l glued on; strip punctuation.
    raw = raw.strip(".,;:|()[]{}'")
    if not raw or not CHORD_TOKEN_RE.match(raw):
        return None
    # Canonicalize: root upper, quality lower-ish (Am, D7, G/B).
    m = re.match(r"^([A-G])([#b]?)(.*)$", raw, re.I)
    if not m:
        return None
    root = m.group(1).upper() + (m.group(2) or "")
    rest = m.group(3) or ""
    if rest.lower() in {"maj", "major"}:
        rest = ""
    elif rest.lower() in {"min", "minor"}:
        rest = "m"
    return root + rest


def is_music_line(line: str) -> bool:
    s = (line or "").strip()
    if not s or s.startswith("%"):
        return False
    if re.match(r"^[A-Za-z]:", s):
        return False
    return bool(re.search(r"[A-Ga-gzZ|:]", s))


def strip_quote_chords(abc: str) -> str:
    lines = []
    for line in (abc or "").splitlines():
        if is_music_line(line):
            lines.append(QUOTE_CHORD_RE.sub("", line))
        else:
            lines.append(line)
    return "\n".join(lines)


def split_melody_bars(abc: str) -> list[str]:
    """Flatten music lines and split on barlines into bar contents (no |)."""
    body_parts = []
    for line in (abc or "").splitlines():
        if is_music_line(line):
            body_parts.append(line.strip())
    flat = " ".join(body_parts)
    # Keep volta markers with following content loosely.
    raw_bars = re.split(r"\|+", flat)
    bars = []
    for b in raw_bars:
        b = b.strip()
        if not b or b in {":", "]"}:
            continue
        # Drop leading : from |: segments
        b = re.sub(r"^:+", "", b).strip()
        if b:
            bars.append(b)
    return bars


def insert_chord_before_beat(bar: str, chord: str, beat_frac: float) -> str:
    """Insert \"Chord\" before a note near beat_frac within the bar text."""
    # Find note-ish positions.
    positions = [m.start() for m in NOTE_START_RE.finditer(bar)]
    if not positions:
        return f'"{chord}"{bar}'
    idx = int(round(max(0.0, min(1.0, beat_frac)) * (len(positions) - 1)))
    pos = positions[idx]
    return bar[:pos] + f'"{chord}"' + bar[pos:]


def rebuild_abc_with_bars(abc: str, chorded_bars: list[str]) -> str:
    """Replace music body with chorded bars joined by |, preserving headers."""
    headers = []
    for line in (abc or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if is_music_line(line):
            break
        headers.append(line)
    # Prefer keeping first |: style if original started with repeat.
    body = "|".join(chorded_bars)
    if body and not body.startswith("|"):
        body = "|" + body
    if not body.endswith("|"):
        body = body + "|"
    return "\n".join(headers + [body]).strip() + "\n"


def filter_chord_boxes(
    boxes: list[dict],
    bands: list[dict],
    image_height: float,
) -> list[dict]:
    """Keep chord-like tokens sitting in the band above each staff system."""
    if not bands:
        # Fallback: top 18% of image often holds chord row for single-system crops.
        y_max = image_height * 0.22
        out = []
        for b in boxes:
            token = normalize_chord_token(str(b.get("text") or ""))
            if not token:
                continue
            cy = float(b.get("y") or 0) + float(b.get("height") or 0) / 2.0
            if cy > y_max:
                continue
            out.append({**b, "chord": token, "cx": float(b.get("x") or 0) + float(b.get("width") or 0) / 2.0})
        return out

    chords = []
    for i, band in enumerate(bands):
        top = float(band.get("top") or 0)
        prev_bottom = float(bands[i - 1].get("bottom") or 0) if i > 0 else 0.0
        # Chord row: from just below previous staff (or image top) down to staff top.
        zone_top = prev_bottom + 2 if i > 0 else 0.0
        zone_bottom = top + max(8.0, (float(band.get("bottom") or top) - top) * 0.15)
        # Prefer the upper portion immediately above the staff.
        prefer_top = max(zone_top, top - max(40.0, (top - zone_top) * 0.85))
        for b in boxes:
            token = normalize_chord_token(str(b.get("text") or ""))
            if not token:
                continue
            cy = float(b.get("y") or 0) + float(b.get("height") or 0) / 2.0
            if cy < prefer_top or cy > zone_bottom:
                continue
            chords.append(
                {
                    **b,
                    "chord": token,
                    "cx": float(b.get("x") or 0) + float(b.get("width") or 0) / 2.0,
                    "staffIndex": i,
                }
            )
    return chords


def align_chords_to_abc(
    abc: str,
    chord_boxes: list[dict],
    staff_left: float,
    staff_right: float,
) -> tuple[str | None, dict]:
    """Map chord boxes by x into bars; return chorded ABC or None + status."""
    melody = strip_quote_chords(abc)
    bars = split_melody_bars(melody)
    status = {
        "ocrChords": len(chord_boxes),
        "bars": len(bars),
        "placed": 0,
        "mappedFraction": 0.0,
    }
    if len(bars) < 2 or len(chord_boxes) < 3:
        status["reason"] = "too-few-bars-or-chords"
        return None, status

    width = max(1.0, staff_right - staff_left)
    # Group chords by approximate bar via x fraction across full staff width.
    # Multi-system: use staffIndex to offset bar ranges.
    staff_indices = sorted({int(c.get("staffIndex") or 0) for c in chord_boxes}) or [0]
    systems = max(1, len(staff_indices))
    bars_per_system = max(1, int(round(len(bars) / systems)))

    placements: list[tuple[int, float, str]] = []  # bar_idx, beat_frac, chord
    for c in sorted(chord_boxes, key=lambda x: (int(x.get("staffIndex") or 0), float(x.get("cx") or 0))):
        frac = (float(c["cx"]) - staff_left) / width
        frac = max(0.0, min(0.999, frac))
        sys_i = int(c.get("staffIndex") or 0)
        local_bar = int(frac * bars_per_system)
        bar_idx = min(len(bars) - 1, sys_i * bars_per_system + local_bar)
        # Beat within bar: subdivide by leftover fraction inside the bar slot.
        slot = 1.0 / bars_per_system
        local_frac = (frac - local_bar * slot) / slot if slot > 0 else 0.0
        beat = max(0.0, min(1.0, local_frac))
        placements.append((bar_idx, beat, c["chord"]))

    # Merge multiple chords on same bar: keep order by beat.
    by_bar: dict[int, list[tuple[float, str]]] = {}
    for bar_idx, beat, chord in placements:
        by_bar.setdefault(bar_idx, []).append((beat, chord))

    chorded_bars = list(bars)
    placed = 0
    for bar_idx, items in by_bar.items():
        items.sort(key=lambda t: t[0])
        # Dedupe identical consecutive chords on same bar.
        cleaned = []
        for beat, chord in items:
            if cleaned and cleaned[-1][1] == chord and abs(cleaned[-1][0] - beat) < 0.15:
                continue
            cleaned.append((beat, chord))
        text = chorded_bars[bar_idx]
        # Insert from right to left so indices stay valid — rebuild via successive inserts.
        # Simpler: strip and place evenly if many.
        if len(cleaned) == 1:
            text = insert_chord_before_beat(QUOTE_CHORD_RE.sub("", text), cleaned[0][1], cleaned[0][0])
            placed += 1
        else:
            text = QUOTE_CHORD_RE.sub("", text)
            # Insert highest beat first.
            for beat, chord in sorted(cleaned, key=lambda t: t[0], reverse=True):
                text = insert_chord_before_beat(text, chord, beat)
                placed += 1
        chorded_bars[bar_idx] = text

    mapped_frac = placed / max(1, len(chord_boxes))
    status["placed"] = placed
    status["mappedFraction"] = round(mapped_frac, 3)
    if placed < 3 or mapped_frac < 0.6:
        status["reason"] = "confidence-gate"
        return None, status

    out = rebuild_abc_with_bars(melody, chorded_bars)
    out = normalize_transpose_in_abc(out)
    status["reason"] = "ok"
    return out, status


def pick_base_abc(entry: dict) -> str:
    """Prefer OMR / current melody ABC (strip chords) as alignment base."""
    cands = list(entry.get("candidates") or [])
    # Prefer omr* without requiring chords.
    for c in cands:
        src = str(c.get("source") or "")
        if src.startswith("omr") and c.get("abc"):
            return str(c["abc"])
    if entry.get("abc") and "%% missing abc" not in str(entry.get("abc") or ""):
        return str(entry["abc"])
    for c in cands:
        if c.get("abc"):
            return str(c["abc"])
    return ""


def process_tune(
    entry: dict,
    work: Path,
    tesseract_bin: str,
    lang: str,
) -> dict:
    title = str(entry.get("title") or "Tune")
    crop_rel = entry.get("cropPath") or ""
    crop = Path(crop_rel) if crop_rel else None
    if crop and not crop.is_absolute():
        crop = work / crop
    if not crop or not crop.exists():
        # Try tunes/ by basename from page+index.
        page = int(entry.get("page") or 0)
        ti = int(entry.get("tuneIndex") or 0)
        matches = list((work / "tunes").glob(f"p{page:02d}_{ti:02d}_*.jpg"))
        crop = matches[0] if matches else None
    if not crop or not crop.exists():
        entry["chordOcrStatus"] = {"reason": "missing-crop"}
        return entry

    base_abc = pick_base_abc(entry)
    if not base_abc or looks_weak_abc(base_abc):
        entry["chordOcrStatus"] = {"reason": "weak-base-abc"}
        return entry

    try:
        staff_info = detect_staff_regions(str(crop))
    except Exception as exc:
        entry["chordOcrStatus"] = {"reason": f"staff-detect-failed:{exc}"}
        return entry
    bands = list(staff_info.get("staffRegions") or [])

    boxes = tesseract_ocr_boxes(crop, tesseract_bin, lang)
    # Image height from staff bands or boxes.
    image_height = 0.0
    if bands:
        image_height = max(float(b.get("bottom") or 0) for b in bands) + 40
    for b in boxes:
        image_height = max(image_height, float(b.get("y") or 0) + float(b.get("height") or 0))
    chord_boxes = filter_chord_boxes(boxes, bands, image_height or 1000.0)
    if bands:
        staff_left = min(float(b.get("left") or 0) for b in bands)
        staff_right = max(float(b.get("right") or 0) for b in bands)
    else:
        staff_left = 0.0
        staff_right = max((float(b.get("x") or 0) + float(b.get("width") or 0) for b in boxes), default=1000.0)

    chorded, status = align_chords_to_abc(base_abc, chord_boxes, staff_left, staff_right)
    entry["chordOcrStatus"] = status
    if not chorded:
        return entry

    row = {
        "id": candidate_id("omr-chords", chorded),
        "source": "omr-chords",
        "matchedTitle": title,
        "url": "",
        "score": round(0.55 + 0.01 * min(20, status.get("placed") or 0), 3),
        "chords": chord_count(chorded),
        "hasChords": True,
        "abc": ensure_x_header(chorded, int(entry.get("x") or 1), title),
        "chordOcrStatus": status,
    }

    cands = [c for c in (entry.get("candidates") or []) if str(c.get("source") or "") != "omr-chords"]
    cands.append(row)
    # Prefer chorded when sorting for display; selection: only bump if current lacks chords.
    cands.sort(key=lambda c: (bool(c.get("hasChords")), int(c.get("chords") or 0), float(c.get("score") or 0)), reverse=True)
    entry["candidates"] = cands

    selected_id = str(entry.get("selectedCandidateId") or "")
    selected = next((c for c in cands if c.get("id") == selected_id), None)
    if not selected or not selected.get("hasChords"):
        # Prefer omr-chords over chordless OMR, but not over a strong chorded Session setting.
        chorded_others = [c for c in cands if c.get("hasChords") and c.get("source") != "omr-chords"]
        if not chorded_others:
            entry["selectedCandidateId"] = row["id"]
            entry["abc"] = row["abc"]
            entry["abcSource"] = "omr-chords"
            entry["lookupMatch"] = title
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="OCR chords above staves into ABC quote-chords")
    parser.add_argument("--work", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--lang", default="eng+fra")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--no-rebuild-abc", action="store_true")
    args = parser.parse_args()

    work = Path(args.work)
    manifest_path = work / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    tunes = list(manifest.get("tunes") or [])
    if args.limit > 0:
        tunes = tunes[: args.limit]

    tesseract_bin = find_tesseract()
    ok = 0
    for i, entry in enumerate(tunes, start=1):
        title = str(entry.get("title") or f"Tune {i}")
        print(f"[{i}/{len(tunes)}] {title}", flush=True)
        process_tune(entry, work, tesseract_bin, args.lang)
        status = entry.get("chordOcrStatus") or {}
        if status.get("reason") == "ok":
            ok += 1
            print(f"  omr-chords placed={status.get('placed')} mapped={status.get('mappedFraction')}")
        else:
            print(f"  skip: {status.get('reason')} ocr={status.get('ocrChords', 0)}")

    if not args.no_rebuild_abc:
        # Keep selected ABC in sync for selected omr-chords.
        for i, entry in enumerate(tunes, start=1):
            sid = entry.get("selectedCandidateId")
            for c in entry.get("candidates") or []:
                if c.get("id") == sid and c.get("abc"):
                    entry["abc"] = ensure_x_header(str(c["abc"]), i, str(entry.get("title") or f"Tune {i}"))
                    entry["abcSource"] = c.get("source") or entry.get("abcSource")
                    break
        rebuild_abc_file(work, tunes)

    manifest["tunes"] = tunes
    manifest["chordOcrCount"] = ok
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"done: omr-chords candidates={ok}/{len(tunes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
