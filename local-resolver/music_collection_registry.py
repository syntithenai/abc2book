"""Collection registry: preserved folders, curation phases, genre mapping."""

from __future__ import annotations

import json
import os
import re

_REGISTRY_CACHE = None


def _registry_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "music_collection_registry.json")


def load_music_collection_registry(force_reload=False):
    global _REGISTRY_CACHE
    if _REGISTRY_CACHE is not None and not force_reload:
        return _REGISTRY_CACHE
    path = _registry_path()
    if not os.path.isfile(path):
        _REGISTRY_CACHE = {
            "version": 1,
            "preserve": [],
            "phases": {},
            "libraryGenres": ["other"],
            "genreMap": {},
        }
        return _REGISTRY_CACHE
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    _REGISTRY_CACHE = data if isinstance(data, dict) else {}
    return _REGISTRY_CACHE


def _norm_path_prefix(value):
    return str(value or "").replace("\\", "/").strip("/").lower()


def path_under_prefix(rel_path, prefix):
    rel = _norm_path_prefix(rel_path)
    pre = _norm_path_prefix(prefix)
    if not pre:
        return False
    return rel == pre or rel.startswith(pre + "/")


def is_preserved_path(rel_path, registry=None):
    reg = registry or load_music_collection_registry()
    for item in reg.get("preserve") or []:
        if path_under_prefix(rel_path, item):
            return True
    return False


def match_phase(rel_path, registry=None):
    """Return phase id for a relative path, or empty string."""
    reg = registry or load_music_collection_registry()
    rel = _norm_path_prefix(rel_path)
    phases = reg.get("phases") or {}
    for phase_id, phase in phases.items():
        if phase_id == "remainder":
            continue
        for source in phase.get("sources") or []:
            if path_under_prefix(rel, source):
                return phase_id
    if "remainder" in phases:
        return "remainder"
    return ""


def resolve_collection_id(rel_path, registry=None):
    """Top-level chunk or preserve id for indexing."""
    rel = str(rel_path or "").replace("\\", "/").strip("/")
    if not rel:
        return ""
    reg = registry or load_music_collection_registry()
    for item in reg.get("preserve") or []:
        if path_under_prefix(rel, item):
            return _norm_path_prefix(item).split("/")[0]
    return rel.split("/")[0].lower()


def map_genre_to_library_folder(genre_text, registry=None):
    reg = registry or load_music_collection_registry()
    genre = str(genre_text or "").strip().lower()
    if not genre:
        return "other"
    genre_map = reg.get("genreMap") or {}
    for folder, keywords in genre_map.items():
        for keyword in keywords or []:
            if keyword and keyword.lower() in genre:
                return folder
    allowed = reg.get("libraryGenres") or []
    if genre in allowed:
        return genre
    return "other"


def sanitize_path_component(text, fallback="Unknown"):
    value = str(text or "").strip()
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", value)
    value = re.sub(r"\s+", " ", value).strip(" .")
    if not value:
        value = fallback
    if len(value) > 180:
        value = value[:180].rstrip()
    return value


def library_target_path(entry, registry=None):
    """library/{genre}/{Artist}/{Title}.ext"""
    reg = registry or load_music_collection_registry()
    title = sanitize_path_component(entry.get("title"), "Track")
    artist = sanitize_path_component(entry.get("artist"), "Unknown Artist")
    genre_folder = map_genre_to_library_folder(entry.get("genre"), reg)
    ext = str(entry.get("ext") or ".mp3").lower()
    if not ext.startswith("."):
        ext = "." + ext
    return f"library/{genre_folder}/{artist}/{title}{ext}"
