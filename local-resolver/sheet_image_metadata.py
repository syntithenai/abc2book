"""Lightweight title/composer extraction from sheet images and PDFs."""

from __future__ import annotations

import base64
import mimetypes
import os
import re
import sys
import tempfile
from typing import Any

from sheet_image_ocr import ensure_paddleocr_available, extract_ocr_boxes
from sheet_image_transcribe import (
    TITLE_LINE_RE,
    _extract_pdf_first_page,
    _guess_title_artist,
    _preprocess_image,
    _write_uploaded_bytes,
)

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore


def _humanize_folder_name(name: str) -> str:
    text = re.sub(r"[_-]+", " ", str(name or "").strip())
    if not text:
        return ""
    return " ".join(part[:1].upper() + part[1:].lower() if part else "" for part in text.split())


def _composer_hint_from_relative_path(relative_path: str) -> str:
    parts = [part for part in str(relative_path or "").replace("\\", "/").split("/") if part.strip()]
    if len(parts) < 2:
        return ""
    parent = parts[-2].strip()
    if not parent or parent.lower() in {"pdf", "sheet music", "sheets", "music"}:
        return ""
    return _humanize_folder_name(parent)


def _lines_from_top_crop(image_path: str, work_dir: str, crop_fraction: float = 0.28) -> list[str]:
    if Image is None:
        return []
    with Image.open(image_path) as image:
        converted = image.convert("RGB")
        width, height = converted.size
        crop_height = max(32, int(height * crop_fraction))
        cropped = converted.crop((0, 0, width, crop_height))
        out_path = os.path.join(work_dir, "title-crop.png")
        cropped.save(out_path, format="PNG")
    if not ensure_paddleocr_available():
        return []
    try:
        boxes = extract_ocr_boxes(out_path)
    except Exception:
        return []
    lines: list[str] = []
    for box in boxes or []:
        text = str(box.get("text") or "").strip()
        if text:
            lines.append(text)
    return lines


def _looks_like_title_line(text: str) -> bool:
    cleaned = str(text or "").strip()
    if not cleaned or len(cleaned) < 3:
        return False
    if cleaned.isdigit():
        return False
    if re.match(r"^page\s+\d+$", cleaned, re.I):
        return False
    if re.match(r"^\d+\s*[/|]\s*\d+$", cleaned):
        return False
    lowered = cleaned.lower()
    if lowered in {"verse", "chorus", "intro", "bridge", "outro"}:
        return False
    return True


