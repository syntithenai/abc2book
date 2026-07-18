"""PaddleOCR wrapper for chord-sheet text extraction."""

from __future__ import annotations

import os
import subprocess
import threading
from typing import Any

# Must be set before PaddleOCR / PaddleX import so prefetched models are found offline.
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", os.getenv("VISION_CACHE_ROOT", "/opt/vision-cache"))
# PaddlePaddle 3.3+ oneDNN/PIR path crashes on PP-OCRv5 CPU inference; PaddleX honors this kwarg.
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

_paddle_ocr = None
_paddle_init_error: str | None = None
# Import probe can take tens of seconds; never run it on the asyncio thread from
# /health (SPA timeout is ~6s). Cache forever once known; probe in a daemon thread.
_paddleocr_cached: bool | None = None
_paddleocr_probe_lock = threading.Lock()
_paddleocr_probe_started = False


def _paddleocr_importable_in(python_path: str) -> bool:
    global _paddle_init_error
    try:
        proc = subprocess.run(
            [python_path, "-c", "import paddleocr"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except Exception as exc:
        _paddle_init_error = str(exc)
        return False
    if proc.returncode == 0:
        return True
    _paddle_init_error = (proc.stderr or proc.stdout or "paddleocr import failed").strip()[:200]
    return False


def _run_paddleocr_probe() -> bool:
    global _paddleocr_cached, _paddle_init_error
    try:
        import paddleocr  # noqa: F401
    except ImportError:
        pass
    else:
        _paddleocr_cached = True
        return True

    vision_python = os.getenv("VISION_VENV_PYTHON", "").strip()
    if vision_python and os.path.isfile(vision_python):
        result = _paddleocr_importable_in(vision_python)
        _paddleocr_cached = result
        return result

    _paddle_init_error = "paddleocr is not installed"
    _paddleocr_cached = False
    return False


def _ensure_paddleocr_probe_started() -> None:
    global _paddleocr_probe_started
    if _paddleocr_cached is not None or _paddleocr_probe_started:
        return
    with _paddleocr_probe_lock:
        if _paddleocr_cached is not None or _paddleocr_probe_started:
            return
        _paddleocr_probe_started = True
        threading.Thread(target=_run_paddleocr_probe, name="paddleocr-probe", daemon=True).start()


def paddleocr_available() -> bool:
    """Return OCR availability without blocking the event loop.

    Until the background import probe finishes, returns False so /health stays
    fast. Callers that need a definitive answer after warmup can re-check once
    the cache is populated.
    """
    if os.getenv("SHEET_IMAGE_OCR_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return False
    if _paddleocr_cached is not None:
        return _paddleocr_cached
    _ensure_paddleocr_probe_started()
    return False


def warmup_paddleocr_probe() -> None:
    """Kick the background import probe (e.g. on server startup)."""
    if os.getenv("SHEET_IMAGE_OCR_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return
    _ensure_paddleocr_probe_started()


def _resolve_device() -> str:
    use_gpu = os.getenv("SHEET_IMAGE_OCR_USE_GPU", "auto").strip().lower()
    if use_gpu == "force":
        return "gpu"
    if use_gpu == "cpu":
        return "cpu"
    try:
        import paddle

        return "gpu" if paddle.device.is_compiled_with_cuda() else "cpu"
    except Exception:
        return "cpu"


def _paddle_ocr_kwargs() -> dict[str, Any]:
    return {
        "lang": os.getenv("SHEET_IMAGE_OCR_LANG", "en"),
        "device": _resolve_device(),
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
        "enable_mkldnn": False,
    }


def _get_paddle_ocr():
    global _paddle_ocr, _paddle_init_error
    if _paddle_ocr is not None:
        return _paddle_ocr
    if not paddleocr_available():
        raise RuntimeError(_paddle_init_error or "PaddleOCR is not available")
    from paddleocr import PaddleOCR

    _paddle_ocr = PaddleOCR(**_paddle_ocr_kwargs())
    return _paddle_ocr


def _box_from_poly(points) -> dict[str, float]:
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    left = min(xs)
    right = max(xs)
    top = min(ys)
    bottom = max(ys)
    return {
        "x": left,
        "y": top,
        "width": max(1.0, right - left),
        "height": max(1.0, bottom - top),
    }


def _box_from_rect(rect) -> dict[str, float]:
    x1, y1, x2, y2 = [float(value) for value in rect[:4]]
    return {
        "x": min(x1, x2),
        "y": min(y1, y2),
        "width": max(1.0, abs(x2 - x1)),
        "height": max(1.0, abs(y2 - y1)),
    }


def _result_payload(page_result) -> dict[str, Any]:
    if hasattr(page_result, "json"):
        payload = page_result.json
        if callable(payload):
            payload = payload()
        if isinstance(payload, dict):
            return payload.get("res", payload)
    if isinstance(page_result, dict):
        return page_result.get("res", page_result)
    return {}


def _parse_predict_result(result) -> list[dict[str, Any]]:
    boxes: list[dict[str, Any]] = []
    for page_result in result or []:
        res = _result_payload(page_result)
        texts = list(res.get("rec_texts") or [])
        scores = list(res.get("rec_scores") or [])
        polys = res.get("rec_polys")
        rects = res.get("rec_boxes")
        for index, text in enumerate(texts):
            cleaned = str(text or "").strip()
            if not cleaned:
                continue
            confidence = float(scores[index]) if index < len(scores) else 0.0
            metrics = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
            if polys is not None and index < len(polys):
                metrics = _box_from_poly(polys[index])
            elif rects is not None and index < len(rects):
                metrics = _box_from_rect(rects[index])
            boxes.append({"text": cleaned, "confidence": confidence, **metrics})
    return boxes


def extract_ocr_boxes(image_path: str) -> list[dict[str, Any]]:
    ocr = _get_paddle_ocr()
    result = ocr.predict(image_path)
    return _parse_predict_result(result)
