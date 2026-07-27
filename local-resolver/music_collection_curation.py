"""Sidecar curation database for triage, notes, and move plans."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

from music_collection import load_music_collection_index, music_collection_metadata_dir, music_collection_root
from music_collection_registry import load_music_collection_registry, path_under_prefix

_DB_LOCK = threading.Lock()
_CONN = None
_DB_PATH = None


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


def _writable_dir(path):
    try:
        os.makedirs(path, exist_ok=True)
        probe = os.path.join(path, ".write_probe")
        with open(probe, "w", encoding="utf-8") as handle:
            handle.write("ok")
        os.remove(probe)
        return True
    except OSError:
        return False


def curation_db_path():
    override = os.getenv("MUSIC_COLLECTION_CURATION_DB", "").strip()
    if override:
        return os.path.abspath(override)
    candidates = [
        os.path.join(music_collection_metadata_dir(), "curation.db"),
        os.path.join(music_collection_root(), ".abc2book-curation", "curation.db"),
    ]
    for path in candidates:
        if _writable_dir(os.path.dirname(path)):
            return path
    return candidates[-1]


def _connect():
    global _CONN, _DB_PATH
    path = curation_db_path()
    if _CONN is not None and _DB_PATH == path:
        return _CONN
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS triage (
            entry_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            note TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS move_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            applied_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tag_queue (
            entry_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    _CONN = conn
    _DB_PATH = path
    return conn


def set_triage(entry_id, status, note=""):
    entry_id = str(entry_id or "").strip()
    status = str(status or "").strip().lower()
    if not entry_id or status not in ("keep", "maybe", "cull", "unset"):
        raise ValueError("Invalid triage update")
    with _DB_LOCK:
        conn = _connect()
        if status == "unset":
            conn.execute("DELETE FROM triage WHERE entry_id = ?", (entry_id,))
        else:
            conn.execute(
                """
                INSERT INTO triage(entry_id, status, note, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(entry_id) DO UPDATE SET
                    status=excluded.status,
                    note=excluded.note,
                    updated_at=excluded.updated_at
                """,
                (entry_id, status, str(note or ""), _utc_now()),
            )
        conn.commit()
    return {"entryId": entry_id, "status": status, "note": note or ""}


def set_triage_bulk(entry_ids, status, note=""):
    status = str(status or "").strip().lower()
    if status not in ("keep", "maybe", "cull", "unset"):
        raise ValueError("Invalid triage update")
    ids = [str(entry_id or "").strip() for entry_id in (entry_ids or []) if str(entry_id or "").strip()]
    if not ids:
        return {"updated": 0, "status": status}
    with _DB_LOCK:
        conn = _connect()
        if status == "unset":
            for entry_id in ids:
                conn.execute("DELETE FROM triage WHERE entry_id = ?", (entry_id,))
        else:
            now = _utc_now()
            note_text = str(note or "")
            for entry_id in ids:
                conn.execute(
                    """
                    INSERT INTO triage(entry_id, status, note, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(entry_id) DO UPDATE SET
                        status=excluded.status,
                        note=excluded.note,
                        updated_at=excluded.updated_at
                    """,
                    (entry_id, status, note_text, now),
                )
        conn.commit()
    return {"updated": len(ids), "status": status}


def resolve_entry_ids_for_bulk(
    *,
    scope,
    value,
    phase="",
    play_count_min=None,
    play_count_max=None,
    triage_unset_only=False,
):
    from music_collection_browse import _iter_filtered_entries, resolve_chunk_key

    scope = str(scope or "").strip().lower()
    value = str(value or "").strip()
    registry = load_music_collection_registry()
    triage = triage_map()
    entry_ids = []

    if scope == "filter":
        for entry_id, entry, trow in _iter_filtered_entries(phase=phase):
            if triage_unset_only and (trow.get("status") or "unset") != "unset":
                continue
            play_count = entry.get("playCount") or 0
            if play_count_min is not None and int(play_count) < int(play_count_min):
                continue
            if play_count_max is not None and int(play_count) > int(play_count_max):
                continue
            entry_ids.append(entry_id)
        return entry_ids

    if scope == "artist":
        target = value.lower()
        for entry_id, entry, trow in _iter_filtered_entries(phase=phase):
            artist = str(entry.get("artist") or "").strip() or "Unknown artist"
            if artist.lower() != target:
                continue
            if triage_unset_only and (trow.get("status") or "unset") != "unset":
                continue
            entry_ids.append(entry_id)
        return entry_ids

    if scope == "chunk":
        target = value.lower()
        for entry_id, entry, trow in _iter_filtered_entries(phase=phase):
            chunk = resolve_chunk_key(entry.get("path") or "", registry, phase).lower()
            if chunk != target:
                continue
            if triage_unset_only and (trow.get("status") or "unset") != "unset":
                continue
            entry_ids.append(entry_id)
        return entry_ids

    if scope == "entry_ids":
        from music_collection_moves import filter_entries_for_phase

        allowed = set()
        if phase:
            index = load_music_collection_index() or {}
            allowed = set(filter_entries_for_phase(index.get("entries") or {}, phase).keys())
        for entry_id in value.split(","):
            entry_id = entry_id.strip()
            if not entry_id:
                continue
            if allowed and entry_id not in allowed:
                continue
            entry_ids.append(entry_id)
        return entry_ids

    raise ValueError("Invalid bulk triage scope")


def set_triage_bulk_scope(
    *,
    scope,
    value="",
    phase="",
    status,
    play_count_min=None,
    play_count_max=None,
    triage_unset_only=False,
    note="",
):
    entry_ids = resolve_entry_ids_for_bulk(
        scope=scope,
        value=value,
        phase=phase,
        play_count_min=play_count_min,
        play_count_max=play_count_max,
        triage_unset_only=triage_unset_only,
    )
    result = set_triage_bulk(entry_ids, status, note=note)
    result["scope"] = scope
    result["value"] = value
    result["phase"] = phase
    return result


def get_triage(entry_id):
    with _DB_LOCK:
        conn = _connect()
        row = conn.execute("SELECT * FROM triage WHERE entry_id = ?", (str(entry_id),)).fetchone()
    if not row:
        return None
    return {"entryId": row["entry_id"], "status": row["status"], "note": row["note"], "updatedAt": row["updated_at"]}


def list_triage(status=None, limit=500):
    with _DB_LOCK:
        conn = _connect()
        if status:
            rows = conn.execute(
                "SELECT * FROM triage WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
                (status, int(limit)),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM triage ORDER BY updated_at DESC LIMIT ?",
                (int(limit),),
            ).fetchall()
    return [
        {"entryId": row["entry_id"], "status": row["status"], "note": row["note"], "updatedAt": row["updated_at"]}
        for row in rows
    ]


def triage_map():
    with _DB_LOCK:
        conn = _connect()
        rows = conn.execute("SELECT entry_id, status, note FROM triage").fetchall()
    return {row["entry_id"]: {"status": row["status"], "note": row["note"]} for row in rows}


def save_move_plan(name, payload, status="draft"):
    with _DB_LOCK:
        conn = _connect()
        cur = conn.execute(
            """
            INSERT INTO move_plans(name, payload, status, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (name, json.dumps(payload), status, _utc_now()),
        )
        conn.commit()
        plan_id = cur.lastrowid
    return {"id": plan_id, "name": name, "status": status}


def list_move_plans(limit=20):
    with _DB_LOCK:
        conn = _connect()
        rows = conn.execute(
            "SELECT id, name, status, created_at, applied_at FROM move_plans ORDER BY id DESC LIMIT ?",
            (int(limit),),
        ).fetchall()
    return [dict(row) for row in rows]


def get_move_plan(plan_id):
    with _DB_LOCK:
        conn = _connect()
        row = conn.execute("SELECT * FROM move_plans WHERE id = ?", (int(plan_id),)).fetchone()
    if not row:
        return None
    payload = json.loads(row["payload"])
    return {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "appliedAt": row["applied_at"],
        "payload": payload,
    }


def mark_move_plan_applied(plan_id):
    with _DB_LOCK:
        conn = _connect()
        conn.execute(
            "UPDATE move_plans SET status = 'applied', applied_at = ? WHERE id = ?",
            (_utc_now(), int(plan_id)),
        )
        conn.commit()