def _normalize_title_key(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def _parse_toc_lines(lines: list[str]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for line in lines or []:
        match = re.match(r"^\s*(\d+)\.\s+(.+?)\s*$", str(line or "").strip())
        if not match:
            continue
        title = str(match.group(2) or "").strip()
        if title and _looks_like_title_line(title):
            entries.append({"num": int(match.group(1)), "title": title})
    return entries


def _map_toc_to_pages(
    toc_entries: list[dict[str, Any]],
    page_titles: list[dict[str, Any]],
) -> list[dict[str, Any]] | None:
    if len(toc_entries) < 3:
        return None

    page_by_title: dict[str, int] = {}
    for entry in page_titles:
        title = str(entry.get("title") or "").strip()
        page_number = int(entry.get("page") or 0)
        if not title or page_number <= 0:
            continue
        key = _normalize_title_key(title)
        if key not in page_by_title:
            page_by_title[key] = page_number

    segments: list[dict[str, Any]] = []
    for entry in toc_entries:
        title = str(entry.get("title") or "").strip()
        if not title:
            continue
        key = _normalize_title_key(title)
        page_number = page_by_title.get(key)
        if not page_number:
            for page_entry in page_titles:
                page_title = _normalize_title_key(str(page_entry.get("title") or ""))
                if not page_title:
                    continue
                if key in page_title or page_title in key:
                    page_number = int(page_entry.get("page") or 0)
                    break
        if not page_number:
            continue
        segments.append({
            "page": page_number,
            "endPage": page_number,
            "title": title,
            "artist": "",
        })

    if len(segments) < 3:
        return None

    last_page = len(page_titles) if page_titles else segments[-1]["page"]
    for index, segment in enumerate(segments):
        if index + 1 < len(segments):
            segment["endPage"] = max(segment["page"], segments[index + 1]["page"] - 1)
        else:
            segment["endPage"] = last_page
    return segments


def _segments_from_page_titles(page_titles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for entry in page_titles[:3]:
        lines = entry.get("lines") or []
        toc_entries = _parse_toc_lines(lines)
        if len(toc_entries) >= 3:
            mapped = _map_toc_to_pages(toc_entries, page_titles)
            if mapped and len(mapped) >= 3:
                return mapped
    return _segment_pages(page_titles)


def _segment_pages(page_titles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for entry in page_titles:
        page_number = int(entry.get("page") or 0)
        title = str(entry.get("title") or "").strip()
        artist = str(entry.get("artist") or "").strip()
        if title and _looks_like_title_line(title):
            if current and current.get("title", "").lower() == title.lower():
                current["endPage"] = page_number
                if artist and not current.get("artist"):
                    current["artist"] = artist
                continue
            if current:
                segments.append(current)
            current = {
                "page": page_number,
                "endPage": page_number,
                "title": title,
                "artist": artist,
            }
            continue
        if current:
            current["endPage"] = page_number
    if current:
        segments.append(current)
    return segments


def _pdf_page_image_paths(data: bytes, filename: str, work_dir: str) -> list[str]:
    mime, _encoding = mimetypes.guess_type(filename or "")
    is_pdf = (mime and "pdf" in mime) or str(filename or "").lower().endswith(".pdf")
    if not is_pdf:
        source_path = _write_uploaded_bytes(data, filename, work_dir)
        return [_preprocess_image(source_path, work_dir)]

    try:
        import pypdfium2 as pdfium
    except ImportError as exc:
        raise RuntimeError("PDF metadata extraction requires pypdfium2") from exc

    source_path = _write_uploaded_bytes(data, filename, work_dir)
    doc = pdfium.PdfDocument(source_path)
    if len(doc) == 0:
        raise ValueError("PDF has no pages")
    paths: list[str] = []
    for index in range(len(doc)):
        page = doc[index]
        bitmap = page.render(scale=2)
        image = bitmap.to_pil()
        out_path = os.path.join(work_dir, f"page-{index + 1}.png")
        image.save(out_path, format="PNG")
        paths.append(_preprocess_image(out_path, work_dir))
    return paths


def metadata_has_readable_title(body: dict[str, Any]) -> bool:
    segments = body.get("segments") if isinstance(body, dict) else None
    if not isinstance(segments, list):
        return False
    return any(str(segment.get("title") or "").strip() for segment in segments)


def apply_cloud_title_metadata(
    body: dict[str, Any],
    cloud: dict[str, Any],
    composer_hint: str = "",
) -> dict[str, Any]:
    next_body = dict(body or {})
    title = str((cloud or {}).get("title") or "").strip()
    artist = str((cloud or {}).get("artist") or "").strip()
    if not title and not artist:
        return next_body
    segments = list(next_body.get("segments") or [])
    if not segments:
        segments = [{
            "page": 1,
            "endPage": int(next_body.get("numPages") or 1),
            "title": title,
            "artist": artist or composer_hint,
        }]
    else:
        first = dict(segments[0])
        if title:
            first["title"] = title
        if artist or composer_hint:
            first["artist"] = artist or composer_hint
        segments[0] = first
    next_body["segments"] = segments
    warnings = list(next_body.get("warnings") or [])
    warnings.extend(list((cloud or {}).get("warnings") or []))
    next_body["warnings"] = warnings
    return next_body


def first_page_image_bytes(data: bytes, filename: str, work_dir: str) -> bytes:
    paths = _pdf_page_image_paths(data, filename, work_dir)
    with open(paths[0], "rb") as handle:
        return handle.read()


def extract_sheet_metadata_bytes(
    data: bytes,
    filename: str = "upload.png",
    composer_hint: str = "",
) -> dict[str, Any]:
    if not data:
        raise ValueError("File is empty")

    with tempfile.TemporaryDirectory(prefix="sheet-metadata-") as work_dir:
        page_paths = _pdf_page_image_paths(data, filename, work_dir)
        page_titles: list[dict[str, Any]] = []
        for index, image_path in enumerate(page_paths):
            lines = _lines_from_top_crop(image_path, work_dir)
            title, artist = _guess_title_artist(lines)
            page_titles.append({
                "page": index + 1,
                "title": title,
                "artist": artist,
                "lines": lines[:6],
            })

        segments = _segments_from_page_titles(page_titles)
        if not segments:
            fallback_title, fallback_artist = _guess_title_artist(
                [line for entry in page_titles for line in entry.get("lines") or []]
            )
            segments = [{
                "page": 1,
                "endPage": len(page_paths),
                "title": fallback_title,
                "artist": fallback_artist or composer_hint,
            }]

        for segment in segments:
            if not segment.get("artist") and composer_hint:
                segment["artist"] = composer_hint

        first_page_image_base64 = ""
        if page_paths:
            with open(page_paths[0], "rb") as handle:
                first_page_image_base64 = base64.b64encode(handle.read()).decode("ascii")

        return {
            "numPages": len(page_paths),
            "segments": segments,
            "pageTitles": page_titles,
            "firstPageImageBase64": first_page_image_base64,
        }


def public_sheet_metadata_body(body: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in (body or {}).items() if key != "firstPageImageBase64"}


def extract_sheet_metadata_sync(
    data: bytes,
    filename: str = "upload.png",
    composer_hint: str = "",
) -> dict[str, Any]:
    """Run metadata extraction in the vision venv when available."""
    vision_python = os.getenv("VISION_VENV_PYTHON", "").strip()
    if vision_python and os.path.isfile(vision_python):
        import json
        import subprocess

        with tempfile.TemporaryDirectory(prefix="sheet-metadata-cli-") as work_dir:
            file_path = os.path.join(work_dir, filename or "upload.png")
            with open(file_path, "wb") as handle:
                handle.write(data)
            cmd = [vision_python, "/app/sheet_image_metadata.py", file_path, "--json"]
            if composer_hint:
                cmd.extend(["--composer-hint", composer_hint])
            timeout = float(os.getenv("SHEET_IMAGE_METADATA_TIMEOUT_SECONDS", "120"))
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
            if proc.returncode != 0:
                message = (proc.stderr or proc.stdout or "sheet metadata extraction failed").strip()[:500]
                raise RuntimeError(message)
            return json.loads(proc.stdout)

    return extract_sheet_metadata_bytes(data, filename, composer_hint=composer_hint)


def run_cli() -> int:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Extract title/composer metadata from sheet images")
    parser.add_argument("file_path")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--composer-hint", default="")
    args = parser.parse_args()
    with open(args.file_path, "rb") as handle:
        data = handle.read()
    try:
        result = extract_sheet_metadata_bytes(
            data,
            os.path.basename(args.file_path),
            composer_hint=str(args.composer_hint or "").strip(),
        )
    except Exception as exc:
        message = str(exc).strip()[:500] or "Sheet metadata extraction failed"
        print(message, file=sys.stderr)
        return 1
    print(json.dumps(result, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(run_cli())
