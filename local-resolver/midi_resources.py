"""Local MIDI resource library: index search and file serving."""

from __future__ import annotations

import json
import os
import re
import threading
from urllib.parse import quote

from chords_fetch import score_title_artist_match

MIDI_RESOURCES_INDEX_NAME = os.getenv("MIDI_RESOURCES_INDEX_NAME", "midi_resources_index.json").strip()
MIDI_RESOURCES_PUBLIC_BASE = os.getenv("MIDI_RESOURCES_PUBLIC_BASE", "/midi-resources").strip().rstrip("/")

MAX_LOCAL_MIDI_SEARCH_RESULTS = 40
MAX_LOCAL_MIDI_CANDIDATES = 5
MAX_MIDI_FILE_BYTES = int(os.getenv("MAX_MIDI_IMPORT_BYTES", str(8 * 1024 * 1024)))

_COMMON_WORDS = frozenset({
    "a", "also", "am", "an", "and", "any", "are", "as", "at", "be", "became", "become",
    "but", "by", "can", "could", "did", "do", "does", "each", "either", "else", "for",
    "had", "has", "have", "how", "i", "if", "in", "is", "it", "its", "me", "must", "my",
    "nor", "not", "of", "oh", "ok", "the", "who", "whom", "will", "with", "within",
    "without", "would", "yes", "yet", "you", "your",
})

_INDEX_LOCK = threading.Lock()
_INDEX_CACHE = None
_INDEX_MTIME = None


def midi_resources_root():
    return os.path.abspath(os.getenv("MIDI_RESOURCES_DIR", "/midi-resources").strip() or "/midi-resources")


def midi_resources_index_path():
    return os.path.join(midi_resources_root(), MIDI_RESOURCES_INDEX_NAME)


def midi_resources_enabled():
    root = midi_resources_root()
    index_path = midi_resources_index_path()
    return os.path.isdir(root) and os.path.isfile(index_path)


def midi_resources_health_fields():
    root = midi_resources_root()
    index_path = midi_resources_index_path()
    enabled = midi_resources_enabled()
    entry_count = 0
    if enabled:
        try:
            index = load_midi_resources_index()
            entry_count = len((index or {}).get("entries") or {})
        except Exception:
            entry_count = 0
    return {
        "midiResources": enabled,
        "midiResourcesDir": root if os.path.isdir(root) else None,
        "midiResourcesIndex": index_path if os.path.isfile(index_path) else None,
        "midiResourcesCount": entry_count,
    }


def _strip_common_words(text):
    parts = []
    for word in re.sub(r"[^a-z0-9 ]+", " ", str(text or "").lower()).split():
        if word and word not in _COMMON_WORDS:
            parts.append(word)
    return " ".join(parts)


def tokenize_midi_search_query(text):
    clean = _strip_common_words(text)
    return [part for part in clean.split() if len(part) >= 3]


def title_from_midi_relative_path(relative_path):
    rel = str(relative_path or "").replace("\\", "/").strip("/")
    if not rel:
        return "MIDI"
    parts = rel.split("/")
    filename = parts[-1]
    name = re.sub(r"\.(mid|midi)$", "", filename, flags=re.I)
    name = re.sub(r"[_\-+]+", " ", name).strip()
    if len(parts) > 1:
        parent = re.sub(r"[_\-+]+", " ", parts[-2]).strip()
        skip_parents = {"midi", "mid", "files", "patterns", "various"}
        if parent and parent.lower() not in skip_parents:
            return parent + " — " + name if name else parent
    return name or "MIDI"


def _tokenize_index_text(text):
    tokens = set()
    for word in re.sub(r"[^a-z0-9 ]+", " ", str(text or "").lower()).split():
        if len(word) >= 3 and word not in _COMMON_WORDS:
            tokens.add(word)
    return tokens


def build_midi_resource_public_url(relative_path):
    rel = str(relative_path or "").replace("\\", "/").lstrip("/")
    segments = [quote(part) for part in rel.split("/") if part]
    return MIDI_RESOURCES_PUBLIC_BASE + "/" + "/".join(segments)


def resolve_midi_resource_file(relative_path):
    root = midi_resources_root()
    rel = str(relative_path or "").replace("\\", "/").lstrip("/")
    if not rel or rel.startswith("..") or "/../" in ("/" + rel + "/"):
        raise ValueError("Invalid MIDI path")
    abs_path = os.path.abspath(os.path.join(root, rel))
    if not abs_path.startswith(root + os.sep) and abs_path != root:
        raise ValueError("Invalid MIDI path")
    if not os.path.isfile(abs_path):
        raise FileNotFoundError("MIDI file not found")
    lower = abs_path.lower()
    if not (lower.endswith(".mid") or lower.endswith(".midi")):
        raise ValueError("Not a MIDI file")
    return abs_path


