"""Personal music collection: metadata index, search, and file serving."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
import threading
import unicodedata
from urllib.parse import quote

from allowlists import (
    load_music_collection_emails as load_music_collection_emails_from_allowlists,
    music_collection_access_allowed as check_music_collection_access,
)
from chords_fetch import score_title_artist_match

MUSIC_COLLECTION_INDEX_NAME = os.getenv("MUSIC_COLLECTION_INDEX_NAME", "music_collection_index.json").strip()
MUSIC_COLLECTION_STATS_NAME = os.getenv("MUSIC_COLLECTION_STATS_NAME", "music_collection_stats.json").strip()
MUSIC_COLLECTION_PUBLIC_BASE = os.getenv("MUSIC_COLLECTION_PUBLIC_BASE", "/music-collection").strip().rstrip("/")
MUSIC_COLLECTION_ART_DIR_NAME = os.getenv("MUSIC_COLLECTION_ART_DIR_NAME", "music_collection_art").strip()

AUDIO_EXTENSIONS = frozenset({
    ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".wma",
})

MAX_MUSIC_COLLECTION_SEARCH_RESULTS = 50
MAX_MUSIC_COLLECTION_FILE_BYTES = int(os.getenv("MAX_MUSIC_COLLECTION_BYTES", str(120 * 1024 * 1024)))

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


def music_collection_root():
    return os.path.abspath(os.getenv("MUSIC_COLLECTION_DIR", "/music-collection").strip() or "/music-collection")


def music_collection_metadata_dir():
    index_dir = os.getenv("MUSIC_COLLECTION_INDEX_DIR", "").strip()
    if index_dir:
        return os.path.abspath(index_dir)
    return music_collection_root()


def music_collection_index_path():
    return os.path.join(music_collection_metadata_dir(), MUSIC_COLLECTION_INDEX_NAME)


def music_collection_stats_path():
    return os.path.join(music_collection_metadata_dir(), MUSIC_COLLECTION_STATS_NAME)


def music_collection_art_dir():
    return os.path.join(music_collection_metadata_dir(), MUSIC_COLLECTION_ART_DIR_NAME)


def load_music_collection_emails():
    return load_music_collection_emails_from_allowlists()


def music_collection_enabled():
    root = music_collection_root()
    index_path = music_collection_index_path()
    return os.path.isdir(root) and os.path.isfile(index_path)


def music_collection_access_allowed(email: str | None, *, require_auth: bool) -> bool:
    return check_music_collection_access(
        email,
        load_music_collection_emails(),
        require_auth,
        collection_enabled=True,
    )


def music_collection_health_fields():
    root = music_collection_root()
    index_path = music_collection_index_path()
    stats_path = music_collection_stats_path()
    enabled = music_collection_enabled()
    entry_count = 0
    stats_summary = None
    built_at = None
    if enabled:
        try:
            index = load_music_collection_index()
            entry_count = len((index or {}).get("entries") or {})
            built_at = (index or {}).get("builtAt")
            stats_summary = music_collection_stats_summary()
        except Exception:
            entry_count = 0
    return {
        "musicCollection": enabled,
        "musicCollectionDir": root if os.path.isdir(root) else None,
        "musicCollectionIndex": index_path if os.path.isfile(index_path) else None,
        "musicCollectionStats": stats_path if os.path.isfile(stats_path) else None,
        "musicCollectionCount": entry_count,
        "musicCollectionBuiltAt": built_at,
        "musicCollectionSummary": stats_summary,
    }


def _fold_search_text(text):
    folded = unicodedata.normalize("NFKD", str(text or ""))
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return folded.lower()


def _strip_common_words(text):
    parts = []
    for word in re.sub(r"[^a-z0-9 ]+", " ", _fold_search_text(text)).split():
        if word and word not in _COMMON_WORDS:
            parts.append(word)
    return " ".join(parts)


def tokenize_music_search_query(text):
    clean = _strip_common_words(text)
    return [part for part in clean.split() if len(part) >= 3]


def _tokenize_index_text(text):
    tokens = set()
    for word in re.sub(r"[^a-z0-9 ]+", " ", _fold_search_text(text)).split():
        if len(word) >= 3 and word not in _COMMON_WORDS:
            tokens.add(word)
    return tokens


def _entry_metadata_tokens(entry):
    entry_path = str(entry.get("path") or "").strip()
    derived_title = title_from_audio_relative_path(entry_path) if entry_path else ""
    filename = os.path.basename(entry_path) if entry_path else ""
    filename_title, filename_artist = title_artist_from_filename(filename)
    token_source = " ".join([
        str(entry.get("title") or ""),
        str(entry.get("artist") or ""),
        str(entry.get("album") or ""),
        str(entry.get("category") or ""),
        str(entry.get("genre") or ""),
        str(entry.get("composer") or ""),
        derived_title,
        filename_title,
        filename_artist,
    ])
    return _tokenize_index_text(token_source)


def _score_collection_text_match(entry_title, entry_artist, title, artist, query_parts):
    score = score_title_artist_match(entry_title, entry_artist, title, artist)
    if title and not artist:
        score = max(score, score_title_artist_match(entry_title, entry_artist, "", title))
    metadata_tokens = _tokenize_index_text(" ".join([entry_title, entry_artist]))
    query_token_set = set(query_parts)
    overlap = query_token_set & metadata_tokens
    if overlap and score <= 0:
        coverage = len(overlap) / max(len(query_token_set), 1)
        score = max(score, int(coverage * 55))
    return score, overlap


def title_from_audio_relative_path(relative_path):
    rel = str(relative_path or "").replace("\\", "/").strip("/")
    if not rel:
        return "Audio"
    parts = rel.split("/")
    filename = parts[-1]
    name = re.sub(r"\.[^.]+$", "", filename, flags=re.I)
    name = re.sub(r"^[\d\s._\-+]+", "", name)
    name = re.sub(r"[_\-+]+", " ", name).strip()
    if len(parts) > 1:
        parent = re.sub(r"[_\-+]+", " ", parts[-2]).strip()
        skip_parents = {"music", "audio", "files", "tracks", "various", "albums"}
        if parent and parent.lower() not in skip_parents:
            return parent + " — " + name if name else parent
    return name or "Audio"


def title_artist_from_filename(filename):
    base = re.sub(r"\.[^.]+$", "", str(filename or "").strip())
    if not base:
        return "", ""
    parts = re.split(r"\s*[-–—|]\s+", base, maxsplit=1)
    if len(parts) >= 2:
        return parts[1].strip(), parts[0].strip()
    return base.strip(), ""


def build_music_collection_public_url(relative_path, public_base=None):
    base = str(public_base or MUSIC_COLLECTION_PUBLIC_BASE).rstrip("/")
    rel = str(relative_path or "").replace("\\", "/").lstrip("/")
    segments = [quote(part) for part in rel.split("/") if part]
    return base + "/" + "/".join(segments)


def build_music_collection_entry_url(entry_id, request_base_url=None):
    base = "/music-collection-by-entry"
    if request_base_url:
        base = str(request_base_url).rstrip("/") + "/music-collection-by-entry"
    return base.rstrip("/") + "/" + quote(str(entry_id or "").strip())


def build_music_collection_art_url(entry_id, request_base_url=None):
    base = "/music-collection-art"
    if request_base_url:
        base = str(request_base_url).rstrip("/") + "/music-collection-art"
    return base.rstrip("/") + "/" + quote(str(entry_id or "").strip())


def resolve_music_collection_file(relative_path):
    root = music_collection_root()
    rel = str(relative_path or "").replace("\\", "/").lstrip("/")
    if not rel or rel.startswith("..") or "/../" in ("/" + rel + "/"):
        raise ValueError("Invalid music collection path")
    abs_path = os.path.abspath(os.path.join(root, rel))
    if not abs_path.startswith(root + os.sep) and abs_path != root:
        raise ValueError("Invalid music collection path")
    if not os.path.isfile(abs_path):
        raise FileNotFoundError("Audio file not found")
    ext = os.path.splitext(abs_path)[1].lower()
    if ext not in AUDIO_EXTENSIONS:
        raise ValueError("Not an audio file")
    return abs_path


def resolve_music_collection_art_file(entry_id, *, allow_on_demand=True):
    art_dir = music_collection_art_dir()
    entry = str(entry_id or "").strip()
    if not entry or not re.fullmatch(r"[0-9]+", entry):
        raise ValueError("Invalid art entry id")
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        abs_path = os.path.join(art_dir, entry + ext)
        if os.path.isfile(abs_path):
            return abs_path
    if allow_on_demand:
        extracted = ensure_music_collection_art_file(entry)
        if extracted:
            return extracted
    raise FileNotFoundError("Album art not found")


def get_music_collection_entry(entry_id):
    index = load_music_collection_index()
    if not index:
        return None
    entry = (index.get("entries") or {}).get(str(entry_id or "").strip())
    return entry if isinstance(entry, dict) else None


def extract_music_collection_art_from_file(abs_path, entry_id, art_dir=None):
    """Extract embedded cover art from an audio file and cache it by entry id."""
    try:
        from mutagen import File as MutagenFile
    except ImportError:
        return ""

    try:
        audio = MutagenFile(abs_path)
    except Exception:
        return ""
    if audio is None:
        return ""

    pictures = []
    if hasattr(audio, "tags") and audio.tags is not None:
        tags = audio.tags
        if hasattr(tags, "getall"):
            try:
                pictures.extend(tags.getall("APIC"))
            except (ValueError, KeyError, TypeError):
                pass
        for key in ("APIC:", "APIC", "covr", "METADATA_BLOCK_PICTURE"):
            try:
                value = tags.get(key)
            except (ValueError, KeyError, TypeError):
                value = None
            if value is None:
                continue
            if isinstance(value, list):
                pictures.extend(value)
            else:
                pictures.append(value)

    target_dir = art_dir or music_collection_art_dir()
    for picture in pictures:
        try:
            data = getattr(picture, "data", None) or getattr(picture, "image", None)
            if not data:
                continue
            mime = str(getattr(picture, "mime", "") or "").lower()
            ext = ".jpg"
            if "png" in mime:
                ext = ".png"
            elif "webp" in mime:
                ext = ".webp"
            os.makedirs(target_dir, exist_ok=True)
            out_path = os.path.join(target_dir, str(entry_id) + ext)
            with open(out_path, "wb") as handle:
                handle.write(data)
            return out_path
        except Exception:
            continue
    return ""


def ensure_music_collection_art_file(entry_id):
    """Return cached art path, extracting from the source audio file on demand."""
    entry = str(entry_id or "").strip()
    if not entry or not re.fullmatch(r"[0-9]+", entry):
        return ""
    art_dir = music_collection_art_dir()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        abs_path = os.path.join(art_dir, entry + ext)
        if os.path.isfile(abs_path):
            return abs_path

    indexed = get_music_collection_entry(entry)
    if not indexed:
        return ""
    rel_path = str(indexed.get("path") or "").strip()
    if not rel_path:
        return ""
    try:
        audio_path = resolve_music_collection_file(rel_path)
    except (FileNotFoundError, ValueError):
        return ""
    return extract_music_collection_art_from_file(audio_path, entry, art_dir=art_dir)


def guess_audio_mime_type(abs_path):
    mime, _encoding = mimetypes.guess_type(abs_path)
    if mime and mime.startswith("audio/"):
        return mime
    ext = os.path.splitext(abs_path)[1].lower()
    mapping = {
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".opus": "audio/opus",
        ".wav": "audio/wav",
        ".wma": "audio/x-ms-wma",
    }
    return mapping.get(ext, "application/octet-stream")


def load_music_collection_index(force_reload=False):
    global _INDEX_CACHE, _INDEX_MTIME
    index_path = music_collection_index_path()
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


def save_music_collection_index(payload):
    index_path = music_collection_index_path()
    with open(index_path + ".tmp", "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    os.replace(index_path + ".tmp", index_path)
    return load_music_collection_index(force_reload=True)


def load_music_collection_stats(force_reload=False):
    stats_path = music_collection_stats_path()
    if os.path.isfile(stats_path):
        try:
            with open(stats_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    index = load_music_collection_index(force_reload=force_reload)
    if not index:
        return None
    stats = index.get("stats")
    if not isinstance(stats, dict):
        return None
    return {
        "version": index.get("version") or 2,
        "builtAt": index.get("builtAt"),
        "startedAt": index.get("startedAt"),
        "root": index.get("root"),
        "count": index.get("count"),
        "stats": stats,
    }


def music_collection_stats_summary():
    from music_collection_analytics import summarize_stats_for_health

    payload = load_music_collection_stats()
    if not payload:
        return None
    return summarize_stats_for_health(payload.get("stats") or {})


def _format_duration(seconds):
    try:
        total = int(float(seconds or 0))
    except (TypeError, ValueError):
        return ""
    if total <= 0:
        return ""
    minutes = total // 60
    secs = total % 60
    return f"{minutes}:{secs:02d}"


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


_TITLE_SPLIT_STOP_WORDS = frozenset({
    "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with",
    "after", "before", "upon", "into", "over", "under",
})


def infer_title_artist_from_query(query: str) -> tuple[str, str]:
    text = str(query or "").strip()
    if not text:
        return "", ""
    words = text.split()
    if len(words) < 4:
        return text, ""
    last_two = words[-2:]
    if any(word.lower() in _TITLE_SPLIT_STOP_WORDS for word in last_two):
        return text, ""
    return " ".join(last_two), " ".join(words[:-2])


def search_music_collection(title, artist="", limit=MAX_MUSIC_COLLECTION_SEARCH_RESULTS):
    index = load_music_collection_index()
    if not index:
        return []

    entries = index.get("entries") or {}
    tokens = index.get("tokens") or {}
    if not entries:
        return []

    query_parts = []
    for variant in _title_query_variants(title):
        query_parts.extend(tokenize_music_search_query(variant))
    query_parts.extend(tokenize_music_search_query(artist))
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
        entry_artist = str(entry.get("artist") or "").strip()
        entry_path = str(entry.get("path") or "").strip()
        if not entry_path:
            continue
        metadata_tokens = _entry_metadata_tokens(entry)
        metadata_overlap = set(query_parts) & metadata_tokens
        text_score, _title_overlap = _score_collection_text_match(
            entry_title,
            entry_artist,
            title,
            artist,
            query_parts,
        )
        if (title or artist) and text_score <= 0 and not metadata_overlap:
            continue
        coverage = token_hits / max(query_token_count, 1)
        match_score = int((token_hits * 28) + (coverage * 42) + text_score)
        if query_token_count > 1 and token_hits < query_token_count:
            match_score -= int((query_token_count - token_hits) * 8)
        if match_score < 20:
            continue
        scored.append({
            "id": entry_id,
            "title": entry_title or title_from_audio_relative_path(entry_path),
            "artist": entry_artist,
            "album": str(entry.get("album") or "").strip(),
            "path": entry_path,
            "duration": entry.get("duration"),
            "matchScore": match_score,
            "tokenHits": token_hits,
            "hasArt": bool(entry.get("hasArt")),
        })

    scored.sort(
        key=lambda item: (
            item.get("tokenHits") or 0,
            item.get("matchScore") or 0,
            item.get("title") or "",
        ),
        reverse=True,
    )
    return scored[: max(1, int(limit or MAX_MUSIC_COLLECTION_SEARCH_RESULTS))]


def build_music_collection_candidate(entry, *, public_base=None, request_base_url=None):
    path = str(entry.get("path") or "").strip()
    entry_id = str(entry.get("id") or "").strip()
    title = str(entry.get("title") or "").strip() or title_from_audio_relative_path(path)
    artist = str(entry.get("artist") or "").strip()
    album = str(entry.get("album") or "").strip()
    duration_label = _format_duration(entry.get("duration"))
    description_parts = [part for part in [album, duration_label] if part]
    description = " · ".join(description_parts)

    if request_base_url:
        public_base = str(request_base_url).rstrip("/") + MUSIC_COLLECTION_PUBLIC_BASE
    link = build_music_collection_public_url(path, public_base=public_base)
    image = build_music_collection_art_url(entry_id, request_base_url=request_base_url) if entry_id else ""
    entry_link = build_music_collection_entry_url(entry_id, request_base_url=request_base_url) if entry_id else ""

    candidate = {
        "id": entry_id,
        "title": title,
        "artist": artist,
        "path": path,
        "description": description,
        "image": image,
        "collectionEntryLink": entry_link,
        "link": link,
        "source": "music-collection",
        "matchScore": int(entry.get("matchScore") or 0),
    }
    for field in ("genre", "year", "composer", "duration", "tracknumber", "albumartist"):
        value = entry.get(field)
        if value not in (None, ""):
            candidate[field] = value
    return candidate


def rebuild_music_collection_index(extract_art=True, resume=False, background=False):
    """Rebuild music_collection_index.json from files on disk."""
    root = music_collection_root()
    if not os.path.isdir(root):
        raise FileNotFoundError("Music collection directory not found")

    metadata_dir = music_collection_metadata_dir()
    os.makedirs(metadata_dir, exist_ok=True)

    if background:
        return start_music_collection_index_build(extract_art=extract_art, resume=resume)

    from music_collection_indexer import IndexBuildOptions, is_build_running, run_build

    if is_build_running(metadata_dir):
        raise RuntimeError("Music collection index build already running")

    opts = IndexBuildOptions(
        root_dir=root,
        metadata_dir=metadata_dir,
        extract_art=extract_art,
        resume=resume,
    )
    index = run_build(
        opts,
        index_output_path=music_collection_index_path(),
        stats_output_path=music_collection_stats_path(),
        acquire_lock=True,
    )
    load_music_collection_index(force_reload=True)
    return index


def start_music_collection_index_build(extract_art=True, resume=False):
    """Spawn a detached index build subprocess."""
    import subprocess

    metadata_dir = music_collection_metadata_dir()
    os.makedirs(metadata_dir, exist_ok=True)

    from music_collection_indexer import is_build_running

    if is_build_running(metadata_dir):
        raise RuntimeError("Music collection index build already running")

    script_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "scripts",
        "build_music_collection_index.py",
    )
    if not os.path.isfile(script_path):
        raise RuntimeError("Music collection index builder script not found")

    cmd = [
        sys.executable,
        script_path,
        music_collection_root(),
    ]
    if not extract_art:
        cmd.append("--no-art")
    if resume:
        cmd.append("--resume")

    log_path = os.path.join(metadata_dir, "build.log")
    log_handle = open(log_path, "a", encoding="utf-8")
    proc = subprocess.Popen(
        cmd,
        cwd=os.path.dirname(os.path.abspath(__file__)),
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log_handle.close()
    return {
        "ok": True,
        "started": True,
        "pid": proc.pid,
        "background": True,
    }
