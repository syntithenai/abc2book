"""Browse and filter music collection index entries."""

from __future__ import annotations

from collections import defaultdict
import threading
import time

from music_collection import load_music_collection_index
from music_collection_curation import triage_map
from music_collection_registry import (
    is_preserved_path,
    load_music_collection_registry,
    path_under_prefix,
)

_CACHE_LOCK = threading.Lock()
_REGISTRY_CACHE = None
_REGISTRY_CACHE_STAMP = 0.0

_TRIAGE_CACHE = None
_TRIAGE_CACHE_STAMP = 0.0
_TRIAGE_CACHE_TTL_SECONDS = 5.0

_TREE_DEFAULT_CACHE_STAMP = None
_TREE_DEFAULT_CHILDREN_BY_PREFIX = None
_TREE_DEFAULT_PATH_BY_PREFIX_AND_CHILD = None
_TREE_DEFAULT_TRACK_IDS_BY_PREFIX = None
_TREE_DEFAULT_TRACK_IDS_BY_PATH = None

_ALBUMS_DEFAULT_CACHE_STAMP = None
_ALBUMS_DEFAULT_SORTED = None

_GENRES_DEFAULT_CACHE_STAMP = None
_GENRES_DEFAULT_SORTED = None

_ARTISTS_DEFAULT_CACHE_STAMP = None
_ARTISTS_DEFAULT_SORTED = None


def _cache_index_stamp(index) -> str:
    # music_collection.load_music_collection_index includes builtAt; fall back
    # to entry count so we invalidate on a rebuild.
    try:
        built_at = (index or {}).get("builtAt")
        if built_at:
            return str(built_at)
    except Exception:
        pass
    entries = (index or {}).get("entries") or {}
    return "entries=" + str(len(entries))


def _get_registry_cached():
    global _REGISTRY_CACHE, _REGISTRY_CACHE_STAMP
    # Registry changes are rare; keep it until the process restarts.
    # The cost is dominated by iterating entries, not registry IO.
    with _CACHE_LOCK:
        if _REGISTRY_CACHE is not None:
            return _REGISTRY_CACHE
        _REGISTRY_CACHE = load_music_collection_registry() or {}
        _REGISTRY_CACHE_STAMP = time.time()
        return _REGISTRY_CACHE


def _get_triage_cached():
    global _TRIAGE_CACHE, _TRIAGE_CACHE_STAMP
    now = time.time()
    with _CACHE_LOCK:
        if _TRIAGE_CACHE is not None and (now - _TRIAGE_CACHE_STAMP) < _TRIAGE_CACHE_TTL_SECONDS:
            return _TRIAGE_CACHE
        _TRIAGE_CACHE = triage_map() or {}
        _TRIAGE_CACHE_STAMP = now
        return _TRIAGE_CACHE


def _ensure_tree_default_precomputed():
    """Precompute tree children + direct tracks for the common case query=''.

    Applies only for requests without phase/query/triage filters/unplayed_only.
    """
    global _TREE_DEFAULT_CACHE_STAMP
    global _TREE_DEFAULT_CHILDREN_BY_PREFIX, _TREE_DEFAULT_TRACK_IDS_BY_PREFIX

    index = load_music_collection_index() or {}
    stamp = _cache_index_stamp(index)
    with _CACHE_LOCK:
        if _TREE_DEFAULT_CACHE_STAMP == stamp and _TREE_DEFAULT_CHILDREN_BY_PREFIX is not None:
            return

        entries = index.get("entries") or {}

        children_by_prefix = defaultdict(lambda: defaultdict(int))
        path_by_child_key = defaultdict(dict)
        tracks_by_prefix = defaultdict(list)
        tracks_by_path = defaultdict(list)

        for entry_id, entry in entries.items():
            if not isinstance(entry, dict):
                continue
            path = str(entry.get("path") or "").replace("\\", "/").strip("/")
            if not path:
                continue
            parts = path.split("/")
            if len(parts) == 1:
                # A top-level file lives at prefix ''.
                tracks_by_prefix[""].append(entry_id)
                tracks_by_path[path].append(entry_id)
                continue

            # Folder children: (prefix, child) where child is the next segment.
            # prefix is join(parts[:k]) for k in [0, len(parts)-2].
            for k in range(0, len(parts) - 1):
                prefix = "/".join(parts[:k])
                child_path = "/".join(parts[: k + 1])
                child_key = child_path.lower()
                children_by_prefix[prefix][child_key] += 1
                path_by_child_key[prefix][child_key] = child_path

            # Direct tracks: files directly under their parent folder prefix.
            track_prefix = "/".join(parts[:-1])
            tracks_by_prefix[track_prefix].append(entry_id)
            tracks_by_path[path].append(entry_id)

        _TREE_DEFAULT_CACHE_STAMP = stamp
        _TREE_DEFAULT_CHILDREN_BY_PREFIX = children_by_prefix
        _TREE_DEFAULT_PATH_BY_PREFIX_AND_CHILD = path_by_child_key
        _TREE_DEFAULT_TRACK_IDS_BY_PREFIX = tracks_by_prefix
        _TREE_DEFAULT_TRACK_IDS_BY_PATH = tracks_by_path


