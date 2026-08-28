"""Search local abcresources dumps (FolkTuneFinder, Norbeck, JC, …) by title and contour."""

from __future__ import annotations

import json
import os
import re
import threading
import unicodedata
from pathlib import Path

from abc_contour import abc_to_contour, contour_similarity
from chords_fetch import normalize_match_text, score_title_artist_match

# Match frontend localAbcCollectionSearch.js (+ JC as collection 6).
COLLECTION_SPECS = (
    ("folktunefinder", "abcresources/folktunefinder/abc_tune_folktunefinder_", ".txt", "FolkTuneFinder"),
    ("thesession", "abcresources/thesession/abc_tune_thesession_", ".abc", "The Session"),
    ("jimsroots", "abcresources/jimsroots/abc_tune_jimsroots_", ".abc", "Jim's Roots"),
    ("misc", "abcresources/misc/abc_tune_misc_", ".abc", "Misc"),
    ("norbeck", "abcresources/norbeck/abc_tune_norbeck_", ".abc", "Norbeck"),
    ("folkinfo", "abcresources/folkinfo/abc_tune_folkinfo_", ".abc", "Folkinfo"),
    ("jc", "abcresources/jc/abc_tune_jc_", ".abc", "JC"),
    ("jc_regional", "abcresources/jc_regional/abc_tune_jc_regional_", ".abc", "JC Regional"),
    ("robinson", "abcresources/robinson/abc_tune_robinson_", ".abc", "Robinson"),
)

_COMMON_WORDS = frozenset({
    "a", "also", "am", "an", "and", "any", "are", "as", "at", "be", "became", "become",
    "but", "by", "can", "could", "did", "do", "does", "each", "either", "else", "for",
    "had", "has", "have", "how", "i", "if", "in", "is", "it", "its", "me", "must", "my",
    "nor", "not", "of", "oh", "ok", "the", "who", "whom", "will", "with", "within",
    "without", "would", "yes", "yet", "you", "your",
})

ABC_BLOCK_RE = re.compile(r"(X:\s*\d+.*?)(?=\nX:\s*\d+|\Z)", re.S | re.I)

MAX_LOCAL_TITLE_CANDIDATES = 8
MAX_LOCAL_CONTOUR_CANDIDATES = 8
MIN_CONTOUR_SCORE = 62.0
CONTOUR_PREFIX_LEN = 8

_INDEX_LOCK = threading.Lock()
_INDEX_CACHE = None
_INDEX_MTIME = None

_CONTOUR_LOCK = threading.Lock()
_CONTOUR_CACHE = None
_CONTOUR_MTIME = None


def _project_root() -> Path:
    env = str(os.getenv("ABC2BOOK_ROOT", "") or "").strip()
    if env:
        return Path(env).resolve()
    # local-resolver/ → repo root; docker mounts repo at /static/www (or legacy /app/www)
    here = Path(__file__).resolve().parent
    for candidate in (Path("/static/www"), Path("/app/www")):
        if candidate.is_dir() and (candidate / "abcresources").is_dir():
            return candidate
    return here.parent


def abc_resources_root() -> Path:
    env = str(os.getenv("ABC_RESOURCES_DIR", "") or "").strip()
    if env:
        return Path(env).resolve()
    return _project_root() / "abcresources"


def textsearch_index_path() -> Path:
    env = str(os.getenv("ABC_TEXTSEARCH_INDEX", "") or "").strip()
    if env:
        return Path(env).resolve()
    return _project_root() / "textsearch_index.json"


def contour_index_path() -> Path:
    env = str(os.getenv("ABC_CONTOUR_INDEX", "") or "").strip()
    if env:
        return Path(env).resolve()
    data = str(os.getenv("RESOLVER_DATA_DIR", "") or "").strip()
    if data:
        return Path(data) / "abc_contour_index.json"
    # Prefer writable /app/data in docker.
    docker_data = Path("/app/data")
    if docker_data.is_dir() and os.access(docker_data, os.W_OK):
        return docker_data / "abc_contour_index.json"
    # Host: avoid root-owned local-resolver/data; use ~/.cache or /tmp.
    home_cache = Path.home() / ".cache" / "abc2book"
    try:
        home_cache.mkdir(parents=True, exist_ok=True)
        probe = home_cache / ".write_test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return home_cache / "abc_contour_index.json"
    except OSError:
        return Path("/tmp") / "abc_contour_index.json"


