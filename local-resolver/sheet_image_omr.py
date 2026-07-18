"""homr-based optical music recognition wrapper."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import threading
from typing import Any

# Same constraint as paddleocr: import/--help probes must not run on the
# asyncio thread from /health.
_homr_cached: bool | None = None
_homr_probe_lock = threading.Lock()
_homr_probe_started = False


def _run_homr_probe() -> bool:
    global _homr_cached
    python_path = os.getenv("VISION_VENV_PYTHON", sys.executable)
    homr_bin = os.getenv("HOMR_BIN", "")
    candidates = [homr_bin] if homr_bin else []
    candidates.extend(["homr", python_path])
    for candidate in candidates:
        if not candidate:
            continue
        try:
            if candidate == python_path:
                proc = subprocess.run(
                    [python_path, "-c", "import homr"],
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
                )
            else:
                proc = subprocess.run(
                    [candidate, "--help"],
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
                )
            if proc.returncode == 0:
                _homr_cached = True
                return True
        except Exception:
            continue
    _homr_cached = False
    return False


def _ensure_homr_probe_started() -> None:
    global _homr_probe_started
    if _homr_cached is not None or _homr_probe_started:
        return
    with _homr_probe_lock:
        if _homr_cached is not None or _homr_probe_started:
            return
        _homr_probe_started = True
        threading.Thread(target=_run_homr_probe, name="homr-probe", daemon=True).start()


def homr_available() -> bool:
    """Return OMR availability without blocking; probes in a background thread."""
    if os.getenv("SHEET_IMAGE_OMR_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return False
    if _homr_cached is not None:
        return _homr_cached
    _ensure_homr_probe_started()
    return False


def warmup_homr_probe() -> None:
    """Kick the background import probe (e.g. on server startup)."""
    if os.getenv("SHEET_IMAGE_OMR_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return
    _ensure_homr_probe_started()


def _homr_command(image_path: str) -> list[str]:
    homr_bin = os.getenv("HOMR_BIN", "").strip()
    if homr_bin:
        return [homr_bin, image_path]
    python_path = os.getenv("VISION_VENV_PYTHON", sys.executable)
    return [python_path, "-m", "homr.main", image_path]


def transcribe_image_to_musicxml(image_path: str) -> str:
    if not os.path.isfile(image_path):
        raise ValueError(f"Image not found: {image_path}")

    with tempfile.TemporaryDirectory(prefix="homr-") as tmp_dir:
        work_image = os.path.join(tmp_dir, "sheet.png")
        shutil.copyfile(image_path, work_image)
        proc = subprocess.run(
            _homr_command(work_image),
            capture_output=True,
            text=True,
            timeout=float(os.getenv("SHEET_IMAGE_OMR_TIMEOUT_SECONDS", "600")),
            check=False,
            cwd=tmp_dir,
        )
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "homr failed").strip()
            raise RuntimeError(detail[:500])

        musicxml_path = os.path.join(tmp_dir, "sheet.musicxml")
        if not os.path.isfile(musicxml_path):
            raise RuntimeError("homr did not produce MusicXML output")

        with open(musicxml_path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read()


def omr_metadata() -> dict[str, Any]:
    return {
        "available": homr_available(),
        "backend": "homr",
    }