def _ensure_albums_genres_default_precomputed(kind: str):
    index = load_music_collection_index() or {}
    stamp = _cache_index_stamp(index)

    if kind == "album":
        global _ALBUMS_DEFAULT_CACHE_STAMP, _ALBUMS_DEFAULT_SORTED
        with _CACHE_LOCK:
            if _ALBUMS_DEFAULT_CACHE_STAMP == stamp and _ALBUMS_DEFAULT_SORTED is not None:
                return
            groups = defaultdict(lambda: {"label": "", "trackCount": 0, "samplePaths": []})
            entries = index.get("entries") or {}
            for entry_id, entry in entries.items():
                if not isinstance(entry, dict):
                    continue
                label = str(entry.get("album") or "").strip()
                if not label:
                    continue
                bucket = groups[label.lower()]
                bucket["label"] = label
                bucket["trackCount"] += 1
                if len(bucket["samplePaths"]) < 3:
                    bucket["samplePaths"].append(entry.get("path") or "")
            results = []
            for row in groups.values():
                results.append({
                    "album": row["label"],
                    "trackCount": row["trackCount"],
                    "samplePaths": row["samplePaths"],
                })
            results.sort(key=lambda item: (
                -(item.get("trackCount") or 0),
                str(item.get("album") or "").lower(),
            ))
            _ALBUMS_DEFAULT_CACHE_STAMP = stamp
            _ALBUMS_DEFAULT_SORTED = results
        return

    if kind == "genre":
        global _GENRES_DEFAULT_CACHE_STAMP, _GENRES_DEFAULT_SORTED
        with _CACHE_LOCK:
            if _GENRES_DEFAULT_CACHE_STAMP == stamp and _GENRES_DEFAULT_SORTED is not None:
                return
            groups = defaultdict(lambda: {"label": "", "trackCount": 0, "samplePaths": []})
            entries = index.get("entries") or {}
            for entry_id, entry in entries.items():
                if not isinstance(entry, dict):
                    continue
                label = str(entry.get("genre") or "").strip()
                if not label:
                    continue
                bucket = groups[label.lower()]
                bucket["label"] = label
                bucket["trackCount"] += 1
                if len(bucket["samplePaths"]) < 3:
                    bucket["samplePaths"].append(entry.get("path") or "")
            results = []
            for row in groups.values():
                results.append({
                    "genre": row["label"],
                    "trackCount": row["trackCount"],
                    "samplePaths": row["samplePaths"],
                })
            results.sort(key=lambda item: (
                -(item.get("trackCount") or 0),
                str(item.get("genre") or "").lower(),
            ))
            _GENRES_DEFAULT_CACHE_STAMP = stamp
            _GENRES_DEFAULT_SORTED = results
        return


