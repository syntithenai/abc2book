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