def read_midi_resource_bytes(relative_path, max_bytes=MAX_MIDI_FILE_BYTES):
    abs_path = resolve_midi_resource_file(relative_path)
    size = os.path.getsize(abs_path)
    if size > max_bytes:
        raise ValueError("MIDI file is too large")
    with open(abs_path, "rb") as handle:
        data = handle.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("MIDI file is too large")
    return data


def load_midi_resources_index(force_reload=False):
    global _INDEX_CACHE, _INDEX_MTIME
    index_path = midi_resources_index_path()
    if not os.path.isfile(index_path):
        return None
    mtime = os.path.getmtime(index_path)
    with _INDEX_LOCK:
        if not force_reload and _INDEX_CACHE is not None and _INDEX_MTIME == mtime:
            return _INDEX_CACHE
        with open(index_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            data = {}
        _INDEX_CACHE = data
        _INDEX_MTIME = mtime
        return _INDEX_CACHE


def search_midi_resources(title, artist="", limit=MAX_LOCAL_MIDI_SEARCH_RESULTS):
    index = load_midi_resources_index()
    if not index:
        return []

    entries = index.get("entries") or {}
    tokens = index.get("tokens") or {}
    if not entries:
        return []

    query_parts = []
    for variant in _title_query_variants(title):
        query_parts.extend(tokenize_midi_search_query(variant))
    query_parts.extend(tokenize_midi_search_query(artist))
    query_parts = list(dict.fromkeys(query_parts))
    if not query_parts:
        return []

    matches = {}
    for part in query_parts:
        for entry_id in tokens.get(part) or []:
            if entry_id not in matches:
                matches[entry_id] = 0
            matches[entry_id] += 1

    query_token_count = len(query_parts)
    scored = []
    for entry_id, token_hits in matches.items():
        entry = entries.get(entry_id)
        if not isinstance(entry, dict):
            continue
        entry_title = str(entry.get("title") or "").strip()
        entry_path = str(entry.get("path") or "").strip()
        if not entry_path:
            continue
        text_score = score_title_artist_match(entry_title, "", title, artist)
        coverage = token_hits / max(query_token_count, 1)
        match_score = int((token_hits * 28) + (coverage * 42) + text_score)
        if query_token_count > 1 and token_hits < query_token_count:
            match_score -= int((query_token_count - token_hits) * 8)
        if match_score < 20:
            continue
        scored.append({
            "id": entry_id,
            "title": entry_title or title_from_midi_relative_path(entry_path),
            "path": entry_path,
            "category": str(entry.get("category") or "").strip(),
            "matchScore": match_score,
            "tokenHits": token_hits,
        })

    scored.sort(
        key=lambda item: (
            item.get("tokenHits") or 0,
            item.get("matchScore") or 0,
            item.get("title") or "",
        ),
        reverse=True,
    )
    return scored[: max(1, int(limit or MAX_LOCAL_MIDI_SEARCH_RESULTS))]


def _title_query_variants(title):
    text = str(title or "").strip()
    if not text:
        return []
    ordered = [text]
    seen = {text.lower()}

    def add(candidate):
        candidate = str(candidate or "").strip()
        if not candidate:
            return
        key = candidate.lower()
        if key in seen:
            return
        seen.add(key)
        ordered.append(candidate)

    lower = text.lower()
    swaps = (("clare", "clair"), ("clair", "clare"), ("claire", "clair"), ("clair", "claire"))
    for left, right in swaps:
        if re.search(r"\b" + re.escape(left) + r"\b", lower):
            pattern = re.compile(r"\b" + re.escape(left) + r"\b", re.I)

            def repl(match, replacement=right):
                word = match.group(0)
                if word.isupper():
                    return replacement.upper()
                if word[0].isupper():
                    return replacement.capitalize()
                return replacement

            add(pattern.sub(repl, text))
    return ordered


def annotate_local_midi_candidate(music_xml, *, title, path, query_title="", artist=""):
    source_url = build_midi_resource_public_url(path)
    tune_meta = {
        "srcUrl": source_url,
        "meta": {"importFormat": "midi", "midiLibrary": True},
    }
    resolved_title = str(title or "").strip() or title_from_midi_relative_path(path)
    if resolved_title:
        tune_meta["name"] = resolved_title
    if artist:
        tune_meta["composer"] = artist
    return {
        "abc": "",
        "musicXml": music_xml,
        "title": resolved_title,
        "artist": artist or "",
        "source": "midi-resources",
        "sourceUrl": source_url,
        "preview": "",
        "titleOnly": not bool(query_title),
        "tuneMeta": tune_meta,
        "matchScore": 0,
    }
