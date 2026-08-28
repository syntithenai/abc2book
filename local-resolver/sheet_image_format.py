"""Early sheet-image format classification (before expensive HOMR).

Formats:
  notation_only | chord_chart | lyrics_only | mixed | unknown
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from chord_sheet_utils import classify_lyric_chord_lines, has_chord_lines
from chords_fetch import token_is_chord

SHEET_FORMATS = (
    "notation_only",
    "chord_chart",
    "lyrics_only",
    "mixed",
    "unknown",
)

COMPOSER_RE = re.compile(
    r"(?i)\b(?:words|lyrics|music|composed?|arr(?:anged)?)\s*by\s*[:\-]?\s*(.+)$"
)
TITLE_ARTIST_RE = re.compile(r"^(.+?)\s*[-–—|]\s*(.+)$")
KEY_HINT_RE = re.compile(r"(?i)\b(?:key|tonality)\s*[:\-]?\s*([A-G][#b]?(?:m|min|maj)?)\b")
CAPO_RE = re.compile(r"(?i)\bcapo\s*[:\-]?\s*(\d{1,2})\b")


@dataclass
class FormatScores:
    notation_only: float = 0.0
    chord_chart: float = 0.0
    lyrics_only: float = 0.0
    mixed: float = 0.0
    unknown: float = 0.0

    def best(self) -> tuple[str, float]:
        items = [
            ("notation_only", self.notation_only),
            ("chord_chart", self.chord_chart),
            ("lyrics_only", self.lyrics_only),
            ("mixed", self.mixed),
            ("unknown", self.unknown),
        ]
        items.sort(key=lambda x: -x[1])
        return items[0]

    def margin(self) -> float:
        items = sorted(
            [self.notation_only, self.chord_chart, self.lyrics_only, self.mixed, self.unknown],
            reverse=True,
        )
        if len(items) < 2:
            return items[0] if items else 0.0
        return items[0] - items[1]

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


def _box_mid_y(box: dict[str, Any]) -> float:
    return float(box.get("y") or 0) + float(box.get("height") or 0) / 2.0


def _cluster_lines_by_y(boxes: list[dict[str, Any]], tol: float = 10.0) -> list[list[dict[str, Any]]]:
    ordered = sorted(boxes or [], key=lambda b: (_box_mid_y(b), float(b.get("x") or 0)))
    rows: list[list[dict[str, Any]]] = []
    for box in ordered:
        mid = _box_mid_y(box)
        if not rows:
            rows.append([box])
            continue
        prev_mid = _box_mid_y(rows[-1][0])
        if abs(mid - prev_mid) <= tol:
            rows[-1].append(box)
        else:
            rows.append([box])
    return rows


def extract_top_band_meta(
    boxes: list[dict[str, Any]],
    image_height: float,
    *,
    top_frac: float = 0.16,
) -> dict[str, Any]:
    """Title / artist / composer / key / capo from the top strip of OCR boxes."""
    h = max(1.0, float(image_height or 1))
    y_max = h * top_frac
    top_boxes = [b for b in (boxes or []) if _box_mid_y(b) <= y_max]
    top_boxes.sort(key=lambda b: (_box_mid_y(b), float(b.get("x") or 0)))
    texts = [str(b.get("text") or "").strip() for b in top_boxes if str(b.get("text") or "").strip()]
    title = ""
    artist = ""
    composer = ""
    key = ""
    capo = None
    for text in texts:
        cm = COMPOSER_RE.search(text)
        if cm and not composer:
            composer = cm.group(1).strip()
            continue
        km = KEY_HINT_RE.search(text)
        if km and not key:
            key = km.group(1)
        cp = CAPO_RE.search(text)
        if cp and capo is None:
            try:
                capo = int(cp.group(1))
            except ValueError:
                pass
        if not title:
            ta = TITLE_ARTIST_RE.match(text)
            if ta:
                title = ta.group(1).strip()
                artist = ta.group(2).strip()
            elif len(text) >= 3 and not token_is_chord(text):
                title = text
        elif not artist and len(text) >= 2 and text != title and not token_is_chord(text):
            # Second non-chord top line often artist/composer
            if not composer:
                artist = text
    return {
        "title": title,
        "artist": artist,
        "composer": composer or artist,
        "key": key,
        "capo": capo,
        "topTexts": texts[:8],
    }


def compute_format_signals(
    staff_info: dict[str, Any] | None,
    ocr_boxes: list[dict[str, Any]] | None,
    raw_lines: list[str] | None,
    *,
    image_height: float = 0.0,
) -> dict[str, Any]:
    staff = staff_info or {}
    has_staff = bool(staff.get("hasStaff"))
    regions = list(staff.get("staffRegions") or [])
    staff_count = int(staff.get("staffRegionCount") or len(regions) or 0)
    avg_staff_h = 0.0
    if regions:
        avg_staff_h = sum(float(r.get("bottom") or 0) - float(r.get("top") or 0) for r in regions) / max(
            1, len(regions)
        )

    boxes = list(ocr_boxes or [])
    lines = [str(x or "") for x in (raw_lines or [])]
    if not lines and boxes:
        # Approximate lines from boxes
        for row in _cluster_lines_by_y(boxes):
            row_sorted = sorted(row, key=lambda b: float(b.get("x") or 0))
            lines.append(" ".join(str(b.get("text") or "").strip() for b in row_sorted if str(b.get("text") or "").strip()))

    classified = classify_lyric_chord_lines(lines)
    chord_line_n = sum(1 for c in classified if c.get("type") == "chord")
    lyric_line_n = sum(1 for c in classified if c.get("type") == "lyric")
    blank_n = sum(1 for c in classified if c.get("type") == "blank")
    header_n = sum(1 for c in classified if c.get("type") == "header")
    non_empty = max(1, chord_line_n + lyric_line_n + header_n)

    chord_tokens = 0
    word_tokens = 0
    for box in boxes:
        tok = str(box.get("text") or "").strip()
        if not tok:
            continue
        if token_is_chord(tok):
            chord_tokens += 1
        else:
            word_tokens += 1
    token_total = max(1, chord_tokens + word_tokens)
    chord_token_density = chord_tokens / token_total

    # Vertical gap pattern: chord row directly above lyric row
    cow_pairs = 0
    for i in range(len(classified) - 1):
        if classified[i].get("type") == "chord" and classified[i + 1].get("type") == "lyric":
            cow_pairs += 1

    lengths = [len(str(c.get("text") or "").strip()) for c in classified if c.get("type") == "lyric"]
    avg_lyric_len = (sum(lengths) / len(lengths)) if lengths else 0.0

    meta = extract_top_band_meta(boxes, image_height or 1000.0)

    return {
        "hasStaff": has_staff,
        "staffCount": staff_count,
        "avgStaffHeight": avg_staff_h,
        "chordLineCount": chord_line_n,
        "lyricLineCount": lyric_line_n,
        "blankLineCount": blank_n,
        "headerLineCount": header_n,
        "chordTokenDensity": chord_token_density,
        "chordTokens": chord_tokens,
        "wordTokens": word_tokens,
        "chordsOverWordsPairs": cow_pairs,
        "avgLyricLineLen": avg_lyric_len,
        "hasChordLines": has_chord_lines(lines),
        "lineCount": non_empty,
        "meta": meta,
    }


def classify_sheet_format(
    staff_info: dict[str, Any] | None,
    ocr_boxes: list[dict[str, Any]] | None = None,
    raw_lines: list[str] | None = None,
    *,
    image_height: float = 0.0,
    margin_threshold: float = 0.12,
) -> dict[str, Any]:
    """Return sheetFormat, confidence, scores, signals, ambiguous flag."""
    signals = compute_format_signals(staff_info, ocr_boxes, raw_lines, image_height=image_height)
    scores = FormatScores()

    has_staff = signals["hasStaff"]
    staff_n = signals["staffCount"]
    chord_dens = signals["chordTokenDensity"]
    chord_lines = signals["chordLineCount"]
    lyric_lines = signals["lyricLineCount"]
    cow = signals["chordsOverWordsPairs"]
    avg_len = signals["avgLyricLineLen"]

    if has_staff:
        scores.notation_only += 0.45 + min(0.25, 0.05 * staff_n)
        if chord_dens > 0.08 or chord_lines >= 1 or cow >= 1:
            scores.mixed += 0.55 + min(0.2, chord_dens)
            scores.notation_only += 0.1
        else:
            scores.notation_only += 0.25
        if lyric_lines >= 2 and avg_len > 20:
            scores.mixed += 0.15
    else:
        scores.notation_only -= 0.2
        if chord_dens >= 0.15 or chord_lines >= 2 or cow >= 1:
            scores.chord_chart += 0.55 + min(0.3, chord_dens) + min(0.15, 0.05 * cow)
        if lyric_lines >= 3 and chord_lines == 0 and chord_dens < 0.08:
            scores.lyrics_only += 0.5 + min(0.25, avg_len / 80.0)
        if chord_lines == 0 and lyric_lines >= 2 and chord_dens < 0.12:
            scores.lyrics_only += 0.2
        if chord_lines >= 1 and lyric_lines >= 2:
            scores.chord_chart += 0.2

    if signals["lineCount"] < 1 and not has_staff:
        scores.unknown += 0.8

    # Normalize soft scores into 0..1-ish by softmax-like clip
    for name in ("notation_only", "chord_chart", "lyrics_only", "mixed", "unknown"):
        val = max(0.0, getattr(scores, name))
        setattr(scores, name, min(1.0, val))

    fmt, conf = scores.best()
    if conf < 0.2:
        fmt, conf = "unknown", max(conf, 0.15)
    ambiguous = scores.margin() < margin_threshold or fmt == "unknown"

    needs_omr = fmt in {"notation_only", "mixed"} or (
        ambiguous and has_staff
    )
    skip_homr = fmt in {"chord_chart", "lyrics_only"} and not ambiguous

    return {
        "sheetFormat": fmt,
        "pageType": fmt,  # alias for existing clients
        "confidence": round(conf, 3),
        "ambiguous": ambiguous,
        "scores": scores.to_dict(),
        "signals": signals,
        "needsOmr": needs_omr,
        "skipHomr": skip_homr,
        "meta": signals.get("meta") or {},
    }


def build_unified_sheet_meta(
    *,
    title: str = "",
    artist: str = "",
    composer: str = "",
    key: str = "",
    capo: Any = None,
    source_format: str = "unknown",
    confidence: float = 0.0,
    ocr_boxes: list[dict[str, Any]] | None = None,
    image_height: float = 0.0,
    folder_composer_hint: str = "",
) -> dict[str, Any]:
    """Normalize title/artist/composer/key across all sheet-image routes."""
    band = extract_top_band_meta(list(ocr_boxes or []), image_height or 1000.0)
    resolved_title = str(title or band.get("title") or "").strip()
    resolved_artist = str(artist or band.get("artist") or "").strip()
    resolved_composer = str(
        composer or band.get("composer") or resolved_artist or folder_composer_hint or ""
    ).strip()
    resolved_key = str(key or band.get("key") or "").strip()
    resolved_capo = capo if capo is not None else band.get("capo")
    return {
        "title": resolved_title,
        "artist": resolved_artist,
        "composer": resolved_composer,
        "key": resolved_key,
        "capo": resolved_capo,
        "sourceFormat": str(source_format or "unknown"),
        "confidence": round(float(confidence or 0.0), 3),
    }


def build_lyrics_only_payload(raw_lines: list[str], meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Stanza-grouped lyrics without chord-token forcing."""
    meta = meta or {}
    lines_out: list[str] = []
    stanzas: list[list[str]] = []
    current: list[str] = []
    for raw in raw_lines or []:
        text = str(raw or "")
        if not text.strip():
            if current:
                stanzas.append(current)
                current = []
            lines_out.append("")
            continue
        # Drop lone chord-like tokens from lyrics-only path
        stripped = text.strip()
        if token_is_chord(stripped) and len(stripped) <= 6:
            continue
        current.append(text)
        lines_out.append(text)
    if current:
        stanzas.append(current)

    body_lines = []
    title = str(meta.get("title") or "").strip()
    artist = str(meta.get("artist") or meta.get("composer") or "").strip()
    if title:
        body_lines.append(f"{{title: {title}}}")
    if artist:
        body_lines.append(f"{{artist: {artist}}}")
    if body_lines:
        body_lines.append("")
    for i, stanza in enumerate(stanzas):
        if i:
            body_lines.append("")
        body_lines.extend(stanza)
    text = "\n".join(body_lines).strip() + ("\n" if body_lines else "")

    classified = []
    for raw in lines_out:
        if not str(raw).strip():
            classified.append({"type": "blank", "text": ""})
        else:
            classified.append({"type": "lyric", "text": raw})

    return {
        "format": "lyrics-only",
        "text": text,
        "lines": classified,
        "sections": [
            {"type": "verse", "label": f"Verse {i + 1}", "lines": stanza}
            for i, stanza in enumerate(stanzas)
        ],
        "stanzas": stanzas,
        "confidence": 0.7 if stanzas else 0.3,
        "warnings": [],
        "lineDetails": [],
    }


