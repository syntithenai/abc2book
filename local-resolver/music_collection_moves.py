"""Move planning and application for music collection curation."""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone

from music_collection import load_music_collection_index, music_collection_root
from music_collection_analytics import build_duplicate_groups
from music_collection_curation import save_move_plan, triage_map
from music_collection_registry import (
    is_preserved_path,
    library_target_path,
    load_music_collection_registry,
    path_under_prefix,
    sanitize_path_component,
)


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


def _unique_target_path(root, rel_path):
    rel = str(rel_path or "").replace("\\", "/").lstrip("/")
    abs_path = os.path.join(root, rel)
    if not os.path.exists(abs_path):
        return rel
    base, ext = os.path.splitext(rel)
    counter = 2
    while counter < 1000:
        candidate = f"{base} ({counter}){ext}"
        if not os.path.exists(os.path.join(root, candidate)):
            return candidate
        counter += 1
    raise ValueError(f"Could not find unique path for {rel_path}")


def filter_entries_for_phase(entries, phase, registry=None):
    reg = registry or load_music_collection_registry()
    if not phase:
        return entries
    filtered = {}
    phase_cfg = (reg.get("phases") or {}).get(phase) or {}
    sources = phase_cfg.get("sources") or []
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        path = str(entry.get("path") or "")
        if phase == "remainder":
            skip = False
            for pid, pdata in (reg.get("phases") or {}).items():
                if pid == "remainder":
                    continue
                for source in pdata.get("sources") or []:
                    if path_under_prefix(path, source):
                        skip = True
                        break
                if skip:
                    break
            if not skip:
                filtered[entry_id] = entry
            continue
        for source in sources:
            if path_under_prefix(path, source):
                filtered[entry_id] = entry
                break
    return filtered


def plan_library_moves(
    *,
    phase="",
    triage_only=True,
    include_duplicates=False,
    limit=5000,
):
    index = load_music_collection_index() or {}
    entries = index.get("entries") or {}
    registry = load_music_collection_registry()
    triage = triage_map()
    entries = filter_entries_for_phase(entries, phase, registry)

    claimed_song_keys = {}
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        if str(entry.get("path") or "").startswith("library/"):
            sk = entry.get("songKey") or ""
            if sk:
                claimed_song_keys[sk] = entry_id

    moves = []
    skipped = []
    for entry_id, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        path = str(entry.get("path") or "")
        if is_preserved_path(path, registry):
            skipped.append({"entryId": entry_id, "reason": "preserved", "path": path})
            continue
        if path.startswith("library/"):
            skipped.append({"entryId": entry_id, "reason": "already_in_library", "path": path})
            continue
        tstatus = (triage.get(entry_id) or {}).get("status") or "unset"
        if triage_only and tstatus != "keep":
            continue
        sk = entry.get("songKey") or ""
        if sk and sk in claimed_song_keys and claimed_song_keys[sk] != entry_id:
            if not include_duplicates:
                skipped.append({"entryId": entry_id, "reason": "duplicate_song_key", "path": path, "songKey": sk})
                continue
        target = library_target_path(entry, registry)
        moves.append({
            "entryId": entry_id,
            "from": path,
            "to": target,
            "songKey": sk,
            "title": entry.get("title") or "",
            "artist": entry.get("artist") or "",
            "triageStatus": tstatus,
        })
        if sk:
            claimed_song_keys[sk] = entry_id
        if len(moves) >= int(limit or 5000):
            break

    payload = {
        "createdAt": _utc_now(),
        "phase": phase,
        "moveCount": len(moves),
        "skippedCount": len(skipped),
        "moves": moves,
        "skipped": skipped[:200],
    }
    return payload


def plan_duplicate_quarantine(*, group_type="songKey", phase="", limit=200):
    index = load_music_collection_index() or {}
    entries = filter_entries_for_phase(index.get("entries") or {}, phase)
    groups = build_duplicate_groups(entries, group_type=group_type, limit=limit)
    moves = []
    for group in groups:
        keeper_id = group.get("keeperId")
        for member in group.get("members") or []:
            if member.get("id") == keeper_id:
                continue
            src = member.get("path") or ""
            if not src or is_preserved_path(src):
                continue
            base = sanitize_path_component(group.get("key") or "duplicate", "duplicate")[:80]
            dest = f"_quarantine/duplicates/{base}/{os.path.basename(src)}"
            moves.append({
                "entryId": member.get("id"),
                "from": src,
                "to": dest,
                "songKey": member.get("songKey") or "",
                "reason": "duplicate",
                "keeperId": keeper_id,
            })
    return {
        "createdAt": _utc_now(),
        "phase": phase,
        "groupType": group_type,
        "moveCount": len(moves),
        "moves": moves,
    }


def apply_move_plan(payload, *, apply=False, staging=False):
    root = music_collection_root()
    moves = payload.get("moves") or []
    log = []
    for move in moves:
        src_rel = str(move.get("from") or "").replace("\\", "/").lstrip("/")
        dest_rel = str(move.get("to") or "").replace("\\", "/").lstrip("/")
        if staging and not dest_rel.startswith("_quarantine/staging/"):
            dest_rel = "_quarantine/staging/" + dest_rel
        src_abs = os.path.join(root, src_rel)
        dest_abs = os.path.join(root, dest_rel)
        record = dict(move)
        record["dest"] = dest_rel
        if not apply:
            record["status"] = "planned"
            log.append(record)
            continue
        if not os.path.isfile(src_abs):
            record["status"] = "missing"
            log.append(record)
            continue
        os.makedirs(os.path.dirname(dest_abs), exist_ok=True)
        dest_rel = _unique_target_path(root, dest_rel)
        dest_abs = os.path.join(root, dest_rel)
        shutil.move(src_abs, dest_abs)
        record["dest"] = dest_rel
        record["status"] = "moved"
        log.append(record)
    result = {
        "applied": bool(apply),
        "staging": bool(staging),
        "moveCount": len(log),
        "moves": log,
        "completedAt": _utc_now(),
    }
    return result


def save_and_optionally_apply_plan(name, payload, apply=False, staging=False):
    saved = save_move_plan(name, payload, status="applied" if apply else "draft")
    result = apply_move_plan(payload, apply=apply, staging=staging)
    result["planId"] = saved.get("id")
    return result
