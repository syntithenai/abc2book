"""Split a deskewed sheet page into per-tune crops (title-first).

Shared by HTTP `/split-sheet-page` and eurosession-style offline scripts.
Uses Paddle OCR when available (same stack as sheet_image_metadata).
"""

from __future__ import annotations

import base64
import io
import os
import re
import tempfile
from typing import Any

from sheet_image_ocr import ensure_paddleocr_available, extract_ocr_boxes
from sheet_image_preprocess import preprocess_sheet_image
from sheet_image_segment import (
    TITLE_KEY_HINT_RE,
    clean_segment_title,
    is_harmony_title,
    is_junk_split_title,
    is_strong_split_title,
    looks_like_person_name_title,
    normalize_title_key,
    segments_from_title_lines,
    select_strong_title_lines,
)
from sheet_image_staff_detect import detect_staff_regions

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore

HARMONY_RE = re.compile(r"^\(?\s*harmony\s*\)?$", re.I)


def slugify(title: str) -> str:
    text = TITLE_KEY_HINT_RE.sub("", title or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text, flags=re.I)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text[:80] or "untitled"


def _cluster_lines_from_boxes(boxes: list[dict], y_tol: float = 18.0) -> list[dict]:
    ordered = sorted(
        [b for b in boxes if str(b.get("text") or "").strip()],
        key=lambda b: (float(b.get("y") or 0), float(b.get("x") or 0)),
    )
    lines: list[dict] = []
    for box in ordered:
        top = float(box.get("y") or 0)
        bottom = top + float(box.get("height") or 0)
        placed = False
        for line in lines:
            if abs(top - line["top"]) <= y_tol:
                line["boxes"].append(box)
                line["top"] = min(line["top"], top)
                line["bottom"] = max(line["bottom"], bottom)
                placed = True
                break
        if not placed:
            lines.append({"boxes": [box], "top": top, "bottom": bottom})

    result: list[dict] = []
    for line in lines:
        boxes_sorted = sorted(line["boxes"], key=lambda b: float(b.get("x") or 0))
        text = " ".join(str(b.get("text") or "").strip() for b in boxes_sorted).strip()
        if not text:
            continue
        left = min(float(b.get("x") or 0) for b in boxes_sorted)
        right = max(float(b.get("x") or 0) + float(b.get("width") or 0) for b in boxes_sorted)
        height = max(1.0, line["bottom"] - line["top"])
        confs = [float(b.get("confidence") or 0.0) for b in boxes_sorted]
        result.append({
            "text": text,
            "top": line["top"],
            "bottom": line["bottom"],
            "left": left,
            "right": right,
            "height": height,
            "centerX": (left + right) / 2.0,
            "confidence": sum(confs) / max(1, len(confs)),
        })
    result.sort(key=lambda item: item["top"])
    return result


def snap_segments_to_staff(
    segments: list[dict],
    bands: list[dict],
    image_height: int,
    pad_top: int = 12,
    pad_bottom: int = 24,
) -> list[dict]:
    if not segments:
        return segments

    ordered_bands = sorted(bands, key=lambda b: float(b.get("top") or 0))
    for seg in segments:
        top = int(seg["top"])
        bottom = int(seg["bottom"])
        in_range = []
        for band in ordered_bands:
            mid = (float(band["top"]) + float(band["bottom"])) / 2.0
            if top <= mid <= bottom:
                in_range.append(band)
        if in_range:
            staff_top = int(min(float(b["top"]) for b in in_range))
            staff_bottom = int(max(float(b["bottom"]) for b in in_range))
            title_top = int(float(seg.get("titleTop") or top))
            seg["top"] = max(0, min(top, title_top - pad_top, staff_top - pad_top))
            seg["bottom"] = min(image_height, max(bottom, staff_bottom + pad_bottom))
            seg["systemTop"] = staff_top
            seg["systemBottom"] = staff_bottom
        else:
            seg.setdefault("systemTop", int(seg.get("titleTop") or top))
            seg.setdefault("systemBottom", int(seg.get("titleBottom") or bottom))

    segments[-1]["bottom"] = image_height
    for i, seg in enumerate(segments):
        seg["index"] = i
        seg["top"] = max(0, min(int(seg["top"]), image_height - 1))
        seg["bottom"] = max(int(seg["top"]) + 1, min(int(seg["bottom"]), image_height))
    return segments


