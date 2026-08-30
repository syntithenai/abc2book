"""Orchestrate chord-sheet OCR and melody OMR for uploaded images."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable

from chord_sheet_utils import (
    build_sections_from_lines,
    classify_lyric_chord_lines,
    estimate_chord_sheet_confidence,
    lines_to_chord_sheet_text,
    reconstruct_chords_over_words,
    reconstruct_chord_sheet_details,
)
from sheet_image_enhanced_omr import extract_enhanced_melody
from sheet_image_abc_repair import polish_omr_abc
from sheet_image_chord_ocr import try_chord_ocr_overlay
from sheet_image_format import (
    build_lyrics_only_payload,
    build_unified_sheet_meta,
    classify_sheet_format,
    split_ocr_bands_for_mixed,
)
from sheet_image_melody import extract_main_melody_from_musicxml
from sheet_image_ocr import ensure_paddleocr_available, extract_ocr_boxes
from sheet_image_omr import ensure_homr_available, transcribe_image_to_musicxml
from sheet_image_preprocess import preprocess_sheet_image
from sheet_image_segment import crop_box_for_segment, segment_page_from_ocr_boxes
from sheet_image_staff_detect import (
    detect_staff_regions,
    vision_stack_available,
    write_staff_crop,
)
from sheet_image_vlm import maybe_apply_vlm_fallback

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

TITLE_LINE_RE = re.compile(r"^(.+?)\s*[-–—|]\s*(.+)$")

ProgressCallback = Callable[[dict[str, Any]], None]

STAGE_PROGRESS = {
    "prepare": 0.06,
    "staff_detect": 0.12,
    "ocr": 0.52,
    "vlm": 0.68,
    "omr": 0.88,
    "melody": 0.96,
    "finalize": 0.99,
}


def _estimate_total_seconds(has_staff: bool, might_vlm: bool = False) -> int:
    total = 65
    if has_staff:
        # Per-staff enhanced OMR can run several homr passes.
        total += 220
    if might_vlm:
        total += 35
    return total


def _emit_progress(
    on_progress: ProgressCallback | None,
    stage: str,
    message: str,
    started_at: float,
    estimated_total_seconds: int,
) -> None:
    payload = {
        "type": "progress",
        "stage": stage,
        "message": message,
        "progress": STAGE_PROGRESS.get(stage, 0.0),
        "estimatedTotalSeconds": estimated_total_seconds,
        "elapsedSeconds": max(0.0, round(time.monotonic() - started_at, 1)),
    }
    if on_progress:
        on_progress(payload)
    if os.getenv("SHEET_IMAGE_PROGRESS", "").strip().lower() in {"1", "true", "yes"}:
        print(json.dumps(payload), file=sys.stderr, flush=True)


def _guess_title_artist(lines: list[str]) -> tuple[str, str]:
    for line in lines[:4]:
        text = str(line or "").strip()
        if not text:
            continue
        match = TITLE_LINE_RE.match(text)
        if match:
            return match.group(1).strip(), match.group(2).strip()
        if len(text) < 80 and not any(ch.isdigit() for ch in text):
            return text, ""
    return "", ""


def _preprocess_image(source_path: str, work_dir: str) -> str:
    meta = preprocess_sheet_image(source_path, work_dir, out_name="preprocessed.png")
    return str(meta.get("path") or source_path)


def _write_uploaded_bytes(data: bytes, filename: str, work_dir: str) -> str:
    suffix = os.path.splitext(filename or "")[1] or ".png"
    out_path = os.path.join(work_dir, f"upload{suffix}")
    with open(out_path, "wb") as handle:
        handle.write(data)
    return out_path


def _extract_pdf_first_page(pdf_path: str, work_dir: str) -> str:
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:
        raise RuntimeError("PDF import requires pypdfium2") from exc
    doc = pdfium.PdfDocument(pdf_path)
    if len(doc) == 0:
        raise ValueError("PDF has no pages")
    page = doc[0]
    bitmap = page.render(scale=2)
    image = bitmap.to_pil()
    out_path = os.path.join(work_dir, "page-1.png")
    image.save(out_path, format="PNG")
    return out_path


def _prepare_image_path(data: bytes, filename: str, work_dir: str) -> str:
    source_path = _write_uploaded_bytes(data, filename, work_dir)
    mime, _encoding = mimetypes.guess_type(filename or "")
    if (mime and "pdf" in mime) or str(filename or "").lower().endswith(".pdf"):
        source_path = _extract_pdf_first_page(source_path, work_dir)
    return _preprocess_image(source_path, work_dir)


def _chord_sheet_from_boxes(boxes: list[dict[str, Any]]) -> dict[str, Any]:
    lines = reconstruct_chords_over_words(boxes)
    line_details = reconstruct_chord_sheet_details(boxes)
    confidence = estimate_chord_sheet_confidence(lines, boxes)
    return {
        "format": "chords-over-words",
        "text": lines_to_chord_sheet_text(lines),
        "lines": classify_lyric_chord_lines(lines),
        "sections": build_sections_from_lines(lines),
        "confidence": confidence,
        "warnings": [],
        "lineDetails": line_details,
        "_rawLines": lines,
    }


def _empty_chord_sheet() -> dict[str, Any]:
    return {
        "format": "chords-over-words",
        "text": "",
        "lines": [],
        "sections": [],
        "confidence": 0.0,
        "warnings": [],
        "lineDetails": [],
        "_rawLines": [],
    }


def _mixed_chord_sheet_from_bands(
    above_boxes: list[dict[str, Any]],
    below_boxes: list[dict[str, Any]],
) -> dict[str, Any]:
    """Rebuild chords-over-words preferring above-staff chords and below-staff lyrics."""
    combined = list(above_boxes or []) + list(below_boxes or [])
    if not combined:
        return _empty_chord_sheet()
    sheet = _chord_sheet_from_boxes(combined)
    # Soften confidence slightly when bands were split (alignment is best-effort).
    sheet["confidence"] = max(0.0, float(sheet.get("confidence") or 0.0) * 0.95)
    sheet["format"] = "mixed-bands"
    return sheet


def _extract_chord_sheet(image_path: str) -> dict[str, Any]:
    warnings: list[str] = []
    # Transcription runs in a short-lived vision subprocess; do not skip OCR
    # while the async /health probe is still cold.
    if not ensure_paddleocr_available():
        return {
            "format": "chords-over-words",
            "text": "",
            "lines": [],
            "sections": [],
            "confidence": 0.0,
            "warnings": ["paddleocr_unavailable"],
        }
    boxes = extract_ocr_boxes(image_path)
    sheet = _chord_sheet_from_boxes(boxes)
    sheet["warnings"] = warnings
    sheet["ocrBoxes"] = boxes
    return sheet


def _extract_melody(
    image_path: str,
    work_dir: str | None = None,
    title: str = "",
) -> dict[str, Any] | None:
    """Extract melody via enhanced per-staff OMR when possible; else full-crop homr."""
    if not ensure_homr_available():
        return None
    try:
        enhanced = extract_enhanced_melody(
            image_path,
            work_dir=work_dir,
            title=title or "",
        )
        if enhanced and str(enhanced.get("abc") or "").strip():
            return enhanced
    except Exception:
        # Fall through to classic staff-union crop path.
        pass

    omr_path = image_path
    staff_crop_used = False
    if work_dir:
        staff_info = detect_staff_regions(image_path)
        crop_path = write_staff_crop(image_path, work_dir, staff_info=staff_info)
        if crop_path:
            omr_path = crop_path
            staff_crop_used = True
    musicxml = transcribe_image_to_musicxml(omr_path)
    melody = extract_main_melody_from_musicxml(musicxml)
    abc, warnings = polish_omr_abc(str(melody.get("abc") or ""), title=title or "")
    melody["abc"] = abc
    if warnings:
        melody["warnings"] = list(dict.fromkeys(list(melody.get("warnings") or []) + warnings))
    melody["source"] = "homr"
    melody["staffCropUsed"] = staff_crop_used
    melody["enhancedOmr"] = {
        "mode": "full-crop",
        "upscaled": False,
        "bandCount": None,
        "okSystems": None,
        "reason": "classic-fallback",
    }
    return melody


def _image_size(image_path: str) -> tuple[int, int]:
    if Image is None:
        return 0, 0
    with Image.open(image_path) as image:
        return int(image.size[0]), int(image.size[1])


def _write_segment_crop(
    image_path: str,
    work_dir: str,
    segment: dict[str, Any],
    index: int,
) -> str:
    if Image is None:
        return image_path
    width, height = _image_size(image_path)
    left, top, right, bottom = crop_box_for_segment(segment, width, height)
    with Image.open(image_path) as image:
        cropped = image.convert("RGB").crop((left, top, right, bottom))
        out_path = os.path.join(work_dir, f"segment-{index:02d}.png")
        cropped.save(out_path, format="PNG")
        return out_path


def _empty_result_error(warnings: list[str], staff_info: dict[str, Any], omr_skipped: bool) -> RuntimeError:
    if "omr_failed" in warnings:
        return RuntimeError(
            "No chords, lyrics, or melody were detected. Staff notation was found but "
            "melody recognition failed. Try a clearer photo, or import MusicXML/ABC "
            "for notation scores."
        )
    if "paddleocr_unavailable" in warnings and omr_skipped:
        return RuntimeError(
            "No chords, lyrics, or melody were detected. Sheet OCR/OMR backends "
            "are not available on this resolver."
        )
    if "paddleocr_unavailable" in warnings:
        return RuntimeError(
            "No chords, lyrics, or melody were detected. OCR is not available on this resolver."
        )
    if staff_info.get("hasStaff") and omr_skipped:
        return RuntimeError(
            "No chords, lyrics, or melody were detected. Staff notation was found but "
            "melody recognition is not available on this resolver."
        )
    if staff_info.get("hasStaff"):
        return RuntimeError(
            "No chords, lyrics, or melody were detected. Staff notation was found but "
            "melody recognition failed. Try a clearer photo, or import MusicXML/ABC "
            "for notation scores."
        )
    return RuntimeError(
        "No chords, lyrics, or melody were detected in the image. "
        "Try a clearer photo of a chord chart or lead sheet."
    )


async def _run_omr_if_needed(
    image_path: str,
    work_dir: str,
    title: str,
    on_progress: ProgressCallback | None,
    started_at: float,
    estimated_total: int,
    warnings: list[str],
) -> tuple[dict[str, Any] | None, bool]:
    """Return (melody, omr_skipped)."""
    if not ensure_homr_available():
        warnings.append("omr_unavailable")
        return None, True
    try:
        _emit_progress(on_progress, "omr", "Recognizing melody notation (OMR)...", started_at, estimated_total)
        melody = _extract_melody(image_path, work_dir=work_dir, title=title)
        _emit_progress(on_progress, "melody", "Converting melody to ABC...", started_at, estimated_total)
        return melody, False
    except Exception as exc:
        warnings.append("omr_failed")
        warnings.append(str(exc)[:200])
        return None, False


async def _transcribe_single_image(
    image_path: str,
    work_dir: str,
    on_progress: ProgressCallback | None,
    started_at: float,
    estimated_total: int,
    title_hint: str = "",
    composer_hint: str = "",
    skip_page_ocr: bool = False,
    ocr_boxes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    _emit_progress(on_progress, "staff_detect", "Detecting staff notation regions...", started_at, estimated_total)
    staff_info = detect_staff_regions(image_path)
    _width, height = _image_size(image_path)

    if skip_page_ocr and ocr_boxes is not None:
        boxes = list(ocr_boxes)
        chord_sheet = _chord_sheet_from_boxes(boxes)
        raw_lines = chord_sheet.pop("_rawLines", [])
    else:
        _emit_progress(on_progress, "ocr", "Running OCR for chords and lyrics...", started_at, estimated_total)
        chord_sheet = _extract_chord_sheet(image_path)
        raw_lines = chord_sheet.pop("_rawLines", [])
        boxes = chord_sheet.pop("ocrBoxes", []) or []
        for w in chord_sheet.get("warnings") or []:
            if w not in warnings:
                warnings.append(w)

    format_info = classify_sheet_format(
        staff_info,
        boxes,
        raw_lines,
        image_height=float(height or 0),
    )
    sheet_format = str(format_info.get("sheetFormat") or "unknown")
    needs_omr = bool(format_info.get("needsOmr"))
    skip_homr = bool(format_info.get("skipHomr"))
    ambiguous = bool(format_info.get("ambiguous"))

    if needs_omr or ambiguous:
        estimated_total = _estimate_total_seconds(has_staff=bool(staff_info.get("hasStaff")))

    # Route-specific chord/lyric payload
    if sheet_format == "lyrics_only" and not ambiguous:
        meta_hint = format_info.get("meta") or {}
        chord_sheet = build_lyrics_only_payload(raw_lines, meta_hint)
        raw_lines = [
            str(item.get("text") or "")
            for item in (chord_sheet.get("lines") or [])
        ]
    elif sheet_format == "notation_only" and not ambiguous:
        signals = format_info.get("signals") or {}
        if float(signals.get("chordTokenDensity") or 0) < 0.05 and int(signals.get("chordLineCount") or 0) == 0:
            chord_sheet = _empty_chord_sheet()
            raw_lines = []

    might_vlm = (
        sheet_format in {"chord_chart", "lyrics_only", "mixed", "unknown"}
        and float(chord_sheet.get("confidence") or 0.0) < 0.55
        and sheet_format != "notation_only"
    )
    if might_vlm:
        estimated_total = _estimate_total_seconds(bool(staff_info.get("hasStaff")), might_vlm=True)

    fallback = None
    if might_vlm:
        fallback = await maybe_apply_vlm_fallback(
            raw_lines, boxes, float(chord_sheet.get("confidence") or 0.0)
        )

    title = str(title_hint or "")
    artist = ""
    if fallback:
        if fallback.get("lines"):
            _emit_progress(on_progress, "vlm", "Cleaning chord text with research LLM...", started_at, estimated_total)
            if sheet_format == "lyrics_only":
                chord_sheet = build_lyrics_only_payload(
                    fallback["lines"],
                    {"title": fallback.get("title"), "artist": fallback.get("artist")},
                )
            else:
                chord_sheet["lines"] = classify_lyric_chord_lines(fallback["lines"])
                chord_sheet["sections"] = build_sections_from_lines(fallback["lines"])
                chord_sheet["text"] = fallback.get("text") or lines_to_chord_sheet_text(fallback["lines"])
                chord_sheet["confidence"] = fallback.get("confidence", chord_sheet.get("confidence"))
                chord_sheet["source"] = fallback.get("source", "llm_cleanup")
            raw_lines = fallback["lines"]
            warnings.append("vlm_fallback_applied")
        if not title:
            title = str(fallback.get("title") or "")
        artist = str(fallback.get("artist") or "")

    if not title and not artist:
        title, artist = _guess_title_artist(raw_lines)

    band_meta = format_info.get("meta") or {}
    if not title:
        title = str(band_meta.get("title") or "")
    if not artist:
        artist = str(band_meta.get("artist") or band_meta.get("composer") or "")

    melody = None
    omr_skipped = False
    run_omr = needs_omr or (ambiguous and bool(staff_info.get("hasStaff")))
    if run_omr and not skip_homr:
        melody, omr_skipped = await _run_omr_if_needed(
            image_path,
            work_dir,
            title,
            on_progress,
            started_at,
            estimated_total,
            warnings,
        )
    elif skip_homr:
        omr_skipped = False  # intentionally skipped by format route, not unavailable
        warnings.append("homr_skipped_by_format")

    # Mixed: re-split OCR into above/below staff bands after we know staff regions
    if sheet_format == "mixed" or (ambiguous and melody and chord_sheet.get("text")):
        bands = split_ocr_bands_for_mixed(boxes, list(staff_info.get("staffRegions") or []))
        if bands.get("above") or bands.get("below"):
            mixed_sheet = _mixed_chord_sheet_from_bands(bands.get("above") or [], bands.get("below") or [])
            if mixed_sheet.get("text"):
                chord_sheet = mixed_sheet
                raw_lines = chord_sheet.pop("_rawLines", raw_lines)
                sheet_format = "mixed"

    # Ambiguous finalize: prefer higher-confidence payload shape
    if ambiguous and melody and not chord_sheet.get("text"):
        sheet_format = "notation_only"
    elif ambiguous and chord_sheet.get("text") and not melody:
        signals = format_info.get("signals") or {}
        if int(signals.get("chordLineCount") or 0) == 0 and float(signals.get("chordTokenDensity") or 0) < 0.08:
            sheet_format = "lyrics_only"
        else:
            sheet_format = "chord_chart"
    elif ambiguous and melody and chord_sheet.get("text"):
        sheet_format = "mixed"

    meta = build_unified_sheet_meta(
        title=title,
        artist=artist,
        composer=artist or str(band_meta.get("composer") or ""),
        key=str(
            (melody or {}).get("key")
            or band_meta.get("key")
            or ""
        ),
        capo=band_meta.get("capo"),
        source_format=sheet_format,
        confidence=float(format_info.get("confidence") or 0.0),
        ocr_boxes=boxes,
        image_height=float(height or 0),
        folder_composer_hint=str(composer_hint or ""),
    )
    title = meta.get("title") or title
    artist = meta.get("artist") or artist or meta.get("composer") or ""

    chord_ocr = None
    if melody and str((melody or {}).get("abc") or "").strip():
        try:
            chorded_abc, chord_status = try_chord_ocr_overlay(
                image_path,
                str(melody.get("abc") or ""),
                staff_info=staff_info,
                ocr_boxes=boxes,
                enhanced_omr=(melody or {}).get("enhancedOmr"),
            )
            if chorded_abc:
                chord_ocr = {
                    "abc": chorded_abc,
                    "source": "omr-chords",
                    "status": chord_status,
                }
        except Exception as exc:
            warnings.append("chord_ocr_failed")
            warnings.append(str(exc)[:120])

    return {
        "title": title,
        "artist": artist,
        "pageType": sheet_format,
        "sheetFormat": sheet_format,
        "formatConfidence": float(format_info.get("confidence") or 0.0),
        "formatScores": format_info.get("scores") or {},
        "formatAmbiguous": ambiguous,
        "meta": meta,
        "chordSheet": {
            "format": chord_sheet.get("format", "chords-over-words"),
            "text": chord_sheet.get("text", ""),
            "lines": chord_sheet.get("lines", []),
            "sections": chord_sheet.get("sections", []),
            "confidence": chord_sheet.get("confidence", 0.0),
            "lineDetails": chord_sheet.get("lineDetails", []),
            "stanzas": chord_sheet.get("stanzas"),
        },
        "melody": melody,
        "chordOcr": chord_ocr,
        "staffDetection": staff_info,
        "warnings": warnings,
        "_omrSkipped": omr_skipped,
        "_rawLines": raw_lines,
        "_ocrBoxes": boxes,
    }


def _filter_boxes_to_segment(
    boxes: list[dict[str, Any]],
    segment: dict[str, Any],
) -> list[dict[str, Any]]:
    top = float(segment.get("top") or 0)
    bottom = float(segment.get("bottom") or 0)
    filtered: list[dict[str, Any]] = []
    for box in boxes or []:
        y = float(box.get("y") or 0)
        h = float(box.get("height") or 0)
        mid = y + h / 2.0
        if mid < top or mid > bottom:
            continue
        next_box = dict(box)
        next_box["y"] = max(0.0, y - top)
        filtered.append(next_box)
    return filtered


async def transcribe_sheet_image_bytes(
    data: bytes,
    filename: str = "upload.png",
    on_progress: ProgressCallback | None = None,
    composer_hint: str = "",
) -> dict[str, Any]:
    if not vision_stack_available():
        raise RuntimeError("Sheet image transcription is disabled")

    started_at = time.monotonic()
    estimated_total = _estimate_total_seconds(has_staff=False)
    _emit_progress(on_progress, "prepare", "Preparing image or PDF page...", started_at, estimated_total)
    folder_composer = str(composer_hint or "").strip()

    with tempfile.TemporaryDirectory(prefix="sheet-image-") as work_dir:
        image_path = _prepare_image_path(data, filename, work_dir)
        width, height = _image_size(image_path)

        # Page-level OCR first so we can detect stacked session-book titles.
        _emit_progress(on_progress, "ocr", "Running OCR for chords and lyrics...", started_at, estimated_total)
        page_chord = _extract_chord_sheet(image_path)
        page_boxes = list(page_chord.pop("ocrBoxes", []) or [])
        page_raw_lines = page_chord.pop("_rawLines", [])
        segments = segment_page_from_ocr_boxes(page_boxes, width, height)
        multi = len(segments) >= 2 and any(str(seg.get("title") or "").strip() for seg in segments)

        if multi:
            tune_results: list[dict[str, Any]] = []
            for index, segment in enumerate(segments):
                if not str(segment.get("title") or "").strip() and len(segments) > 1:
                    # Skip empty trailing/leading spacer segments without titles when others exist.
                    continue
                seg_dir = os.path.join(work_dir, f"seg-{index:02d}")
                os.makedirs(seg_dir, exist_ok=True)
                seg_path = _write_segment_crop(image_path, seg_dir, segment, index)
                seg_boxes = _filter_boxes_to_segment(page_boxes, segment)
                one = await _transcribe_single_image(
                    seg_path,
                    seg_dir,
                    on_progress,
                    started_at,
                    estimated_total,
                    title_hint=str(segment.get("title") or ""),
                    composer_hint=folder_composer,
                    skip_page_ocr=True,
                    ocr_boxes=seg_boxes,
                )
                one.pop("_omrSkipped", None)
                one.pop("_rawLines", None)
                one.pop("_ocrBoxes", None)
                one["segment"] = {
                    "title": segment.get("title"),
                    "top": segment.get("top"),
                    "bottom": segment.get("bottom"),
                    "confidence": segment.get("confidence"),
                    "index": index,
                }
                tune_results.append(one)

            if not tune_results:
                multi = False
            else:
                first = tune_results[0]
                result = {
                    "title": first.get("title") or "",
                    "artist": first.get("artist") or "",
                    "pageType": first.get("pageType") or "unknown",
                    "sheetFormat": first.get("sheetFormat") or first.get("pageType") or "unknown",
                    "formatConfidence": first.get("formatConfidence"),
                    "meta": first.get("meta") or {},
                    "chordSheet": first.get("chordSheet"),
                    "melody": first.get("melody"),
                    "staffDetection": first.get("staffDetection"),
                    "warnings": list(first.get("warnings") or []),
                    "segments": [
                        {
                            "title": seg.get("title"),
                            "top": seg.get("top"),
                            "bottom": seg.get("bottom"),
                            "confidence": seg.get("confidence"),
                            "index": seg.get("index"),
                        }
                        for seg in segments
                    ],
                    "tunes": tune_results,
                }
                if len(tune_results) > 1:
                    result["warnings"] = list(result.get("warnings") or []) + ["multi_tune_page"]
                _emit_progress(on_progress, "finalize", "Finishing transcription...", started_at, estimated_total)
                return result

        # Single-tune path (reuse page OCR already computed).
        one = await _transcribe_single_image(
            image_path,
            work_dir,
            on_progress,
            started_at,
            estimated_total,
            composer_hint=folder_composer,
            skip_page_ocr=True,
            ocr_boxes=page_boxes,
        )
        # Prefer page OCR chord sheet text when segment path was not used.
        if page_chord.get("text") and not (one.get("chordSheet") or {}).get("text"):
            one["chordSheet"] = {
                "format": page_chord.get("format", "chords-over-words"),
                "text": page_chord.get("text", ""),
                "lines": page_chord.get("lines", []),
                "sections": page_chord.get("sections", []),
                "confidence": page_chord.get("confidence", 0.0),
                "lineDetails": page_chord.get("lineDetails", []),
            }
            one["_rawLines"] = page_raw_lines

        omr_skipped = bool(one.pop("_omrSkipped", False))
        one.pop("_rawLines", None)
        one.pop("_ocrBoxes", None)
        warnings = list(one.get("warnings") or [])
        staff_info = one.get("staffDetection") or {}
        chord_text = str((one.get("chordSheet") or {}).get("text") or "").strip()
        melody_abc = ""
        melody = one.get("melody")
        if isinstance(melody, dict):
            melody_abc = str(melody.get("abc") or "").strip()
        if not chord_text and not melody_abc:
            raise _empty_result_error(warnings, staff_info, omr_skipped)

        one["segments"] = segments
        one["tunes"] = [{
            "title": one.get("title"),
            "artist": one.get("artist"),
            "pageType": one.get("pageType"),
            "sheetFormat": one.get("sheetFormat") or one.get("pageType"),
            "meta": one.get("meta"),
            "chordSheet": one.get("chordSheet"),
            "melody": one.get("melody"),
            "staffDetection": one.get("staffDetection"),
            "warnings": one.get("warnings"),
            "segment": segments[0] if segments else {"title": one.get("title"), "top": 0, "bottom": height, "index": 0},
        }]
        result = one

    _emit_progress(on_progress, "finalize", "Finishing transcription...", started_at, estimated_total)
    return result


def transcribe_sheet_image_sync(
    data: bytes,
    filename: str = "upload.png",
    on_progress: ProgressCallback | None = None,
    composer_hint: str = "",
) -> dict[str, Any]:
    import asyncio

    return asyncio.run(
        transcribe_sheet_image_bytes(
            data,
            filename,
            on_progress=on_progress,
            composer_hint=composer_hint,
        )
    )


def run_cli() -> int:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Transcribe a chord sheet / lead sheet image")
    parser.add_argument("image_path")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--composer-hint",
        default="",
        help="Folder/composer hint when the image path has no parent folder context",
    )
    args = parser.parse_args()
    with open(args.image_path, "rb") as handle:
        data = handle.read()
    import asyncio

    try:
        result = asyncio.run(
            transcribe_sheet_image_bytes(
                data,
                os.path.basename(args.image_path),
                composer_hint=str(args.composer_hint or "").strip(),
            )
        )
    except Exception as exc:
        message = str(exc).strip()[:500] or "Sheet image transcription failed"
        if os.getenv("SHEET_IMAGE_PROGRESS", "").strip().lower() in {"1", "true", "yes"}:
            print(json.dumps({"type": "error", "message": message}), file=sys.stderr, flush=True)
        print(message, file=sys.stderr, flush=True)
        return 1
    print(json.dumps(result, indent=2 if args.json else None, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(run_cli())