def split_ocr_bands_for_mixed(
    ocr_boxes: list[dict[str, Any]],
    staff_regions: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Split OCR boxes into above-staff (chords) vs below/between (lyrics)."""
    regions = sorted(staff_regions or [], key=lambda r: float(r.get("top") or 0))
    above: list[dict[str, Any]] = []
    below: list[dict[str, Any]] = []
    if not regions:
        return {"above": list(ocr_boxes or []), "below": []}

    for box in ocr_boxes or []:
        mid = _box_mid_y(box)
        # Find nearest staff
        placed = False
        for i, reg in enumerate(regions):
            top = float(reg.get("top") or 0)
            bot = float(reg.get("bottom") or top)
            staff_h = max(8.0, bot - top)
            zone_top = float(regions[i - 1].get("bottom") or 0) + 2 if i > 0 else 0.0
            chord_bottom = top + staff_h * 0.2
            if zone_top <= mid <= chord_bottom:
                above.append(box)
                placed = True
                break
            if top <= mid <= bot:
                # On staff — treat short tokens as chords, else lyrics
                tok = str(box.get("text") or "").strip()
                if token_is_chord(tok):
                    above.append(box)
                else:
                    below.append(box)
                placed = True
                break
        if not placed:
            # Below last staff or between
            below.append(box)
    return {"above": above, "below": below}
