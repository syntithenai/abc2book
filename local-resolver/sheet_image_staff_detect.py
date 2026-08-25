"""Detect staff notation regions in sheet images."""

from __future__ import annotations

import os
from typing import Any

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover - optional in minimal test envs
    cv2 = None


def _load_grayscale(image_path: str) -> np.ndarray:
    if cv2 is None:
        raise RuntimeError("opencv-python-headless is required for staff detection")
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")
    return image


def _detect_staff_bands(gray: np.ndarray) -> list[dict[str, float]]:
    if cv2 is None:
        return []
    height, width = gray.shape[:2]
    if width < 40 or height < 40:
        return []

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    horizontal_size = max(20, width // 20)
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (horizontal_size, 1))
    staff_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)

    projection = np.sum(staff_lines > 0, axis=1)
    threshold = max(8.0, float(width) * 0.12)
    active_rows = np.where(projection >= threshold)[0]
    if active_rows.size == 0:
        return []

    groups: list[list[int]] = []
    current = [int(active_rows[0])]
    for row in active_rows[1:]:
        if int(row) - current[-1] <= 6:
            current.append(int(row))
        else:
            groups.append(current)
            current = [int(row)]
    groups.append(current)

    bands: list[dict[str, float]] = []
    for group in groups:
        if len(group) < 2:
            continue
        top = max(0, group[0] - 8)
        bottom = min(height - 1, group[-1] + 24)
        band_height = bottom - top
        if band_height < 12:
            continue
        bands.append(
            {
                "top": float(top),
                "bottom": float(bottom),
                "left": 0.0,
                "right": float(width - 1),
                "lineCount": float(len(group)),
                "confidence": min(1.0, len(group) / 5.0),
            }
        )
    return bands


def detect_staff_regions(image_path: str) -> dict[str, Any]:
    gray = _load_grayscale(image_path)
    bands = _detect_staff_bands(gray)
    has_staff = len(bands) > 0
    confidence = 0.0
    if bands:
        confidence = min(1.0, sum(band["confidence"] for band in bands) / len(bands))
    return {
        "hasStaff": has_staff,
        "staffRegionCount": len(bands),
        "staffRegions": bands,
        "confidence": confidence,
    }


def staff_union_crop_box(
    staff_info: dict[str, Any],
    image_width: int,
    image_height: int,
    pad_top: int = 12,
    pad_bottom: int = 16,
) -> tuple[int, int, int, int] | None:
    """Union of staff bands with padding; drops title/chord space above first staff."""
    bands = list((staff_info or {}).get("staffRegions") or [])
    if not bands or image_width <= 0 or image_height <= 0:
        return None
    top = min(float(band.get("top") or 0) for band in bands)
    bottom = max(float(band.get("bottom") or 0) for band in bands)
    top_i = max(0, int(top) - pad_top)
    bottom_i = min(image_height, int(bottom) + pad_bottom)
    if bottom_i - top_i < 24:
        return None
    return 0, top_i, image_width, bottom_i


def write_staff_crop(
    image_path: str,
    work_dir: str,
    staff_info: dict[str, Any] | None = None,
    out_name: str = "staff-crop.png",
) -> str | None:
    """Write a staff-only crop for OMR. Returns path or None if no staff crop."""
    if cv2 is None:
        return None
    info = staff_info if staff_info is not None else detect_staff_regions(image_path)
    image = cv2.imread(image_path)
    if image is None:
        return None
    height, width = image.shape[:2]
    box = staff_union_crop_box(info, width, height)
    if box is None:
        return None
    left, top, right, bottom = box
    cropped = image[top:bottom, left:right]
    if cropped.size == 0:
        return None
    out_path = os.path.join(work_dir, out_name)
    cv2.imwrite(out_path, cropped)
    return out_path


def classify_page_type(has_staff: bool, chord_lines: list[str]) -> str:
    has_chords_or_lyrics = any(str(line or "").strip() for line in chord_lines or [])
    if has_staff and has_chords_or_lyrics:
        return "mixed"
    if has_staff:
        return "notation_only"
    if has_chords_or_lyrics:
        return "chord_chart"
    return "unknown"


def vision_stack_available() -> bool:
    return cv2 is not None and os.getenv("SHEET_IMAGE_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
