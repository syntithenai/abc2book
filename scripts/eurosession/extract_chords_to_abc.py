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
# Reject OCR junk like C23 — only common qualities / extensions.
CHORD_TOKEN_RE = re.compile(
    r"^[A-G](?:#|b|♯|♭)?(?:maj7|maj|min|dim|aug|sus4|sus2|sus|add\d*|m|M)?(?:7|9|11|13)?(?:/[A-G](?:#|b|♯|♭)?)?$",
    re.I,
)
QUOTE_CHORD_RE = re.compile(r'"[^"\n]*"')
# Barline flavors we preserve through chord overlay.
BARLINE_TOKEN_RE = re.compile(r"(\|:|:\||\|\||\|\]|\|\d+|\|)")
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
    # Doubled root letter (BB, AA) from blurry glyphs → single root.
    if re.fullmatch(r"([A-Ga-g])\1", raw):
        raw = raw[0].upper()
    # EM / AM / DM → Em / Am / Dm (Tesseract often uppercases the quality).
    m_qual = re.fullmatch(r"([A-Ga-g])([#b]?)[Mm]", raw)
    if m_qual and not raw.lower().endswith("maj"):
        raw = m_qual.group(1).upper() + (m_qual.group(2) or "") + "m"
    if not raw or not CHORD_TOKEN_RE.match(raw):
        return None
    # Canonicalize: root upper, quality lower-ish (Am, D7, G/B).
    m = re.match(r"^([A-G])([#b]?)(.*)$", raw, re.I)
    if not m:
        return None
    root = m.group(1).upper() + (m.group(2) or "")
    rest = m.group(3) or ""
    rl = rest.lower()
    if rl in {"m", "min", "minor"}:
        rest = "m"
    elif rl in {"maj", "major"}:
        rest = ""
    elif rl in {"maj7", "major7", "ma7"}:
        rest = "maj7"
    elif rl in {"min7", "mi7"}:
        rest = "m7"
    elif rl in {"sus", "sus4", "suspended"}:
        rest = "sus4"
    elif rl in {"sus2"}:
        rest = "sus2"
    elif rl in {"dim", "diminished"}:
        rest = "dim"
    elif rl in {"aug", "augmented", "+"}:
        rest = "aug"
    elif rl in {"7", "9", "11", "13"}:
        rest = rl
    elif re.fullmatch(r"add\d+", rl):
        rest = rl
    elif not rest:
        rest = ""
    elif not re.fullmatch(r"(?:m|maj7|m7|7|9|11|13|sus4|sus2|dim|aug|add\d+)", rl):
        return None
    else:
        rest = rl
    return root + rest


def is_music_line(line: str) -> bool:
    s = (line or "").strip()
    if not s or s.startswith("%"):
        return False
    if re.match(r"^[A-Za-z]:", s):
        return False
    return bool(re.search(r"[A-Ga-gzZ|:]", s))


def is_lone_root_chord(token: str) -> bool:
    """True for bare A–G roots (often OCR noteheads / lyrics, not chords)."""
    return bool(re.fullmatch(r"[A-G][#b]?", (token or "").strip()))


def body_note_count(abc: str) -> int:
    """Count note letters after the last K: header (ignore titles)."""
    text = abc or ""
    body = text
    for line in text.splitlines():
        if line.startswith("K:"):
            body = text[text.find(line) + len(line) :]
    # Mask quote-chords so Am/Em letters do not inflate the count.
    body = QUOTE_CHORD_RE.sub("", body)
    return len(re.findall(r"[A-Ga-g]", body))


def strip_quote_chords(abc: str) -> str:
    lines = []
    for line in (abc or "").splitlines():
        if is_music_line(line):
            lines.append(QUOTE_CHORD_RE.sub("", line))
        else:
            lines.append(line)
    return "\n".join(lines)