def _ensure_artists_default_precomputed():
    """Precompute aggregate artists for the common case with no filters.

    Includes triage counts because this endpoint is shared with the curator UI.
    """
    global _ARTISTS_DEFAULT_CACHE_STAMP, _ARTISTS_DEFAULT_SORTED
    index = load_music_collection_index() or {}
    index_stamp = _cache_index_stamp(index)
    triage = _get_triage_cached()
    triage_stamp = str(_TRIAGE_CACHE_STAMP)
    stamp = index_stamp + "|triage=" + triage_stamp

    with _CACHE_LOCK:
        if _ARTISTS_DEFAULT_CACHE_STAMP == stamp and _ARTISTS_DEFAULT_SORTED is not None:
            return

        entries = index.get("entries") or {}
        groups = defaultdict(lambda: {
            "artist": "",
            "trackCount": 0,
            "keepCount": 0,
            "maybeCount": 0,
            "cullCount": 0,
            "unsetCount": 0,
            "totalPlayCount": 0,
            "entryIds": [],
            "samplePaths": [],
        })

        for entry_id, entry in entries.items():
            if not isinstance(entry, dict):
                continue
            artist = str(entry.get("artist") or "").strip() or "Unknown artist"
            bucket = groups[artist.lower()]
            bucket["artist"] = artist
            bucket["trackCount"] += 1
            bucket["entryIds"].append(entry_id)
            status = (triage.get(entry_id) or {}).get("status") or "unset"
            if status == "keep":
                bucket["keepCount"] += 1
            elif status == "maybe":
                bucket["maybeCount"] += 1
            elif status == "cull":
                bucket["cullCount"] += 1
            else:
                bucket["unsetCount"] += 1
            play_count = entry.get("playCount")
            if isinstance(play_count, int) and play_count > 0:
                bucket["totalPlayCount"] += play_count
            if len(bucket["samplePaths"]) < 3:
                bucket["samplePaths"].append(entry.get("path") or "")

        results = []
        for row in groups.values():
            results.append({
                "artist": row["artist"],
                "trackCount": row["trackCount"],
                "keepCount": row["keepCount"],
                "maybeCount": row["maybeCount"],
                "cullCount": row["cullCount"],
                "unsetCount": row["unsetCount"],
                "totalPlayCount": row["totalPlayCount"],
                "samplePaths": row["samplePaths"],
                "entryIds": row["entryIds"],
            })

        results.sort(key=lambda item: (
            -(item.get("unsetCount") or 0),
            -(item.get("trackCount") or 0),
            str(item.get("artist") or "").lower(),
        ))

        _ARTISTS_DEFAULT_CACHE_STAMP = stamp
        _ARTISTS_DEFAULT_SORTED = results



def _entry_matches_phase(entry, phase, registry):
    if not phase:
        return True
    entry_phase = str(entry.get("phase") or "").strip()
    if entry_phase == phase:
        return True
    path = str(entry.get("path") or "")
    phase_cfg = (registry.get("phases") or {}).get(phase) or {}
    for source in phase_cfg.get("sources") or []:
        if path_under_prefix(path, source):
            return True
    if phase == "remainder":
        known = set()
        for pid, pdata in (registry.get("phases") or {}).items():
            if pid == "remainder":
                continue
            for source in pdata.get("sources") or []:
                known.add(source.lower())
        for prefix in known:
            if path_under_prefix(path, prefix):
                return False
        return True
    return False


def _phase_source_prefixes(phase, registry):
    if not phase:
        return []
    phase_cfg = (registry.get("phases") or {}).get(phase) or {}
    return list(phase_cfg.get("sources") or [])


def resolve_chunk_key(rel_path, registry=None, phase=""):
    """Best shelf label for a file path within a phase."""
    path = str(rel_path or "").replace("\\", "/").strip("/")
    if not path:
        return "unknown"
    reg = registry or load_music_collection_registry()
    for source in _phase_source_prefixes(phase, reg):
        if path_under_prefix(path, source):
            return source
    parts = path.split("/")
    if len(parts) >= 2:
        return parts[0] + "/" + parts[1]
    return parts[0]


def _iter_filtered_entries(*, phase="", query="", triage_status="", unplayed_only=False):
    index = load_music_collection_index() or {}
    entries = index.get("entries") or {}
    registry = _get_registry_cached()
    # Avoid caching here so unit tests (and any admin triage changes) are
    # reflected immediately for scan-based filtered requests.
    triage = triage_map()
    query_l = str(query or "").strip().lower()
    triage_filter = str(triage_status or "").strip().lower()

    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        if phase and not _entry_matches_phase(entry, phase, registry):
            continue
        trow = triage.get(entry_id) or {}
        if triage_filter and trow.get("status") != triage_filter:
            continue
        if unplayed_only:
            play_count = entry.get("playCount")
            if isinstance(play_count, int) and play_count > 0:
                continue
        if query_l:
            hay = " ".join([
                str(entry.get("title") or ""),
                str(entry.get("artist") or ""),
                str(entry.get("album") or ""),
                str(entry.get("path") or ""),
                str(entry.get("genre") or ""),
            ]).lower()
            if query_l not in hay:
                continue
        yield entry_id, entry, trow


def normalize_path_prefix(prefix):
    path = str(prefix or "").replace("\\", "/").strip("/")
    return path


