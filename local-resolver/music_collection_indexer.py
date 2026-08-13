"""Robust music collection index builder: per-file isolation, timeouts, checkpoints."""

from __future__ import annotations

import json
import os
import time
from concurrent.futures import ProcessPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from music_collection import (
    AUDIO_EXTENSIONS,
    MUSIC_COLLECTION_ART_DIR_NAME,
    MUSIC_COLLECTION_INDEX_NAME,
    MUSIC_COLLECTION_STATS_NAME,
    _tokenize_index_text,
    title_artist_from_filename,
    title_from_audio_relative_path,
)
from music_collection_analytics import (
    NATIVE_TAG_FIELD_KEYS,
    _normalize_key,
    _tag_value_text,
    build_collection_stats,
    file_timestamps,
    metadata_sources,
    parse_bpm_value,
    quick_content_fingerprint,
    read_audio_info,
    read_playback_info,
    read_standard_tags,
    song_key,
    soft_duplicate_key,
)
from music_collection_registry import is_preserved_path, match_phase, resolve_collection_id

BUILD_LOCK_NAME = "build.lock"
BUILD_PROGRESS_NAME = "build_progress.json"
BUILD_ERRORS_NAME = "build_errors.jsonl"
CHECKPOINT_NAME = "checkpoint.json"
PARTIAL_INDEX_NAME = "music_collection_index.partial.json"

FILE_TIMEOUT_SECONDS = max(1, int(os.getenv("MUSIC_COLLECTION_FILE_TIMEOUT_SECONDS", "8")))
CHECKPOINT_EVERY = max(0, int(os.getenv("MUSIC_COLLECTION_CHECKPOINT_EVERY", "2000")))
MAX_ERROR_LOG = max(50, int(os.getenv("MUSIC_COLLECTION_MAX_ERROR_LOG", "500")))
SKIP_SYMLINKS = os.getenv("MUSIC_COLLECTION_SKIP_SYMLINKS", "1").strip().lower() in ("1", "true", "yes")
TAGS_ONLY = os.getenv("MUSIC_COLLECTION_TAGS_ONLY", "").strip().lower() in ("1", "true", "yes")
PROGRESS_EVERY = max(1, int(os.getenv("MUSIC_COLLECTION_PROGRESS_EVERY", "500")))


@dataclass
class IndexBuildOptions:
    root_dir: str
    metadata_dir: str
    extract_art: bool = True
    resume: bool = False
    tags_only: bool = False

    @property
    def art_dir(self) -> str:
        return os.path.join(self.metadata_dir, MUSIC_COLLECTION_ART_DIR_NAME)

    @property
    def progress_path(self) -> str:
        return os.path.join(self.metadata_dir, BUILD_PROGRESS_NAME)

    @property
    def errors_path(self) -> str:
        return os.path.join(self.metadata_dir, BUILD_ERRORS_NAME)

    @property
    def checkpoint_path(self) -> str:
        return os.path.join(self.metadata_dir, CHECKPOINT_NAME)

    @property
    def partial_index_path(self) -> str:
        return os.path.join(self.metadata_dir, PARTIAL_INDEX_NAME)

    @property
    def lock_path(self) -> str:
        return os.path.join(self.metadata_dir, BUILD_LOCK_NAME)


@dataclass
class BuildState:
    errors: int = 0
    skipped: int = 0
    errors_by_stage: dict[str, int] = field(default_factory=dict)
    last_error: dict[str, str] | None = None

    def record_error(self, stage: str, rel_path: str, exc: BaseException) -> dict[str, str]:
        self.errors += 1
        self.errors_by_stage[stage] = self.errors_by_stage.get(stage, 0) + 1
        payload = {
            "path": rel_path,
            "stage": stage,
            "errorType": type(exc).__name__,
            "message": str(exc)[:500],
            "at": datetime.now(tz=timezone.utc).isoformat(),
        }
        self.last_error = payload
        return payload


def _utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def atomic_write_json(path: str, payload: Any) -> None:
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    os.replace(tmp_path, path)


def write_progress(progress_path: str, payload: dict[str, Any]) -> None:
    if not progress_path:
        return
    try:
        atomic_write_json(progress_path, payload)
    except OSError:
        pass


