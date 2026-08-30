"""Admin review-projects root: Milliner–Koken + oldtimefiddletunes working files.

Host default: ~/Documents/oldtime sources review
Container: REVIEW_PROJECTS_DIR=/review-projects (bind-mounted from host)
"""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any


DEFAULT_HOST_ROOT = str(
    Path.home() / "Documents" / "oldtime sources review"
)

# Known project manifests relative to the review root.
KNOWN_PROJECTS = (
    {
        "id": "milliner-koken",
        "label": "Milliner–Koken",
        "kind": "book-import",
        "packagePath": "milliner-koken/milliner-koken-full/merged/milliner-koken-import.json",
        "cropsDir": "milliner-koken/milliner-koken-full/merged/tunes",
        "abcPath": "milliner-koken/milliner-koken-full/merged/milliner-koken.abc",
    },
    {
        "id": "oldtimefiddletunes",
        "label": "Old Time Fiddle Tunes",
        "kind": "oldtime-enrich",
        "proofPackagePath": "oldtimefiddletunes/public-packages/enrich_package_proof.json",
        "fullPackagePath": "oldtimefiddletunes/public-packages/enrich_package.json",
        "dataPackagePath": "oldtimefiddletunes/data/enrich_package.json",
    },
)


def review_projects_root() -> str:
    raw = (os.getenv("REVIEW_PROJECTS_DIR") or "").strip()
    if raw:
        return os.path.abspath(raw)
    # Prefer container mount path when present.
    if os.path.isdir("/review-projects"):
        return "/review-projects"
    return os.path.abspath(DEFAULT_HOST_ROOT)


def review_projects_enabled() -> bool:
    root = review_projects_root()
    return bool(root and os.path.isdir(root))


def review_projects_health_fields() -> dict[str, Any]:
    root = review_projects_root()
    enabled = review_projects_enabled()
    projects = list_review_projects() if enabled else []
    return {
        "reviewProjects": enabled and len(projects) > 0,
        "reviewProjectsDir": root if enabled else None,
        "reviewProjectsCount": len(projects),
    }


def _safe_join(root: str, relative: str) -> str:
    rel = str(relative or "").replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise ValueError("Invalid review-projects path")
    abs_root = os.path.realpath(root)
    abs_path = os.path.realpath(os.path.join(abs_root, rel))
    if abs_path != abs_root and not abs_path.startswith(abs_root + os.sep):
        raise ValueError("Path escapes review-projects root")
    return abs_path


def resolve_review_projects_file(relative: str) -> str:
    if not review_projects_enabled():
        raise FileNotFoundError("Review projects root is not available")
    abs_path = _safe_join(review_projects_root(), relative)
    if not os.path.isfile(abs_path):
        raise FileNotFoundError("Review projects file not found")
    return abs_path


def guess_review_projects_mime(path: str) -> str:
    mime, _ = mimetypes.guess_type(path)
    if mime:
        return mime
    lower = path.lower()
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith(".abc"):
        return "text/plain"
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith(".mid") or lower.endswith(".midi"):
        return "audio/midi"
    return "application/octet-stream"


def list_review_projects() -> list[dict[str, Any]]:
    if not review_projects_enabled():
        return []
    root = review_projects_root()
    out: list[dict[str, Any]] = []
    for spec in KNOWN_PROJECTS:
        entry = dict(spec)
        available = False
        if spec["kind"] == "book-import":
            pkg = os.path.join(root, spec["packagePath"])
            available = os.path.isfile(pkg)
        elif spec["kind"] == "oldtime-enrich":
            available = any(
                os.path.isfile(os.path.join(root, spec[key]))
                for key in ("proofPackagePath", "fullPackagePath", "dataPackagePath")
                if key in spec
            )
        if not available:
            continue
        entry["available"] = True
        out.append(entry)
    return out


def review_projects_catalog() -> dict[str, Any]:
    projects = list_review_projects()
    return {
        "ok": True,
        "available": bool(projects),
        "root": review_projects_root() if review_projects_enabled() else None,
        "projects": projects,
    }
