#!/usr/bin/env python3
"""Enhanced OMR for EuroSession OMR+: upscale + per-staff homr stitch.

Falls back to full-crop post_omr when fewer than 2 staff systems are detected.
Runs homr inside abc2book-local-resolver (vision venv).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from omr_and_lookup import (
    abc_quality_warnings,
    extract_omr_abc,
    looks_weak_abc,
    post_omr,
)

# Keep in sync with local-resolver/sheet_image_enhanced_omr.py (2×8 bourrées).
MIN_SYSTEMS_FOR_PER_STAFF = 2
UPSCALE_HEIGHT_THRESHOLD = 1200
UPSCALE_STAFF_HEIGHT_THRESHOLD = 80
UPSCALE_FACTOR = 3

DOCKER_WORKER = r'''
import json, sys
sys.path.insert(0, "/app")
from sheet_image_enhanced_omr import extract_enhanced_melody

def main(image_path, title, min_systems, upscale_h, upscale_staff, factor):
    result = extract_enhanced_melody(
        image_path,
        title=title or "Tune",
        min_systems=int(min_systems),
        upscale_h=int(upscale_h),
        upscale_staff=int(upscale_staff),
        factor=int(factor),
    )
    if not result:
        print(json.dumps({"error": "homr_unavailable", "mode": "failed", "abc": ""}))
        return 1
    enh = result.get("enhancedOmr") or {}
    mode = str(result.get("mode") or enh.get("mode") or "unknown")
    out = {
        "mode": mode,
        "abc": str(result.get("abc") or ""),
        "upscaled": bool(result.get("upscaled") if result.get("upscaled") is not None else enh.get("upscaled")),
        "bandCount": result.get("bandCount", enh.get("bandCount")),
        "okSystems": result.get("okSystems", enh.get("okSystems")),
        "systems": result.get("systems") or enh.get("systems"),
        "meter": result.get("meter"),
        "key": result.get("key"),
        "error": result.get("error") or enh.get("reason"),
        "structureEvents": result.get("structureEvents") or enh.get("structureEvents") or [],
        "structureSource": result.get("structureSource") or enh.get("structureSource"),
        "structureKindCounts": result.get("structureKindCounts") or enh.get("structureKindCounts") or {},
    }
    # Signal host-side full-crop when per-staff produced nothing usable.
    if not out["abc"].strip() and mode.startswith("full-crop"):
        out["mode"] = "full-crop-fallback"
        out["reason"] = enh.get("reason") or "empty"
    print(json.dumps(out))
    return 0

if __name__ == "__main__":
    raise SystemExit(main(
        sys.argv[1],
        sys.argv[2] if len(sys.argv) > 2 else "Tune",
        int(sys.argv[3]) if len(sys.argv) > 3 else 3,
        int(sys.argv[4]) if len(sys.argv) > 4 else 1200,
        int(sys.argv[5]) if len(sys.argv) > 5 else 80,
        int(sys.argv[6]) if len(sys.argv) > 6 else 3,
    ))
'''


def _staging_dir() -> Path:
    staging = Path("/home/stever/projects/abc2book/.eurosession-tmp")
    staging.mkdir(parents=True, exist_ok=True)
    return staging


def _run_docker_worker(image_path: Path, title: str, timeout: float = 900.0) -> dict[str, Any]:
    container = os.environ.get("RESOLVER_DOCKER_CONTAINER", "abc2book-local-resolver")
    staging = _staging_dir()
    staged = staging / f"enh-{image_path.name}"
    shutil.copy2(image_path, staged)
    worker_host = staging / "enhanced_omr_worker.py"
    worker_host.write_text(DOCKER_WORKER, encoding="utf-8")

    container_img = f"/static/www/.eurosession-tmp/{staged.name}"
    container_worker = "/static/www/.eurosession-tmp/enhanced_omr_worker.py"
    # Also copy worker into /tmp in case static mount is ro for write but readable
    cmd = [
        "docker",
        "exec",
        "-e",
        "SHEET_IMAGE_PROGRESS=0",
        container,
        "bash",
        "-lc",
        (
            'PY="${VISION_VENV_PYTHON:-/opt/vision-venv/bin/python}"; '
            f'cp -f {container_worker!r} /tmp/enhanced_omr_worker.py 2>/dev/null || true; '
            f'W=/tmp/enhanced_omr_worker.py; test -f "$W" || W={container_worker!r}; '
            f'"$PY" "$W" {container_img!r} {title!r} '
            f"{MIN_SYSTEMS_FOR_PER_STAFF} {UPSCALE_HEIGHT_THRESHOLD} "
            f"{UPSCALE_STAFF_HEIGHT_THRESHOLD} {UPSCALE_FACTOR}"
        ),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except Exception as exc:
        return {"error": str(exc)[:300], "mode": "failed"}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    if proc.returncode != 0 and not out:
        return {"error": (err or "enhanced omr docker failed")[:400], "mode": "failed"}

    # Prefer last JSON object on stdout
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        start = out.find("{")
        end = out.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(out[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {
            "error": "enhanced_omr_json_parse_failed",
            "mode": "failed",
            "stderr": err[:300],
            "stdoutHead": out[:300],
        }


def _full_crop_omr(image_path: Path, resolver: str, title: str) -> dict[str, Any]:
    omr = post_omr(resolver, image_path)
    abc, status = extract_omr_abc(omr)
    return {
        "mode": "full-crop",
        "omrStatus": status,
        "abc": abc or "",
        "error": None if abc else status,
    }


def enhanced_omr(
    image_path: Path | str,
    *,
    title: str = "Tune",
    resolver: str = "http://127.0.0.1:8787",
    timeout: float = 900.0,
) -> dict[str, Any]:
    """Run enhanced OMR; return dict with abc, mode, warnings, meta."""
    path = Path(image_path)
    if not path.is_file():
        return {"abc": "", "mode": "failed", "error": "missing-image", "warnings": ["missing-image"]}

    result = _run_docker_worker(path, title, timeout=timeout)
    mode = str(result.get("mode") or "")
    abc = str(result.get("abc") or "").strip()

    # Worker asked for full-crop fallback, or failed to produce ABC.
    if mode in {"full-crop-fallback", "failed"} or not abc or looks_weak_abc(abc):
        fallback = _full_crop_omr(path, resolver, title)
        fb_abc = str(fallback.get("abc") or "").strip()
        # Prefer per-staff even if slightly weak when full-crop is also weak/shorter.
        if fb_abc and (not abc or looks_weak_abc(abc) or len(fb_abc) > len(abc) * 1.3):
            # If we had a non-empty per-staff that isn't mangled-worse, keep it when longer.
            if abc and not looks_weak_abc(abc) and len(abc) >= len(fb_abc):
                pass
            else:
                result = {
                    **result,
                    **fallback,
                    "mode": "full-crop" if mode == "full-crop-fallback" else f"full-crop-after-{mode or 'fail'}",
                    "abc": fb_abc,
                }
                abc = fb_abc

    abc = str(result.get("abc") or "").strip()
    warnings = abc_quality_warnings(abc)
    if looks_weak_abc(abc):
        warnings = list(dict.fromkeys(warnings + ["weak_abc"]))

    return {
        "abc": abc,
        "mode": str(result.get("mode") or "unknown"),
        "upscaled": bool(result.get("upscaled")),
        "bandCount": result.get("bandCount"),
        "okSystems": result.get("okSystems"),
        "systems": result.get("systems"),
        "meter": result.get("meter"),
        "key": result.get("key"),
        "warnings": warnings,
        "error": result.get("error"),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Enhanced per-staff OMR")
    parser.add_argument("image")
    parser.add_argument("--title", default="Tune")
    parser.add_argument("--resolver", default="http://127.0.0.1:8787")
    args = parser.parse_args()
    out = enhanced_omr(args.image, title=args.title, resolver=args.resolver)
    print(json.dumps({k: v for k, v in out.items() if k != "systems"}, indent=2))
    if out.get("abc"):
        print("--- ABC ---")
        print(out["abc"][:1500])