def merge_harmony_segments(segments: list[dict]) -> list[dict]:
    if len(segments) <= 1:
        return segments

    merged: list[dict] = [dict(segments[0])]
    for seg in segments[1:]:
        title = str(seg.get("title") or "").strip()
        prev_title = str(merged[-1].get("title") or "").strip()
        prev_key = normalize_title_key(prev_title)
        this_key = normalize_title_key(title)

        is_harmony = is_harmony_title(title) or bool(HARMONY_RE.match(title or ""))
        same_base = (
            prev_key
            and this_key
            and (this_key == prev_key or this_key.startswith(prev_key) or prev_key.startswith(this_key))
            and is_harmony
        )
        if is_harmony or same_base:
            merged[-1]["bottom"] = max(int(merged[-1]["bottom"]), int(seg["bottom"]))
            if seg.get("systemBottom") is not None:
                merged[-1]["systemBottom"] = max(
                    int(merged[-1].get("systemBottom") or 0),
                    int(seg.get("systemBottom") or 0),
                )
            continue
        merged.append(dict(seg))

    for i, seg in enumerate(merged):
        seg["index"] = i
    return merged


def merge_weak_segments(segments: list[dict], image_height: int) -> list[dict]:
    if len(segments) <= 1:
        return segments

    min_gap = max(140.0, image_height * 0.08)
    merged: list[dict] = [dict(segments[0])]
    for seg in segments[1:]:
        title = str(seg.get("title") or "").strip()
        prev_title_top = float(merged[-1].get("titleTop") or merged[-1].get("top") or 0)
        this_title_top = float(seg.get("titleTop") or seg.get("top") or 0)
        title_gap = this_title_top - prev_title_top

        weak = (
            not title
            or is_junk_split_title(title)
            or (looks_like_person_name_title(title) and title_gap < min_gap)
        )
        if weak:
            merged[-1]["bottom"] = max(int(merged[-1]["bottom"]), int(seg["bottom"]))
            if seg.get("systemBottom") is not None:
                merged[-1]["systemBottom"] = max(
                    int(merged[-1].get("systemBottom") or 0),
                    int(seg.get("systemBottom") or 0),
                )
            continue
        merged.append(dict(seg))

    if len(merged) == 1 and is_junk_split_title(str(merged[0].get("title") or "")):
        merged[0]["title"] = ""

    for i, seg in enumerate(merged):
        seg["index"] = i
    return merged


def merge_title_candidates(*groups: list[dict], image_height: int) -> list[dict]:
    merged: list[dict] = []
    for group in groups:
        merged.extend(group or [])
    if not merged:
        return []
    merged.sort(key=lambda t: float(t.get("top") or 0))
    deduped: list[dict] = []
    y_tol = max(100.0, image_height * 0.05)
    for title in merged:
        text = str(title.get("text") or "")
        score = float(title.get("score") or title.get("confidence") or 0)
        score += min(0.2, len(text) * 0.01)
        title = dict(title)
        title["score"] = score
        if deduped and abs(float(title.get("top") or 0) - float(deduped[-1].get("top") or 0)) < y_tol:
            if score >= float(deduped[-1].get("score") or 0):
                deduped[-1] = title
            continue
        deduped.append(title)
    return deduped


def _ocr_strip_paddle(rgb: "Image.Image", top: int, bottom: int, work_dir: str, name: str) -> str:
    """OCR a horizontal strip with Paddle (EuroSession strip-scan port)."""
    if Image is None:
        return ""
    width, height = rgb.size
    top = max(0, min(int(top), height - 1))
    bottom = max(top + 1, min(int(bottom), height))
    crop = rgb.crop((0, top, width, bottom))
    path = os.path.join(work_dir, name)
    crop.save(path, format="PNG")
    try:
        boxes = extract_ocr_boxes(path) or []
    except Exception:
        return ""
    lines = _cluster_lines_from_boxes(boxes, y_tol=12.0)
    if not lines:
        return ""
    # Prefer the most title-like line in the strip
    best = ""
    best_score = -1.0
    for line in lines:
        text = clean_segment_title(str(line.get("text") or ""))
        if not text:
            continue
        score = float(line.get("confidence") or 0)
        if TITLE_KEY_HINT_RE.search(text):
            score += 0.4
        if is_strong_split_title(text):
            score += 0.3
        if score > best_score:
            best_score = score
            best = text
    return best