def split_melody_bars_structured(abc: str) -> tuple[list[str], list[str], list[str]]:
    """Split music body into bar contents with aligned prefixes and endings.

    Returns (contents, prefixes, endings) where:
      prefixes[i] is e.g. '|:', '|1', '|2', or '|' (opening barline)
      endings[i] is e.g. '|', ':|', '||', '|]' (closing barline for that bar)
    """
    body_parts = []
    for line in (abc or "").splitlines():
        if is_music_line(line):
            body_parts.append(line.strip())
    flat = " ".join(body_parts).strip()
    if not flat:
        return [], [], []

    # Tokenize into barline vs content chunks.
    pieces: list[tuple[str, str]] = []  # ("bar"|"text", value)
    pos = 0
    for m in BARLINE_TOKEN_RE.finditer(flat):
        if m.start() > pos:
            pieces.append(("text", flat[pos : m.start()]))
        pieces.append(("bar", m.group(1)))
        pos = m.end()
    if pos < len(flat):
        pieces.append(("text", flat[pos:]))

    contents: list[str] = []
    prefixes: list[str] = []
    endings: list[str] = []

    pending_prefix = "|"
    buf = ""
    open_bar = False

    def _flush(end: str) -> None:
        nonlocal buf, pending_prefix, open_bar
        content = re.sub(r"^:+", "", buf.strip()).strip()
        if pending_prefix.startswith("|") and len(pending_prefix) > 1 and pending_prefix[1:].isdigit():
            content = re.sub(r"^\d+\.?\s*", "", content).strip()
        if content or open_bar or pending_prefix in {":|", "|:", "|]", "||"} or (
            pending_prefix.startswith("|") and len(pending_prefix) > 1
        ):
            if content or pending_prefix != "|" or end != "|":
                contents.append(content)
                prefixes.append(pending_prefix)
                endings.append(end)
        buf = ""
        pending_prefix = "|"
        open_bar = False

    for kind, val in pieces:
        if kind == "text":
            buf += val
            continue
        # barline
        if val in {":|", "||", "|]"}:
            if open_bar or buf.strip() or pending_prefix != "|":
                _flush(val)
            else:
                # Closer without open bar — ignore orphan
                pass
        elif val == "|:" or (val.startswith("|") and len(val) > 1 and val[1:].isdigit()):
            if open_bar or buf.strip():
                _flush("|")
            pending_prefix = val
            open_bar = True
        else:
            # plain |
            if open_bar or buf.strip() or pending_prefix != "|":
                _flush("|")
            else:
                # Leading | opens first bar
                pending_prefix = "|"
                open_bar = True
                continue
            pending_prefix = "|"
            open_bar = True

    if buf.strip() or (open_bar and pending_prefix != "|"):
        _flush("|")

    return contents, prefixes, endings


def split_melody_bars(abc: str) -> list[str]:
    """Flatten music lines and split on barlines into bar contents (no |)."""
    contents, _prefixes, _endings = split_melody_bars_structured(abc)
    return contents


def _mask_quoted_spans(bar: str) -> str:
    """Replace \"Chord\" spans with spaces so NOTE_START_RE ignores chord letters."""
    return QUOTE_CHORD_RE.sub(lambda m: " " * len(m.group(0)), bar)


def note_start_positions(bar: str) -> list[int]:
    """Note-start indices in bar, skipping letters inside existing quote-chords."""
    masked = _mask_quoted_spans(bar)
    return [m.start() for m in NOTE_START_RE.finditer(masked)]


def insert_chord_before_beat(bar: str, chord: str, beat_frac: float) -> str:
    """Insert \"Chord\" before a note near beat_frac within the bar text."""
    positions = note_start_positions(bar)
    if not positions:
        prefix = f'"{chord}"'
        if bar.startswith('"'):
            prefix += " "
        return prefix + bar
    idx = int(round(max(0.0, min(1.0, beat_frac)) * (len(positions) - 1)))
    pos = positions[idx]
    # Avoid landing on the same note as an existing quote-chord (adjacent "" ).
    while pos > 0 and bar[pos - 1] == '"' and idx + 1 < len(positions):
        idx += 1
        pos = positions[idx]
    insert = f'"{chord}"'
    # Space before next quote-chord or after previous for readability / anti-mangle.
    if pos < len(bar) and bar[pos] == '"':
        insert += " "
    if pos > 0 and bar[pos - 1] == '"':
        insert = " " + insert
    return bar[:pos] + insert + bar[pos:]


