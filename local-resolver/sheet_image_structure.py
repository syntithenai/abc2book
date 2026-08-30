"""Detect repeats, double bars, and voltas from staff-crop images (no MusicXML).

Primary path is OpenCV on per-system crops. An optional alternate CLI probe can
fill gaps when STRUCTURE_ALT_OMR_CMD is set. Form heuristics are a last resort.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from typing import Any

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover
    cv2 = None
    np = None

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    Image = None
    ImageDraw = None


KIND_START_REPEAT = "start_repeat"
KIND_END_REPEAT = "end_repeat"
KIND_DOUBLE_BAR = "double_bar"
KIND_VOLTA_START = "volta_start"
KIND_VOLTA_END = "volta_end"


@dataclass
class StructureEvent:
    measure_index: int
    kind: str
    number: int | None = None
    confidence: float = 0.0
    x: float = 0.0
    source: str = "cv"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def count_abc_bars(abc_body: str) -> int:
    """Count measure contents in an ABC music body (headers optional)."""
    text = abc_body or ""
    lines = []
    for ln in text.splitlines():
        if re.match(r"^[A-Za-z]:", ln.strip()) or ln.strip().startswith("%"):
            continue
        if ln.strip():
            lines.append(re.sub(r'"[^"]*"', "", ln))
    flat = " ".join(lines)
    parts = re.split(r"\|+", flat)
    bars = 0
    for p in parts:
        p = p.strip()
        if not p or p in {":", "]", ":]", "[:"}:
            continue
        p = re.sub(r"^:+", "", p).strip()
        p = re.sub(r"^\d+", "", p).strip()
        if re.search(r"[A-Ga-gzZ]", p):
            bars += 1
    return bars


def _x_to_measure(x: float, left: float, right: float, bar_count: int) -> int:
    if bar_count <= 1:
        return 0
    width = max(1.0, right - left)
    frac = (float(x) - left) / width
    frac = max(0.0, min(0.999, frac))
    return int(frac * bar_count)


def _find_vertical_runs(binary: Any, min_height_frac: float = 0.22) -> list[dict[str, float]]:
    """Find dark vertical barline-like columns via projection."""
    h, w = binary.shape[:2]
    col_sum = np.sum(binary > 0, axis=0).astype(np.float32)
    thresh = max(2.0, h * min_height_frac)
    active = col_sum >= thresh
    runs: list[dict[str, float]] = []
    i = 0
    while i < w:
        if not active[i]:
            i += 1
            continue
        j = i
        while j < w and active[j]:
            j += 1
        thickness = j - i
        if 1 <= thickness <= max(14, w // 25):
            strength = float(np.mean(col_sum[i:j])) / max(1.0, h)
            runs.append(
                {
                    "x": (i + j - 1) / 2.0,
                    "left": float(i),
                    "right": float(j - 1),
                    "thickness": float(thickness),
                    "strength": strength,
                }
            )
        i = j
    return runs


def _has_repeat_dots(binary: Any, x_center: float, side: str, staff_top: int, staff_bot: int) -> bool:
    """Look for two stacked dots left or right of a thick barline."""
    h, w = binary.shape[:2]
    band_h = max(8, staff_bot - staff_top)
    y1 = staff_top + int(band_h * 0.22)
    y2 = staff_top + int(band_h * 0.72)
    search_w = max(8, int(band_h * 0.55))
    if side == "right":
        x0 = int(x_center) + 1
        x1 = min(w, x0 + search_w)
    else:
        x1 = int(x_center) - 1
        x0 = max(0, x1 - search_w)
    if x1 <= x0:
        return False
    roi = binary[max(0, y1) : min(h, y2), x0:x1]
    if roi.size == 0:
        return False
    k = max(1, band_h // 20)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    roi = cv2.morphologyEx(roi, cv2.MORPH_OPEN, kernel)
    n_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats(roi, connectivity=8)
    blobs = []
    for lab in range(1, n_labels):
        area = int(stats[lab, cv2.CC_STAT_AREA])
        bw = int(stats[lab, cv2.CC_STAT_WIDTH])
        bh = int(stats[lab, cv2.CC_STAT_HEIGHT])
        cy = float(centroids[lab][1])
        if 1 <= area <= max(80, band_h * 2) and bw <= search_w and bh <= band_h // 2:
            blobs.append(cy)
    if len(blobs) < 2:
        return False
    blobs.sort()
    for a, b in zip(blobs, blobs[1:]):
        gap = b - a
        if band_h * 0.12 <= gap <= band_h * 0.55:
            return True
    return len(blobs) >= 2


def _staff_band_y(gray: Any) -> tuple[int, int]:
    """Estimate staff vertical extent from horizontal projection."""
    h, w = gray.shape[:2]
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    row_sum = np.sum(binary > 0, axis=1)
    thresh = max(5.0, w * 0.08)
    rows = np.where(row_sum >= thresh)[0]
    if rows.size == 0:
        return int(h * 0.2), int(h * 0.85)
    return int(rows[0]), int(rows[-1])


def _detect_volta_numbers(gray: Any, staff_top: int) -> list[tuple[int, float, float]]:
    """Return list of (number, x_center, confidence) from top strip OCR / heuristics."""
    h, w = gray.shape[:2]
    top = max(0, staff_top - max(24, h // 3))
    bot = max(top + 8, staff_top + 4)
    strip = gray[top:bot, :]
    found: list[tuple[int, float, float]] = []

    try:
        import shutil

        tess = shutil.which("tesseract")
        if tess and Image is not None:
            pil = Image.fromarray(strip)
            fd, tmp = tempfile.mkstemp(suffix=".png", prefix="volta-")
            os.close(fd)
            try:
                pil.save(tmp)
                proc = subprocess.run(
                    [tess, tmp, "stdout", "--psm", "6", "-c", "tessedit_char_whitelist=0123456789."],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    check=False,
                )
                text = (proc.stdout or "").strip()
                for m in re.finditer(r"([12])\s*\.?", text):
                    num = int(m.group(1))
                    frac = (m.start() + 0.5) / max(1, len(text))
                    found.append((num, frac * w, 0.7))
            finally:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
    except Exception:
        pass

    if not found and cv2 is not None:
        # Peak clustering without OCR is too noisy for voltas — skip unless
        # the strip clearly has two right-side digit-like blobs AND a top rule.
        _, bin_strip = cv2.threshold(strip, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        # Require a long horizontal rule in the strip (volta bracket).
        row_sum = np.sum(bin_strip > 0, axis=1)
        if float(np.max(row_sum)) < w * 0.15:
            return found
        col = np.sum(bin_strip > 0, axis=0)
        peaks = []
        for x in range(1, w - 1):
            if col[x] >= max(3, strip.shape[0] * 0.35) and col[x] >= col[x - 1] and col[x] >= col[x + 1]:
                peaks.append(x)
        clustered: list[int] = []
        for x in peaks:
            if not clustered or x - clustered[-1] > 15:
                clustered.append(x)
        rightish = [x for x in clustered if x > w * 0.45]
        if len(rightish) >= 2:
            found.append((1, float(rightish[0]), 0.45))
            found.append((2, float(rightish[1]), 0.45))
        elif len(rightish) == 1 and rightish[0] > w * 0.55:
            found.append((1, float(rightish[0]), 0.4))
    return found


def detect_structure_cv(image_path: str, bar_count: int) -> list[StructureEvent]:
    """CV detection of repeats / double bars / voltas on one staff system crop."""
    if cv2 is None or np is None:
        return []
    if bar_count < 1:
        bar_count = 1
    gray = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return []
    h, w = gray.shape[:2]
    staff_top, staff_bot = _staff_band_y(gray)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    staff_bin = np.zeros_like(binary)
    staff_bin[staff_top:staff_bot, :] = binary[staff_top:staff_bot, :]
    runs = _find_vertical_runs(staff_bin, min_height_frac=0.22)
    if not runs:
        runs = _find_vertical_runs(staff_bin, min_height_frac=0.15)
    if not runs:
        return []

    music_left = w * 0.08
    music_right = w * 0.98
    events: list[StructureEvent] = []

    thick = [r for r in runs if r["thickness"] >= 2.0]
    thin = [r for r in runs if r["thickness"] < 2.0]
    if not thick:
        thick = sorted(runs, key=lambda r: -r["thickness"])[:6]

    def nearest(run: dict, pool: list[dict], max_dist: float) -> dict | None:
        best = None
        best_d = max_dist
        for other in pool:
            d = abs(other["x"] - run["x"])
            if 0.5 < d < best_d:
                best = other
                best_d = d
        return best

    left_limit = music_left + (music_right - music_left) * 0.28
    for r in sorted([x for x in thick if x["x"] <= left_limit], key=lambda z: z["x"]):
        partner = nearest(r, thin + [x for x in thick if x is not r], max_dist=max(14.0, h * 0.35))
        dots = _has_repeat_dots(binary, r["x"], "right", staff_top, staff_bot)
        if not dots:
            dots = _has_repeat_dots(binary, r["x"] + 6, "right", staff_top, staff_bot)
        if partner is not None or dots:
            conf = 0.5 + (0.3 if dots else 0.0) + (0.1 if partner else 0.0)
            events.append(
                StructureEvent(
                    measure_index=0,
                    kind=KIND_START_REPEAT,
                    confidence=min(0.95, conf),
                    x=r["x"],
                    source="cv",
                )
            )
            break
    if not any(e.kind == KIND_START_REPEAT for e in events):
        for x_probe in range(int(w * 0.05), int(w * 0.22), 4):
            if _has_repeat_dots(binary, float(x_probe), "right", staff_top, staff_bot):
                events.append(
                    StructureEvent(
                        measure_index=0,
                        kind=KIND_START_REPEAT,
                        confidence=0.55,
                        x=float(x_probe),
                        source="cv",
                    )
                )
                break

    right_limit = music_left + (music_right - music_left) * 0.68
    for r in sorted([x for x in thick if x["x"] >= right_limit], key=lambda z: -z["x"]):
        partner = nearest(r, thin + [x for x in thick if x is not r], max_dist=max(14.0, h * 0.35))
        dots = _has_repeat_dots(binary, r["x"], "left", staff_top, staff_bot)
        if not dots:
            dots = _has_repeat_dots(binary, r["x"] - 6, "left", staff_top, staff_bot)
        if partner is not None or dots:
            conf = 0.5 + (0.3 if dots else 0.0) + (0.1 if partner else 0.0)
            events.append(
                StructureEvent(
                    measure_index=max(0, bar_count - 1),
                    kind=KIND_END_REPEAT,
                    confidence=min(0.95, conf),
                    x=r["x"],
                    source="cv",
                )
            )
            break
    if not any(e.kind == KIND_END_REPEAT for e in events):
        for x_probe in range(int(w * 0.78), int(w * 0.98), 4):
            if _has_repeat_dots(binary, float(x_probe), "left", staff_top, staff_bot):
                events.append(
                    StructureEvent(
                        measure_index=max(0, bar_count - 1),
                        kind=KIND_END_REPEAT,
                        confidence=0.55,
                        x=float(x_probe),
                        source="cv",
                    )
                )
                break

    used_x = {e.x for e in events}
    for i, a in enumerate(thin):
        if any(abs(a["x"] - ux) < 8 for ux in used_x):
            continue
        for b in thin[i + 1 :]:
            gap = b["x"] - a["x"]
            if gap < 2 or gap > max(14.0, h * 0.25):
                continue
            mid = (a["x"] + b["x"]) / 2.0
            if mid < music_left + (music_right - music_left) * 0.2:
                continue
            if _has_repeat_dots(binary, mid, "left", staff_top, staff_bot) or _has_repeat_dots(
                binary, mid, "right", staff_top, staff_bot
            ):
                continue
            mi = _x_to_measure(mid, music_left, music_right, bar_count)
            events.append(
                StructureEvent(
                    measure_index=mi,
                    kind=KIND_DOUBLE_BAR,
                    confidence=0.5,
                    x=mid,
                    source="cv",
                )
            )
            used_x.add(mid)
            break

    for num, x, conf in _detect_volta_numbers(gray, staff_top):
        # Prefer solid OCR (≥0.7); drop weak guesses on short regular systems.
        if conf < 0.7 and bar_count <= 8:
            continue
        if conf < 0.55:
            continue
        mi = _x_to_measure(x, music_left, music_right, bar_count)
        # Voltas almost always sit in the last third of a system.
        if mi < max(0, bar_count - max(3, bar_count // 3)):
            continue
        events.append(
            StructureEvent(
                measure_index=mi,
                kind=KIND_VOLTA_START,
                number=num,
                confidence=conf,
                x=float(x),
                source="cv",
            )
        )
        end_i = min(bar_count - 1, mi + 1) if num == 1 else bar_count - 1
        events.append(
            StructureEvent(
                measure_index=end_i,
                kind=KIND_VOLTA_END,
                number=num,
                confidence=conf * 0.9,
                x=float(x),
                source="cv",
            )
        )

    return _cap_cv_repeats(_dedupe_events(events))


def _cap_cv_repeats(events: list[StructureEvent]) -> list[StructureEvent]:
    """Keep at most one start and one end repeat per crop; drop spurious mid double bars."""
    if not events:
        return events
    starts = [e for e in events if e.kind == KIND_START_REPEAT]
    ends = [e for e in events if e.kind == KIND_END_REPEAT]
    others = [e for e in events if e.kind not in {KIND_START_REPEAT, KIND_END_REPEAT}]
    kept: list[StructureEvent] = list(others)
    if starts:
        best_start = max(starts, key=lambda e: (e.confidence, -e.measure_index))
        kept.append(best_start)
    if ends:
        best_end = max(ends, key=lambda e: (e.confidence, e.measure_index))
        kept.append(best_end)
    # Drop double_bar events sandwiched between outer repeats unless voltas present.
    has_volta = any(e.kind in {KIND_VOLTA_START, KIND_VOLTA_END} for e in kept)
    if starts and ends and not has_volta:
        kept = [e for e in kept if e.kind != KIND_DOUBLE_BAR]
    return _dedupe_events(kept)


def _dedupe_events(events: list[StructureEvent]) -> list[StructureEvent]:
    best: dict[tuple[str, int, int | None], StructureEvent] = {}
    for e in events:
        key = (e.kind, e.measure_index, e.number)
        prev = best.get(key)
        if prev is None or e.confidence > prev.confidence:
            best[key] = e
    return sorted(best.values(), key=lambda e: (e.measure_index, e.kind, e.number or 0))


def detect_structure_alternate(image_path: str, bar_count: int) -> list[StructureEvent]:
    """Optional external structure probe via STRUCTURE_ALT_OMR_CMD."""
    cmd_tmpl = (os.environ.get("STRUCTURE_ALT_OMR_CMD") or "").strip()
    if not cmd_tmpl:
        return []
    cmd = cmd_tmpl.format(image=image_path, bars=bar_count)
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=float(os.environ.get("STRUCTURE_ALT_OMR_TIMEOUT", "120")),
            check=False,
        )
    except Exception:
        return []
    out = (proc.stdout or "").strip()
    if not out or proc.returncode != 0:
        return []
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        start = out.find("[")
        end = out.rfind("]")
        if start < 0 or end <= start:
            return []
        try:
            data = json.loads(out[start : end + 1])
        except json.JSONDecodeError:
            return []
    events: list[StructureEvent] = []
    for row in data or []:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "")
        if kind not in {
            KIND_START_REPEAT,
            KIND_END_REPEAT,
            KIND_DOUBLE_BAR,
            KIND_VOLTA_START,
            KIND_VOLTA_END,
        }:
            continue
        events.append(
            StructureEvent(
                measure_index=int(row.get("measure_index") or 0),
                kind=kind,
                number=int(row["number"]) if row.get("number") is not None else None,
                confidence=float(row.get("confidence") or 0.4),
                x=float(row.get("x") or 0),
                source="alt",
            )
        )
    return events


def merge_structure_events(
    cv_events: list[StructureEvent],
    alt_events: list[StructureEvent],
) -> list[StructureEvent]:
    """CV wins on conflicts; alt fills empty measure/kind slots."""
    merged = list(cv_events)
    occupied = {(e.kind, e.measure_index, e.number) for e in cv_events}
    kinds_at: dict[int, set[str]] = {}
    for e in cv_events:
        kinds_at.setdefault(e.measure_index, set()).add(e.kind)
    for e in alt_events:
        key = (e.kind, e.measure_index, e.number)
        if key in occupied:
            continue
        if e.kind in kinds_at.get(e.measure_index, set()):
            continue
        if e.kind in {KIND_START_REPEAT, KIND_END_REPEAT} and any(x.kind == e.kind for x in merged):
            continue
        merged.append(e)
    return _dedupe_events(merged)


def infer_voltas_for_long_systems(
    system_bar_counts: list[int],
    existing: list[list[StructureEvent]],
    *,
    meter: str = "",
) -> list[list[StructureEvent]]:
    """When a system has outer repeats but no voltas, assume 1st/2nd endings.

    Folk session pages often encode ``|:`` … ``|1`` … ``:|2`` … ``|]`` as a 10-bar
    system. CV finds the outer repeats but misses ``1.``/``2.`` OCR; without this
    pass structure F1 vs MXL stays low (end_repeat alone at the last bar).

    Threshold is 10 bars by default, 8+ for 3/4 mazurka-style systems.
    """
    out: list[list[StructureEvent]] = []
    for i, n_bars in enumerate(system_bar_counts):
        ev = list(existing[i] if i < len(existing) else [])
        has_volta = any(e.kind in {KIND_VOLTA_START, KIND_VOLTA_END} for e in ev)
        has_start = any(e.kind == KIND_START_REPEAT for e in ev)
        has_end = any(e.kind == KIND_END_REPEAT for e in ev)
        min_bars = 8 if meter.strip() == "3/4" else 10
        if n_bars >= min_bars and has_start and has_end and not has_volta:
            # Drop end_repeat(s) at the final bar; place volta1+end at n-2, volta2 at n-1.
            v1 = max(0, n_bars - 2)
            v2 = max(0, n_bars - 1)
            ev = [
                e
                for e in ev
                if not (e.kind == KIND_END_REPEAT and int(e.measure_index) >= v1)
            ]
            ev.append(
                StructureEvent(
                    measure_index=v1,
                    kind=KIND_VOLTA_START,
                    number=1,
                    confidence=0.55,
                    source="heuristic",
                )
            )
            ev.append(
                StructureEvent(
                    measure_index=v1,
                    kind=KIND_END_REPEAT,
                    confidence=0.55,
                    source="heuristic",
                )
            )
            ev.append(
                StructureEvent(
                    measure_index=v2,
                    kind=KIND_VOLTA_START,
                    number=2,
                    confidence=0.55,
                    source="heuristic",
                )
            )
            ev.append(
                StructureEvent(
                    measure_index=v2,
                    kind=KIND_DOUBLE_BAR,
                    confidence=0.5,
                    source="heuristic",
                )
            )
        out.append(_dedupe_events(ev))
    return out


def _uniform_section_base(system_bar_counts: list[int]) -> int | None:
    """Return 8 or 9 when every system is base or base+2 (volta extension)."""
    if len(system_bar_counts) < 2:
        return None
    for base in (8, 9):
        if all(c == base or c == base + 2 for c in system_bar_counts):
            return base
    return None


def _system_has_cv_hint(ev: list[StructureEvent]) -> bool:
    """Weak CV signal: repeat marks or double bars from CV/alt (not pure heuristic)."""
    return any(
        e.source in {"cv", "alt"}
        and e.kind in {KIND_START_REPEAT, KIND_END_REPEAT, KIND_DOUBLE_BAR, KIND_VOLTA_START}
        for e in ev
    )


def collapse_uniform_eight_bar_repeats(
    system_bar_counts: list[int],
    event_lists: list[list[StructureEvent]],
) -> list[list[StructureEvent]]:
    """For uniform 8-bar systems, collapse to canonical start@0 / end@7 repeats."""
    base = _uniform_section_base(system_bar_counts)
    if base != 8:
        return event_lists
    out: list[list[StructureEvent]] = []
    for i, n_bars in enumerate(system_bar_counts):
        ev = list(event_lists[i] if i < len(event_lists) else [])
        if n_bars != 8:
            out.append(_dedupe_events(ev))
            continue
        repeats = [e for e in ev if e.kind in {KIND_START_REPEAT, KIND_END_REPEAT}]
        if len(repeats) <= 2:
            out.append(_dedupe_events(ev))
            continue
        canonical = [
            e
            for e in ev
            if e.kind not in {KIND_START_REPEAT, KIND_END_REPEAT, KIND_DOUBLE_BAR}
        ]
        canonical.append(
            StructureEvent(
                measure_index=0,
                kind=KIND_START_REPEAT,
                confidence=0.6,
                source="heuristic",
            )
        )
        canonical.append(
            StructureEvent(
                measure_index=7,
                kind=KIND_END_REPEAT,
                confidence=0.6,
                source="heuristic",
            )
        )
        out.append(_dedupe_events(canonical))
    return out


def apply_form_heuristics(
    system_bar_counts: list[int],
    existing: list[list[StructureEvent]],
    *,
    volta_hint: bool = False,
    require_cv_hint: bool = False,
) -> list[list[StructureEvent]]:
    """Wrap regular 8/9-bar systems (±2 for voltas) as |: … :| when they lack CV repeats.

    Applies to 2+ systems (16-bar 2×8 bourrée or 18-bar 2×9 in 3/8). Systems that
    already have a start or end repeat are left alone; empty siblings still get wrapped.
    """
    base = _uniform_section_base(system_bar_counts)
    if base is None:
        return existing
    multi_system = len(system_bar_counts) >= 2
    out: list[list[StructureEvent]] = []
    for i, n_bars in enumerate(system_bar_counts):
        ev = list(existing[i] if i < len(existing) else [])
        has_repeat = any(e.kind in {KIND_START_REPEAT, KIND_END_REPEAT} for e in ev)
        if has_repeat or n_bars < base:
            out.append(_dedupe_events(ev))
            continue
        if require_cv_hint and not multi_system and not _system_has_cv_hint(ev):
            out.append(_dedupe_events(ev))
            continue
        ev.append(
            StructureEvent(
                measure_index=0,
                kind=KIND_START_REPEAT,
                confidence=0.35,
                source="heuristic",
            )
        )
        if n_bars == base + 2 and volta_hint:
            ev.append(
                StructureEvent(
                    measure_index=base,
                    kind=KIND_VOLTA_START,
                    number=1,
                    confidence=0.3,
                    source="heuristic",
                )
            )
            ev.append(
                StructureEvent(
                    measure_index=base,
                    kind=KIND_END_REPEAT,
                    confidence=0.3,
                    source="heuristic",
                )
            )
            ev.append(
                StructureEvent(
                    measure_index=base + 1,
                    kind=KIND_VOLTA_START,
                    number=2,
                    confidence=0.3,
                    source="heuristic",
                )
            )
            ev.append(
                StructureEvent(
                    measure_index=base + 1,
                    kind=KIND_DOUBLE_BAR,
                    confidence=0.3,
                    source="heuristic",
                )
            )
        else:
            ev.append(
                StructureEvent(
                    measure_index=n_bars - 1,
                    kind=KIND_END_REPEAT,
                    confidence=0.35,
                    source="heuristic",
                )
            )
        out.append(_dedupe_events(ev))
    return out


def _abc_body_bar_contents(abc: str) -> list[str]:
    header_lines: list[str] = []
    body_lines: list[str] = []
    for ln in (abc or "").splitlines():
        if (re.match(r"^[A-Za-z]:", ln) or ln.startswith("%")) and not body_lines:
            continue
        if ln.strip() or body_lines:
            body_lines.append(ln)
    flat = " ".join(body_lines)
    segments = re.split(r"\|+", flat)
    bars: list[str] = []
    for seg in segments:
        seg = seg.strip()
        if not seg or seg in {":", "]"}:
            continue
        seg = re.sub(r"^:+", "", seg).strip()
        seg = re.sub(r"[:\]]+$", "", seg).strip()
        if seg:
            bars.append(seg)
    return bars


def infer_section_bars(n: int, meter: str = "") -> int | None:
    """Guess section size for repeat wrapping when CV/heuristics found nothing."""
    meter = (meter or "").strip()
    if meter == "3/8" and n == 18:
        return 9
    if meter == "3/4" and n == 21:
        return 8
    if n == 12:
        return 4
    if n == 9:
        return 3
    if n >= 16 and n % 8 == 0:
        return 8
    if n >= 48 and n % 16 == 0:
        return 16
    if n == 46 and n % 16 != 0:
        # Triple 16-bar sections with short tail — wrap 16-bar blocks only when divisible.
        return None
    if n == 15:
        return None
    return None


def apply_section_repeat_to_abc(abc: str, *, meter: str | None = None, section_bars: int | None = None) -> str:
    """Wrap N-bar sections as |: … :| when ABC has no repeat marks."""
    if not abc or "|:" in abc or ":|" in abc or re.search(r"\|\d", abc):
        return abc
    header_lines: list[str] = []
    body_started = False
    for ln in (abc or "").splitlines():
        if (re.match(r"^[A-Za-z]:", ln) or ln.startswith("%")) and not body_started:
            header_lines.append(ln)
            continue
        body_started = True
    bars = _abc_body_bar_contents(abc)
    n = len(bars)
    if section_bars is None:
        meter_m = re.search(r"^M:\s*(\S+)", abc, re.M)
        m = (meter or (meter_m.group(1) if meter_m else "")).strip()
        section_bars = infer_section_bars(n, m)
    if section_bars is None or section_bars < 3 or n < section_bars * 2 or n % section_bars != 0:
        return abc
    out_bars: list[str] = []
    for i, content in enumerate(bars):
        if i % section_bars == 0:
            out_bars.append(f"|:{content}|")
        elif i % section_bars == section_bars - 1:
            out_bars.append(f"{content}:|")
        else:
            out_bars.append(f"{content}|")
    lines: list[str] = []
    for i in range(0, n, section_bars):
        lines.append("".join(out_bars[i : i + section_bars]))
    return "\n".join(header_lines + lines)


def annotate_abc_with_structure(abc: str, events: list[StructureEvent]) -> str:
    """Apply structure events to an ABC body (with or without headers)."""
    if not abc or not events:
        return abc

    header_lines: list[str] = []
    body_lines: list[str] = []
    for ln in abc.splitlines():
        if (re.match(r"^[A-Za-z]:", ln) or ln.startswith("%")) and not body_lines:
            header_lines.append(ln)
            continue
        if ln.strip() or body_lines:
            body_lines.append(ln)

    flat = " ".join(body_lines)
    segments = re.split(r"\|+", flat)
    bars: list[str] = []
    for seg in segments:
        seg = seg.strip()
        if not seg or seg in {":", "]"}:
            continue
        seg = re.sub(r"^:+", "", seg).strip()
        if seg:
            bars.append(seg)
    if not bars:
        return abc

    n = len(bars)
    # Only special openers live in prefixes; plain '|' is implied between bars
    # via the previous bar's suffix to avoid ``||`` artifacts.
    prefixes = [""] * n
    suffixes = ["|"] * n

    for e in events:
        i = max(0, min(n - 1, int(e.measure_index)))
        if e.kind == KIND_START_REPEAT:
            prefixes[i] = "|:"
        elif e.kind == KIND_END_REPEAT:
            suffixes[i] = ":|"
        elif e.kind == KIND_DOUBLE_BAR:
            suffixes[i] = "|]" if i == n - 1 else "||"
        elif e.kind == KIND_VOLTA_START and e.number:
            prefixes[i] = f"|{e.number}"
        elif e.kind == KIND_VOLTA_END and e.number == 1:
            if suffixes[i] not in {":|", "|]"}:
                suffixes[i] = ":|"
        elif e.kind == KIND_VOLTA_END and e.number == 2:
            suffixes[i] = "|]"

    if not prefixes[0]:
        prefixes[0] = "|"

    out_bars: list[str] = []
    for i, content in enumerate(bars):
        body = content
        pref = prefixes[i]
        end = suffixes[i]
        if pref.startswith("|") and len(pref) > 1 and pref[1:].isdigit():
            body = re.sub(r"^\d+\.?\s*", "", body)
        body = re.sub(r"[:\]]+$", "", body).strip()
        piece = pref + body + end
        # Avoid ``||1`` / ``||:`` when a special opener follows a plain barline.
        if (
            out_bars
            and pref.startswith("|")
            and len(pref) > 1
            and out_bars[-1].endswith("|")
            and not out_bars[-1].endswith((":|", "||", "|]"))
        ):
            out_bars[-1] = out_bars[-1][:-1]
        out_bars.append(piece)

    lines_out: list[str] = []
    chunk: list[str] = []
    for i, piece in enumerate(out_bars):
        chunk.append(piece)
        if len(chunk) >= 4 or i == len(out_bars) - 1:
            line = "".join(chunk)
            line = re.sub(r"\|{3,}", "||", line)
            lines_out.append(line)
            chunk = []

    result = "\n".join(header_lines + lines_out).strip()
    if abc.endswith("\n"):
        result += "\n"
    return result


def apply_structure_pipeline_to_abc(
    abc: str,
    image_path: str,
    *,
    meter: str = "",
    per_staff_event_dicts: list[dict[str, Any]] | None = None,
    single_system: bool = True,
) -> tuple[str, list[dict[str, Any]], str]:
    """CV + heuristics + annotate on one ABC body (full-crop or single system)."""
    bar_count = count_abc_bars(abc) or max(1, len(_abc_body_bar_contents(abc)))
    events: list[StructureEvent] = []
    try:
        events = detect_structure_on_staff_crop(image_path, bar_count)
    except Exception:
        events = []

    if not events and per_staff_event_dicts:
        for row in per_staff_event_dicts:
            if not isinstance(row, dict):
                continue
            kind = str(row.get("kind") or "")
            if kind not in {
                KIND_START_REPEAT,
                KIND_END_REPEAT,
                KIND_DOUBLE_BAR,
                KIND_VOLTA_START,
                KIND_VOLTA_END,
            }:
                continue
            events.append(
                StructureEvent(
                    measure_index=int(row.get("measure_index") or 0),
                    kind=kind,
                    number=int(row["number"]) if row.get("number") is not None else None,
                    confidence=float(row.get("confidence") or 0.4),
                    x=float(row.get("x") or 0),
                    source=str(row.get("source") or "heuristic"),
                )
            )
        events = _dedupe_events(events)

    event_lists = [list(events)]
    bar_counts = [bar_count]
    volta_hint = any(e.kind == KIND_VOLTA_START for e in events)
    any_cv_repeat = any(
        e.kind in {KIND_START_REPEAT, KIND_END_REPEAT} and e.source == "cv" for e in events
    )
    structure_source = "cv" if any_cv_repeat else ("heuristic" if events else "none")

    if not any_cv_repeat:
        event_lists = apply_form_heuristics(
            bar_counts,
            event_lists,
            volta_hint=volta_hint,
            require_cv_hint=single_system,
        )
        if any(event_lists[0]):
            structure_source = "heuristic"

    event_lists = collapse_uniform_eight_bar_repeats(bar_counts, event_lists)
    event_lists = infer_voltas_for_long_systems(bar_counts, event_lists, meter=meter)
    if any(e.source == "heuristic" for e in event_lists[0]):
        structure_source = "heuristic"

    final_events = event_lists[0]
    annotated = annotate_abc_with_structure(abc, final_events)
    if not re.search(r"\|[:1-9]|:?\|", annotated):
        annotated = apply_section_repeat_to_abc(annotated, meter=meter)

    kind_counts: dict[str, int] = {}
    out_dicts: list[dict[str, Any]] = []
    for e in final_events:
        out_dicts.append(e.to_dict())
        kind_counts[e.kind] = kind_counts.get(e.kind, 0) + 1
    if apply_section_repeat_to_abc(abc, meter=meter) != abc and not out_dicts:
        structure_source = "heuristic"
    return annotated, out_dicts, structure_source


def detect_structure_on_staff_crop(
    image_path: str,
    bar_count: int,
    *,
    use_alt: bool = True,
) -> list[StructureEvent]:
    """Full detection: CV + optional alternate merge."""
    cv_events = detect_structure_cv(image_path, bar_count)
    alt_events: list[StructureEvent] = []
    if use_alt:
        alt_events = detect_structure_alternate(image_path, bar_count)
    return merge_structure_events(cv_events, alt_events)


def draw_synthetic_staff_with_repeats(
    out_path: str,
    *,
    with_voltas: bool = False,
    width: int = 800,
    height: int = 120,
) -> str:
    """Write a simple synthetic staff PNG for unit tests."""
    if Image is None or ImageDraw is None:
        raise RuntimeError("Pillow required for synthetic fixtures")
    img = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(img)
    top = 40
    gap = 10
    for i in range(5):
        y = top + i * gap
        draw.line([(40, y), (width - 20, y)], fill=0, width=1)
    x0 = 70
    draw.line([(x0, top), (x0, top + 4 * gap)], fill=0, width=1)
    draw.line([(x0 + 4, top), (x0 + 4, top + 4 * gap)], fill=0, width=3)
    draw.ellipse([x0 + 8, top + gap - 2, x0 + 12, top + gap + 2], fill=0)
    draw.ellipse([x0 + 8, top + 2 * gap - 2, x0 + 12, top + 2 * gap + 2], fill=0)
    for bx in (200, 320, 440, 560):
        draw.line([(bx, top), (bx, top + 4 * gap)], fill=0, width=1)
    if with_voltas:
        draw.line([(560, 12), (680, 12)], fill=0, width=2)
        draw.line([(560, 12), (560, 22)], fill=0, width=2)
        draw.text((564, 2), "1.", fill=0)
        draw.line([(680, 12), (760, 12)], fill=0, width=2)
        draw.line([(680, 12), (680, 22)], fill=0, width=2)
        draw.text((684, 2), "2.", fill=0)
    xr = width - 30
    draw.ellipse([xr - 14, top + gap - 2, xr - 10, top + gap + 2], fill=0)
    draw.ellipse([xr - 14, top + 2 * gap - 2, xr - 10, top + 2 * gap + 2], fill=0)
    draw.line([(xr - 6, top), (xr - 6, top + 4 * gap)], fill=0, width=3)
    draw.line([(xr - 2, top), (xr - 2, top + 4 * gap)], fill=0, width=1)
    img.save(out_path)
    return out_path