def discover_titles_strip_scan_paddle(
    rgb: "Image.Image",
    work_dir: str,
    step: int = 48,
    strip_height: int = 110,
) -> list[dict]:
    width, height = rgb.size
    found: list[dict] = []
    for y in range(0, max(1, height - 80), step):
        title = _ocr_strip_paddle(rgb, y, min(y + strip_height, height), work_dir, f"scan-{y:04d}.png")
        if not title or not is_strong_split_title(title) or is_junk_split_title(title):
            continue
        words = [w for w in title.split() if sum(ch.isalpha() for ch in w) >= 2]
        has_key = bool(TITLE_KEY_HINT_RE.search(title))
        has_gloss = "(" in title and ")" in title
        if not has_key and not has_gloss and len(words) < 3:
            continue
        score = 0.5
        if has_key:
            score = 0.9
        elif has_gloss:
            score = 0.85
        elif len(words) >= 3:
            score = 0.7
        found.append({
            "text": title,
            "top": float(y),
            "bottom": float(min(y + strip_height, height)),
            "left": width * 0.1,
            "right": width * 0.9,
            "height": float(strip_height),
            "centerX": width / 2.0,
            "confidence": 0.5,
            "score": score,
        })
    deduped: list[dict] = []
    for item in sorted(found, key=lambda t: t["top"]):
        if deduped and abs(item["top"] - deduped[-1]["top"]) < max(100.0, height * 0.05):
            if item.get("score", 0) >= deduped[-1].get("score", 0):
                deduped[-1] = item
            continue
        deduped.append(item)
    return deduped


def _inter_band_gaps(bands: list[dict]) -> list[tuple[float, float, float]]:
    ordered = sorted(bands or [], key=lambda b: float(b.get("top") or 0))
    gaps: list[tuple[float, float, float]] = []
    for i in range(len(ordered) - 1):
        gap_top = float(ordered[i].get("bottom") or 0)
        gap_bottom = float(ordered[i + 1].get("top") or 0)
        gap = gap_bottom - gap_top
        if gap > 0:
            gaps.append((gap_top, gap_bottom, gap))
    return gaps


def discover_titles_large_gaps_paddle(
    rgb: "Image.Image",
    bands: list[dict],
    work_dir: str,
    image_height: int,
) -> list[dict]:
    gap_min = max(200.0, image_height * 0.12)
    titles: list[dict] = []
    width = rgb.size[0]
    for gap_top, gap_bottom, gap_size in _inter_band_gaps(bands):
        if gap_size < gap_min:
            continue
        strip_top = int(gap_top + gap_size * 0.05)
        strip_bottom = int(gap_top + gap_size * 0.85)
        title = _ocr_strip_paddle(
            rgb, strip_top, strip_bottom, work_dir, f"gap-{strip_top:04d}.png"
        )
        if not title or is_harmony_title(title) or is_junk_split_title(title):
            continue
        if not is_strong_split_title(title):
            continue
        y_center = (strip_top + strip_bottom) / 2.0
        titles.append({
            "text": title,
            "top": y_center - 20,
            "bottom": y_center + 20,
            "left": width * 0.1,
            "right": width * 0.9,
            "height": 40.0,
            "centerX": width / 2.0,
            "confidence": 0.4,
            "score": 0.55,
        })
    return titles


def build_segments_from_boxes(
    boxes: list[dict],
    width: int,
    height: int,
    bands: list[dict] | None = None,
    *,
    rgb: "Image.Image | None" = None,
    work_dir: str | None = None,
) -> tuple[list[dict], dict]:
    meta: dict = {"splitMethod": "none"}
    lines = _cluster_lines_from_boxes(boxes or [])
    strong = [
        t for t in select_strong_title_lines(lines, width, height)
        if not is_junk_split_title(str(t.get("text") or ""))
    ]
    meta["strongTitleCount"] = len(strong)

    # EuroSession-style fallbacks when full-page OCR finds fewer than 2 titles.
    if len(strong) < 2 and rgb is not None and work_dir:
        strip_titles = discover_titles_strip_scan_paddle(rgb, work_dir)
        gap_titles = discover_titles_large_gaps_paddle(rgb, bands or [], work_dir, height) if bands else []
        combined = merge_title_candidates(strong, strip_titles, gap_titles, image_height=height)
        combined = [
            t for t in combined
            if is_strong_split_title(str(t.get("text") or ""))
            and not is_junk_split_title(str(t.get("text") or ""))
        ]
        if len(combined) > len(strong):
            strong = combined
            meta["splitMethod"] = "fallback"
            meta["fallbackStripCount"] = len(strip_titles)
            meta["fallbackGapCount"] = len(gap_titles)

    if not strong:
        segments = [{
            "title": "",
            "top": 0,
            "bottom": height,
            "confidence": 0.0,
            "index": 0,
            "titleTop": 0.0,
            "titleBottom": 0.0,
        }]
        meta["splitMethod"] = "single"
    else:
        segments = segments_from_title_lines(strong, height)
        if meta.get("splitMethod") != "fallback":
            meta["splitMethod"] = "title_first"
        for seg in segments:
            seg["title"] = clean_segment_title(str(seg.get("title") or ""))

    pad_bottom = max(24, int(height * 0.025))
    segments = snap_segments_to_staff(segments, bands or [], height, pad_bottom=pad_bottom)
    segments = merge_harmony_segments(segments)
    segments = merge_weak_segments(segments, height)

    # Fill empty titles from a strip near titleTop when we have the page image.
    if rgb is not None and work_dir:
        for seg in segments:
            if str(seg.get("title") or "").strip():
                continue
            title_top = int(float(seg.get("titleTop") or seg["top"]))
            strip_top = max(0, title_top - 10)
            strip_bottom = min(height, title_top + 80)
            title = _ocr_strip_paddle(
                rgb, strip_top, strip_bottom, work_dir, f"label-{seg.get('index', 0):02d}.png"
            )
            if title and not is_harmony_title(title) and not is_junk_split_title(title):
                seg["title"] = clean_segment_title(title)

    meta["systemCount"] = len(bands or [])
    return segments, meta