def remap_staff_ordinals(chord_boxes: list[dict]) -> list[dict]:
    """Map raw staffIndex values to dense 0..N-1 ordinals (fixes over-segmentation)."""
    raw = sorted({int(c.get("staffIndex") or 0) for c in chord_boxes})
    if not raw:
        return list(chord_boxes)
    mapping = {old: i for i, old in enumerate(raw)}
    out = []
    for c in chord_boxes:
        next_c = dict(c)
        next_c["staffIndex"] = mapping.get(int(c.get("staffIndex") or 0), 0)
        out.append(next_c)
    return out


def rebuild_abc_with_bars(
    abc: str,
    chorded_bars: list[str],
    *,
    bars_per_line: int = 4,
    bar_prefixes: list[str] | None = None,
    bar_endings: list[str] | None = None,
) -> str:
    """Replace music body with chorded bars, rewrapping every bars_per_line.

    When ``bar_prefixes`` / ``bar_endings`` are omitted they are taken from the
    original ``abc`` so ``|:`` ``:|`` ``||`` ``|1`` ``|2`` ``|]`` survive overlay.
    """
    headers = []
    for line in (abc or "").splitlines():
        s = line.strip()
        if not s:
            continue
        if is_music_line(line):
            break
        headers.append(line)

    _orig_contents, orig_prefixes, orig_endings = split_melody_bars_structured(abc)
    if bar_prefixes is None:
        bar_prefixes = list(orig_prefixes)
    if bar_endings is None:
        bar_endings = list(orig_endings)
    while len(bar_prefixes) < len(chorded_bars):
        bar_prefixes.append("|")
    while len(bar_endings) < len(chorded_bars):
        bar_endings.append("|")
    bar_prefixes = bar_prefixes[: len(chorded_bars)]
    bar_endings = bar_endings[: len(chorded_bars)]

    original_line_bars: list[int] = []
    for line in (abc or "").splitlines():
        if not is_music_line(line):
            continue
        n = len(split_melody_bars(line))
        if n > 0:
            original_line_bars.append(n)

    lines: list[str] = []
    i = 0
    total = len(chorded_bars)
    line_idx = 0
    while i < total:
        if original_line_bars and line_idx < len(original_line_bars):
            chunk = max(1, original_line_bars[line_idx])
        else:
            chunk = max(1, int(bars_per_line))
        chunk_bars = chorded_bars[i : i + chunk]
        chunk_pref = bar_prefixes[i : i + chunk]
        chunk_end = bar_endings[i : i + chunk]
        pieces: list[str] = []
        for j, body in enumerate(chunk_bars):
            pref = chunk_pref[j] if j < len(chunk_pref) else "|"
            end = chunk_end[j] if j < len(chunk_end) else "|"
            # Mid-line plain '|' prefixes duplicate the previous bar's ending.
            if j > 0 and pref == "|":
                pref = ""
            elif (
                j > 0
                and pref.startswith("|")
                and len(pref) > 1
                and pieces
                and pieces[-1].endswith("|")
                and not pieces[-1].endswith((":|", "||", "|]"))
            ):
                pieces[-1] = pieces[-1][:-1]
            if j == 0 and not pref:
                pref = "|"
            pieces.append(f"{pref}{body}{end}")
        body = "".join(pieces)
        body = re.sub(r"\|{3,}", "||", body)
        lines.append(body)
        i += chunk
        line_idx += 1

    return "\n".join(headers + lines).strip() + "\n"


def _box_confidence(box: dict) -> float:
    """Normalize OCR confidence to 0..1."""
    raw = box.get("confidence")
    if raw is None:
        raw = box.get("conf")
    try:
        val = float(raw or 0)
    except (TypeError, ValueError):
        return 0.0
    # Tesseract sometimes reports 0..100, sometimes 0..1.
    if val > 1.5:
        return max(0.0, min(1.0, val / 100.0))
    return max(0.0, min(1.0, val))


