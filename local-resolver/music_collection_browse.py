"""Browse and filter music collection index entries."""

from __future__ import annotations

from collections import defaultdict

from music_collection import load_music_collection_index
from music_collection_curation import triage_map
from music_collection_registry import (
    is_preserved_path,
    load_music_collection_registry,
    path_under_prefix,
)


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
    registry = load_music_collection_registry()
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
                str(entry.get("path") or ""),
                str(entry.get("genre") or ""),
            ]).lower()
            if query_l not in hay:
                continue
        yield entry_id, entry, trow


def _triage_counts_for_ids(entry_ids, triage):
    counts = {"keep": 0, "maybe": 0, "cull": 0, "unset": 0}
    for entry_id in entry_ids:
        status = (triage.get(entry_id) or {}).get("status") or "unset"
        if status not in counts:
            status = "unset"
        counts[status] += 1
    return counts


def aggregate_artists(*, phase="", query="", limit=50, offset=0):
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
    collection_id="",
    triage_status="",
    unplayed_only=False,
    query="",
    limit=50,
    offset=0,
):
    genre_l = str(genre or "").strip().lower()
    artist_l = str(artist or "").strip().lower()
    collection_l = str(collection_id or "").strip().lower()

    results = []
    for entry_id, entry, trow in _iter_filtered_entries(
        phase=phase,
        query=query,
        triage_status=triage_status,
        unplayed_only=unplayed_only,
    ):
        if genre_l and genre_l not in str(entry.get("genre") or "").lower():
            continue
        if artist_l and artist_l not in str(entry.get("artist") or "").lower():
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