def _crop_jpeg_base64(rgb: "Image.Image", top: int, bottom: int) -> str:
    width, _ = rgb.size
    crop = rgb.crop((0, top, width, bottom))
    buf = io.BytesIO()
    crop.save(buf, format="JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def split_sheet_page_sync(
    image_bytes: bytes,
    filename: str = "page.png",
    page_number: int = 1,
) -> dict[str, Any]:
    """Split one page image into tune crops. Returns JSON-serializable body."""
    if Image is None:
        raise RuntimeError("Pillow is required for sheet page splitting")
    if not image_bytes:
        raise ValueError("Image file is empty")
    if not ensure_paddleocr_available():
        raise RuntimeError("Sheet OCR is not available on this resolver")

    with tempfile.TemporaryDirectory(prefix="sheet-split-") as work_dir:
        suffix = os.path.splitext(filename or "")[1] or ".png"
        if suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff"}:
            suffix = ".png"
        src_path = os.path.join(work_dir, "upload" + suffix)
        with open(src_path, "wb") as handle:
            handle.write(image_bytes)

        try:
            meta = preprocess_sheet_image(src_path, work_dir, out_name="pre.png")
            pre_path = str(meta.get("path") or src_path)
        except Exception:
            pre_path = src_path
            meta = {}

        page_out = os.path.join(work_dir, "page.jpg")
        with Image.open(pre_path) as image:
            rgb = image.convert("RGB")
            rgb.save(page_out, format="JPEG", quality=92)
            width, height = rgb.size

        try:
            info = detect_staff_regions(page_out)
            bands = list(info.get("staffRegions") or [])
        except Exception:
            bands = []

        try:
            boxes = extract_ocr_boxes(page_out) or []
        except Exception as exc:
            raise RuntimeError("OCR failed: " + str(exc)[:300]) from exc

        with Image.open(page_out) as image:
            page_rgb = image.convert("RGB")
            segments, split_meta = build_segments_from_boxes(
                boxes,
                width,
                height,
                bands,
                rgb=page_rgb,
                work_dir=work_dir,
            )

            page_jpeg = io.BytesIO()
            page_rgb.save(page_jpeg, format="JPEG", quality=92)
            page_b64 = base64.b64encode(page_jpeg.getvalue()).decode("ascii")

            out_segments: list[dict[str, Any]] = []
            for index, segment in enumerate(segments, start=1):
                title = str(segment.get("title") or "").strip() or (
                    f"untitled-p{int(page_number):02d}-{index:02d}"
                )
                top = int(segment["top"])
                bottom = int(segment["bottom"])
                out_segments.append({
                    "title": title,
                    "tuneIndex": index,
                    "slug": slugify(title),
                    "top": top,
                    "bottom": bottom,
                    "bbox": {"x": 0, "y": top, "width": width, "height": max(1, bottom - top)},
                    "systemTop": segment.get("systemTop"),
                    "systemBottom": segment.get("systemBottom"),
                    "cropJpegBase64": _crop_jpeg_base64(page_rgb, top, bottom),
                })

        return {
            "page": int(page_number) if page_number else 1,
            "width": width,
            "height": height,
            "pageJpegBase64": page_b64,
            "splitMethod": split_meta.get("splitMethod"),
            "systemCount": split_meta.get("systemCount"),
            "deskewAngle": meta.get("deskewAngle"),
            "segments": out_segments,
            "warnings": [],
        }


def sheet_image_split_available() -> bool:
    try:
        return bool(ensure_paddleocr_available() and Image is not None)
    except Exception:
        return False