def local_abc_resources_enabled() -> bool:
    root = abc_resources_root()
    index = textsearch_index_path()
    return root.is_dir() and index.is_file()


def local_abc_health_fields() -> dict:
    enabled = local_abc_resources_enabled()
    lookups = 0
    if enabled:
        try:
            index = load_textsearch_index()
            lookups = len((index or {}).get("lookups") or {})
        except Exception:
            lookups = 0
    return {
        "localAbcResources": enabled,
        "localAbcResourcesDir": str(abc_resources_root()) if abc_resources_root().is_dir() else None,
        "localAbcTextsearchIndex": str(textsearch_index_path()) if textsearch_index_path().is_file() else None,
        "localAbcLookupCount": lookups,
        "localAbcContourIndex": str(contour_index_path()) if contour_index_path().is_file() else None,
    }


def load_textsearch_index() -> dict:
    global _INDEX_CACHE, _INDEX_MTIME
    path = textsearch_index_path()
    if not path.is_file():
        return {}
    mtime = path.stat().st_mtime
    with _INDEX_LOCK:
        if _INDEX_CACHE is not None and _INDEX_MTIME == mtime:
            return _INDEX_CACHE
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        _INDEX_CACHE = data if isinstance(data, dict) else {}
        _INDEX_MTIME = mtime
        return _INDEX_CACHE


