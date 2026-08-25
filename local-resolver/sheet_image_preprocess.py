"""Deskew and mild page-flatten preprocessing for sheet images."""

from __future__ import annotations

import os
from typing import Any

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None  # type: ignore


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name, "true" if default else "false").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def estimate_skew_angle_hough(gray: np.ndarray) -> float | None:
    """Estimate skew from long near-horizontal staff/text lines (degrees, CCW)."""
    if cv2 is None:
        return None
    height, width = gray.shape[:2]
    if width < 40 or height < 40:
        return None

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)
    min_len = max(40, width // 6)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180.0,
        threshold=max(40, width // 40),
        minLineLength=min_len,
        maxLineGap=20,
    )
    if lines is None or len(lines) == 0:
        return None

    # OpenCV 4: (N,1,4); OpenCV 5: (N,4)
    line_list = lines[:, 0] if lines.ndim == 3 else lines

    angles: list[float] = []
    for line in line_list:
        x1, y1, x2, y2 = (float(v) for v in line[:4])
        dx = x2 - x1
        dy = y2 - y1
        if abs(dx) < 1e-3:
            continue
        angle = float(np.degrees(np.arctan2(dy, dx)))
        # Keep near-horizontal lines only.
        if abs(angle) > 15 and abs(abs(angle) - 180) > 15:
            continue
        if angle > 90:
            angle -= 180
        elif angle < -90:
            angle += 180
        if abs(angle) <= 15:
            angles.append(angle)

    if len(angles) < 5:
        return None
    return float(np.median(angles))


def estimate_skew_angle_min_area(gray: np.ndarray) -> float:
    """Fallback skew via minAreaRect on horizontal ink mask."""
    if cv2 is None:
        return 0.0
    height, width = gray.shape[:2]
    if width < 40 or height < 40:
        return 0.0

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    horizontal_size = max(20, width // 25)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (horizontal_size, 1))
    mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=1)

    coords = np.column_stack(np.where(mask > 0))
    if coords.shape[0] < 80:
        coords = np.column_stack(np.where(binary > 0))
    if coords.shape[0] < 80:
        return 0.0

    rect = cv2.minAreaRect(coords.astype(np.float32))
    angle = float(rect[-1])
    if angle < -45:
        angle = 90.0 + angle
    if abs(angle) > 15:
        return 0.0
    return angle


def estimate_skew_angle(gray: np.ndarray) -> float:
    """Return skew angle in degrees (positive = counterclockwise)."""
    hough = estimate_skew_angle_hough(gray)
    if hough is not None:
        return hough
    return estimate_skew_angle_min_area(gray)


def rotate_expand_bgr(image_bgr: np.ndarray, angle: float) -> np.ndarray:
    """Rotate about center and expand canvas so no content is clipped."""
    if cv2 is None or abs(angle) < 0.15:
        return image_bgr
    height, width = image_bgr.shape[:2]
    center = (width / 2.0, height / 2.0)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    cos = abs(float(matrix[0, 0]))
    sin = abs(float(matrix[0, 1]))
    new_w = int(height * sin + width * cos)
    new_h = int(height * cos + width * sin)
    matrix[0, 2] += (new_w / 2.0) - center[0]
    matrix[1, 2] += (new_h / 2.0) - center[1]
    return cv2.warpAffine(
        image_bgr,
        matrix,
        (new_w, new_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )


def deskew_bgr(image_bgr: np.ndarray) -> tuple[np.ndarray, float]:
    if cv2 is None:
        return image_bgr, 0.0
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    angle = estimate_skew_angle(gray)
    if abs(angle) < 0.15:
        return image_bgr, 0.0
    return rotate_expand_bgr(image_bgr, angle), angle


def _order_quad_points(pts: np.ndarray) -> np.ndarray:
    """Order four points as top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def detect_page_quad(gray: np.ndarray) -> np.ndarray | None:
    """Return ordered page corners if a plausible document quad is found."""
    if cv2 is None:
        return None
    height, width = gray.shape[:2]
    scale = 800.0 / float(max(height, width))
    if scale < 1.0:
        small = cv2.resize(gray, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    else:
        small = gray
        scale = 1.0

    blurred = cv2.GaussianBlur(small, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    page_area = float(small.shape[0] * small.shape[1])
    best = None
    best_area = 0.0
    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        area = float(cv2.contourArea(approx))
        if area < page_area * 0.35 or area > page_area * 0.98:
            continue
        if area > best_area:
            best_area = area
            best = approx.reshape(4, 2).astype(np.float32)

    if best is None:
        return None
    ordered = _order_quad_points(best)
    return ordered / scale


def flatten_page_bgr(image_bgr: np.ndarray) -> tuple[np.ndarray, bool]:
    """Mild perspective flatten when a page quad is detectable."""
    if cv2 is None or not _env_flag("SHEET_IMAGE_FLATTEN", True):
        return image_bgr, False
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    quad = detect_page_quad(gray)
    if quad is None:
        return image_bgr, False

    (tl, tr, br, bl) = quad
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_w = int(max(width_a, width_b))
    max_h = int(max(height_a, height_b))
    if max_w < 80 or max_h < 80:
        return image_bgr, False

    src_h, src_w = image_bgr.shape[:2]
    area_ratio = (max_w * max_h) / float(max(1, src_w * src_h))
    if area_ratio < 0.5 or area_ratio > 1.05:
        return image_bgr, False

    dst = np.array(
        [[0, 0], [max_w - 1, 0], [max_w - 1, max_h - 1], [0, max_h - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(quad, dst)
    warped = cv2.warpPerspective(image_bgr, matrix, (max_w, max_h), flags=cv2.INTER_LINEAR)
    return warped, True


def preprocess_sheet_image(
    source_path: str,
    work_dir: str,
    out_name: str = "preprocessed.png",
) -> dict[str, Any]:
    """Deskew/flatten then resize to SHEET_IMAGE_MAX_EDGE. Returns path + meta."""
    meta: dict[str, Any] = {
        "path": source_path,
        "deskewAngle": 0.0,
        "flattened": False,
        "deskewEnabled": _env_flag("SHEET_IMAGE_DESKEW", True),
    }
    out_path = os.path.join(work_dir, out_name)

    if Image is None:
        return meta

    with Image.open(source_path) as image:
        rgb = image.convert("RGB")

    if cv2 is not None and meta["deskewEnabled"]:
        bgr = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
        bgr, flattened = flatten_page_bgr(bgr)
        meta["flattened"] = flattened
        bgr, angle = deskew_bgr(bgr)
        meta["deskewAngle"] = round(float(angle), 3)
        rgb = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

    max_edge = int(os.getenv("SHEET_IMAGE_MAX_EDGE", "2400"))
    width, height = rgb.size
    longest = max(width, height)
    if longest > max_edge:
        scale = max_edge / float(longest)
        rgb = rgb.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)

    rgb.save(out_path, format="PNG")
    meta["path"] = out_path
    return meta