class BuildErrorLog:
    def __init__(self, path: str, max_lines: int = MAX_ERROR_LOG):
        self.path = path
        self.max_lines = max_lines
        self._lines: list[str] = []
        self.total = 0
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    self._lines = [line.rstrip("\n") for line in handle if line.strip()]
                self.total = len(self._lines)
            except OSError:
                self._lines = []
                self.total = 0

    def append(self, payload: dict[str, Any]) -> None:
        self.total += 1
        line = json.dumps(payload, separators=(",", ":"))
        self._lines.append(line)
        if len(self._lines) > self.max_lines:
            self._lines = self._lines[-self.max_lines :]
        try:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            with open(self.path, "a", encoding="utf-8") as handle:
                handle.write(line + "\n")
        except OSError:
            pass


class BuildLock:
    def __init__(self, lock_path: str):
        self.lock_path = lock_path
        self._acquired = False

    def acquire(self) -> None:
        os.makedirs(os.path.dirname(self.lock_path) or ".", exist_ok=True)
        if os.path.isfile(self.lock_path):
            try:
                with open(self.lock_path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                pid = int(data.get("pid") or 0)
            except (OSError, ValueError, json.JSONDecodeError):
                pid = 0
            if pid > 0 and _pid_alive(pid):
                raise RuntimeError("Music collection index build already running (pid %s)" % pid)
        payload = {"pid": os.getpid(), "startedAt": _utc_now()}
        atomic_write_json(self.lock_path, payload)
        self._acquired = True

    def release(self) -> None:
        if not self._acquired:
            return
        try:
            if os.path.isfile(self.lock_path):
                os.unlink(self.lock_path)
        except OSError:
            pass
        self._acquired = False

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.release()
        return False


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def is_build_running(metadata_dir: str) -> bool:
    lock_path = os.path.join(metadata_dir, BUILD_LOCK_NAME)
    if not os.path.isfile(lock_path):
        return False
    try:
        with open(lock_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return _pid_alive(int(data.get("pid") or 0))
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def load_build_progress(metadata_dir: str) -> dict[str, Any] | None:
    path = os.path.join(metadata_dir, BUILD_PROGRESS_NAME)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _walk_error(exc: OSError) -> None:
    return None


def iter_audio_files(root_dir: str):
    skip_dirs: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root_dir, onerror=_walk_error):
        if MUSIC_COLLECTION_ART_DIR_NAME in dirpath.replace("\\", "/").split("/"):
            continue
        for filename in filenames:
            lower = filename.lower()
            ext = os.path.splitext(lower)[1]
            if ext not in AUDIO_EXTENSIONS:
                continue
            abs_path = os.path.join(dirpath, filename)
            if SKIP_SYMLINKS and os.path.islink(abs_path):
                continue
            try:
                if os.path.getsize(abs_path) <= 0:
                    continue
            except OSError:
                continue
            rel_path = os.path.relpath(abs_path, root_dir).replace("\\", "/")
            yield rel_path, abs_path


def _read_tags(abs_path: str) -> tuple[dict, list, dict, dict, list, dict]:
    issues: list[dict[str, str]] = []
    try:
        from mutagen import File as MutagenFile
    except ImportError as exc:
        raise RuntimeError("mutagen is required") from exc

    audio = None
    easy_audio = None
    try:
        easy_audio = MutagenFile(abs_path, easy=True)
    except Exception as exc:
        issues.append({"stage": "tags_easy", "error": type(exc).__name__})

    try:
        audio = MutagenFile(abs_path)
    except Exception as exc:
        issues.append({"stage": "tags_native", "error": type(exc).__name__})

    if audio is None and easy_audio is None:
        return {}, [], {}, {}, issues, {}

    tags = (audio.tags if audio and audio.tags else None) or (easy_audio.tags if easy_audio and easy_audio.tags else None)
    if tags is None:
        tags = {}

    try:
        standard, tag_keys = read_standard_tags(tags)
    except Exception as exc:
        issues.append({"stage": "tags_parse", "error": type(exc).__name__})
        standard, tag_keys = {}, []

    if audio and audio.tags:
        try:
            native_standard, native_keys = read_standard_tags(audio.tags)
            for fld, value in native_standard.items():
                if value and not standard.get(fld):
                    standard[fld] = value
            tag_keys = sorted(set(tag_keys).union(native_keys))
        except Exception as exc:
            issues.append({"stage": "tags_native_parse", "error": type(exc).__name__})

    try:
        playback = read_playback_info(audio.tags if audio and audio.tags else tags)
    except Exception as exc:
        issues.append({"stage": "playback", "error": type(exc).__name__})
        playback = {}

    duration = None
    source_audio = audio or easy_audio
    if source_audio is not None and hasattr(source_audio, "info") and source_audio.info is not None:
        try:
            duration = float(getattr(source_audio.info, "length", 0) or 0)
        except (TypeError, ValueError):
            duration = None
    standard["duration"] = duration

    extra_tags: dict[str, str] = {}
    raw_tags = audio.tags if audio and audio.tags else tags
    try:
        if hasattr(raw_tags, "items"):
            covered = set()
            for keys in NATIVE_TAG_FIELD_KEYS.values():
                covered.update(keys)
            covered_norm = {_normalize_key(item) for item in covered}
            for key, value in _iter_tag_items_safe(raw_tags):
                key_text = str(key)
                if key_text in covered or _normalize_key(key_text) in covered_norm:
                    continue
                text = _tag_value_text(value)
                if text:
                    extra_tags[key_text] = text[:200]
    except Exception as exc:
        issues.append({"stage": "extra_tags", "error": type(exc).__name__})

    source_audio = audio or easy_audio
    audio_info = read_audio_info(source_audio) if source_audio else {}
    return standard, tag_keys, playback, extra_tags, issues, audio_info


def _iter_tag_items_safe(tags):
    if tags is None:
        return
    try:
        items = tags.items() if hasattr(tags, "items") else None
    except (ValueError, TypeError):
        items = None
    if items is not None:
        for key, value in items:
            yield key, value


def _extract_art(abs_path: str, entry_id: str, art_dir: str) -> bool:
    from music_collection import extract_music_collection_art_from_file

    return bool(extract_music_collection_art_from_file(abs_path, entry_id, art_dir=art_dir))


def process_file(
    rel_path: str,
    abs_path: str,
    entry_id: str,
    *,
    extract_art: bool,
    art_dir: str,
    tags_only: bool,
) -> dict[str, Any]:
    """Process one audio file. Must remain picklable for ProcessPoolExecutor."""
    read_issues: list[dict[str, str]] = []
    tags: dict = {}
    tag_keys: list = []
    playback: dict = {}
    extra_tags: dict = {}

    try:
        tags, tag_keys, playback, extra_tags, tag_issues, audio_info = _read_tags(abs_path)
        read_issues.extend(tag_issues)
    except Exception as exc:
        read_issues.append({"stage": "tags", "error": type(exc).__name__})
        audio_info = {}

    filename = os.path.basename(rel_path)
    fallback_title, fallback_artist = title_artist_from_filename(filename)
    title = tags.get("title") or fallback_title or title_from_audio_relative_path(rel_path)
    artist = tags.get("artist") or fallback_artist
    album = tags.get("album") or ""
    category = ""
    parts = rel_path.split("/")
    if len(parts) > 1:
        category = parts[0]

    try:
        timestamps = file_timestamps(abs_path)
    except Exception:
        timestamps = {}
    size = int(timestamps.get("size") or 0)
    ext = os.path.splitext(rel_path)[1].lower()
    duration = tags.get("duration")
    resolved = {
        "title": title,
        "artist": artist,
        "album": album,
        "genre": tags.get("genre") or "",
        "year": tags.get("year") or "",
        "composer": tags.get("composer") or "",
        "tracknumber": tags.get("tracknumber") or "",
    }
    bpm = parse_bpm_value(tags.get("bpm"))
    parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
    folder_depth = max(len(parts) - 1, 0)
    phase = match_phase(rel_path)
    collection_id = resolve_collection_id(rel_path)
    sk = song_key(artist, title)

    has_art = False
    if extract_art and not tags_only:
        try:
            has_art = _extract_art(abs_path, entry_id, art_dir)
        except Exception as exc:
            read_issues.append({"stage": "art_extract", "error": type(exc).__name__})

    fingerprint = None
    if not tags_only and size > 0:
        try:
            fingerprint = quick_content_fingerprint(abs_path, size)
        except Exception as exc:
            read_issues.append({"stage": "fingerprint", "error": type(exc).__name__})

    entry = {
        "title": title,
        "artist": artist,
        "album": album,
        "path": rel_path,
        "category": category,
        "collectionId": collection_id,
        "phase": phase,
        "parentPath": parent_path,
        "folderDepth": folder_depth,
        "duration": duration,
        "year": resolved["year"],
        "genre": resolved["genre"],
        "composer": resolved["composer"],
        "tracknumber": resolved["tracknumber"],
        "albumartist": tags.get("albumartist") or "",
        "discnumber": tags.get("discnumber") or "",
        "bpm": bpm,
        "key": tags.get("key") or "",
        "bitrate": audio_info.get("bitrate"),
        "sampleRate": audio_info.get("sampleRate"),
        "channels": audio_info.get("channels"),
        "hasArt": has_art,
        "ext": ext,
        "size": size,
        "addedAt": timestamps.get("addedAt"),
        "modifiedAt": timestamps.get("modifiedAt"),
        "accessedAt": timestamps.get("accessedAt"),
        "playCount": playback.get("playCount"),
        "lastPlayed": playback.get("lastPlayed"),
        "meta": metadata_sources(tags, resolved),
        "tagKeys": tag_keys,
        "extraTags": extra_tags,
        "fingerprint": fingerprint,
        "softDupKey": soft_duplicate_key(title, artist, duration),
        "songKey": sk,
        "preserved": is_preserved_path(rel_path),
    }
    if read_issues:
        entry["readIssues"] = read_issues
    return entry


def _process_file_worker(args: tuple) -> dict[str, Any]:
    rel_path, abs_path, entry_id, extract_art, art_dir, tags_only = args
    return process_file(
        rel_path,
        abs_path,
        entry_id,
        extract_art=extract_art,
        art_dir=art_dir,
        tags_only=tags_only,
    )


def process_file_safe(
    rel_path: str,
    abs_path: str,
    entry_id: str,
    opts: IndexBuildOptions,
    executor: ProcessPoolExecutor | None,
) -> tuple[dict[str, Any], list[dict[str, str]], bool]:
    """Returns (entry, issues, executor_needs_reset)."""
    worker_args = (
        rel_path,
        abs_path,
        entry_id,
        opts.extract_art,
        opts.art_dir,
        opts.tags_only or TAGS_ONLY,
    )
    issues: list[dict[str, str]] = []
    try:
        if executor is not None:
            future = executor.submit(_process_file_worker, worker_args)
            return future.result(timeout=FILE_TIMEOUT_SECONDS), issues, False
        return process_file(
            rel_path,
            abs_path,
            entry_id,
            extract_art=opts.extract_art,
            art_dir=opts.art_dir,
            tags_only=opts.tags_only or TAGS_ONLY,
        ), issues, False
    except FuturesTimeoutError:
        issues.append({"stage": "timeout", "error": "TimeoutError"})
        return _fallback_entry(rel_path, abs_path, entry_id), issues, True
    except Exception as exc:
        issues.append({"stage": "process", "error": type(exc).__name__})
        return _fallback_entry(rel_path, abs_path, entry_id), issues, False


def _fallback_entry(rel_path: str, abs_path: str, entry_id: str) -> dict[str, Any]:
    filename = os.path.basename(rel_path)
    fallback_title, fallback_artist = title_artist_from_filename(filename)
    title = fallback_title or title_from_audio_relative_path(rel_path)
    artist = fallback_artist
    timestamps = file_timestamps(abs_path)
    size = int(timestamps.get("size") or 0)
    ext = os.path.splitext(rel_path)[1].lower()
    category = rel_path.split("/")[0] if "/" in rel_path else ""
    resolved = {"title": title, "artist": artist, "album": "", "genre": "", "year": "", "composer": "", "tracknumber": ""}
    sk = song_key(artist, title)
    return {
        "title": title,
        "artist": artist,
        "album": "",
        "path": rel_path,
        "category": category,
        "collectionId": resolve_collection_id(rel_path),
        "phase": match_phase(rel_path),
        "parentPath": "/".join(rel_path.split("/")[:-1]) if "/" in rel_path else "",
        "folderDepth": max(len(rel_path.split("/")) - 1, 0),
        "duration": None,
        "year": "",
        "genre": "",
        "composer": "",
        "tracknumber": "",
        "albumartist": "",
        "discnumber": "",
        "bpm": None,
        "key": "",
        "bitrate": None,
        "sampleRate": None,
        "channels": None,
        "hasArt": False,
        "ext": ext,
        "size": size,
        "addedAt": timestamps.get("addedAt"),
        "modifiedAt": timestamps.get("modifiedAt"),
        "accessedAt": timestamps.get("accessedAt"),
        "playCount": None,
        "lastPlayed": None,
        "meta": metadata_sources({}, resolved),
        "tagKeys": [],
        "extraTags": {},
        "fingerprint": None,
        "softDupKey": soft_duplicate_key(title, artist, None),
        "songKey": sk,
        "preserved": is_preserved_path(rel_path),
        "readIssues": [{"stage": "fallback", "error": "partial"}],
    }


def _file_signature(abs_path: str) -> dict[str, int] | None:
    try:
        stat = os.stat(abs_path)
        return {"mtime": int(stat.st_mtime), "size": int(stat.st_size)}
    except OSError:
        return None


def load_checkpoint(path: str) -> dict[str, Any] | None:
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def save_checkpoint(
    path: str,
    *,
    entries: dict,
    tokens: dict,
    processed_files: dict,
    next_id: int,
    state: BuildState,
    started_at: str,
    root_dir: str,
    partial_index_path: str,
) -> None:
    payload = {
        "version": 1,
        "startedAt": started_at,
        "updatedAt": _utc_now(),
        "root": os.path.abspath(root_dir),
        "nextId": next_id,
        "processedFiles": processed_files,
        "errors": state.errors,
        "skipped": state.skipped,
        "errorsByStage": state.errors_by_stage,
    }
    atomic_write_json(path, payload)
    partial = {
        "version": 2,
        "builtAt": _utc_now(),
        "startedAt": started_at,
        "root": os.path.abspath(root_dir),
        "count": len(entries),
        "entries": entries,
        "tokens": tokens,
        "indexName": MUSIC_COLLECTION_INDEX_NAME,
    }
    atomic_write_json(partial_index_path, partial)


def _add_entry_tokens(tokens: dict, entry_id: str, entry: dict) -> None:
    token_source = " ".join([
        str(entry.get("title") or ""),
        str(entry.get("artist") or ""),
        str(entry.get("album") or ""),
        str(entry.get("category") or ""),
        str(entry.get("genre") or ""),
        str(entry.get("composer") or ""),
    ])
    for token in _tokenize_index_text(token_source):
        bucket = tokens.setdefault(token, [])
        bucket.append(entry_id)


def _load_existing_index(index_path: str) -> dict[str, Any]:
    if not os.path.isfile(index_path):
        return {}
    try:
        with open(index_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _max_entry_id(existing_entries: dict[str, Any]) -> int:
    max_id = -1
    for entry_id in existing_entries.keys():
        try:
            max_id = max(max_id, int(entry_id))
        except (TypeError, ValueError):
            continue
    return max_id


def _rebuild_tokens(entries: dict[str, Any]) -> dict[str, list]:
    tokens: dict[str, list] = {}
    for entry_id, entry in entries.items():
        if isinstance(entry, dict):
            _add_entry_tokens(tokens, entry_id, entry)
    return tokens


def build_index(opts: IndexBuildOptions) -> dict[str, Any]:
    root_dir = os.path.abspath(opts.root_dir)
    started_at = _utc_now()
    state = BuildState()
    error_log = BuildErrorLog(opts.errors_path)
    entries: dict[str, Any] = {}
    tokens: dict[str, list] = {}
    processed_files: dict[str, Any] = {}
    next_id = 0
    existing_index = _load_existing_index(os.path.join(opts.metadata_dir, MUSIC_COLLECTION_INDEX_NAME))
    existing_entries = dict(existing_index.get("entries") or {})
    existing_path_to_id: dict[str, str] = {}
    existing_fingerprint_to_ids: dict[str, list[str]] = {}
    for existing_entry_id, existing_entry in existing_entries.items():
        if not isinstance(existing_entry, dict):
            continue
        existing_path = str(existing_entry.get("path") or "").strip()
        if existing_path and existing_path not in existing_path_to_id:
            existing_path_to_id[existing_path] = str(existing_entry_id)
        fingerprint = str(existing_entry.get("fingerprint") or "").strip()
        if fingerprint:
            existing_fingerprint_to_ids.setdefault(fingerprint, []).append(str(existing_entry_id))
    next_id = max(next_id, _max_entry_id(existing_entries) + 1)
    claimed_entry_ids: set[str] = set()
    seen_paths: set[str] = set()

    if opts.resume:
        checkpoint = load_checkpoint(opts.checkpoint_path)
        if checkpoint and checkpoint.get("root") == root_dir:
            processed_files = dict(checkpoint.get("processedFiles") or {})
            next_id = int(checkpoint.get("nextId") or 0)
            state.errors = int(checkpoint.get("errors") or 0)
            state.skipped = int(checkpoint.get("skipped") or 0)
            state.errors_by_stage = dict(checkpoint.get("errorsByStage") or {})
            if os.path.isfile(opts.partial_index_path):
                try:
                    with open(opts.partial_index_path, "r", encoding="utf-8") as handle:
                        partial = json.load(handle)
                    entries = dict(partial.get("entries") or {})
                    tokens = dict(partial.get("tokens") or {})
                except (OSError, json.JSONDecodeError):
                    entries = {}
                    tokens = {}
    claimed_entry_ids.update(str(entry_id) for entry_id in entries.keys())
    next_id = max(next_id, _max_entry_id(entries) + 1)

    def pick_entry_id(rel_path: str, abs_path: str, signature: dict[str, Any] | None) -> str:
        nonlocal next_id
        path_entry_id = existing_path_to_id.get(rel_path)
        if path_entry_id and path_entry_id not in claimed_entry_ids:
            claimed_entry_ids.add(path_entry_id)
            return path_entry_id
        if signature:
            fingerprint = quick_content_fingerprint(abs_path, int(signature.get("size") or 0))
            if fingerprint:
                for fingerprint_entry_id in existing_fingerprint_to_ids.get(fingerprint) or []:
                    if fingerprint_entry_id in claimed_entry_ids:
                        continue
                    claimed_entry_ids.add(fingerprint_entry_id)
                    return fingerprint_entry_id
        entry_id = str(next_id)
        next_id += 1
        claimed_entry_ids.add(entry_id)
        return entry_id

    file_list = sorted(iter_audio_files(root_dir))
    total_files = len(file_list)
    loop_started = time.time()

    write_progress(opts.progress_path, {
        "phase": "scanning",
        "processed": 0,
        "total": total_files,
        "errors": 0,
        "skipped": 0,
        "startedAt": started_at,
        "updatedAt": _utc_now(),
    })

    executor = ProcessPoolExecutor(max_workers=1)
    try:
        for index, (rel_path, abs_path) in enumerate(file_list):
            signature = _file_signature(abs_path)
            if opts.resume and signature:
                cached = processed_files.get(rel_path)
                if (
                    cached
                    and cached.get("mtime") == signature["mtime"]
                    and cached.get("size") == signature["size"]
                    and cached.get("entryId") in entries
                    and not (entries.get(cached["entryId"]) or {}).get("readIssues")
                ):
                    state.skipped += 1
                    claimed_entry_ids.add(str(cached.get("entryId")))
                    seen_paths.add(rel_path)
                    if (index + 1) % PROGRESS_EVERY == 0 or index + 1 == total_files:
                        elapsed = max(time.time() - loop_started, 0.001)
                        rate = (index + 1) / elapsed
                        write_progress(opts.progress_path, _progress_payload(
                            index + 1, total_files, state, started_at, rel_path, rate,
                        ))
                    continue

            entry_id = pick_entry_id(rel_path, abs_path, signature)

            try:
                entry, issues, reset_executor = process_file_safe(rel_path, abs_path, entry_id, opts, executor)
            except Exception as exc:
                entry = _fallback_entry(rel_path, abs_path, entry_id)
                issues = [{"stage": "process", "error": type(exc).__name__}]
                reset_executor = False
            if reset_executor:
                executor.shutdown(wait=False, cancel_futures=True)
                executor = ProcessPoolExecutor(max_workers=1)
            for issue in issues:
                err = state.record_error(issue.get("stage") or "process", rel_path, Exception(issue.get("error") or "error"))
                error_log.append(err)
            for issue in entry.get("readIssues") or []:
                if issue.get("stage") == "fallback":
                    continue
                err = state.record_error(issue.get("stage") or "read", rel_path, Exception(issue.get("error") or "error"))
                error_log.append(err)

            entries[entry_id] = entry
            seen_paths.add(rel_path)
            if signature:
                processed_files[rel_path] = {
                    "mtime": signature["mtime"],
                    "size": signature["size"],
                    "entryId": entry_id,
                }

            if CHECKPOINT_EVERY > 0 and (index + 1) % CHECKPOINT_EVERY == 0:
                save_checkpoint(
                    opts.checkpoint_path,
                    entries=entries,
                    tokens=tokens,
                    processed_files=processed_files,
                    next_id=next_id,
                    state=state,
                    started_at=started_at,
                    root_dir=root_dir,
                    partial_index_path=opts.partial_index_path,
                )

            if (index + 1) % PROGRESS_EVERY == 0 or index + 1 == total_files:
                elapsed = max(time.time() - loop_started, 0.001)
                rate = (index + 1) / elapsed
                write_progress(opts.progress_path, _progress_payload(
                    index + 1, total_files, state, started_at, rel_path, rate,
                ))
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    entries = {
        str(entry_id): entry
        for entry_id, entry in entries.items()
        if str(entry_id) in claimed_entry_ids
        and isinstance(entry, dict)
        and str(entry.get("path") or "") in seen_paths
    }
    processed_files = {
        str(path): meta
        for path, meta in processed_files.items()
        if str(path) in seen_paths and str((meta or {}).get("entryId") or "") in entries
    }
    tokens = _rebuild_tokens(entries)

    stats = build_collection_stats(entries)
    if isinstance(stats, dict):
        stats["readErrors"] = state.errors
        stats["skipped"] = state.skipped
        stats["errorsByStage"] = dict(state.errors_by_stage)
        stats["partialTags"] = sum(1 for e in entries.values() if (e or {}).get("readIssues"))

    finished_at = _utc_now()
    return {
        "version": 2,
        "builtAt": finished_at,
        "startedAt": started_at,
        "root": root_dir,
        "count": len(entries),
        "entries": entries,
        "tokens": tokens,
        "stats": stats,
        "indexName": MUSIC_COLLECTION_INDEX_NAME,
    }


def _progress_payload(
    processed: int,
    total: int,
    state: BuildState,
    started_at: str,
    current_path: str,
    rate: float,
) -> dict[str, Any]:
    remaining = max(total - processed, 0)
    eta = int(remaining / rate) if rate > 0 else None
    payload = {
        "phase": "scanning",
        "processed": processed,
        "total": total,
        "errors": state.errors,
        "skipped": state.skipped,
        "errorsTotal": state.errors,
        "startedAt": started_at,
        "updatedAt": _utc_now(),
        "currentPath": current_path,
        "ratePerSecond": round(rate, 2),
    }
    if eta is not None:
        payload["etaSeconds"] = eta
    if state.last_error:
        payload["lastError"] = state.last_error
    return payload


def run_build(
    opts: IndexBuildOptions,
    *,
    index_output_path: str,
    stats_output_path: str,
    acquire_lock: bool = True,
) -> dict[str, Any]:
    started = time.time()
    lock = BuildLock(opts.lock_path) if acquire_lock else None
    try:
        if lock is not None:
            lock.acquire()
        write_progress(opts.progress_path, {
            "phase": "starting",
            "processed": 0,
            "total": 0,
            "startedAt": _utc_now(),
        })
        index = build_index(opts)
        write_progress(opts.progress_path, {
            "phase": "writing",
            "processed": index.get("count") or 0,
            "total": index.get("count") or 0,
            "startedAt": index.get("startedAt"),
            "updatedAt": _utc_now(),
        })
        atomic_write_json(index_output_path, index)
        stats_payload = {
            "version": 2,
            "builtAt": index.get("builtAt"),
            "startedAt": index.get("startedAt"),
            "root": index.get("root"),
            "count": index.get("count"),
            "stats": index.get("stats") or {},
        }
        atomic_write_json(stats_output_path, stats_payload)
        write_progress(opts.progress_path, {
            "phase": "complete",
            "processed": index.get("count") or 0,
            "total": index.get("count") or 0,
            "errors": (index.get("stats") or {}).get("readErrors", 0),
            "skipped": (index.get("stats") or {}).get("skipped", 0),
            "startedAt": index.get("startedAt"),
            "finishedAt": index.get("builtAt"),
            "durationSeconds": round(time.time() - started, 1),
            "statsPath": stats_output_path,
            "indexPath": index_output_path,
        })
        try:
            if os.path.isfile(opts.checkpoint_path):
                os.unlink(opts.checkpoint_path)
            if os.path.isfile(opts.partial_index_path):
                os.unlink(opts.partial_index_path)
        except OSError:
            pass
        return index
    except Exception as exc:
        write_progress(opts.progress_path, {
            "phase": "failed",
            "error": str(exc)[:500],
            "errorType": type(exc).__name__,
            "updatedAt": _utc_now(),
        })
        raise
    finally:
        if lock is not None:
            lock.release()