def _fold_ascii(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def tokenize_local_search_query(text: str) -> list[str]:
    clean = _fold_ascii(text).lower()
    clean = re.sub(r"[^a-z0-9 ]+", " ", clean)
    parts = []
    for part in clean.split():
        if part in _COMMON_WORDS:
            continue
        if len(part) < 3:
            continue
        parts.append(part)
    return parts


def _token_lookup_variants(part: str) -> list[str]:
    """Expand tokens so folded 'bourree' can hit index entries like 'bourr' + 'ee'."""
    part = str(part or "").lower()
    if not part:
        return []
    variants = [part]
    # Only near-full prefixes — avoid "miserlou" → "miser" flooding unrelated hits.
    if len(part) >= 6:
        variants.append(part[:-1])
        variants.append(part[:-2])
    elif len(part) >= 5:
        variants.append(part[:-1])
    # Drop a trailing duplicated vowel from accent folds (ée→ee).
    if len(part) >= 5 and part[-1] == part[-2] and part[-1] in "aeiou":
        variants.append(part[:-1])
        variants.append(part[:-2])
    # Dedupe preserve order.
    out = []
    seen = set()
    for item in variants:
        if item in seen or len(item) < 4:
            continue
        seen.add(item)
        out.append(item)
    return out


def search_local_collection_titles(title: str, limit: int = 25) -> list[dict]:
    """Return [{ids, name, score}] like the frontend text search."""
    title = str(title or "").strip()
    if not title or not local_abc_resources_enabled():
        return []
    index = load_textsearch_index()
    tokens_map = index.get("tokens") or {}
    lookups = index.get("lookups") or {}
    if not tokens_map or not lookups:
        return []

    parts = tokenize_local_search_query(title)
    if not parts:
        return []

    # Per original query part → set of matching tune ids (any variant).
    part_hits: list[set[str]] = []
    matches: dict[str, int] = {}
    for part in parts:
        ids_for_part: set[str] = set()
        for variant in _token_lookup_variants(part):
            ids = tokens_map.get(variant)
            if not isinstance(ids, list):
                continue
            for match_id in ids:
                key = str(match_id)
                ids_for_part.add(key)
        part_hits.append(ids_for_part)
        for key in ids_for_part:
            matches[key] = matches.get(key, 0) + 1

    if len(parts) > 1:
        candidate_ids = set.intersection(*part_hits) if part_hits and all(part_hits) else set()
        # Relax: if strict AND empty, allow ids matching most parts.
        if not candidate_ids:
            need = max(1, len(parts) - 1)
            candidate_ids = {mid for mid, count in matches.items() if count >= need}
    else:
        candidate_ids = set(matches.keys())

    seen: dict[str, dict] = {}
    for match_id in candidate_ids:
        name = str(lookups.get(match_id) or "").strip()
        if not name:
            continue
        lower = name.lower()
        entry = seen.get(lower)
        if not entry:
            entry = {"ids": [], "name": name, "indexTokenScore": 0}
            seen[lower] = entry
        entry["ids"].append(match_id)
        entry["indexTokenScore"] = max(entry["indexTokenScore"], matches.get(match_id, 0))

    results = []
    title_key = normalize_match_text(title)
    for entry in seen.values():
        score = score_title_artist_match(entry["name"], "", title, "")
        name_key = normalize_match_text(entry["name"])
        # Contained-title boost (e.g. Miserlou ⊂ Armenian Miserlou).
        if title_key and name_key and title_key != name_key:
            if title_key in name_key or name_key in title_key:
                shorter = min(len(title_key), len(name_key))
                longer = max(len(title_key), len(name_key))
                if shorter >= 5 and shorter / float(longer) >= 0.4:
                    score = max(score, 55)
        coverage = entry["indexTokenScore"] / max(len(parts), 1)
        score = int(score + (20 * coverage))
        results.append({
            "ids": entry["ids"],
            "name": entry["name"],
            "score": score,
            "matchedTokenCount": entry["indexTokenScore"],
            "queryTokenCount": len(parts),
        })
    results.sort(key=lambda row: row.get("score") or 0, reverse=True)
    return results[:limit]


def collection_label_for_id(tune_id: str) -> str:
    parts = str(tune_id or "").split("-")
    if not parts:
        return "local collection"
    try:
        idx = int(parts[0])
    except ValueError:
        return "local collection"
    if 0 <= idx < len(COLLECTION_SPECS):
        return COLLECTION_SPECS[idx][3]
    return "local collection"


def _file_path_for_tune_id(tune_id: str) -> tuple[Path | None, int]:
    parts = str(tune_id or "").split("-")
    if len(parts) < 3:
        return None, 0
    try:
        collection_number = int(parts[0])
        tune_number = int(parts[2])
    except ValueError:
        return None, 0
    if collection_number < 0 or collection_number >= len(COLLECTION_SPECS):
        return None, 0
    _key, prefix, ext, _label = COLLECTION_SPECS[collection_number]
    # prefix includes abcresources/…; files live under abc_resources_root's parent or root.
    rel = prefix + parts[1] + ext
    # COLLECTION paths are relative to project root, not abcresources alone.
    path = _project_root() / rel
    if not path.is_file():
        # Fallback: strip leading abcresources/ against ABC_RESOURCES_DIR.
        alt = abc_resources_root() / rel.split("abcresources/", 1)[-1]
        if alt.is_file():
            path = alt
        else:
            return None, 0
    return path, tune_number


def split_abc_tunes(text: str) -> list[str]:
    raw = str(text or "")
    if not raw.strip():
        return []
    blocks = ABC_BLOCK_RE.findall(raw)
    if blocks:
        return [block.strip() for block in blocks if block.strip()]
    # Single-tune file without a second X:
    if re.search(r"^X:\s*\d+", raw, re.M) or re.search(r"^K:", raw, re.M):
        return [raw.strip()]
    return []


def load_abc_for_tune_id(tune_id: str) -> str | None:
    path, tune_number = _file_path_for_tune_id(tune_id)
    if path is None:
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    tunes = split_abc_tunes(text)
    if not tunes:
        return None
    if tune_number < 0 or tune_number >= len(tunes):
        # Some dumps store one tune per file with tune_number 0.
        if len(tunes) == 1:
            return tunes[0]
        return None
    abc = tunes[tune_number]
    if "K:" not in abc.upper():
        return None
    return abc


def _annotate_local(abc: str, title: str, source: str, tune_id: str) -> dict:
    from notation_fetch import annotate_candidate, tune_meta_from_abc_headers

    meta = tune_meta_from_abc_headers(abc)
    return annotate_candidate(
        abc,
        title or (meta.get("name") if isinstance(meta, dict) else "") or "",
        source,
        "local://" + str(tune_id),
        artist="",
        title_only=False,
        tune_meta=meta or None,
    )


async def collect_local_abc_candidates(title, artist="", on_progress=None, limit=MAX_LOCAL_TITLE_CANDIDATES):
    """Title search over FolktuneFinder / Norbeck / JC / … dumps."""
    title = str(title or "").strip()
    if not title or not local_abc_resources_enabled():
        return []

    if callable(on_progress):
        await on_progress("local_abc", "Searching local ABC collections...", 0.42)

    rows = search_local_collection_titles(title, limit=max(limit * 3, 15))
    candidates = []
    seen_abc = set()
    for row in rows:
        if int(row.get("score") or 0) < 40:
            continue
        ids = row.get("ids") or []
        name = str(row.get("name") or title)
        for tune_id in ids[:3]:
            abc = load_abc_for_tune_id(tune_id)
            if not abc:
                continue
            key = normalize_match_text(abc[:160])
            if key in seen_abc:
                continue
            seen_abc.add(key)
            source = collection_label_for_id(tune_id)
            # Prefer Norbeck/JC labels as host-like sources for traditional bonus.
            source_key = {
            "FolkTuneFinder": "folktunefinder.com",
            "Norbeck": "norbeck.nu",
            "JC": "trillian.mit.edu",
            "JC Regional": "trillian.mit.edu",
            "Robinson": "richardrobinson.tunebook.org.uk",
            "Folkinfo": "folkinfo.org",
            "The Session": "thesession.org",
        }.get(source, source.lower().replace(" ", "") + ".local")
            cand = _annotate_local(abc, name, source_key, tune_id)
            cand["matchScore"] = int(row.get("score") or 0)
            candidates.append(cand)
            if len(candidates) >= limit:
                return candidates
    return candidates


def load_contour_index() -> dict:
    global _CONTOUR_CACHE, _CONTOUR_MTIME
    path = contour_index_path()
    if not path.is_file():
        return {}
    mtime = path.stat().st_mtime
    with _CONTOUR_LOCK:
        if _CONTOUR_CACHE is not None and _CONTOUR_MTIME == mtime:
            return _CONTOUR_CACHE
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        _CONTOUR_CACHE = data if isinstance(data, dict) else {}
        _CONTOUR_MTIME = mtime
        return _CONTOUR_CACHE


def save_contour_index(data: dict) -> Path:
    path = contour_index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)
    global _CONTOUR_CACHE, _CONTOUR_MTIME
    with _CONTOUR_LOCK:
        _CONTOUR_CACHE = data
        _CONTOUR_MTIME = path.stat().st_mtime
    return path