def _entry_under_path_prefix(entry, path_prefix):
    prefix = normalize_path_prefix(path_prefix)
    if not prefix:
        return True
    path = str(entry.get("path") or "").replace("\\", "/").strip("/")
    return path == prefix or path.startswith(prefix + "/")


def list_music_collection_tree_children(*, prefix="", query=""):
    # Fast path: the common case for browse tree is prefix drill-down with
    # query='' and no extra filters. We can answer from a precomputed tree index.
    if not str(query or "").strip():
        path_prefix = normalize_path_prefix(prefix)
        _ensure_tree_default_precomputed()
        children_by_prefix = _TREE_DEFAULT_CHILDREN_BY_PREFIX or {}
        path_by_child_key = _TREE_DEFAULT_PATH_BY_PREFIX_AND_CHILD or {}
        tracks_by_prefix = _TREE_DEFAULT_TRACK_IDS_BY_PREFIX or {}
        tracks_by_path = _TREE_DEFAULT_TRACK_IDS_BY_PATH or {}

        prefix_key = path_prefix
        direct_track_ids = tracks_by_prefix.get(prefix_key) or []
        exact_match_ids = tracks_by_path.get(prefix_key) or []
        # Include tracks whose parent folder prefix matches; this matches the
        # semantics of the scan-based implementation for prefix drill-down.
        index = load_music_collection_index() or {}
        entries = index.get("entries") or {}
        triage = _get_triage_cached()
        folders = []
        for child_key, count in (children_by_prefix.get(prefix_key) or {}).items():
            child_path = (path_by_child_key.get(prefix_key) or {}).get(child_key) or child_key
            folders.append({
                "name": child_path.split("/")[-1] if "/" in child_path else child_path,
                "path": child_path,
                "trackCount": count,
            })
        # Reorder like scan-based version
        folders.sort(key=lambda item: str(item.get("name") or "").lower())

        tracks = []
        for entry_id in exact_match_ids + direct_track_ids:
            entry = entries.get(entry_id) or {}
            if not isinstance(entry, dict):
                continue
            item = dict(entry)
            item["id"] = entry_id
            item["triageStatus"] = (triage.get(entry_id) or {}).get("status") or "unset"
            item["triageNote"] = (triage.get(entry_id) or {}).get("note") or ""
            tracks.append(item)
        tracks.sort(key=lambda item: (str(item.get("title") or "").lower(), str(item.get("path") or "")))

        return {"prefix": path_prefix, "folders": folders, "tracks": tracks}

    path_prefix = normalize_path_prefix(prefix)
    folder_counts = defaultdict(int)
    folder_names = {}
    tracks = []

    for entry_id, entry, trow in _iter_filtered_entries(query=query):
        path = str(entry.get("path") or "").replace("\\", "/").strip("/")
        if not path:
            continue
        if path_prefix:
            if path == path_prefix:
                item = dict(entry)
                item["id"] = entry_id
                item["triageStatus"] = trow.get("status") or "unset"
                item["triageNote"] = trow.get("note") or ""
                tracks.append(item)
                continue
            if not path.startswith(path_prefix + "/"):
                continue
            remainder = path[len(path_prefix) + 1:]
        else:
            remainder = path

        if not remainder:
            continue
        parts = remainder.split("/")
        if len(parts) == 1:
            item = dict(entry)
            item["id"] = entry_id
            item["triageStatus"] = trow.get("status") or "unset"
            item["triageNote"] = trow.get("note") or ""
            tracks.append(item)
        else:
            child_name = parts[0]
            child_path = (path_prefix + "/" + child_name) if path_prefix else child_name
            key = child_path.lower()
            folder_counts[key] += 1
            folder_names[key] = child_path

    folders = []
    for key, count in folder_counts.items():
        child_path = folder_names.get(key) or key
        folders.append({
            "name": child_path.split("/")[-1] if "/" in child_path else child_path,
            "path": child_path,
            "trackCount": count,
        })
    folders.sort(key=lambda item: str(item.get("name") or "").lower())
    tracks.sort(key=lambda item: (
        str(item.get("title") or "").lower(),
        str(item.get("path") or ""),
    ))

    return {
        "prefix": path_prefix,
        "folders": folders,
        "tracks": tracks,
    }


