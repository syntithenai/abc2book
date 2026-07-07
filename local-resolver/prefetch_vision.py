"""Predownload homr and PaddleOCR model weights during image build."""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
import tempfile
from pathlib import Path

VISION_CACHE_ROOT = os.getenv("VISION_CACHE_ROOT", "/opt/vision-cache")
PADDLE_CACHE_HOME = os.getenv("PADDLE_PDX_CACHE_HOME", VISION_CACHE_ROOT)


def _configure_cache_env() -> None:
    os.environ["PADDLE_PDX_CACHE_HOME"] = PADDLE_CACHE_HOME
    os.environ.setdefault("HOME", "/root")
    os.environ.setdefault("FLAGS_enable_pir_api", "0")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


def _prefetch_homr() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "homr.main", "--init"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "homr --init failed").strip()
        raise RuntimeError(detail[:500])
    print("homr: ONNX and RapidOCR weights prefetched")


def _tiny_test_image() -> str:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (320, 120), "white")
    draw = ImageDraw.Draw(image)
    draw.text((20, 20), "Verse", fill="black")
    draw.text((20, 50), "C G Am", fill="black")
    draw.text((20, 80), "Hello world", fill="black")
    handle = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    path = handle.name
    handle.close()
    image.save(path, format="PNG")
    return path


def _prefetch_paddleocr() -> None:
    from paddleocr import PaddleOCR

    from sheet_image_ocr import _paddle_ocr_kwargs, _parse_predict_result

    capture = io.StringIO()
    with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
        ocr = PaddleOCR(**_paddle_ocr_kwargs())
        image_path = _tiny_test_image()
        try:
            result = ocr.predict(image_path)
            _parse_predict_result(result)
        finally:
            try:
                os.remove(image_path)
            except OSError:
                pass
    print(f"paddleocr: models prefetched (device={_paddle_ocr_kwargs()['device']}, cache={PADDLE_CACHE_HOME})")


def _verify_homr_models() -> None:
    from homr.segmentation.config import segnet_path_onnx
    from homr.transformer.configs import default_config

    required = [
        segnet_path_onnx,
        default_config.filepaths.encoder_path,
        default_config.filepaths.decoder_path,
    ]
    missing = [path for path in required if not os.path.isfile(path)]
    if missing:
        raise RuntimeError("homr models missing after prefetch: " + ", ".join(missing))


def _verify_paddle_models() -> None:
    official_models = Path(PADDLE_CACHE_HOME) / "official_models"
    if not official_models.is_dir():
        raise RuntimeError(f"paddleocr cache missing: {official_models}")
    model_dirs = [path for path in official_models.iterdir() if path.is_dir()]
    if not model_dirs:
        raise RuntimeError(f"paddleocr cache is empty: {official_models}")
    print(f"vision: found {len(model_dirs)} paddle model directories in {official_models}")


def main() -> None:
    _configure_cache_env()
    _prefetch_homr()
    _verify_homr_models()
    _prefetch_paddleocr()
    _verify_paddle_models()
    print("vision: prefetch complete")


if __name__ == "__main__":
    main()