def build_contour_index(
    collections: tuple[int, ...] | None = None,
    limit: int | None = None,
    progress_every: int = 2000,
) -> dict:
    """
    Build interval+parsons fingerprints for local tunes.
    Default collections: FolkTuneFinder(0), Norbeck(4), JC(6) — continental-heavy.
    """
    if collections is None:
        collections = (0, 4, 6)
    index = load_textsearch_index()
    lookups = index.get("lookups") or {}
    by_id: dict[str, dict] = {}
    prefixes: dict[str, list[str]] = {}
    count = 0
    for tune_id, name in lookups.items():
        parts = str(tune_id).split("-")
        try:
            coll = int(parts[0])
        except (ValueError, IndexError):
            continue
        if coll not in collections:
            continue
        abc = load_abc_for_tune_id(tune_id)
        if not abc:
            continue
        contour = abc_to_contour(abc, max_notes=48)
        intervals = contour.get("intervals") or ""
        parsons = contour.get("parsons") or ""
        if len(intervals) < 4 and len(parsons) < 5:
            continue
        entry = {
            "t": str(name or ""),
            "i": intervals,
            "p": parsons,
        }
        by_id[str(tune_id)] = entry
        prefix = (intervals[:CONTOUR_PREFIX_LEN] or parsons[:CONTOUR_PREFIX_LEN])
        if prefix:
            prefixes.setdefault(prefix, []).append(str(tune_id))
        count += 1
        if limit and count >= limit:
            break
        if progress_every and count % progress_every == 0:
            print("contour index: {0} tunes…".format(count), flush=True)

    data = {
        "version": 1,
        "collections": list(collections),
        "byId": by_id,
        "prefixes": prefixes,
    }
    save_contour_index(data)
    return data