def _aggregate_metadata_field(field_name, label_key, *, phase="", query="", limit=50, offset=0):
    # Fast path: only support for default slice (no phase, no triage filters).
    # browse UI uses phase='' and triage_status='' for album/genre shelves.
    if not str(query or "").strip() and not phase:
        if label_key == "album":
            _ensure_albums_genres_default_precomputed("album")
            all_rows = _ALBUMS_DEFAULT_SORTED or []
        elif label_key == "genre":
            _ensure_albums_genres_default_precomputed("genre")
            all_rows = _GENRES_DEFAULT_SORTED or []
        else:
            all_rows = []

        total = len(all_rows)
        start = max(int(offset or 0), 0)
        end = start + max(int(limit or 50), 1)
        sliced = all_rows[start:end]
        if label_key == "album":
            return {
                "total": total,
                "offset": start,
                "limit": limit,
                "albums": sliced,
            }
        if label_key == "genre":
            return {
                "total": total,
                "offset": start,
                "limit": limit,
                "genres": sliced,
            }

    groups = defaultdict(lambda: {
        label_key: "",
        "trackCount": 0,
        "samplePaths": [],
    })

    for entry_id, entry, trow in _iter_filtered_entries(phase=phase, query=query):
        label = str(entry.get(field_name) or "").strip()
        if not label:
            continue
        bucket = groups[label.lower()]
        bucket[label_key] = label
        bucket["trackCount"] += 1
        if len(bucket["samplePaths"]) < 3:
            bucket["samplePaths"].append(entry.get("path") or "")

    results = []
    for row in groups.values():
        results.append({
            label_key: row[label_key],
            "trackCount": row["trackCount"],
            "samplePaths": row["samplePaths"],
        })

    results.sort(key=lambda item: (
        -(item.get("trackCount") or 0),
        str(item.get(label_key) or "").lower(),
    ))
    total = len(results)
    start = max(int(offset or 0), 0)
    end = start + max(int(limit or 50), 1)
    return {
        "total": total,
        "offset": start,
        "limit": limit,
        label_key + "s": results[start:end],
    }


def aggregate_albums(*, phase="", query="", limit=50, offset=0):
    body = _aggregate_metadata_field("album", "album", phase=phase, query=query, limit=limit, offset=offset)
    return body


def aggregate_genres(*, phase="", query="", limit=50, offset=0):
    body = _aggregate_metadata_field("genre", "genre", phase=phase, query=query, limit=limit, offset=offset)
    return body


def _triage_counts_for_ids(entry_ids, triage):
    counts = {"keep": 0, "maybe": 0, "cull": 0, "unset": 0}
    for entry_id in entry_ids:
        status = (triage.get(entry_id) or {}).get("status") or "unset"
        if status not in counts:
            status = "unset"
        counts[status] += 1
    return counts


def aggregate_artists(*, phase="", query="", limit=50, offset=0):
    # Fast path: common case (no phase filter and empty query).
    if not str(query or "").strip() and not phase:
        _ensure_artists_default_precomputed()
        all_rows = _ARTISTS_DEFAULT_SORTED or []
        total = len(all_rows)
        start = max(int(offset or 0), 0)
        end = start + max(int(limit or 50), 1)
        return {
            "total": total,
            "offset": start,
            "limit": limit,
            "artists": all_rows[start:end],
        }

    registry = load_music_collection_registry()
    triage = triage_map()
    groups = defaultdict(lambda: {
        "artist": "",
        "trackCount": 0,
        "keepCount": 0,
        "maybeCount": 0,
        "cullCount": 0,
        "unsetCount": 0,
        "totalPlayCount": 0,
        "entryIds": [],
        "samplePaths": [],
    })

    for entry_id, entry, trow in _iter_filtered_entries(phase=phase, query=query):
        artist = str(entry.get("artist") or "").strip() or "Unknown artist"
        bucket = groups[artist.lower()]
        bucket["artist"] = artist
        bucket["trackCount"] += 1
        bucket["entryIds"].append(entry_id)
        status = trow.get("status") or "unset"
        if status == "keep":
            bucket["keepCount"] += 1
        elif status == "maybe":
            bucket["maybeCount"] += 1
        elif status == "cull":
            bucket["cullCount"] += 1
        else:
            bucket["unsetCount"] += 1
        play_count = entry.get("playCount")
        if isinstance(play_count, int) and play_count > 0:
            bucket["totalPlayCount"] += play_count
        if len(bucket["samplePaths"]) < 3:
            bucket["samplePaths"].append(entry.get("path") or "")

    results = []
    for row in groups.values():
        results.append({
            "artist": row["artist"],
            "trackCount": row["trackCount"],
            "keepCount": row["keepCount"],
            "maybeCount": row["maybeCount"],
            "cullCount": row["cullCount"],
            "unsetCount": row["unsetCount"],
            "totalPlayCount": row["totalPlayCount"],
            "samplePaths": row["samplePaths"],
        })

    results.sort(key=lambda item: (
        -(item.get("unsetCount") or 0),
        -(item.get("trackCount") or 0),
        str(item.get("artist") or "").lower(),
    ))
    total = len(results)
    start = max(int(offset or 0), 0)
    end = start + max(int(limit or 50), 1)
    return {"total": total, "offset": start, "limit": limit, "artists": results[start:end]}


