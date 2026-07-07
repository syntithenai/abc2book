"""Feature flags for sheet image transcription."""

from __future__ import annotations

import os
import subprocess
import sys

from sheet_image_ocr import paddleocr_available
from sheet_image_omr import homr_available
from sheet_image_staff_detect import vision_stack_available


def sheet_image_enabled() -> bool:
    return os.getenv("SHEET_IMAGE_ENABLED", "true").strip().lower() not in {"0", "false", "no"}


def sheet_image_available() -> bool:
    if not sheet_image_enabled():
        return False
    if not vision_stack_available():
        return False
    return paddleocr_available() or homr_available()


def sheet_image_features() -> dict[str, bool]:
    return {
        "enabled": sheet_image_enabled(),
        "ocr": paddleocr_available(),
        "omr": homr_available(),
        "visionStack": vision_stack_available(),
        "available": sheet_image_available(),
    }


def vision_python_path() -> str:
    return os.getenv("VISION_VENV_PYTHON", sys.executable)
