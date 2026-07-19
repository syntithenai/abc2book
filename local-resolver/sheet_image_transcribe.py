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
from sheet_image_melody import extract_main_melody_from_musicxml
from sheet_image_ocr import ensure_paddleocr_available, extract_ocr_boxes
from sheet_image_omr import ensure_homr_available, transcribe_image_to_musicxml
from sheet_image_staff_detect import classify_page_type, detect_staff_regions, vision_stack_available
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
        total += 140
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
    if Image is None:
        return source_path
    with Image.open(source_path) as image:
        converted = image.convert("RGB")
        max_edge = int(os.getenv("SHEET_IMAGE_MAX_EDGE", "2400"))
        width, height = converted.size
        longest = max(width, height)
        if longest > max_edge:
            scale = max_edge / float(longest)
            converted = converted.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)
        out_path = os.path.join(work_dir, "preprocessed.png")
        converted.save(out_path, format="PNG")
        return out_path


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
    lines = reconstruct_chords_over_words(boxes)
    line_details = reconstruct_chord_sheet_details(boxes)
    confidence = estimate_chord_sheet_confidence(lines, boxes)
    return {
        "format": "chords-over-words",
        "text": lines_to_chord_sheet_text(lines),
        "lines": classify_lyric_chord_lines(lines),
        "sections": build_sections_from_lines(lines),
        "confidence": confidence,
        "warnings": warnings,
        "ocrBoxes": boxes,
        "lineDetails": line_details,
        "_rawLines": lines,
    }


def _extract_melody(image_path: str) -> dict[str, Any] | None:
    if not ensure_homr_available():
        return None
    musicxml = transcribe_image_to_musicxml(image_path)
    melody = extract_main_melody_from_musicxml(musicxml)
    melody["source"] = "homr"
    return melody