def ensure_contour_index(max_build: int | None = None) -> dict:
    existing = load_contour_index()
    if existing.get("byId"):
        return existing
    # Avoid multi-minute blocking in request path unless explicitly allowed.
    if str(os.getenv("ABC_CONTOUR_AUTOBUILD", "") or "").strip().lower() in ("1", "true", "yes"):
        return build_contour_index(limit=max_build)
    return {}


def search_local_abc_by_contour(abc_text: str, limit: int = MAX_LOCAL_CONTOUR_CANDIDATES) -> list[dict]:
    """Match OMR/query ABC contour against local contour index."""
    abc_text = str(abc_text or "").strip()
    if not abc_text:
        return []
    index = ensure_contour_index()
    by_id = index.get("byId") or {}
    prefixes = index.get("prefixes") or {}
    if not by_id:
        return []

    query = abc_to_contour(abc_text, max_notes=48)
    q_int = query.get("intervals") or ""
    q_par = query.get("parsons") or ""
    if len(q_int) < 4 and len(q_par) < 5:
        return []

    candidate_ids: set[str] = set()
    for prefix_src in (q_int, q_par):
        if len(prefix_src) < 4:
            continue
        for length in range(min(CONTOUR_PREFIX_LEN, len(prefix_src)), 3, -1):
            key = prefix_src[:length]
            for tune_id in prefixes.get(key) or []:
                candidate_ids.add(tune_id)
            if len(candidate_ids) >= 400:
                break
        if len(candidate_ids) >= 200:
            break

    # Fallback: sample scan if prefix map miss (short index / odd contour).
    if len(candidate_ids) < 20:
        for tune_id in list(by_id.keys())[:5000]:
            candidate_ids.add(tune_id)

    scored = []
    for tune_id in candidate_ids:
        entry = by_id.get(tune_id) or {}
        score = contour_similarity(
            query,
            {"intervals": entry.get("i") or "", "parsons": entry.get("p") or ""},
        )
        if score < MIN_CONTOUR_SCORE:
            continue
        scored.append((score, tune_id, entry))
    scored.sort(key=lambda row: row[0], reverse=True)

    out = []
    seen = set()
    for score, tune_id, entry in scored[: limit * 2]:
        abc = load_abc_for_tune_id(tune_id)
        if not abc:
            continue
        key = normalize_match_text(abc[:160])
        if key in seen:
            continue
        seen.add(key)
        source = collection_label_for_id(tune_id)
        source_key = {
            "FolkTuneFinder": "folktunefinder.com",
            "Norbeck": "norbeck.nu",
            "JC": "trillian.mit.edu",
            "JC Regional": "trillian.mit.edu",
            "Robinson": "richardrobinson.tunebook.org.uk",
            "Folkinfo": "folkinfo.org",
            "The Session": "thesession.org",
        }.get(source, "local.contour")
        cand = _annotate_local(abc, entry.get("t") or "", source_key, tune_id)
        cand["matchScore"] = int(score)
        cand["contourScore"] = round(float(score), 1)
        out.append(cand)
        if len(out) >= limit:
            break
    return out


async def collect_local_abc_contour_candidates(abc_text, on_progress=None, limit=MAX_LOCAL_CONTOUR_CANDIDATES):
    if callable(on_progress):
        await on_progress("local_contour", "Matching ABC contour against local corpus...", 0.48)
    return search_local_abc_by_contour(abc_text, limit=limit)