def filter_chord_boxes(
    boxes: list[dict],
    bands: list[dict],
    image_height: float,
    *,
    drop_lone_roots: bool = True,
    lone_root_min_conf: float = 0.55,
) -> list[dict]:
    """Keep chord-like tokens sitting in the band above each staff system.

    Lone roots (C, E, G, …) are common on EuroSession pages; keep them when
    confidence is high enough. ``drop_lone_roots`` only drops *low-confidence*
    single-letter tokens (often OCR of noteheads). Calibrated vs MXL: many
    printed C/E/G roots sit around 0.55–0.75 OCR confidence.
    """
    if not bands:
        # Fallback: top 18% of image often holds chord row for single-system crops.
        y_max = image_height * 0.22
        out = []
        for b in boxes:
            token = normalize_chord_token(str(b.get("text") or ""))
            if not token:
                continue
            conf = _box_confidence(b)
            if drop_lone_roots and is_lone_root_chord(token) and conf < lone_root_min_conf:
                continue
            cy = float(b.get("y") or 0) + float(b.get("height") or 0) / 2.0
            if cy > y_max:
                continue
            out.append({**b, "chord": token, "cx": float(b.get("x") or 0) + float(b.get("width") or 0) / 2.0, "confidence": conf})
        return out

    chords = []
    for i, band in enumerate(bands):
        top = float(band.get("top") or 0)
        bottom = float(band.get("bottom") or top)
        staff_h = max(12.0, bottom - top)
        prev_bottom = float(bands[i - 1].get("bottom") or 0) if i > 0 else 0.0
        # Chord row: from just below previous staff (or image top) down onto staff top.
        zone_top = prev_bottom + 2 if i > 0 else 0.0
        # Include a little into the staff head so symbols sitting on the top line survive.
        zone_bottom = top + max(10.0, staff_h * 0.22)
        prefer_top = max(zone_top, top - max(48.0, staff_h * 1.1))
        for b in boxes:
            token = normalize_chord_token(str(b.get("text") or ""))
            if not token:
                continue
            conf = _box_confidence(b)
            if drop_lone_roots and is_lone_root_chord(token) and conf < lone_root_min_conf:
                continue
            # Reject very low-confidence multi-letter tokens (e.g. Fm misread of Em).
            if conf < 0.45 and not is_lone_root_chord(token):
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
                    "confidence": conf,
                }
            )
    return chords