async def transcribe_sheet_image_bytes(
    data: bytes,
    filename: str = "upload.png",
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    if not vision_stack_available():
        raise RuntimeError("Sheet image transcription is disabled")

    started_at = time.monotonic()
    estimated_total = _estimate_total_seconds(has_staff=False)
    _emit_progress(on_progress, "prepare", "Preparing image or PDF page...", started_at, estimated_total)

    warnings: list[str] = []
    with tempfile.TemporaryDirectory(prefix="sheet-image-") as work_dir:
        image_path = _prepare_image_path(data, filename, work_dir)
        _emit_progress(on_progress, "staff_detect", "Detecting staff notation regions...", started_at, estimated_total)
        staff_info = detect_staff_regions(image_path)
        if staff_info.get("hasStaff"):
            estimated_total = _estimate_total_seconds(has_staff=True)
        _emit_progress(on_progress, "ocr", "Running OCR for chords and lyrics...", started_at, estimated_total)
        chord_sheet = _extract_chord_sheet(image_path)
        raw_lines = chord_sheet.pop("_rawLines", [])
        ocr_boxes = chord_sheet.pop("ocrBoxes", [])

        might_vlm = float(chord_sheet.get("confidence") or 0.0) < 0.55
        if might_vlm:
            estimated_total = _estimate_total_seconds(bool(staff_info.get("hasStaff")), might_vlm=True)

        fallback = await maybe_apply_vlm_fallback(raw_lines, ocr_boxes, float(chord_sheet.get("confidence") or 0.0))
        title = ""
        artist = ""
        if fallback:
            if fallback.get("lines"):
                _emit_progress(on_progress, "vlm", "Cleaning chord text with research LLM...", started_at, estimated_total)
                chord_sheet["lines"] = classify_lyric_chord_lines(fallback["lines"])
                chord_sheet["sections"] = build_sections_from_lines(fallback["lines"])
                chord_sheet["text"] = fallback.get("text") or lines_to_chord_sheet_text(fallback["lines"])
                chord_sheet["confidence"] = fallback.get("confidence", chord_sheet.get("confidence"))
                chord_sheet["source"] = fallback.get("source", "llm_cleanup")
                raw_lines = fallback["lines"]
                warnings.append("vlm_fallback_applied")
            title = str(fallback.get("title") or "")
            artist = str(fallback.get("artist") or "")

        if not title and not artist:
            title, artist = _guess_title_artist(raw_lines)

        melody = None
        omr_skipped = False
        if staff_info.get("hasStaff"):
            if ensure_homr_available():
                try:
                    _emit_progress(on_progress, "omr", "Recognizing melody notation (OMR)...", started_at, estimated_total)
                    melody = _extract_melody(image_path)
                    _emit_progress(on_progress, "melody", "Converting melody to ABC...", started_at, estimated_total)
                except Exception as exc:
                    warnings.append("omr_failed")
                    warnings.append(str(exc)[:200])
            else:
                omr_skipped = True
                warnings.append("omr_unavailable")

        page_type = classify_page_type(bool(staff_info.get("hasStaff")), raw_lines)
        if chord_sheet.get("text") and melody:
            page_type = "mixed"
        elif melody and not chord_sheet.get("text"):
            page_type = "notation_only"
        elif chord_sheet.get("text") and not melody:
            page_type = "chord_chart"

        chord_text = str(chord_sheet.get("text") or "").strip()
        melody_abc = ""
        if isinstance(melody, dict):
            melody_abc = str(melody.get("abc") or "").strip()
        if not chord_text and not melody_abc:
            if "omr_failed" in warnings:
                raise RuntimeError(
                    "No chords, lyrics, or melody were detected. Staff notation was found but "
                    "melody recognition failed. Try a clearer photo, or import MusicXML/ABC "
                    "for notation scores."
                )
            if "paddleocr_unavailable" in warnings and omr_skipped:
                raise RuntimeError(
                    "No chords, lyrics, or melody were detected. Sheet OCR/OMR backends "
                    "are not available on this resolver."
                )
            if "paddleocr_unavailable" in warnings:
                raise RuntimeError(
                    "No chords, lyrics, or melody were detected. OCR is not available on this resolver."
                )
            if staff_info.get("hasStaff") and omr_skipped:
                raise RuntimeError(
                    "No chords, lyrics, or melody were detected. Staff notation was found but "
                    "melody recognition is not available on this resolver."
                )
            if staff_info.get("hasStaff"):
                raise RuntimeError(
                    "No chords, lyrics, or melody were detected. Staff notation was found but "
                    "melody recognition failed. Try a clearer photo, or import MusicXML/ABC "
                    "for notation scores."
                )
            raise RuntimeError(
                "No chords, lyrics, or melody were detected in the image. "
                "Try a clearer photo of a chord chart or lead sheet."
            )

        result = {
            "title": title,
            "artist": artist,
            "pageType": page_type,
            "chordSheet": {
                "format": chord_sheet.get("format", "chords-over-words"),
                "text": chord_sheet.get("text", ""),
                "lines": chord_sheet.get("lines", []),
                "sections": chord_sheet.get("sections", []),
                "confidence": chord_sheet.get("confidence", 0.0),
                "lineDetails": chord_sheet.get("lineDetails", []),
            },
            "melody": melody,
            "staffDetection": staff_info,
            "warnings": warnings,
        }

    # Emit finalize only after temp files are released so the UI does not sit at
    # "Finishing transcription..." while cleanup or serialization is still running.
    _emit_progress(on_progress, "finalize", "Finishing transcription...", started_at, estimated_total)
    return result


def transcribe_sheet_image_sync(
    data: bytes,
    filename: str = "upload.png",
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    import asyncio

    return asyncio.run(transcribe_sheet_image_bytes(data, filename, on_progress=on_progress))


def run_cli() -> int:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Transcribe a chord sheet / lead sheet image")
    parser.add_argument("image_path")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    with open(args.image_path, "rb") as handle:
        data = handle.read()
    import asyncio

    try:
        result = asyncio.run(transcribe_sheet_image_bytes(data, os.path.basename(args.image_path)))
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
