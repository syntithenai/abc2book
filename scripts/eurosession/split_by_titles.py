#!/usr/bin/env python3
"""Split EuroSession page snapshots into per-tune crops (title-first).

Clear centered titles (especially with key hints) drive splits. Staff geometry
only refines crop bounds within each title region.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

_RESOLVER = Path(__file__).resolve().parents[2] / "local-resolver"
if _RESOLVER.is_dir():
    sys.path.insert(0, str(_RESOLVER))

from sheet_image_preprocess import preprocess_sheet_image  # noqa: E402
from sheet_image_segment import (  # noqa: E402
    TITLE_KEY_HINT_RE,
    clean_segment_title,
    is_harmony_title,
    is_junk_split_title,
    is_strong_split_title,
    looks_like_person_name_title,
    looks_like_title_line,
    normalize_title_key,
    segments_from_title_lines,
    select_strong_title_lines,
    select_title_lines,
)
from sheet_image_staff_detect import detect_staff_regions  # noqa: E402

HARMONY_RE = re.compile(r"^\(?\s*harmony\s*\)?$", re.I)


def find_tesseract() -> str:
    env = os.environ.get("TESSERACT_BIN", "").strip()
    if env and shutil.which(env):
        return env
    for candidate in (
        str(Path.home() / "tools/bin/tesseract"),
        "tesseract",
        "/usr/bin/tesseract",
    ):
        path = shutil.which(candidate) if not candidate.startswith("/") else candidate
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
        if candidate.startswith("/") and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError(
        "tesseract not found. Install tesseract-ocr or set TESSERACT_BIN "
        "(wrapper at ~/tools/bin/tesseract uses the local-resolver Docker image)."
    )


def list_page_images(input_dir: Path) -> list[Path]:
    return sorted(
        [p for p in input_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}],
        key=lambda p: p.name,
    )


def slugify(title: str) -> str:
    text = TITLE_KEY_HINT_RE.sub("", title or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text, flags=re.I)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text[:80] or "untitled"


def tesseract_text(image_path: Path, tesseract_bin: str, lang: str, psm: str = "7") -> list[str]:
    cmd = [tesseract_bin, str(image_path), "stdout", "--psm", psm, "-l", lang]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        return []
    return [ln.strip() for ln in (proc.stdout or "").splitlines() if ln.strip()]


def tesseract_ocr_boxes(image_path: Path, tesseract_bin: str, lang: str) -> list[dict]:
    """Parse Tesseract TSV word boxes into resolver-compatible dicts."""
    cmd = [
        tesseract_bin,
        str(image_path),
        "stdout",
        "--psm",
        "6",
        "-l",
        lang,
        "tsv",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not (proc.stdout or "").strip():
        return []

    boxes: list[dict] = []
    reader = csv.DictReader(io.StringIO(proc.stdout), delimiter="\t")
    for row in reader:
        try:
            level = int(row.get("level") or 0)
        except ValueError:
            continue
        if level != 5:
            continue
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        try:
            conf = float(row.get("conf") or 0)
        except ValueError:
            conf = 0.0
        if conf < 0:
            conf = 0.0
        boxes.append({
            "text": text,
            "x": float(row.get("left") or 0),
            "y": float(row.get("top") or 0),
            "width": float(row.get("width") or 1),
            "height": float(row.get("height") or 1),
            "confidence": conf / 100.0 if conf > 1 else conf,
        })
    return boxes


def _cluster_lines_from_boxes(boxes: list[dict], y_tol: float = 18.0) -> list[dict]:
    """Cluster word boxes into lines (mirrors sheet_image_segment._cluster_lines)."""
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


def pick_best_title(lines: list[str]) -> str:
    scored: list[tuple[float, str]] = []
    for line in lines:
        cleaned = line.strip()
        if HARMONY_RE.match(cleaned):
            return "(Harmony)"
        if not looks_like_title_line(cleaned):
            continue
        if re.search(r"SSS|_{2,}|\|{2,}|\+{2,}|={2,}", cleaned):
            continue
        tokens = cleaned.replace(",", " ").split()
        chordish = sum(
            1
            for tok in tokens
            if re.match(
                r"^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d{0,2}(?:/[A-G](?:#|b)?)?$",
                tok,
                re.I,
            )
        )
        if chordish >= 2 and chordish >= len(tokens) / 2:
            continue
        letters = sum(ch.isalpha() for ch in cleaned)
        if letters < 4:
            continue
        score = float(letters) / max(1, len(cleaned))
        if TITLE_KEY_HINT_RE.search(cleaned):
            score += 0.5
        if re.search(r"[a-zàâäæéèêëîïôœùûüÿñçøå]", cleaned):
            score += 0.1
        scored.append((score, cleaned))
    if not scored:
        return ""
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[0][1]


def ocr_strip(
    rgb: Image.Image,
    top: int,
    bottom: int,
    work_dir: Path,
    name: str,
    tesseract_bin: str,
    lang: str,
) -> str:
    width, height = rgb.size
    top = max(0, min(height - 1, top))
    bottom = max(top + 1, min(height, bottom))
    if bottom - top < 12:
        return ""
    left = int(width * 0.06)
    right = int(width * 0.94)
    crop = rgb.crop((left, top, right, bottom))
    path = work_dir / name
    cw, ch = crop.size
    if ch < 40:
        scale = max(2, int(56 / max(1, ch)))
        crop = crop.resize((cw * scale, ch * scale), Image.Resampling.LANCZOS)
    crop.save(path, format="PNG")
    lines = tesseract_text(path, tesseract_bin, lang, psm="6")
    if not lines:
        lines = tesseract_text(path, tesseract_bin, lang, psm="7")
    return pick_best_title(lines)


def inter_band_gaps(bands: list[dict]) -> list[tuple[float, float, float]]:
    """Return (gap_top, gap_bottom, gap_size) for consecutive staff bands."""
    ordered = sorted(bands, key=lambda b: float(b.get("top") or 0))
    gaps: list[tuple[float, float, float]] = []
    for i in range(len(ordered) - 1):
        gap_top = float(ordered[i]["bottom"])
        gap_bottom = float(ordered[i + 1]["top"])
        gap = gap_bottom - gap_top
        if gap > 0:
            gaps.append((gap_top, gap_bottom, gap))
    return gaps


def discover_titles_from_boxes(
    boxes: list[dict],
    width: int,
    height: int,
) -> list[dict]:
    lines = _cluster_lines_from_boxes(boxes)
    return select_strong_title_lines(lines, width, height)


def discover_titles_strip_scan(
    rgb: Image.Image,
    work_dir: Path,
    tesseract_bin: str,
    lang: str,
    step: int = 40,
    strip_height: int = 100,
) -> list[dict]:
    """Sliding strip OCR fallback when full-page boxes miss titles."""
    _, height = rgb.size
    found: list[dict] = []
    for y in range(0, max(1, height - 80), step):
        title = ocr_strip(
            rgb, y, min(y + strip_height, height), work_dir,
            f"scan-{y:04d}.png", tesseract_bin, lang,
        )
        if not title or not is_strong_split_title(title):
            continue
        if is_junk_split_title(title):
            continue
        # Strip scan is noisy: require key hint, parenthetical gloss, or 3+ words.
        words = [w for w in title.split() if sum(ch.isalpha() for ch in w) >= 2]
        has_key = bool(TITLE_KEY_HINT_RE.search(title))
        has_gloss = "(" in title and ")" in title
        if not has_key and not has_gloss and len(words) < 3:
            continue
        if title.lstrip().startswith(("/", "[", "|", "=")):
            title = title.lstrip("/[|= ").strip()
            if not is_strong_split_title(title):
                continue
        score = 0.5
        if has_key:
            score = 0.9
        elif has_gloss:
            score = 0.85
        elif re.search(r"[a-zàâäæéèêëîïôœùûüÿñçøå]", title):
            score = 0.7
        score += min(0.15, 0.03 * len(words))
        found.append({
            "text": title,  # keep full OCR text for split strength; clean later
            "top": float(y),
            "bottom": float(min(y + strip_height, height)),
            "left": rgb.size[0] * 0.1,
            "right": rgb.size[0] * 0.9,
            "height": float(strip_height),
            "centerX": rgb.size[0] / 2.0,
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


def discover_titles_large_gaps(
    rgb: Image.Image,
    bands: list[dict],
    work_dir: Path,
    tesseract_bin: str,
    lang: str,
    image_height: int,
) -> list[dict]:
    """Split at large inter-staff gaps only when gap OCR finds title-like text."""
    gap_min = max(200.0, image_height * 0.12)
    titles: list[dict] = []
    for gap_top, gap_bottom, gap_size in inter_band_gaps(bands):
        if gap_size < gap_min:
            continue
        strip_top = int(gap_top + gap_size * 0.05)
        strip_bottom = int(gap_top + gap_size * 0.85)
        title = ocr_strip(
            rgb, strip_top, strip_bottom, work_dir,
            f"gap-{strip_top:04d}.png", tesseract_bin, lang,
        )
        if not title or not looks_like_title_line(title):
            continue
        if is_harmony_title(title):
            continue
        if not is_strong_split_title(title):
            continue
        y_center = (strip_top + strip_bottom) / 2.0
        titles.append({
            "text": title,  # clean later at segment label time
            "top": y_center - 20,
            "bottom": y_center + 20,
            "left": rgb.size[0] * 0.1,
            "right": rgb.size[0] * 0.9,
            "height": 40.0,
            "centerX": rgb.size[0] / 2.0,
            "confidence": 0.4,
            "score": 0.55,
        })
    return titles


def find_harmony_base_title(
    rgb: Image.Image,
    work_dir: Path,
    tesseract_bin: str,
    lang: str,
) -> str:
    """When only a harmony line OCRs cleanly, use its base name as the tune title."""
    _, height = rgb.size
    for y in range(0, max(1, height - 80), 40):
        title = ocr_strip(
            rgb, y, min(y + 100, height), work_dir,
            f"harmony-{y:04d}.png", tesseract_bin, lang,
        )
        if title and is_harmony_title(title):
            return clean_segment_title(title)
    return ""


def merge_title_candidates(*groups: list[dict], image_height: int) -> list[dict]:
    merged: list[dict] = []
    for group in groups:
        merged.extend(group)
    if not merged:
        return []
    merged.sort(key=lambda t: float(t.get("top") or 0))
    deduped: list[dict] = []
    # Wide enough to collapse composer-credit OCR under the real title.
    y_tol = max(100.0, image_height * 0.05)
    for title in merged:
        text = str(title.get("text") or "")
        score = float(title.get("score") or 0)
        # Prefer longer real titles over short composer-pair OCR.
        score += min(0.2, len(text) * 0.01)
        title = dict(title)
        title["score"] = score
        if deduped and abs(float(title["top"]) - float(deduped[-1]["top"])) < y_tol:
            if score >= float(deduped[-1].get("score") or 0):
                deduped[-1] = title
            continue
        deduped.append(title)
    return deduped


def snap_segments_to_staff(
    segments: list[dict],
    bands: list[dict],
    image_height: int,
    pad_top: int = 12,
    pad_bottom: int = 24,
) -> list[dict]:
    """Extend segment bounds to cover all staff bands within each title region."""
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

    # Last segment always to page bottom.
    segments[-1]["bottom"] = image_height
    for i, seg in enumerate(segments):
        seg["index"] = i
        seg["top"] = max(0, min(int(seg["top"]), image_height - 1))
        seg["bottom"] = max(int(seg["top"]) + 1, min(int(seg["bottom"]), image_height))
    return segments


def merge_harmony_segments(segments: list[dict]) -> list[dict]:
    """Merge harmony continuations and repeated base-title lines into previous crop."""
    if len(segments) <= 1:
        return segments

    merged: list[dict] = [dict(segments[0])]
    for seg in segments[1:]:
        title = str(seg.get("title") or "").strip()
        prev_title = str(merged[-1].get("title") or "").strip()
        prev_key = normalize_title_key(prev_title)
        this_key = normalize_title_key(title)

        is_harmony = is_harmony_title(title) or HARMONY_RE.match(title or "")
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
    """Absorb junk / nearby composer-credit splits into the previous crop."""
    if len(segments) <= 1:
        return segments

    min_gap = max(140.0, image_height * 0.08)
    merged: list[dict] = [dict(segments[0])]
    for seg in segments[1:]:
        title = str(seg.get("title") or "").strip()
        gap = float(seg.get("top") or 0) - float(merged[-1].get("bottom") or 0)
        # Title-midpoint segments may abut; use titleTop distance when available.
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

    # If the first segment itself is junk-titled but later ones are strong, keep later ones;
    # if everything collapsed to one junk title, clear it so labeling can retry.
    if len(merged) == 1 and is_junk_split_title(str(merged[0].get("title") or "")):
        merged[0]["title"] = ""

    for i, seg in enumerate(merged):
        seg["index"] = i
    return merged


def build_page_segments(
    page_out: Path,
    page_rgb: Image.Image,
    bands: list[dict],
    work_dir: Path,
    tesseract_bin: str,
    lang: str,
) -> tuple[list[dict], dict]:
    width, height = page_rgb.size
    meta: dict = {"splitMethod": "none"}

    boxes = tesseract_ocr_boxes(page_out, tesseract_bin, lang)
    lines = _cluster_lines_from_boxes(boxes)
    strong = [
        t for t in select_strong_title_lines(lines, width, height)
        if not is_junk_split_title(str(t.get("text") or ""))
    ]
    meta["splitMethod"] = "ocr_boxes"
    meta["strongTitleCount"] = len(strong)

    if len(strong) < 2:
        strip_titles = discover_titles_strip_scan(page_rgb, work_dir, tesseract_bin, lang)
        gap_titles = discover_titles_large_gaps(
            page_rgb, bands, work_dir, tesseract_bin, lang, height,
        ) if bands else []
        combined = merge_title_candidates(strong, strip_titles, gap_titles, image_height=height)
        combined = [
            t for t in combined
            if is_strong_split_title(str(t.get("text") or ""))
            and not is_junk_split_title(str(t.get("text") or ""))
        ]
        if len(combined) > len(strong):
            strong = combined
            if strip_titles or gap_titles:
                meta["splitMethod"] = "fallback"

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
        meta["splitMethod"] = "title_first"
        for seg in segments:
            seg["title"] = clean_segment_title(str(seg.get("title") or ""))

    pad_bottom = max(24, int(height * 0.025))
    segments = snap_segments_to_staff(segments, bands, height, pad_bottom=pad_bottom)
    segments = merge_harmony_segments(segments)
    segments = merge_weak_segments(segments, height)

    # Fill missing titles from strip OCR near titleTop.
    for seg in segments:
        if str(seg.get("title") or "").strip():
            continue
        title_top = int(float(seg.get("titleTop") or seg["top"]))
        strip_top = max(0, title_top - 10)
        strip_bottom = min(height, title_top + 80)
        title = ocr_strip(
            page_rgb, strip_top, strip_bottom, work_dir,
            f"label-{seg['index']:02d}.png", tesseract_bin, lang,
        )
        if title and not is_harmony_title(title) and not is_junk_split_title(title):
            seg["title"] = clean_segment_title(title)

    if len(segments) == 1:
        harmony_title = find_harmony_base_title(page_rgb, work_dir, tesseract_bin, lang)
        current = str(segments[0].get("title") or "").strip()
        if harmony_title and (
            not current
            or is_harmony_title(current)
            or is_junk_split_title(current)
            or len(harmony_title) > len(current) + 2
            or ("©" in current)
        ):
            segments[0]["title"] = harmony_title

    meta["systemCount"] = len(bands)
    return segments, meta


def process_page(
    page_path: Path,
    page_number: int,
    pages_dir: Path,
    tunes_dir: Path,
    tesseract_bin: str,
    lang: str,
) -> list[dict]:
    pages_dir.mkdir(parents=True, exist_ok=True)
    tunes_dir.mkdir(parents=True, exist_ok=True)
    work_dir = pages_dir / f".tmp-preprocess-p{page_number:02d}"
    work_dir.mkdir(parents=True, exist_ok=True)
    try:
        meta = preprocess_sheet_image(
            str(page_path), str(work_dir), out_name=f"p{page_number:02d}-pre.png"
        )
        pre_path = Path(meta["path"])
        page_out = pages_dir / f"p{page_number:02d}.jpg"
        with Image.open(pre_path) as image:
            rgb = image.convert("RGB")
            rgb.save(page_out, format="JPEG", quality=92)
            width, height = rgb.size

        info = detect_staff_regions(str(page_out))
        bands = list(info.get("staffRegions") or [])

        gap_dir = work_dir / f"ocr-p{page_number:02d}"
        gap_dir.mkdir(parents=True, exist_ok=True)
        with Image.open(page_out) as image:
            page_rgb = image.convert("RGB")
            segments, split_meta = build_page_segments(
                page_out, page_rgb, bands, gap_dir, tesseract_bin, lang,
            )

            for old in tunes_dir.glob(f"p{page_number:02d}_*.jpg"):
                old.unlink(missing_ok=True)

            entries: list[dict] = []
            for index, segment in enumerate(segments, start=1):
                title = str(segment.get("title") or "").strip() or f"untitled-p{page_number:02d}-{index:02d}"
                top = int(segment["top"])
                bottom = int(segment["bottom"])
                crop = page_rgb.crop((0, top, width, bottom))
                slug = slugify(title)
                name = f"p{page_number:02d}_{index:02d}_{slug}.jpg"
                crop_path = tunes_dir / name
                crop.save(crop_path, format="JPEG", quality=92)
                entries.append({
                    "page": page_number,
                    "tuneIndex": index,
                    "title": title,
                    "slug": slug,
                    "cropPath": str(crop_path),
                    "pagePath": str(page_out),
                    "sourcePath": str(page_path),
                    "top": top,
                    "bottom": bottom,
                    "systemTop": segment.get("systemTop"),
                    "systemBottom": segment.get("systemBottom"),
                    "splitMethod": split_meta.get("splitMethod"),
                    "systemCount": split_meta.get("systemCount"),
                    "deskewAngle": meta.get("deskewAngle"),
                    "flattened": meta.get("flattened"),
                })
            return entries
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Split EuroSession pages by title lines")
    parser.add_argument("--input", default="/home/stever/Downloads/eurosession book")
    parser.add_argument("--output", default="/home/stever/Downloads/eurosession-work")
    parser.add_argument("--lang", default="eng+fra+dan+nor+ell")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--pages", default="", help="Comma-separated 1-based page numbers")
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    pages_dir = output_dir / "pages"
    tunes_dir = output_dir / "tunes"
    output_dir.mkdir(parents=True, exist_ok=True)

    tesseract_bin = find_tesseract()
    full_images = list_page_images(input_dir)
    if not full_images:
        print(f"No images in {input_dir}", file=sys.stderr)
        return 1

    selected = set()
    if args.pages.strip():
        selected = {int(x.strip()) for x in args.pages.split(",") if x.strip()}

    if selected:
        targets = [(n, full_images[n - 1]) for n in sorted(selected) if 1 <= n <= len(full_images)]
    elif args.limit > 0:
        targets = list(enumerate(full_images[: args.limit], start=1))
    else:
        targets = list(enumerate(full_images, start=1))

    print(f"tesseract={tesseract_bin}")
    print(f"pages={len(targets)} output={output_dir}")

    all_entries: list[dict] = []
    for page_number, page_path in targets:
        print(f"page {page_number:02d}: {page_path.name}")
        try:
            entries = process_page(page_path, page_number, pages_dir, tunes_dir, tesseract_bin, args.lang)
        except Exception as exc:
            print(f"  ERROR: {exc}", file=sys.stderr)
            all_entries.append({
                "page": page_number,
                "tuneIndex": 0,
                "title": "",
                "error": str(exc)[:300],
                "sourcePath": str(page_path),
            })
            continue
        print(f"  tunes={len(entries)}: " + "; ".join(e["title"] for e in entries))
        all_entries.extend(entries)

    manifest_path = output_dir / "manifest.json"
    existing = []
    if manifest_path.exists() and selected:
        try:
            prev = json.loads(manifest_path.read_text(encoding="utf-8"))
            existing = [t for t in prev.get("tunes") or [] if int(t.get("page") or 0) not in selected]
        except Exception:
            existing = []
    merged = existing + all_entries
    merged.sort(key=lambda t: (int(t.get("page") or 0), int(t.get("tuneIndex") or 0)))

    manifest = {
        "inputDir": str(input_dir),
        "outputDir": str(output_dir),
        "pageCount": len(full_images),
        "tuneCount": sum(1 for e in merged if e.get("cropPath")),
        "tunes": merged,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {manifest_path} ({manifest['tuneCount']} tunes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