def align_chords_to_abc(
    abc: str,
    chord_boxes: list[dict],
    staff_left: float,
    staff_right: float,
    *,
    min_placed: int = 3,
    min_mapped: float = 0.6,
    min_chord_boxes: int = 3,
    system_count_hint: int | None = None,
    system_bar_counts: list[int] | None = None,
    clef_pad_frac: float = 0.14,
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
    if len(bars) < 2 or len(chord_boxes) < max(1, int(min_chord_boxes)):
        status["reason"] = "too-few-bars-or-chords"
        return None, status

    width = max(1.0, staff_right - staff_left)
    # Clef/key signature eats left margin; without this, the first printed chord
    # lands in bar 1 instead of bar 0 (MXL/book put Am on the opening bar).
    # 0.12–0.16 calibrated offline vs eurosessions MXL harmony onsets (UDN).
    clef_pad_frac = max(0.08, min(0.22, float(clef_pad_frac)))
    clef_pad = width * clef_pad_frac
    music_left = staff_left + clef_pad
    music_width = max(1.0, staff_right - music_left)
    status["clefPadFrac"] = clef_pad_frac
    remapped = remap_staff_ordinals(chord_boxes)
    staff_indices = sorted({int(c.get("staffIndex") or 0) for c in remapped}) or [0]
    systems = max(1, len(staff_indices))
    if system_count_hint and int(system_count_hint) > 0:
        # Prefer enhanced OMR system count when staff detect over-segmented.
        systems = max(1, min(int(system_count_hint), len(bars)))
        # Re-bin by y-order ordinals into hint systems when raw indices >> hint.
        if len(staff_indices) > systems:
            # Spread remapped ordinals evenly into hint buckets.
            scale = systems / max(1, len(staff_indices))
            tmp = []
            for c in remapped:
                next_c = dict(c)
                next_c["staffIndex"] = min(systems - 1, int(int(c.get("staffIndex") or 0) * scale))
                tmp.append(next_c)
            remapped = tmp
            staff_indices = list(range(systems))

    # Prefer real per-system bar counts (8/10/8/…) over equal division.
    counts: list[int] | None = None
    if system_bar_counts and len(system_bar_counts) >= systems:
        counts = [max(1, int(c)) for c in system_bar_counts[:systems]]
        total = sum(counts)
        if total < len(bars):
            counts[-1] += len(bars) - total
        elif total > len(bars):
            overflow = total - len(bars)
            for i in range(systems - 1, -1, -1):
                take = min(overflow, counts[i] - 1)
                counts[i] -= take
                overflow -= take
                if overflow <= 0:
                    break
    if not counts:
        bps = max(1, len(bars) // systems)
        counts = [bps] * systems
        counts[-1] = max(1, len(bars) - bps * (systems - 1))
    bases: list[int] = []
    acc = 0
    for c in counts:
        bases.append(acc)
        acc += c
    status["systems"] = systems
    status["barsPerSystem"] = counts
    status["systemBases"] = bases

    placements: list[tuple[int, float, str]] = []  # bar_idx, beat_frac, chord
    # Leftmost chord on each system → bar 0 of that system (MXL/book style).
    first_cx_by_sys: dict[int, float] = {}
    for c in remapped:
        sys_i = max(0, min(systems - 1, int(c.get("staffIndex") or 0)))
        cx = float(c.get("cx") or 0)
        if sys_i not in first_cx_by_sys or cx < first_cx_by_sys[sys_i]:
            first_cx_by_sys[sys_i] = cx

    for c in sorted(remapped, key=lambda x: (int(x.get("staffIndex") or 0), float(x.get("cx") or 0))):
        frac = (float(c["cx"]) - music_left) / music_width
        frac = max(0.0, min(0.999, frac))
        sys_i = int(c.get("staffIndex") or 0)
        # Clamp system index to known range (ordinals are already dense).
        sys_i = max(0, min(systems - 1, sys_i))
        n_local = counts[sys_i]
        base = bases[sys_i]
        is_first = abs(float(c["cx"]) - first_cx_by_sys.get(sys_i, -1e9)) < 1.0
        local_bar = 0 if is_first else int(frac * n_local)
        bar_idx = min(len(bars) - 1, base + local_bar)
        if is_first:
            frac = 0.0
            bar_idx = base
        slot = 1.0 / max(1, n_local)
        local_frac = (frac - local_bar * slot) / slot if slot > 0 else 0.0
        beat = max(0.0, min(1.0, local_frac))
        placements.append((bar_idx, beat, c["chord"]))

    by_bar: dict[int, list[tuple[float, str]]] = {}
    for bar_idx, beat, chord in placements:
        by_bar.setdefault(bar_idx, []).append((beat, chord))

    chorded_bars = list(bars)
    placed = 0
    for bar_idx, items in by_bar.items():
        items.sort(key=lambda t: t[0])
        cleaned: list[tuple[float, str]] = []
        for beat, chord in items:
            if cleaned and cleaned[-1][1] == chord and abs(cleaned[-1][0] - beat) < 0.15:
                continue
            cleaned.append((beat, chord))
        text = QUOTE_CHORD_RE.sub("", chorded_bars[bar_idx])
        if len(cleaned) == 1:
            # Bar-start bias (Cursor/book style) for a single chord in the bar.
            text = insert_chord_before_beat(text, cleaned[0][1], 0.0)
            placed += 1
        else:
            # First chord at bar start; others by beat. Dedupe same note landing.
            ordered = [(0.0, cleaned[0][1])] + list(cleaned[1:])
            positions = note_start_positions(text)
            chosen: list[tuple[int, str]] = []  # (pos, chord) unique positions
            seen_pos: set[int] = set()
            for beat, chord in ordered:
                if not positions:
                    chosen.append((0, chord))
                    break
                idx = int(round(max(0.0, min(1.0, beat)) * (len(positions) - 1)))
                pos = positions[idx]
                if pos in seen_pos:
                    continue
                seen_pos.add(pos)
                chosen.append((pos, chord))
            # Insert right-to-left so indices stay valid.
            for pos, chord in sorted(chosen, key=lambda t: t[0], reverse=True):
                insert = f'"{chord}"'
                if pos < len(text) and text[pos] == '"':
                    insert += " "
                if pos > 0 and text[pos - 1] == '"':
                    insert = " " + insert
                text = text[:pos] + insert + text[pos:]
                placed += 1
        chorded_bars[bar_idx] = text

    mapped_frac = placed / max(1, len(chord_boxes))
    status["placed"] = placed
    status["mappedFraction"] = round(mapped_frac, 3)
    if placed < int(min_placed) or mapped_frac < float(min_mapped):
        status["reason"] = "confidence-gate"
        return None, status

    out = rebuild_abc_with_bars(melody, chorded_bars)
    out = normalize_transpose_in_abc(out)
    out = prefer_key_from_chords(out)
    status["reason"] = "ok"
    return out, status


def prefer_key_from_chords(abc: str) -> str:
    """If quote-chords strongly imply a minor tonic, rewrite K: (MXL lesson)."""
    chords = re.findall(
        r'"\s*([A-G][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:/[A-G][#b]?)?)\s*"',
        abc or "",
        re.I,
    )
    if len(chords) < 4:
        return abc
    # Count minor tonics like Am, Em, Dm as candidates; prefer most common Xm
    # when it appears often and current key is a relative/parallel major.
    minor_tonics: dict[str, int] = {}
    for ch in chords:
        m = re.match(r"^([A-G][#b]?)m(?:in)?(?:\d|$|/)", ch, re.I)
        if m:
            tonic = m.group(1).upper() + "m"
            tonic = tonic.replace("B#", "C").replace("E#", "F")
            minor_tonics[tonic] = minor_tonics.get(tonic, 0) + 1
    if not minor_tonics:
        return abc
    best, count = max(minor_tonics.items(), key=lambda kv: kv[1])
    # Need a clear lead: at least 3 hits, and not a thin minority.
    if count < 3 or count < len(chords) * 0.18:
        return abc
    km = re.search(r"^K:\s*([^\n]+)", abc or "", re.M)
    cur = (km.group(1).strip() if km else "")
    relative = {"Am": "C", "Em": "G", "Dm": "F", "Bm": "D", "F#m": "A", "Cm": "Eb", "Gm": "Bb"}
    cur_root = re.match(r"^([A-G][#b]?)", cur or "")
    cur_root_s = cur_root.group(1) if cur_root else ""
    if cur == best or cur.startswith(best):
        return abc
    # Relative major (Am↔C) or any bare major K: when minor tonic dominates
    # (covers HOMR voting G/C/F while printed chords are Am/Dm/…).
    if cur_root_s and relative.get(best) == cur_root_s:
        return re.sub(r"^K:\s*[^\n]+", f"K:{best}", abc, count=1, flags=re.M)
    if re.fullmatch(r"[A-G][#b]?(?:maj)?", cur or "", re.I):
        return re.sub(r"^K:\s*[^\n]+", f"K:{best}", abc, count=1, flags=re.M)
    return abc


def pick_base_abc(entry: dict) -> str:
    """Prefer plain OMR melody ABC as alignment base (not omr-chords)."""
    cands = list(entry.get("candidates") or [])
    if entry.get("omrAbc") and "%% missing abc" not in str(entry.get("omrAbc") or ""):
        return str(entry["omrAbc"])
    for c in cands:
        if str(c.get("source") or "").lower() == "omr" and c.get("abc"):
            return str(c["abc"])
    for c in cands:
        src = str(c.get("source") or "").lower()
        if src.startswith("omr") and src != "omr-chords" and c.get("abc"):
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
    # Keep archive/session first; append omr then omr-chords at the end.
    other = [c for c in cands if not str(c.get("source") or "").lower().startswith("omr")]
    omr_plain = [c for c in cands if str(c.get("source") or "").lower() == "omr"]
    omr_rest = [
        c
        for c in cands
        if str(c.get("source") or "").lower().startswith("omr")
        and str(c.get("source") or "").lower() != "omr"
    ]
    entry["candidates"] = other + omr_plain + omr_rest + [row]
    # Never auto-select omr-chords — leave selection / abcSource unchanged.
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