def aggregate_chunks(*, phase="", query="", limit=50, offset=0):
    registry = load_music_collection_registry()
    groups = defaultdict(lambda: {
        "chunk": "",
        "trackCount": 0,
        "keepCount": 0,
        "maybeCount": 0,
        "cullCount": 0,
        "unsetCount": 0,
        "totalPlayCount": 0,
        "preserved": False,
        "samplePaths": [],
    })

    for entry_id, entry, trow in _iter_filtered_entries(phase=phase, query=query):
        path = str(entry.get("path") or "")
        chunk = resolve_chunk_key(path, registry, phase)
        bucket = groups[chunk.lower()]
        bucket["chunk"] = chunk
        bucket["preserved"] = is_preserved_path(path, registry)
        bucket["trackCount"] += 1
        status = trow.get("status") or "unset"
        if status == "keep":
            bucket["keepCount"] += 1
        elif status == "maybe":
            bucket["maybeCount"] += 1
        elif status == "cull":
            bucket["cullCount"] += 1
        else:
            bucket["unsetCount"] += 1
        play_count = entry.get("playCount")
        if isinstance(play_count, int) and play_count > 0:
            bucket["totalPlayCount"] += play_count
        if len(bucket["samplePaths"]) < 3:
            bucket["samplePaths"].append(path)

    results = []
    for row in groups.values():
        results.append({
            "chunk": row["chunk"],
            "trackCount": row["trackCount"],
            "keepCount": row["keepCount"],
            "maybeCount": row["maybeCount"],
            "cullCount": row["cullCount"],
            "unsetCount": row["unsetCount"],
            "totalPlayCount": row["totalPlayCount"],
            "preserved": row["preserved"],
            "samplePaths": row["samplePaths"],
        })

    results.sort(key=lambda item: (
        -(item.get("unsetCount") or 0),
        -(item.get("trackCount") or 0),
        str(item.get("chunk") or "").lower(),
    ))
    total = len(results)
    start = max(int(offset or 0), 0)
    end = start + max(int(limit or 50), 1)
    return {"total": total, "offset": start, "limit": limit, "chunks": results[start:end]}


def browse_music_collection(
    *,
    phase="",
    genre="",
    artist="",
    album="",
    collection_id="",
    triage_status="",
    unplayed_only=False,
    query="",
    path_prefix="",
    limit=50,
    offset=0,
):
    genre_l = str(genre or "").strip().lower()
    artist_l = str(artist or "").strip().lower()
    album_l = str(album or "").strip().lower()
    collection_l = str(collection_id or "").strip().lower()

    results = []
    for entry_id, entry, trow in _iter_filtered_entries(
        phase=phase,
        query=query,
        triage_status=triage_status,
        unplayed_only=unplayed_only,
    ):
        if not _entry_under_path_prefix(entry, path_prefix):
            continue
        if genre_l and genre_l not in str(entry.get("genre") or "").lower():
            continue
        if artist_l and artist_l not in str(entry.get("artist") or "").lower():
            continue
        if album_l and album_l not in str(entry.get("album") or "").lower():
            continue
        if collection_l and collection_l != str(entry.get("collectionId") or "").lower():
            continue
        item = dict(entry)
        item["id"] = entry_id
        item["triageStatus"] = trow.get("status") or "unset"
        item["triageNote"] = trow.get("note") or ""
        results.append(item)

    results.sort(key=lambda item: (
        str(item.get("artist") or "").lower(),
        str(item.get("title") or "").lower(),
        str(item.get("path") or ""),
    ))
    total = len(results)
    start = max(int(offset or 0), 0)
    end = start + max(int(limit or 50), 1)
    return {"total": total, "offset": start, "limit": limit, "entries": results[start:end]}
