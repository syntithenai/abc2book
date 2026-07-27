"""Collection analytics helpers for the personal music library index."""

from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone


STANDARD_TAG_FIELDS = (
    "title",
    "artist",
    "album",
    "albumartist",
    "genre",
    "date",
    "year",
    "composer",
    "tracknumber",
    "discnumber",
    "comment",
    "bpm",
    "key",
    "label",
    "isrc",
)

PLAY_COUNT_KEYS = (
    "playcount",
    "play_count",
    "play counter",
    "totaldiscs",
)

LAST_PLAYED_KEYS = (
    "lastplayed",
    "last_played",
    "last played",
    "lastplaytime",
)


def _utc_iso(timestamp):
    try:
        value = float(timestamp)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


def file_timestamps(abs_path):
    import os

    try:
        stat = os.stat(abs_path)
    except OSError:
        return {}

    added = getattr(stat, "st_birthtime", None)
    if added is None:
        added = stat.st_ctime
    return {
        "addedAt": _utc_iso(added),
        "modifiedAt": _utc_iso(stat.st_mtime),
        "accessedAt": _utc_iso(stat.st_atime),
        "size": int(stat.st_size),
    }


def _first_text(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        for item in value:
            text = _first_text(item)
            if text:
                return text
        return ""
    try:
        return str(value).strip()
    except Exception:
        return ""


def _normalize_key(key):
    return re.sub(r"[^a-z0-9]+", "", str(key or "").lower())


def _iter_tag_items(tags):
    if tags is None:
        return
    try:
        items = tags.items() if hasattr(tags, "items") else None
    except (ValueError, TypeError):
        items = None
    if items is not None:
        for key, value in items:
            yield str(key), value
        return
    if isinstance(tags, dict):
        for key, value in tags.items():
            yield str(key), value


def _read_popm_play_count(tags):
    for key, value in _iter_tag_items(tags):
        if not key.upper().startswith("POPM"):
            continue
        count = getattr(value, "count", None)
        if count is not None:
            try:
                return int(count)
            except (TypeError, ValueError):
                continue
    return None


def read_playback_info(tags):
    play_count = _read_popm_play_count(tags)
    last_played = None

    for key, value in _iter_tag_items(tags):
        normalized = _normalize_key(key)
        if play_count is None and normalized in {_normalize_key(item) for item in PLAY_COUNT_KEYS}:
            try:
                play_count = int(_first_text(value) or 0)
            except (TypeError, ValueError):
                pass
        if last_played is None and normalized in {_normalize_key(item) for item in LAST_PLAYED_KEYS}:
            text = _first_text(value)
            if text:
                last_played = text

    return {
        "playCount": play_count if play_count and play_count > 0 else None,
        "lastPlayed": last_played or None,
    }


NATIVE_TAG_FIELD_KEYS = {
    "title": ("title", "TIT2", "TITLE", "\xa9nam", "WM/Title"),
    "artist": ("artist", "TPE1", "ARTIST", "\xa9ART", "WM/Artist", "performer"),
    "album": ("album", "TALB", "ALBUM", "\xa9alb", "WM/AlbumTitle"),
    "albumartist": ("albumartist", "TPE2", "ALBUMARTIST", "aART", "WM/AlbumArtist"),
    "genre": ("genre", "TCON", "GENRE", "\xa9gen", "WM/Genre"),
    "date": ("date", "originaldate", "TDRC", "TYER", "TDOR", "DATE", "\xa9day", "WM/Year"),
    "composer": ("composer", "TCOM", "COMPOSER", "WM/Composer"),
    "tracknumber": ("tracknumber", "TRCK", "TRACKNUMBER", "trkn"),
    "discnumber": ("discnumber", "TPOS", "DISCNUMBER", "disk"),
    "comment": ("comment", "COMM", "COMMENT", "\xa9cmt"),
    "bpm": ("bpm", "TBPM", "BPM", "tmpo"),
    "key": ("key", "TKEY", "INITIALKEY", "KEY"),
    "label": ("label", "TPUB", "LABEL", "ORGANIZATION"),
    "isrc": ("isrc", "TXXX:ISRC", "ISRC", "----:com.apple.iTunes:ISRC"),
}


def _tag_value_text(value):
    if value is None:
        return ""
    if hasattr(value, "text"):
        return _first_text(value.text)
    return _first_text(value)


def _get_mapped_tag(tags, *keys):
    if not hasattr(tags, "get"):
        return ""
    for key in keys:
        try:
            value = tags.get(key)
        except (ValueError, KeyError, TypeError):
            continue
        text = _tag_value_text(value)
        if text:
            return text
    return ""


def read_standard_tags(tags):
    if tags is None:
        return {}, []

    easy = {}
    if hasattr(tags, "get"):
        easy = {}
        for field, keys in NATIVE_TAG_FIELD_KEYS.items():
            easy[field] = _get_mapped_tag(tags, *keys)

    year = _get_mapped_tag(tags, "TYER", "year") if hasattr(tags, "get") else ""
    if not year and easy.get("date"):
        match = re.search(r"\d{4}", easy["date"])
        if match:
            year = match.group(0)
    easy["year"] = year

    tag_keys = sorted({_normalize_key(key) for key, _value in _iter_tag_items(tags) if _normalize_key(key)})
    return easy, tag_keys


def metadata_sources(tag_values, resolved):
    sources = {}
    for field in ("title", "artist", "album", "genre", "year", "composer", "tracknumber"):
        tag_value = str((tag_values or {}).get(field) or "").strip()
        resolved_value = str((resolved or {}).get(field) or "").strip()
        if tag_value:
            sources[field] = "tag"
        elif resolved_value:
            sources[field] = "derived"
        else:
            sources[field] = "missing"
    return sources


def quick_content_fingerprint(abs_path, size):
    hasher = hashlib.sha256()
    hasher.update(str(size).encode("utf-8"))
    try:
        with open(abs_path, "rb") as handle:
            hasher.update(handle.read(65536))
            if size > 131072:
                handle.seek(-65536, 2)
                hasher.update(handle.read(65536))
    except OSError:
        return None
    return hasher.hexdigest()[:20]


def normalize_match_text(text):
    text = str(text or "").lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def soft_duplicate_key(title, artist, duration):
    return "|".join([
        normalize_match_text(artist),
        normalize_match_text(title),
        str(int(round(float(duration or 0)))),
    ])


def song_key(artist, title):
    """Canonical identity: one song per artist (album ignored)."""
    artist_norm = normalize_match_text(artist)
    title_norm = normalize_match_text(title)
    if not artist_norm and not title_norm:
        return ""
    return f"{artist_norm}|{title_norm}"


def read_audio_info(audio_file):
    """Extract bitrate, sample rate, channels from mutagen audio object."""
    info = getattr(audio_file, "info", None)
    if info is None:
        return {}
    out = {}
    for attr, key in (("bitrate", "bitrate"), ("sample_rate", "sampleRate"), ("channels", "channels")):
        try:
            value = getattr(info, attr, None)
            if value is not None:
                out[key] = int(value)
        except (TypeError, ValueError):
            pass
    return out


def parse_bpm_value(raw):
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    try:
        value = float(match.group(1))
    except (TypeError, ValueError):
        return None
    if value <= 0 or value > 400:
        return None
    return round(value, 1)


def score_keeper_entry(entry):
    """Higher is better when picking one copy per songKey."""
    score = 0
    play_count = entry.get("playCount")
    if isinstance(play_count, int) and play_count > 0:
        score += min(play_count, 500) * 10
    bitrate = entry.get("bitrate")
    if isinstance(bitrate, int) and bitrate > 0:
        score += min(bitrate // 1000, 320)
    meta = entry.get("meta") or {}
    for field in ("title", "artist", "genre", "year"):
        if meta.get(field) == "tag":
            score += 5
    if entry.get("bpm"):
        score += 3
    path = str(entry.get("path") or "")
    if path.startswith("library/"):
        score += 50
    if entry.get("hasArt"):
        score += 2
    score -= min(len(path) // 40, 10)
    return score


def pick_keeper_entry_ids(entry_ids, entries):
    best_id = None
    best_score = -10**9
    for entry_id in entry_ids:
        entry = entries.get(entry_id) or {}
        if not isinstance(entry, dict):
            continue
        score = score_keeper_entry(entry)
        if score > best_score:
            best_score = score
            best_id = entry_id
    return best_id


def entry_summary(entry_id, entry):
    return {
        "id": entry_id,
        "title": entry.get("title") or "",
        "artist": entry.get("artist") or "",
        "album": entry.get("album") or "",
        "path": entry.get("path") or "",
        "duration": entry.get("duration"),
        "playCount": entry.get("playCount"),
        "bitrate": entry.get("bitrate"),
        "bpm": entry.get("bpm"),
        "genre": entry.get("genre") or "",
        "songKey": entry.get("songKey") or "",
        "collectionId": entry.get("collectionId") or "",
        "phase": entry.get("phase") or "",
    }


def build_duplicate_groups(entries, *, group_type="songKey", limit=50):
    entries = entries or {}
    groups_map = defaultdict(list)
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        if group_type == "exact":
            key = entry.get("fingerprint") or ""
        elif group_type == "soft":
            key = entry.get("softDupKey") or ""
        else:
            key = entry.get("songKey") or song_key(entry.get("artist"), entry.get("title"))
        if not key:
            continue
        groups_map[key].append(entry_id)

    groups = []
    for key, entry_ids in groups_map.items():
        if len(entry_ids) < 2:
            continue
        keeper_id = pick_keeper_entry_ids(entry_ids, entries)
        members = [entry_summary(eid, entries.get(eid) or {}) for eid in entry_ids]
        for member in members:
            member["keeper"] = member["id"] == keeper_id
        groups.append({
            "key": key,
            "type": group_type,
            "size": len(entry_ids),
            "keeperId": keeper_id,
            "members": members,
        })

    groups.sort(key=lambda item: (-item["size"], item.get("key") or ""))
    return groups[: max(1, int(limit or 50))]


def _top_counter(counter, limit=25):
    return [{"value": value, "count": count} for value, count in counter.most_common(limit)]


def _month_key(iso_timestamp):
    if not iso_timestamp:
        return None
    return str(iso_timestamp)[:7]


def build_collection_stats(entries):
    entries = entries or {}
    total = len(entries)
    if total == 0:
        return {
            "tracks": 0,
            "metadata": {},
            "formats": [],
            "categories": [],
            "tags": {},
            "playback": {},
            "timeline": {},
            "duplicates": {},
        }

    metadata_counts = Counter()
    format_counts = Counter()
    category_counts = Counter()
    genre_counts = Counter()
    artist_counts = Counter()
    album_counts = Counter()
    tag_key_counts = Counter()
    tag_value_counts = defaultdict(Counter)
    play_count_total = 0
    with_play_count = 0
    with_last_played = 0
    most_played = []
    added_by_year = Counter()
    added_by_month = Counter()
    fingerprint_groups = defaultdict(list)
    soft_dup_groups = defaultdict(list)
    song_key_groups = defaultdict(list)
    total_bytes = 0

    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue

        total_bytes += int(entry.get("size") or 0)
        ext = str(entry.get("ext") or "").lower()
        if ext:
            format_counts[ext] += 1

        category = str(entry.get("category") or "").strip()
        if category:
            category_counts[category] += 1

        meta = entry.get("meta") or {}
        for field, source in meta.items():
            if source == "tag":
                metadata_counts[field] += 1
            elif source == "derived":
                metadata_counts[field + "Derived"] += 1
            else:
                metadata_counts[field + "Missing"] += 1
        if entry.get("bpm"):
            metadata_counts["bpm"] += 1

        if entry.get("hasArt"):
            metadata_counts["art"] += 1

        genre = str(entry.get("genre") or "").strip()
        if genre:
            genre_counts[genre] += 1
        artist = str(entry.get("artist") or "").strip()
        if artist:
            artist_counts[artist] += 1
        album = str(entry.get("album") or "").strip()
        if album:
            album_counts[album] += 1

        for tag_key in entry.get("tagKeys") or []:
            tag_key_counts[tag_key] += 1
        for tag_key, tag_value in (entry.get("extraTags") or {}).items():
            if tag_value:
                tag_value_counts[tag_key][str(tag_value)] += 1

        play_count = entry.get("playCount")
        if isinstance(play_count, int) and play_count > 0:
            with_play_count += 1
            play_count_total += play_count
            most_played.append({
                "id": entry_id,
                "title": entry.get("title") or "",
                "artist": entry.get("artist") or "",
                "playCount": play_count,
                "path": entry.get("path") or "",
            })
        if entry.get("lastPlayed"):
            with_last_played += 1

        added_month = _month_key(entry.get("addedAt"))
        if added_month:
            added_by_month[added_month] += 1
            added_by_year[added_month[:4]] += 1

        fingerprint = entry.get("fingerprint")
        if fingerprint:
            fingerprint_groups[fingerprint].append(entry_id)
        soft_key = entry.get("softDupKey")
        if soft_key:
            soft_dup_groups[soft_key].append(entry_id)
        sk = entry.get("songKey")
        if sk:
            song_key_groups[sk].append(entry_id)

    most_played.sort(key=lambda item: (item.get("playCount") or 0, item.get("title") or ""), reverse=True)

    exact_dup_groups = [ids for ids in fingerprint_groups.values() if len(ids) > 1]
    soft_dup_group_list = [ids for ids in soft_dup_groups.values() if len(ids) > 1]
    song_key_group_list = [ids for ids in song_key_groups.values() if len(ids) > 1]

    def _dup_summary(groups):
        extra_copies = sum(len(group) - 1 for group in groups)
        largest = sorted(groups, key=len, reverse=True)[:10]
        return {
            "groups": len(groups),
            "extraCopies": extra_copies,
            "largestGroups": [{"size": len(group), "entryIds": group[:5]} for group in largest],
        }

    metadata_summary = {
        "tracks": total,
        "taggedTitle": metadata_counts.get("title", 0),
        "taggedArtist": metadata_counts.get("artist", 0),
        "taggedAlbum": metadata_counts.get("album", 0),
        "taggedGenre": metadata_counts.get("genre", 0),
        "taggedYear": metadata_counts.get("year", 0),
        "taggedComposer": metadata_counts.get("composer", 0),
        "taggedTrackNumber": metadata_counts.get("tracknumber", 0),
        "taggedBpm": metadata_counts.get("bpm", 0),
        "derivedTitle": metadata_counts.get("titleDerived", 0),
        "derivedArtist": metadata_counts.get("artistDerived", 0),
        "withArt": metadata_counts.get("art", 0),
        "completeCore": sum(
            1
            for entry in entries.values()
            if isinstance(entry, dict)
            and (entry.get("meta") or {}).get("title") == "tag"
            and (entry.get("meta") or {}).get("artist") == "tag"
            and str(entry.get("album") or "").strip()
        ),
    }

    widely_used_tags = {}
    for tag_key, counter in tag_value_counts.items():
        widely_used_tags[tag_key] = _top_counter(counter, limit=15)

    return {
        "tracks": total,
        "totalBytes": total_bytes,
        "metadata": metadata_summary,
        "formats": _top_counter(format_counts, limit=20),
        "categories": _top_counter(category_counts, limit=25),
        "genres": _top_counter(genre_counts, limit=25),
        "artists": _top_counter(artist_counts, limit=25),
        "albums": _top_counter(album_counts, limit=25),
        "tags": {
            "keys": _top_counter(tag_key_counts, limit=40),
            "values": widely_used_tags,
        },
        "playback": {
            "withPlayCount": with_play_count,
            "withLastPlayed": with_last_played,
            "totalPlayCount": play_count_total,
            "mostPlayed": most_played[:25],
        },
        "timeline": {
            "addedByYear": dict(sorted(added_by_year.items())),
            "addedByMonth": dict(sorted(added_by_month.items())[-36:]),
        },
        "duplicates": {
            "exact": _dup_summary(exact_dup_groups),
            "metadata": _dup_summary(soft_dup_group_list),
            "songKey": _dup_summary(song_key_group_list),
        },
    }


def summarize_stats_for_health(stats):
    stats = stats or {}
    metadata = stats.get("metadata") or {}
    duplicates = stats.get("duplicates") or {}
    playback = stats.get("playback") or {}
    total = int(metadata.get("tracks") or stats.get("tracks") or 0)
    tagged_title = int(metadata.get("taggedTitle") or 0)
    tagged_artist = int(metadata.get("taggedArtist") or 0)
    return {
        "tracks": total,
        "taggedTitlePct": round((tagged_title / total) * 100, 1) if total else 0,
        "taggedArtistPct": round((tagged_artist / total) * 100, 1) if total else 0,
        "withPlayCount": int(playback.get("withPlayCount") or 0),
        "duplicateExtras": int((duplicates.get("exact") or {}).get("extraCopies") or 0),
        "metadataDuplicateExtras": int((duplicates.get("metadata") or {}).get("extraCopies") or 0),
        "songKeyDuplicateExtras": int((duplicates.get("songKey") or {}).get("extraCopies") or 0),
        "topGenres": (stats.get("genres") or [])[:5],
        "topCategories": (stats.get("categories") or [])[:5],
    }
