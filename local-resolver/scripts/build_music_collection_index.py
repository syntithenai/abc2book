#!/usr/bin/env python3
"""Build a searchable index for the personal music collection library."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from music_collection import (  # noqa: E402
    AUDIO_EXTENSIONS,
    MUSIC_COLLECTION_ART_DIR_NAME,
    MUSIC_COLLECTION_INDEX_NAME,
    MUSIC_COLLECTION_STATS_NAME,
    _tokenize_index_text,
    title_artist_from_filename,
    title_from_audio_relative_path,
)
from music_collection_analytics import (  # noqa: E402
    build_collection_stats,
    file_timestamps,
    metadata_sources,
    quick_content_fingerprint,
    read_playback_info,
    read_standard_tags,
    soft_duplicate_key,
)


def _first_text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        for item in value:
            text = _first_text(item)
            if text:
                return text
        return ""
    return str(value).strip()


def _read_tags(abs_path):
    try:
        from mutagen import File as MutagenFile
    except ImportError as exc:
        raise SystemExit("mutagen is required: pip install mutagen") from exc

    try:
        audio = MutagenFile(abs_path)
    except Exception:
        return {}, [], {}, {}

    if audio is None:
        return {}, [], {}, {}

    tags = audio.tags or {}
    standard, tag_keys = read_standard_tags(tags)
    playback = read_playback_info(tags)

    duration = None
    if hasattr(audio, "info") and audio.info is not None:
        try:
            duration = float(getattr(audio.info, "length", 0) or 0)
        except (TypeError, ValueError):
            duration = None
    standard["duration"] = duration

    extra_tags = {}
    if hasattr(tags, "items"):
        for key, value in tags.items():
            key_text = str(key)
            normalized = key_text.lower()
            if normalized in {
                "title", "artist", "album", "albumartist", "performer", "genre",
                "date", "originaldate", "composer", "tracknumber", "discnumber",
            }:
                continue
            text = _first_text(value)
            if text:
                extra_tags[key_text] = text[:200]

    return standard, tag_keys, playback, extra_tags


def _extract_art(abs_path, entry_id, art_dir):
    try:
        from mutagen import File as MutagenFile
    except ImportError:
        return False

    audio = MutagenFile(abs_path)
    if audio is None:
        return False

    pictures = []
    if hasattr(audio, "tags") and audio.tags is not None:
        for key in ("APIC:", "APIC", "covr", "METADATA_BLOCK_PICTURE"):
            value = audio.tags.get(key)
            if value is None:
                continue
            if isinstance(value, list):
                pictures.extend(value)
            else:
                pictures.append(value)

    for picture in pictures:
        data = getattr(picture, "data", None) or getattr(picture, "image", None)
        if not data:
            continue
        mime = str(getattr(picture, "mime", "") or "").lower()
        ext = ".jpg"
        if "png" in mime:
            ext = ".png"
        elif "webp" in mime:
            ext = ".webp"
        os.makedirs(art_dir, exist_ok=True)
        out_path = os.path.join(art_dir, str(entry_id) + ext)
        with open(out_path, "wb") as handle:
            handle.write(data)
        return True
    return False


def iter_audio_files(root_dir):
    for dirpath, _dirnames, filenames in os.walk(root_dir):
        if MUSIC_COLLECTION_ART_DIR_NAME in dirpath.replace("\\", "/").split("/"):
            continue
        for filename in filenames:
            lower = filename.lower()
            ext = os.path.splitext(lower)[1]
            if ext in AUDIO_EXTENSIONS:
                abs_path = os.path.join(dirpath, filename)
                rel_path = os.path.relpath(abs_path, root_dir).replace("\\", "/")
                yield rel_path, abs_path


def _write_progress(progress_path, payload):
    if not progress_path:
        return
    try:
        os.makedirs(os.path.dirname(progress_path), exist_ok=True)
        with open(progress_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
    except OSError:
        pass


def build_index(root_dir, extract_art=True, art_dir=None, output_dir=None, progress_path=None):
    entries = {}
    tokens = {}
    next_id = 0
    art_dir = art_dir or os.path.join(root_dir, MUSIC_COLLECTION_ART_DIR_NAME)
    output_dir = output_dir or root_dir
    started_at = datetime.now(tz=timezone.utc).isoformat()
    file_list = sorted(iter_audio_files(root_dir))
    total_files = len(file_list)

    for index, (rel_path, abs_path) in enumerate(file_list):
        entry_id = str(next_id)
        next_id += 1

        tags, tag_keys, playback, extra_tags = _read_tags(abs_path)
        filename = os.path.basename(rel_path)
        fallback_title, fallback_artist = title_artist_from_filename(filename)
        title = tags.get("title") or fallback_title or title_from_audio_relative_path(rel_path)
        artist = tags.get("artist") or fallback_artist
        album = tags.get("album") or ""
        category = ""
        parts = rel_path.split("/")
        if len(parts) > 1:
            category = parts[0]

        timestamps = file_timestamps(abs_path)
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

        has_art = False
        if extract_art:
            has_art = _extract_art(abs_path, entry_id, art_dir)

        fingerprint = quick_content_fingerprint(abs_path, size)
        entry = {
            "title": title,
            "artist": artist,
            "album": album,
            "path": rel_path,
            "category": category,
            "duration": duration,
            "year": resolved["year"],
            "genre": resolved["genre"],
            "composer": resolved["composer"],
            "tracknumber": resolved["tracknumber"],
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
        }
        entries[entry_id] = entry

        token_source = " ".join([
            title,
            artist,
            album,
            rel_path.replace("/", " "),
            category,
            resolved["genre"],
            resolved["composer"],
        ])
        for token in _tokenize_index_text(token_source):
            bucket = tokens.setdefault(token, [])
            bucket.append(entry_id)

        if progress_path and (index == 0 or (index + 1) % 500 == 0 or index + 1 == total_files):
            _write_progress(progress_path, {
                "phase": "scanning",
                "processed": index + 1,
                "total": total_files,
                "startedAt": started_at,
                "updatedAt": datetime.now(tz=timezone.utc).isoformat(),
            })

    stats = build_collection_stats(entries)
    finished_at = datetime.now(tz=timezone.utc).isoformat()
    return {
        "version": 2,
        "builtAt": finished_at,
        "startedAt": started_at,
        "root": os.path.abspath(root_dir),
        "count": len(entries),
        "entries": entries,
        "tokens": tokens,
        "stats": stats,
        "indexName": MUSIC_COLLECTION_INDEX_NAME,
    }


def main():
    parser = argparse.ArgumentParser(description="Build music_collection_index.json")
    parser.add_argument(
        "root",
        nargs="?",
        default=os.getenv(
            "MUSIC_COLLECTION_DIR",
            os.path.abspath(os.path.join(ROOT, "music-collection")),
        ),
        help="Music collection root directory",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output index path (default: <metadata-dir>/music_collection_index.json)",
    )
    parser.add_argument(
        "--no-art",
        action="store_true",
        help="Skip embedded album art extraction",
    )
    args = parser.parse_args()

    root_dir = os.path.abspath(args.root)
    if not os.path.isdir(root_dir):
        print("Music collection directory not found:", root_dir, file=sys.stderr)
        return 1

    metadata_dir = os.path.abspath(
        os.getenv("MUSIC_COLLECTION_INDEX_DIR", "").strip() or root_dir
    )
    progress_path = os.path.join(metadata_dir, "build_progress.json")
    _write_progress(progress_path, {
        "phase": "starting",
        "processed": 0,
        "total": 0,
        "startedAt": datetime.now(tz=timezone.utc).isoformat(),
    })

    started = time.time()
    index = build_index(
        root_dir,
        extract_art=not args.no_art,
        art_dir=os.path.join(metadata_dir, MUSIC_COLLECTION_ART_DIR_NAME),
        output_dir=metadata_dir,
        progress_path=progress_path,
    )
    output_path = os.path.abspath(args.output or os.path.join(metadata_dir, MUSIC_COLLECTION_INDEX_NAME))
    stats_path = os.path.join(metadata_dir, MUSIC_COLLECTION_STATS_NAME)

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(index, handle, separators=(",", ":"))

    stats_payload = {
        "version": 2,
        "builtAt": index.get("builtAt"),
        "startedAt": index.get("startedAt"),
        "root": index.get("root"),
        "count": index.get("count"),
        "stats": index.get("stats") or {},
    }
    with open(stats_path, "w", encoding="utf-8") as handle:
        json.dump(stats_payload, handle, separators=(",", ":"))

    _write_progress(progress_path, {
        "phase": "complete",
        "processed": index.get("count") or 0,
        "total": index.get("count") or 0,
        "startedAt": index.get("startedAt"),
        "finishedAt": index.get("builtAt"),
        "durationSeconds": round(time.time() - started, 1),
        "statsPath": stats_path,
        "indexPath": output_path,
    })

    print("Wrote", output_path)
    print("Wrote", stats_path)
    print("Entries:", index.get("count", 0))
    print("Tokens:", len(index.get("tokens") or {}))
    stats = index.get("stats") or {}
    metadata = stats.get("metadata") or {}
    duplicates = stats.get("duplicates") or {}
    print("Tagged title:", metadata.get("taggedTitle"), "/", metadata.get("tracks"))
    print("Exact duplicate extras:", (duplicates.get("exact") or {}).get("extraCopies"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
