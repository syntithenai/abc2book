"""Firestore/SQLite persistence for YogApp community teachers, blogs, and routines.

Storage follows billing: YOGA_STORE / AUTH_SESSION_STORE = sqlite | firestore.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
import uuid
from typing import Any

YOGA_STORE = os.getenv(
    "YOGA_STORE",
    os.getenv("BILLING_STORE", os.getenv("AUTH_SESSION_STORE", "sqlite")),
).strip().lower()
YOGA_DB_PATH = os.getenv(
    "YOGA_DB_PATH",
    os.path.join(os.path.dirname(__file__), "data", "yoga_community.sqlite"),
).strip()


def _resolve_yoga_db_path() -> str:
    """Prefer configured path; fall back to /tmp when data/ is not writable (tests/CI)."""
    path = YOGA_DB_PATH
    parent = os.path.dirname(path)
    if parent:
        try:
            os.makedirs(parent, exist_ok=True)
            probe = os.path.join(parent, ".yoga_write_probe")
            with open(probe, "w", encoding="utf-8") as fh:
                fh.write("ok")
            os.remove(probe)
            return path
        except OSError:
            pass
    return os.path.join("/tmp", "yoga_community.sqlite")


_EFFECTIVE_YOGA_DB_PATH: str | None = None


def _yoga_db_path() -> str:
    global _EFFECTIVE_YOGA_DB_PATH
    if _EFFECTIVE_YOGA_DB_PATH is None:
        _EFFECTIVE_YOGA_DB_PATH = _resolve_yoga_db_path()
    return _EFFECTIVE_YOGA_DB_PATH
YOGA_FIRESTORE_PROJECT = os.getenv(
    "YOGA_FIRESTORE_PROJECT",
    os.getenv("BILLING_FIRESTORE_PROJECT", os.getenv("AUTH_SESSION_FIRESTORE_PROJECT", "")),
).strip()
YOGA_TEACHERS_COLLECTION = os.getenv("YOGA_TEACHERS_COLLECTION", "yoga_teachers").strip()
YOGA_BLOGS_COLLECTION = os.getenv("YOGA_BLOGS_COLLECTION", "yoga_blogs").strip()
YOGA_ROUTINES_COLLECTION = os.getenv("YOGA_ROUTINES_COLLECTION", "yoga_community_routines").strip()
YOGA_CLASSES_COLLECTION = os.getenv("YOGA_CLASSES_COLLECTION", "yoga_classes").strip()
YOGA_SUBSCRIPTIONS_COLLECTION = os.getenv(
    "YOGA_SUBSCRIPTIONS_COLLECTION", "yoga_teacher_subscriptions"
).strip()
YOGA_CLASS_REGISTRATIONS_COLLECTION = os.getenv(
    "YOGA_CLASS_REGISTRATIONS_COLLECTION", "yoga_class_registrations"
).strip()
YOGA_CLASS_CANCELLATIONS_COLLECTION = os.getenv(
    "YOGA_CLASS_CANCELLATIONS_COLLECTION", "yoga_class_cancellations"
).strip()
YOGA_BLOG_LIKES_COLLECTION = os.getenv(
    "YOGA_BLOG_LIKES_COLLECTION", "yoga_blog_likes"
).strip()
YOGA_FEEDBACK_COLLECTION = os.getenv(
    "YOGA_FEEDBACK_COLLECTION", "yoga_feedback"
).strip()
# Teacher score = blog likes + (subscriptions × weight).
TEACHER_SCORE_SUBSCRIPTION_WEIGHT = 3

SEED_AUTHOR_EMAIL = "seed@synthesized.yoga"
MAX_BLURB_LEN = 280
MAX_PHOTO_DATA_URL_CHARS = 350_000
MAX_FEEDBACK_COMMENT_LEN = 4000
MAX_FEEDBACK_DEBUG_CHARS = 150_000
MAX_FEEDBACK_SCREENSHOT_CHARS = MAX_PHOTO_DATA_URL_CHARS
MAX_FEEDBACK_ROUTE_LEN = 500
MAX_FEEDBACK_USER_AGENT_LEN = 500
MAX_FEEDBACK_AUTHOR_NAME_LEN = 120
FEEDBACK_STATUSES = frozenset({"open", "in_progress", "fixed"})
# Shortest edge before resize — list cards ~16rem; 2× displays need ≥512px source.
MIN_TEACHER_PHOTO_EDGE = 512
TEACHER_PHOTO_MAX_EDGE = 512
MAX_CONTACT_EMAIL_LEN = 120
MAX_CONTACT_PHONE_LEN = 40
MAX_CONTACT_LINK_LEN = 300
MAX_YOUTUBE_LINKS = 12
MAX_TEACHER_EVIDENCE = 5
MAX_EVIDENCE_DATA_URL_CHARS = 250_000
MAX_EVIDENCE_NAME_LEN = 120
MAX_EVIDENCE_URL_LEN = 500
MAX_CLASS_TITLE_LEN = 120
MAX_CLASS_DESCRIPTION_LEN = 4000
MAX_CLASS_LOCATION_LEN = 300
MAX_CLASS_IMAGE_CHARS = MAX_PHOTO_DATA_URL_CHARS
MAX_CLASS_REGISTRANTS = 500
MAX_CLASS_RECURRENCE_OCCURRENCES = 52
CLASS_RECURRENCE_FREQUENCIES = frozenset({"weekly", "biweekly", "monthly"})


def normalize_youtube_links(raw: Any) -> list[str]:
    """Accept URLs or 11-char ids; store canonical watch URLs (deduped, capped)."""
    if raw is None:
        return []
    if isinstance(raw, str):
        items = [raw]
    elif isinstance(raw, list):
        items = raw
    else:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        vid = extract_youtube_id(str(item or "").strip())
        if not vid or vid in seen:
            continue
        seen.add(vid)
        out.append(f"https://www.youtube.com/watch?v={vid}")
        if len(out) >= MAX_YOUTUBE_LINKS:
            break
    return out


def extract_youtube_id(value: str) -> str:
    v = (value or "").strip()
    if not v:
        return ""
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", v):
        return v
    m = re.search(
        r"(?:youtube\.com/(?:watch\?.*?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})",
        v,
    )
    return m.group(1) if m else ""


def teacher_has_contact(teacher: dict[str, Any] | None) -> bool:
    """True when the teacher has any contact method (legacy helper)."""
    if not teacher:
        return False
    return bool(
        (teacher.get("contactEmail") or "").strip()
        or (teacher.get("contactPhone") or "").strip()
        or (teacher.get("contactLink") or "").strip()
    )


def teacher_has_website(teacher: dict[str, Any] | None) -> bool:
    """Website/link is required before a teacher can be approved for listing."""
    if not teacher:
        return False
    return bool((teacher.get("contactLink") or "").strip())


def teacher_listing_complete(teacher: dict[str, Any] | None) -> bool:
    """Profile has the fields required for public listing (aside from approval)."""
    if not teacher:
        return False
    return bool(
        str(teacher.get("blurb") or "").strip()
        and (teacher.get("photoDataUrl") or teacher.get("photoUrl"))
        and teacher_has_website(teacher)
    )


def teacher_is_publicly_listed(teacher: dict[str, Any] | None) -> bool:
    """True when the teacher is approved/active (classes, profile URL, subscribe).

    Unlisted teachers remain publicly listed in this sense — they are omitted
    from directory/top rankings via teacher_appears_in_directory().
    """
    return bool(
        teacher
        and not teacher_is_disabled(teacher)
        and teacher_listing_complete(teacher)
    )


def teacher_is_unlisted(teacher: dict[str, Any] | None) -> bool:
    if not teacher:
        return False
    return bool(teacher.get("unlisted"))


def teacher_appears_in_directory(teacher: dict[str, Any] | None) -> bool:
    """True when the teacher should appear on the public Teachers directory."""
    return teacher_is_publicly_listed(teacher) and not teacher_is_unlisted(teacher)


def teacher_is_banned(teacher: dict[str, Any] | None) -> bool:
    if not teacher:
        return False
    return bool(teacher.get("banned"))


def teacher_is_disabled(teacher: dict[str, Any] | None) -> bool:
    if not teacher:
        return False
    return bool(teacher.get("disabled")) or teacher_is_banned(teacher)


def teacher_needs_approval(teacher: dict[str, Any] | None) -> bool:
    """True when the applicant has published and awaits first admin approval."""
    if not teacher or teacher_is_banned(teacher):
        return False
    if str(teacher.get("rejectReason") or "").strip():
        return False
    if not teacher.get("disabled"):
        return False
    if not teacher_listing_complete(teacher):
        return False
    if not teacher.get("submittedAt"):
        return False
    if teacher.get("approvedAt"):
        return False
    return True


def _ts_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def normalize_evidence_item(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    item_id = str(raw.get("id") or "").strip()
    if not item_id:
        return None
    name = str(raw.get("name") or "").strip()[:MAX_EVIDENCE_NAME_LEN]
    content_type = str(raw.get("contentType") or raw.get("content_type") or "").strip()[
        :120
    ]
    data_url = str(raw.get("dataUrl") or raw.get("data_url") or "").strip()
    url = str(raw.get("url") or "").strip()[:MAX_EVIDENCE_URL_LEN]
    if data_url:
        if len(data_url) > MAX_EVIDENCE_DATA_URL_CHARS:
            return None
        lower = data_url.lower()
        if not (
            lower.startswith("data:image/")
            or lower.startswith("data:application/pdf")
        ):
            return None
    elif url:
        if not re_match_http(url):
            if "." in url and " " not in url:
                url = "https://" + url.lstrip("/")
            else:
                return None
        content_type = content_type or "text/uri-list"
    else:
        return None
    uploaded_at = _ts_or_none(raw.get("uploadedAt") or raw.get("uploaded_at")) or _now()
    return {
        "id": item_id,
        "name": name or "Evidence",
        "contentType": content_type or ("application/octet-stream" if data_url else "text/uri-list"),
        "dataUrl": data_url,
        "url": url if not data_url else "",
        "uploadedAt": uploaded_at,
    }


def normalize_evidence_list(raw: Any) -> list[dict[str, Any]]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw:
        norm = normalize_evidence_item(item)
        if not norm or norm["id"] in seen:
            continue
        seen.add(norm["id"])
        out.append(norm)
        if len(out) >= MAX_TEACHER_EVIDENCE:
            break
    return out


def _apply_teacher_legacy_status(out: dict[str, Any]) -> dict[str, Any]:
    """Normalize timestamps; backfill approvedAt for already-listed teachers on read."""
    submitted = _ts_or_none(out.get("submittedAt"))
    approved = _ts_or_none(out.get("approvedAt"))
    out["submittedAt"] = submitted
    out["approvedAt"] = approved
    if approved is None and not teacher_is_disabled(out) and teacher_listing_complete(out):
        approved = _ts_or_none(out.get("registeredAt")) or _ts_or_none(out.get("updatedAt"))
        out["approvedAt"] = approved
    if submitted is None and approved:
        out["submittedAt"] = approved
    return out


def _migrate_teacher_application_status_sqlite(conn: sqlite3.Connection) -> None:
    """One-time: treat existing complete+disabled apps as submitted; listed as approved."""
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='yoga_meta'"
    ).fetchone()
    if not row:
        conn.execute(
            """
            CREATE TABLE yoga_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
            """
        )
    flag = conn.execute(
        "SELECT value FROM yoga_meta WHERE key = ?",
        ("teacher_application_status_v2",),
    ).fetchone()
    if flag and str(flag[0] or "") == "1":
        return
    conn.execute(
        """
        UPDATE yoga_teachers
        SET approved_at = coalesce(registered_at, updated_at)
        WHERE coalesce(disabled, 0) = 0
          AND blurb != ''
          AND (photo_data_url != '' OR photo_url != '')
          AND trim(contact_link) != ''
          AND coalesce(banned, 0) = 0
          AND approved_at IS NULL
        """
    )
    conn.execute(
        """
        UPDATE yoga_teachers
        SET submitted_at = coalesce(updated_at, registered_at)
        WHERE coalesce(disabled, 0) = 1
          AND blurb != ''
          AND (photo_data_url != '' OR photo_url != '')
          AND trim(contact_link) != ''
          AND coalesce(banned, 0) = 0
          AND trim(coalesce(reject_reason, '')) = ''
          AND submitted_at IS NULL
          AND approved_at IS NULL
        """
    )
    conn.execute(
        """
        UPDATE yoga_teachers
        SET submitted_at = coalesce(approved_at, updated_at, registered_at)
        WHERE approved_at IS NOT NULL
          AND submitted_at IS NULL
        """
    )
    conn.execute(
        """
        INSERT INTO yoga_meta (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        ("teacher_application_status_v2", "1"),
    )


def _migrate_teacher_application_status_firestore() -> None:
    """One-time Firestore backfill for submittedAt / approvedAt (same rules as SQLite)."""
    try:
        client = _get_firestore_client()
    except Exception:
        return
    meta_ref = client.collection("yoga_meta").document("teacher_application_status_v2")
    try:
        meta = meta_ref.get()
        if meta.exists and str((meta.to_dict() or {}).get("value") or "") == "1":
            return
    except Exception:
        return
    try:
        docs = list(client.collection(YOGA_TEACHERS_COLLECTION).stream())
    except Exception:
        return
    for doc in docs:
        data = doc.to_dict() or {}
        data["email"] = data.get("email") or doc.id
        teacher = _teacher_from_row(data)
        # _teacher_from_row may already inject approvedAt for listed teachers; persist.
        payload: dict[str, Any] = {}
        banned = teacher_is_banned(teacher)
        complete = teacher_listing_complete(teacher)
        disabled = bool(teacher.get("disabled"))
        reject = str(teacher.get("rejectReason") or "").strip()
        submitted = _ts_or_none(data.get("submittedAt"))
        approved = _ts_or_none(data.get("approvedAt"))
        if (
            approved is None
            and not disabled
            and not banned
            and complete
        ):
            approved = (
                _ts_or_none(teacher.get("registeredAt"))
                or _ts_or_none(teacher.get("updatedAt"))
            )
            payload["approvedAt"] = approved
        if submitted is None and (approved or payload.get("approvedAt")):
            payload["submittedAt"] = approved or payload.get("approvedAt")
        elif (
            submitted is None
            and disabled
            and complete
            and not banned
            and not reject
            and approved is None
        ):
            payload["submittedAt"] = (
                _ts_or_none(teacher.get("updatedAt"))
                or _ts_or_none(teacher.get("registeredAt"))
            )
        if payload:
            try:
                doc.reference.set(payload, merge=True)
            except Exception:
                pass
    try:
        meta_ref.set({"value": "1"}, merge=True)
    except Exception:
        pass


def blog_is_disabled(blog: dict[str, Any] | None) -> bool:
    if not blog:
        return False
    return bool(blog.get("disabled"))


def _truthy_disabled(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes")
    return bool(value)


_db_initialized = False
_firestore_client = None


def _use_firestore() -> bool:
    return YOGA_STORE == "firestore"


def _get_firestore_client():
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client
    from google.cloud import firestore

    project = YOGA_FIRESTORE_PROJECT or None
    _firestore_client = firestore.Client(project=project)
    return _firestore_client


def _connect() -> sqlite3.Connection:
    path = _yoga_db_path()
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db() -> None:
    global _db_initialized
    if _use_firestore():
        if not _db_initialized:
            _migrate_teacher_application_status_firestore()
            _db_initialized = True
        return
    if _db_initialized:
        return
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_teachers (
                email TEXT PRIMARY KEY,
                display_name TEXT NOT NULL DEFAULT '',
                blurb TEXT NOT NULL DEFAULT '',
                photo_data_url TEXT NOT NULL DEFAULT '',
                photo_url TEXT NOT NULL DEFAULT '',
                contact_email TEXT NOT NULL DEFAULT '',
                contact_phone TEXT NOT NULL DEFAULT '',
                contact_link TEXT NOT NULL DEFAULT '',
                youtube_links_json TEXT NOT NULL DEFAULT '[]',
                country TEXT NOT NULL DEFAULT '',
                region TEXT NOT NULL DEFAULT '',
                registered_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(yoga_teachers)").fetchall()
        }
        if "contact_link" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN contact_link TEXT NOT NULL DEFAULT ''"
            )
        if "youtube_links_json" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN youtube_links_json TEXT NOT NULL DEFAULT '[]'"
            )
        if "country" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN country TEXT NOT NULL DEFAULT ''"
            )
        if "region" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN region TEXT NOT NULL DEFAULT ''"
            )
        if "disabled" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0"
            )
        if "banned" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN banned INTEGER NOT NULL DEFAULT 0"
            )
        if "ban_reason" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''"
            )
        if "banned_at" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN banned_at REAL"
            )
        if "admin_lookup_json" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN admin_lookup_json TEXT NOT NULL DEFAULT ''"
            )
        if "reject_reason" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN reject_reason TEXT NOT NULL DEFAULT ''"
            )
        if "rejected_at" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN rejected_at REAL"
            )
        if "submitted_at" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN submitted_at REAL"
            )
        if "approved_at" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN approved_at REAL"
            )
        if "evidence_json" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'"
            )
        if "unlisted" not in cols:
            conn.execute(
                "ALTER TABLE yoga_teachers ADD COLUMN unlisted INTEGER NOT NULL DEFAULT 0"
            )
        _migrate_teacher_application_status_sqlite(conn)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_blogs (
                id TEXT PRIMARY KEY,
                author_email TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                body_json TEXT NOT NULL DEFAULT '[]',
                image TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                view_count INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                published_at REAL
            )
            """
        )
        blog_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(yoga_blogs)").fetchall()
        }
        if "disabled" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0"
            )
        if "flagged" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0"
            )
        if "flag_reason" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN flag_reason TEXT NOT NULL DEFAULT ''"
            )
        if "flagged_at" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN flagged_at REAL"
            )
        if "assessment_ok" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN assessment_ok INTEGER NOT NULL DEFAULT 1"
            )
        if "assessment_reason" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN assessment_reason TEXT NOT NULL DEFAULT ''"
            )
        if "assessed_at" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN assessed_at REAL"
            )
        if "admin_reviewed_at" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN admin_reviewed_at REAL"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_community_routines (
                id TEXT PRIMARY KEY,
                author_email TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'draft',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                published_at REAL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_classes (
                id TEXT PRIMARY KEY,
                teacher_email TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                starts_at TEXT NOT NULL,
                max_registrants INTEGER NOT NULL DEFAULT 1,
                image TEXT NOT NULL DEFAULT '',
                registrant_count INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_yoga_classes_teacher ON yoga_classes(teacher_email)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_yoga_classes_starts ON yoga_classes(starts_at)"
        )
        class_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(yoga_classes)").fetchall()
        }
        if "series_id" not in class_cols:
            conn.execute(
                "ALTER TABLE yoga_classes ADD COLUMN series_id TEXT NOT NULL DEFAULT ''"
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_yoga_classes_series ON yoga_classes(series_id)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_teacher_subscriptions (
                id TEXT PRIMARY KEY,
                subscriber_email TEXT NOT NULL,
                teacher_email TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_subs_subscriber
            ON yoga_teacher_subscriptions(subscriber_email)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_subs_teacher
            ON yoga_teacher_subscriptions(teacher_email)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_class_registrations (
                id TEXT PRIMARY KEY,
                class_id TEXT NOT NULL,
                user_email TEXT NOT NULL,
                teacher_email TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_regs_class
            ON yoga_class_registrations(class_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_regs_user
            ON yoga_class_registrations(user_email)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_class_cancellations (
                id TEXT PRIMARY KEY,
                user_email TEXT NOT NULL,
                class_id TEXT NOT NULL,
                teacher_email TEXT NOT NULL,
                teacher_display_name TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                starts_at TEXT NOT NULL DEFAULT '',
                cancelled_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_cancels_user
            ON yoga_class_cancellations(user_email)
            """
        )
        if "like_count" not in blog_cols:
            conn.execute(
                "ALTER TABLE yoga_blogs ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_blog_likes (
                id TEXT PRIMARY KEY,
                blog_id TEXT NOT NULL,
                user_email TEXT NOT NULL,
                author_email TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_blog_likes_blog
            ON yoga_blog_likes(blog_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_blog_likes_author
            ON yoga_blog_likes(author_email)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_blog_likes_user
            ON yoga_blog_likes(user_email)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS yoga_feedback (
                id TEXT PRIMARY KEY,
                author_email TEXT NOT NULL,
                author_name TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                screenshot_data_url TEXT NOT NULL DEFAULT '',
                debug_json TEXT NOT NULL DEFAULT '',
                user_agent TEXT NOT NULL DEFAULT '',
                route TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL
            )
            """
        )
        feedback_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(yoga_feedback)").fetchall()
        }
        if "status" not in feedback_cols:
            conn.execute(
                "ALTER TABLE yoga_feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'open'"
            )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_yoga_feedback_created
            ON yoga_feedback(created_at)
            """
        )
        conn.commit()
    _db_initialized = True


def _now() -> float:
    return time.time()


def _teacher_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        d = dict(row)
    else:
        d = dict(row)
    yt_raw = d.get("youtube_links_json")
    if yt_raw is None:
        yt_raw = d.get("youtubeLinks")
    if isinstance(yt_raw, str):
        try:
            yt_parsed = json.loads(yt_raw)
        except json.JSONDecodeError:
            yt_parsed = []
    elif isinstance(yt_raw, list):
        yt_parsed = yt_raw
    else:
        yt_parsed = []
    out = {
        "email": d.get("email") or "",
        "displayName": d.get("display_name") or d.get("displayName") or "",
        "blurb": d.get("blurb") or "",
        "photoDataUrl": d.get("photo_data_url") or d.get("photoDataUrl") or "",
        "photoUrl": d.get("photo_url") or d.get("photoUrl") or "",
        "contactEmail": d.get("contact_email") or d.get("contactEmail") or "",
        "contactPhone": d.get("contact_phone") or d.get("contactPhone") or "",
        "contactLink": d.get("contact_link") or d.get("contactLink") or "",
        "youtubeLinks": normalize_youtube_links(yt_parsed),
        "country": d.get("country") or "",
        "region": d.get("region") or d.get("region_name") or "",
        "disabled": _truthy_disabled(d.get("disabled")),
        "unlisted": _truthy_disabled(d.get("unlisted")),
        "banned": _truthy_disabled(d.get("banned")),
        "banReason": d.get("ban_reason") or d.get("banReason") or "",
        "bannedAt": d.get("banned_at") if "banned_at" in d or "bannedAt" in d else d.get("bannedAt"),
        "rejectReason": d.get("reject_reason") or d.get("rejectReason") or "",
        "rejectedAt": d.get("rejected_at") if "rejected_at" in d or "rejectedAt" in d else d.get("rejectedAt"),
        "submittedAt": d.get("submitted_at") if "submitted_at" in d or "submittedAt" in d else d.get("submittedAt"),
        "approvedAt": d.get("approved_at") if "approved_at" in d or "approvedAt" in d else d.get("approvedAt"),
        "evidence": normalize_evidence_list(
            d.get("evidence_json") if "evidence_json" in d else d.get("evidence")
        ),
        "registeredAt": d.get("registered_at") or d.get("registeredAt"),
        "updatedAt": d.get("updated_at") or d.get("updatedAt"),
    }
    lookup = _parse_admin_lookup(
        d.get("admin_lookup_json") if "admin_lookup_json" in d else d.get("adminLookup")
    )
    if lookup:
        out["adminLookup"] = lookup
    return _apply_teacher_legacy_status(out)


def _parse_admin_lookup(raw: Any) -> dict[str, Any] | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return None
    if not isinstance(raw, dict):
        return None
    status = str(raw.get("status") or "").strip().lower()
    report = str(raw.get("reportMarkdown") or "").strip()
    if report or status in ("running", "error"):
        return raw
    return None


def _blog_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        d = dict(row)
        body_raw = d.get("body_json") or "[]"
    else:
        d = dict(row)
        body_raw = d.get("body_json") or d.get("body") or []
    if isinstance(body_raw, str):
        try:
            body = json.loads(body_raw)
        except json.JSONDecodeError:
            body = []
    else:
        body = list(body_raw) if body_raw else []
    return {
        "id": d.get("id") or "",
        "authorEmail": d.get("author_email") or d.get("authorEmail") or "",
        "title": d.get("title") or "",
        "summary": d.get("summary") or "",
        "body": body if isinstance(body, list) else [],
        "image": d.get("image") or "",
        "status": d.get("status") or "draft",
        "disabled": _truthy_disabled(d.get("disabled")),
        "flagged": _truthy_disabled(d.get("flagged")),
        "flagReason": (d.get("flag_reason") or d.get("flagReason") or "").strip(),
        "flaggedAt": d.get("flagged_at") if "flagged_at" in d or "flaggedAt" in d else d.get("flaggedAt"),
        # Legacy blogs without assessment fields are treated as passed (ok=True).
        "assessmentOk": (
            True
            if ("assessment_ok" not in d and "assessmentOk" not in d)
            else _truthy_disabled(
                d.get("assessment_ok") if "assessment_ok" in d else d.get("assessmentOk")
            )
        ),
        "assessmentReason": (
            d.get("assessment_reason") or d.get("assessmentReason") or ""
        ).strip(),
        "assessedAt": (
            d.get("assessed_at")
            if "assessed_at" in d or "assessedAt" in d
            else d.get("assessedAt")
        ),
        "viewCount": int(d.get("view_count") if d.get("view_count") is not None else d.get("viewCount") or 0),
        "likeCount": int(d.get("like_count") if d.get("like_count") is not None else d.get("likeCount") or 0),
        "createdAt": d.get("created_at") or d.get("createdAt"),
        "updatedAt": d.get("updated_at") or d.get("updatedAt"),
        "publishedAt": d.get("published_at") if "published_at" in d or "publishedAt" in d else d.get("publishedAt"),
        "adminReviewedAt": (
            d.get("admin_reviewed_at")
            if "admin_reviewed_at" in d or "adminReviewedAt" in d
            else d.get("adminReviewedAt")
        ),
    }


def _routine_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        d = dict(row)
        payload_raw = d.get("payload_json") or "{}"
    else:
        d = dict(row)
        payload_raw = d.get("payload_json") or d.get("payload") or {}
    if isinstance(payload_raw, str):
        try:
            payload = json.loads(payload_raw)
        except json.JSONDecodeError:
            payload = {}
    else:
        payload = dict(payload_raw) if payload_raw else {}
    return {
        "id": d.get("id") or "",
        "authorEmail": d.get("author_email") or d.get("authorEmail") or "",
        "name": d.get("name") or "",
        "description": d.get("description") or "",
        "payload": payload,
        "status": d.get("status") or "draft",
        "createdAt": d.get("created_at") or d.get("createdAt"),
        "updatedAt": d.get("updated_at") or d.get("updatedAt"),
        "publishedAt": d.get("published_at") if "published_at" in d or "publishedAt" in d else d.get("publishedAt"),
    }


def list_all_teachers() -> list[dict[str, Any]]:
    """All teacher records (including incomplete / disabled), A–Z by name."""
    ensure_db()
    if _use_firestore():
        client = _get_firestore_client()
        docs = client.collection(YOGA_TEACHERS_COLLECTION).stream()
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["email"] = data.get("email") or doc.id
            out.append(_teacher_from_row(data))
        out.sort(key=lambda t: (t.get("displayName") or t.get("email") or "").lower())
        return out
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM yoga_teachers ORDER BY lower(display_name), email"
        ).fetchall()
        return [_teacher_from_row(r) for r in rows]


def list_teachers() -> list[dict[str, Any]]:
    ensure_db()
    if _use_firestore():
        client = _get_firestore_client()
        docs = client.collection(YOGA_TEACHERS_COLLECTION).stream()
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["email"] = data.get("email") or doc.id
            teacher = _teacher_from_row(data)
            if not teacher_appears_in_directory(teacher):
                continue
            out.append(teacher)
        out.sort(key=lambda t: (t.get("displayName") or t.get("email") or "").lower())
        return out
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM yoga_teachers
            WHERE blurb != ''
              AND coalesce(disabled, 0) = 0
              AND coalesce(unlisted, 0) = 0
              AND (photo_data_url != '' OR photo_url != '')
              AND trim(contact_link) != ''
            ORDER BY lower(display_name), email
            """
        ).fetchall()
        return [_teacher_from_row(r) for r in rows]


def get_teacher(email: str) -> dict[str, Any] | None:
    ensure_db()
    email = (email or "").strip().lower()
    if not email:
        return None
    if _use_firestore():
        doc = _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["email"] = email
        return _teacher_from_row(data)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM yoga_teachers WHERE email = ?",
            (email,),
        ).fetchone()
        return _teacher_from_row(row) if row else None


def upsert_teacher(
    email: str,
    *,
    display_name: str | None = None,
    blurb: str | None = None,
    photo_data_url: str | None = None,
    photo_url: str | None = None,
    contact_email: str | None = None,
    contact_phone: str | None = None,
    contact_link: str | None = None,
    youtube_links: list[str] | None = None,
    country: str | None = None,
    region: str | None = None,
    # When True, new teachers are listed immediately (seed / admin). Default False
    # means new registrations stay disabled until an admin enables them.
    approved: bool = False,
) -> dict[str, Any]:
    ensure_db()
    email = email.strip().lower()
    now = _now()
    existing = get_teacher(email)
    is_new = existing is None
    registered_at = (existing or {}).get("registeredAt") or now
    next_display = (
        display_name
        if display_name is not None
        else (existing or {}).get("displayName") or ""
    )
    next_blurb = (
        blurb if blurb is not None else (existing or {}).get("blurb") or ""
    )
    next_photo_data = (
        photo_data_url
        if photo_data_url is not None
        else (existing or {}).get("photoDataUrl") or ""
    )
    next_photo_url = (
        photo_url if photo_url is not None else (existing or {}).get("photoUrl") or ""
    )
    next_contact_email = (
        contact_email
        if contact_email is not None
        else (existing or {}).get("contactEmail") or ""
    )
    next_contact_phone = (
        contact_phone
        if contact_phone is not None
        else (existing or {}).get("contactPhone") or ""
    )
    next_contact_link = (
        contact_link
        if contact_link is not None
        else (existing or {}).get("contactLink") or ""
    )
    next_youtube = (
        normalize_youtube_links(youtube_links)
        if youtube_links is not None
        else list((existing or {}).get("youtubeLinks") or [])
    )
    next_country = (
        country if country is not None else (existing or {}).get("country") or ""
    )
    next_region = (
        region if region is not None else (existing or {}).get("region") or ""
    )
    link = (next_contact_link or "").strip()[:MAX_CONTACT_LINK_LEN]
    if link and not re_match_http(link):
        if "." in link and " " not in link:
            link = "https://" + link.lstrip("/")
    # New teachers require admin approval before public listing.
    # Updates: keep already-public teachers approved; everyone else stays pending
    # (covers legacy docs where `disabled` was missing and defaulted to false).
    if is_new:
        next_disabled = not approved
    else:
        next_disabled = not teacher_is_publicly_listed(existing)
    record = {
        "email": email,
        "display_name": (next_display or "").strip(),
        "blurb": (next_blurb or "").strip()[:MAX_BLURB_LEN],
        "photo_data_url": next_photo_data,
        "photo_url": next_photo_url,
        "contact_email": (next_contact_email or "").strip()[:MAX_CONTACT_EMAIL_LEN],
        "contact_phone": (next_contact_phone or "").strip()[:MAX_CONTACT_PHONE_LEN],
        "contact_link": link,
        "youtube_links": next_youtube,
        "country": (next_country or "").strip()[:8].upper(),
        "region": (next_region or "").strip()[:120],
        "disabled": next_disabled,
        "registered_at": registered_at,
        "updated_at": now,
    }
    if _use_firestore():
        payload = {
            "email": email,
            "displayName": record["display_name"],
            "blurb": record["blurb"],
            "photoDataUrl": record["photo_data_url"],
            "photoUrl": record["photo_url"],
            "contactEmail": record["contact_email"],
            "contactPhone": record["contact_phone"],
            "contactLink": record["contact_link"],
            "youtubeLinks": record["youtube_links"],
            "country": record["country"],
            "region": record["region"],
            "disabled": next_disabled,
            "registeredAt": registered_at,
            "updatedAt": now,
        }
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            payload, merge=True
        )
        return get_teacher(email) or _teacher_from_row(payload)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_teachers (
                email, display_name, blurb, photo_data_url, photo_url,
                contact_email, contact_phone, contact_link, youtube_links_json,
                country, region, disabled, registered_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                display_name = excluded.display_name,
                blurb = excluded.blurb,
                photo_data_url = excluded.photo_data_url,
                photo_url = excluded.photo_url,
                contact_email = excluded.contact_email,
                contact_phone = excluded.contact_phone,
                contact_link = excluded.contact_link,
                youtube_links_json = excluded.youtube_links_json,
                country = excluded.country,
                region = excluded.region,
                disabled = excluded.disabled,
                updated_at = excluded.updated_at
            """,
            (
                email,
                record["display_name"],
                record["blurb"],
                record["photo_data_url"],
                record["photo_url"],
                record["contact_email"],
                record["contact_phone"],
                record["contact_link"],
                json.dumps(record["youtube_links"]),
                record["country"],
                record["region"],
                1 if next_disabled else 0,
                registered_at,
                now,
            ),
        )
        conn.commit()
    return get_teacher(email) or _teacher_from_row(
        {
            **record,
            "youtube_links_json": json.dumps(record["youtube_links"]),
        }
    )


def re_match_http(value: str) -> bool:
    return value.lower().startswith(("http://", "https://"))


def set_teacher_photo(email: str, photo_data_url: str) -> dict[str, Any]:
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    return upsert_teacher(
        email,
        display_name=teacher.get("displayName") or "",
        blurb=teacher.get("blurb") or "",
        photo_data_url=photo_data_url,
        photo_url="",
        contact_email=teacher.get("contactEmail") or "",
        contact_phone=teacher.get("contactPhone") or "",
        contact_link=teacher.get("contactLink") or "",
        youtube_links=list(teacher.get("youtubeLinks") or []),
        country=teacher.get("country") or "",
        region=teacher.get("region") or "",
    )


def set_teacher_unlisted(email: str, unlisted: bool) -> dict[str, Any]:
    """Hide from Teachers directory while keeping the profile URL reachable."""
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher):
        raise ValueError("teacher_banned")
    if not teacher_is_publicly_listed(teacher):
        raise ValueError("teacher_not_listed")
    now = _now()
    flag = bool(unlisted)
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            {"unlisted": flag, "updatedAt": now},
            merge=True,
        )
        return get_teacher(email) or {**teacher, "unlisted": flag, "updatedAt": now}
    with _connect() as conn:
        conn.execute(
            "UPDATE yoga_teachers SET unlisted = ?, updated_at = ? WHERE email = ?",
            (1 if flag else 0, now, email),
        )
        conn.commit()
    return get_teacher(email) or {**teacher, "unlisted": flag, "updatedAt": now}


def set_teacher_disabled(email: str, disabled: bool) -> dict[str, Any]:
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher) and not disabled:
        raise ValueError("teacher_banned")
    now = _now()
    flag = bool(disabled)
    # Approving clears any prior application rejection reason and stamps approvedAt.
    clear_reject = not flag
    prior_approved_at = _ts_or_none(teacher.get("approvedAt"))
    # First approval: wipe application evidence (heavy dataUrls) from the listing.
    clear_evidence = clear_reject and prior_approved_at is None
    approved_at = prior_approved_at
    if clear_reject and approved_at is None:
        approved_at = now
    # When self-disabling a legacy listed teacher, persist backfilled approvedAt.
    persist_approved_on_disable = flag and approved_at is not None
    if _use_firestore():
        payload: dict[str, Any] = {"disabled": flag, "updatedAt": now}
        if clear_reject:
            payload["rejectReason"] = ""
            payload["rejectedAt"] = None
            payload["approvedAt"] = approved_at
            if clear_evidence:
                payload["evidence"] = []
        elif persist_approved_on_disable:
            payload["approvedAt"] = approved_at
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            payload,
            merge=True,
        )
        out = get_teacher(email) or {**teacher, "disabled": flag, "updatedAt": now}
        if clear_reject:
            out = {
                **out,
                "rejectReason": "",
                "rejectedAt": None,
                "approvedAt": approved_at,
            }
            if clear_evidence:
                out = {**out, "evidence": []}
        elif persist_approved_on_disable:
            out = {**out, "approvedAt": approved_at}
        return out
    with _connect() as conn:
        if clear_reject:
            if clear_evidence:
                conn.execute(
                    """
                    UPDATE yoga_teachers
                    SET disabled = ?, reject_reason = '', rejected_at = NULL,
                        approved_at = ?, evidence_json = ?, updated_at = ?
                    WHERE email = ?
                    """,
                    (0, approved_at, json.dumps([]), now, email),
                )
            else:
                conn.execute(
                    """
                    UPDATE yoga_teachers
                    SET disabled = ?, reject_reason = '', rejected_at = NULL,
                        approved_at = ?, updated_at = ?
                    WHERE email = ?
                    """,
                    (0, approved_at, now, email),
                )
        elif persist_approved_on_disable:
            conn.execute(
                """
                UPDATE yoga_teachers
                SET disabled = ?, approved_at = ?, updated_at = ?
                WHERE email = ?
                """,
                (1, approved_at, now, email),
            )
        else:
            conn.execute(
                "UPDATE yoga_teachers SET disabled = ?, updated_at = ? WHERE email = ?",
                (1, now, email),
            )
        conn.commit()
    out = get_teacher(email) or {**teacher, "disabled": flag, "updatedAt": now}
    if clear_reject:
        out = {
            **out,
            "rejectReason": "",
            "rejectedAt": None,
            "approvedAt": approved_at,
        }
        if clear_evidence:
            out = {**out, "evidence": []}
    elif persist_approved_on_disable:
        out = {**out, "approvedAt": approved_at}
    return out


def mark_teacher_submitted(email: str) -> dict[str, Any]:
    """Publish / resubmit: stamp submittedAt, clear rejection, stay disabled for review."""
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher):
        raise ValueError("teacher_banned")
    if not teacher_listing_complete(teacher):
        raise ValueError("listing_incomplete")
    now = _now()
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            {
                "disabled": True,
                "submittedAt": now,
                "rejectReason": "",
                "rejectedAt": None,
                "updatedAt": now,
            },
            merge=True,
        )
        return get_teacher(email) or {
            **teacher,
            "disabled": True,
            "submittedAt": now,
            "rejectReason": "",
            "rejectedAt": None,
            "updatedAt": now,
        }
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_teachers
            SET disabled = 1, submitted_at = ?, reject_reason = '',
                rejected_at = NULL, updated_at = ?
            WHERE email = ?
            """,
            (now, now, email),
        )
        conn.commit()
    return get_teacher(email) or {
        **teacher,
        "disabled": True,
        "submittedAt": now,
        "rejectReason": "",
        "rejectedAt": None,
        "updatedAt": now,
    }


def add_teacher_evidence(
    email: str,
    *,
    name: str = "",
    content_type: str = "",
    data_url: str = "",
    url: str = "",
) -> dict[str, Any]:
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher):
        raise ValueError("teacher_banned")
    existing = list(teacher.get("evidence") or [])
    if len(existing) >= MAX_TEACHER_EVIDENCE:
        raise ValueError("evidence_limit")
    item = normalize_evidence_item(
        {
            "id": str(uuid.uuid4()),
            "name": name,
            "contentType": content_type,
            "dataUrl": data_url,
            "url": url,
            "uploadedAt": _now(),
        }
    )
    if not item:
        raise ValueError("invalid_evidence")
    next_list = existing + [item]
    return _set_teacher_evidence_list(email, next_list, teacher=teacher)


def remove_teacher_evidence(email: str, evidence_id: str) -> dict[str, Any]:
    ensure_db()
    email = (email or "").strip().lower()
    evidence_id = (evidence_id or "").strip()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher):
        raise ValueError("teacher_banned")
    existing = list(teacher.get("evidence") or [])
    next_list = [e for e in existing if e.get("id") != evidence_id]
    if len(next_list) == len(existing):
        raise KeyError("evidence_not_found")
    return _set_teacher_evidence_list(email, next_list, teacher=teacher)


def _set_teacher_evidence_list(
    email: str,
    evidence: list[dict[str, Any]],
    *,
    teacher: dict[str, Any],
) -> dict[str, Any]:
    now = _now()
    normalized = normalize_evidence_list(evidence)
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            {"evidence": normalized, "updatedAt": now},
            merge=True,
        )
        return get_teacher(email) or {**teacher, "evidence": normalized, "updatedAt": now}
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_teachers
            SET evidence_json = ?, updated_at = ?
            WHERE email = ?
            """,
            (json.dumps(normalized), now, email),
        )
        conn.commit()
    return get_teacher(email) or {**teacher, "evidence": normalized, "updatedAt": now}


def set_teacher_rejected(email: str, reject_reason: str) -> dict[str, Any]:
    """Reject a teacher application: keep listing disabled with an applicant-visible reason."""
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher):
        raise ValueError("teacher_banned")
    reason = (reject_reason or "").strip()[:500]
    if not reason:
        raise ValueError("reject_reason_required")
    now = _now()
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            {
                "disabled": True,
                "rejectReason": reason,
                "rejectedAt": now,
                "updatedAt": now,
            },
            merge=True,
        )
        return get_teacher(email) or {
            **teacher,
            "disabled": True,
            "rejectReason": reason,
            "rejectedAt": now,
            "updatedAt": now,
        }
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_teachers
            SET disabled = 1, reject_reason = ?, rejected_at = ?, updated_at = ?
            WHERE email = ?
            """,
            (reason, now, now, email),
        )
        conn.commit()
    return get_teacher(email) or {
        **teacher,
        "disabled": True,
        "rejectReason": reason,
        "rejectedAt": now,
        "updatedAt": now,
    }


def clear_teacher_rejection(email: str) -> dict[str, Any]:
    """Applicant resubmits after rejection: clear reject reason, stay disabled for review."""
    # Prefer mark_teacher_submitted when listing is complete; keep for API compat.
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if teacher_is_banned(teacher):
        raise ValueError("teacher_banned")
    reason = str(teacher.get("rejectReason") or "").strip()
    if not reason:
        raise ValueError("not_rejected")
    now = _now()
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            {
                "disabled": True,
                "rejectReason": "",
                "rejectedAt": None,
                "submittedAt": now,
                "updatedAt": now,
            },
            merge=True,
        )
        return get_teacher(email) or {
            **teacher,
            "disabled": True,
            "rejectReason": "",
            "rejectedAt": None,
            "submittedAt": now,
            "updatedAt": now,
        }
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_teachers
            SET disabled = 1, reject_reason = '', rejected_at = NULL,
                submitted_at = ?, updated_at = ?
            WHERE email = ?
            """,
            (now, now, email),
        )
        conn.commit()
    return get_teacher(email) or {
        **teacher,
        "disabled": True,
        "rejectReason": "",
        "rejectedAt": None,
        "submittedAt": now,
        "updatedAt": now,
    }


def set_teacher_banned(
    email: str,
    banned: bool,
    *,
    ban_reason: str = "",
) -> dict[str, Any]:
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    now = _now()
    flag = bool(banned)
    reason = (ban_reason or "").strip()[:500] if flag else ""
    banned_at = now if flag else None
    if _use_firestore():
        payload: dict[str, Any] = {
            "banned": flag,
            "banReason": reason,
            "bannedAt": banned_at,
            "updatedAt": now,
        }
        if flag:
            payload["disabled"] = True
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            payload,
            merge=True,
        )
        return get_teacher(email) or {
            **teacher,
            "banned": flag,
            "banReason": reason,
            "bannedAt": banned_at,
            "disabled": True if flag else teacher.get("disabled"),
            "updatedAt": now,
        }
    with _connect() as conn:
        if flag:
            conn.execute(
                """
                UPDATE yoga_teachers
                SET banned = 1, ban_reason = ?, banned_at = ?, disabled = 1, updated_at = ?
                WHERE email = ?
                """,
                (reason, banned_at, now, email),
            )
        else:
            conn.execute(
                """
                UPDATE yoga_teachers
                SET banned = 0, ban_reason = '', banned_at = NULL, updated_at = ?
                WHERE email = ?
                """,
                (now, email),
            )
        conn.commit()
    return get_teacher(email) or {
        **teacher,
        "banned": flag,
        "banReason": reason,
        "bannedAt": banned_at,
        "updatedAt": now,
    }


def get_teacher_admin_lookup(email: str) -> dict[str, Any] | None:
    """Admin-only saved background lookup; never expose on public teacher payloads."""
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    lookup = teacher.get("adminLookup")
    return lookup if isinstance(lookup, dict) else None


def set_teacher_admin_lookup(email: str, lookup: dict[str, Any]) -> dict[str, Any]:
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    now = _now()
    status = str((lookup or {}).get("status") or "").strip().lower()
    report = str((lookup or {}).get("reportMarkdown") or "").strip()
    prior = teacher.get("adminLookup") if isinstance(teacher.get("adminLookup"), dict) else {}
    if status not in ("running", "ready", "error"):
        status = "ready" if report else "error"
    if status == "ready" and not report:
        raise ValueError("reportMarkdown is required")
    if not report and status in ("running", "error"):
        report = str((prior or {}).get("reportMarkdown") or "").strip()
    error_message = str((lookup or {}).get("error") or "").strip()[:800]
    sources = list((lookup or {}).get("sources") or [])
    if not sources and status in ("running", "error"):
        sources = list((prior or {}).get("sources") or [])
    contact_snapshot = dict((lookup or {}).get("contactSnapshot") or {})
    if not contact_snapshot and status in ("running", "error"):
        contact_snapshot = dict((prior or {}).get("contactSnapshot") or {})
    payload = {
        "status": status,
        "reportMarkdown": report,
        "sources": sources,
        "contactSnapshot": contact_snapshot,
        "searchBackend": str((lookup or {}).get("searchBackend") or (prior or {}).get("searchBackend") or ""),
        "model": str((lookup or {}).get("model") or (prior or {}).get("model") or ""),
        "queryCount": int((lookup or {}).get("queryCount") or (prior or {}).get("queryCount") or 0),
        "timing": dict((lookup or {}).get("timing") or (prior or {}).get("timing") or {}),
        "rejectReason": str(
            (lookup or {}).get("rejectReason")
            or (prior or {}).get("rejectReason")
            or ""
        ).strip()[:500],
        "generatedAt": (lookup or {}).get("generatedAt")
        if (lookup or {}).get("generatedAt") is not None
        else (prior or {}).get("generatedAt"),
        "generatedBy": str(
            (lookup or {}).get("generatedBy") or (prior or {}).get("generatedBy") or ""
        ).strip().lower(),
        "startedAt": float((lookup or {}).get("startedAt") or 0) or (prior or {}).get("startedAt"),
        "error": error_message if status == "error" else "",
        "updatedAt": now,
    }
    if status == "ready" and not payload.get("generatedAt"):
        payload["generatedAt"] = now
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).set(
            {"adminLookup": payload, "updatedAt": now},
            merge=True,
        )
        return payload
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_teachers
            SET admin_lookup_json = ?, updated_at = ?
            WHERE email = ?
            """,
            (json.dumps(payload), now, email),
        )
        conn.commit()
    return payload


def delete_teacher(email: str) -> None:
    ensure_db()
    email = (email or "").strip().lower()
    teacher = get_teacher(email)
    if not teacher:
        raise KeyError("teacher_not_found")
    if _use_firestore():
        _get_firestore_client().collection(YOGA_TEACHERS_COLLECTION).document(email).delete()
        return
    with _connect() as conn:
        conn.execute("DELETE FROM yoga_teachers WHERE email = ?", (email,))
        conn.commit()


def delete_blog(blog_id: str) -> None:
    ensure_db()
    blog_id = (blog_id or "").strip()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    if _use_firestore():
        client = _get_firestore_client()
        likes = (
            client.collection(YOGA_BLOG_LIKES_COLLECTION)
            .where("blogId", "==", blog_id)
            .stream()
        )
        for doc in likes:
            doc.reference.delete()
        client.collection(YOGA_BLOGS_COLLECTION).document(blog_id).delete()
        return
    with _connect() as conn:
        conn.execute("DELETE FROM yoga_blog_likes WHERE blog_id = ?", (blog_id,))
        conn.execute("DELETE FROM yoga_blogs WHERE id = ?", (blog_id,))
        conn.commit()


def set_blog_disabled(blog_id: str, disabled: bool) -> dict[str, Any]:
    ensure_db()
    blog_id = (blog_id or "").strip()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    now = _now()
    flag = bool(disabled)
    if _use_firestore():
        _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id).set(
            {"disabled": flag, "updatedAt": now},
            merge=True,
        )
        return get_blog(blog_id) or {**blog, "disabled": flag, "updatedAt": now}
    with _connect() as conn:
        conn.execute(
            "UPDATE yoga_blogs SET disabled = ?, updated_at = ? WHERE id = ?",
            (1 if flag else 0, now, blog_id),
        )
        conn.commit()
    return get_blog(blog_id) or {**blog, "disabled": flag, "updatedAt": now}


MAX_BLOG_FLAG_REASON_LEN = 500


def flag_blog(blog_id: str, reason: str = "") -> dict[str, Any]:
    """Mark a published blog as flagged for admin review."""
    ensure_db()
    blog_id = (blog_id or "").strip()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    if blog.get("status") != "published":
        raise PermissionError("not_published")
    if blog_is_disabled(blog):
        raise KeyError("blog_not_found")
    now = _now()
    reason_clean = (reason or "").strip()[:MAX_BLOG_FLAG_REASON_LEN]
    already = bool(blog.get("flagged"))
    existing_reason = (blog.get("flagReason") or "").strip()
    next_reason = existing_reason or reason_clean
    if already and reason_clean and not existing_reason:
        next_reason = reason_clean
    elif already and existing_reason:
        next_reason = existing_reason
    elif reason_clean:
        next_reason = reason_clean
    flagged_at = blog.get("flaggedAt") if already and blog.get("flaggedAt") else now
    if already and next_reason == existing_reason:
        return blog
    if _use_firestore():
        _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id).set(
            {
                "flagged": True,
                "flagReason": next_reason,
                "flaggedAt": flagged_at,
                "updatedAt": now,
            },
            merge=True,
        )
        return get_blog(blog_id) or {
            **blog,
            "flagged": True,
            "flagReason": next_reason,
            "flaggedAt": flagged_at,
            "updatedAt": now,
        }
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_blogs
            SET flagged = 1, flag_reason = ?, flagged_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (next_reason, flagged_at, now, blog_id),
        )
        conn.commit()
    return get_blog(blog_id) or {
        **blog,
        "flagged": True,
        "flagReason": next_reason,
        "flaggedAt": flagged_at,
        "updatedAt": now,
    }


def clear_blog_flag(blog_id: str) -> dict[str, Any]:
    ensure_db()
    blog_id = (blog_id or "").strip()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    now = _now()
    if _use_firestore():
        _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id).set(
            {
                "flagged": False,
                "flagReason": "",
                "flaggedAt": None,
                "updatedAt": now,
            },
            merge=True,
        )
        return get_blog(blog_id) or {
            **blog,
            "flagged": False,
            "flagReason": "",
            "flaggedAt": None,
            "updatedAt": now,
        }
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_blogs
            SET flagged = 0, flag_reason = '', flagged_at = NULL, updated_at = ?
            WHERE id = ?
            """,
            (now, blog_id),
        )
        conn.commit()
    return get_blog(blog_id) or {
        **blog,
        "flagged": False,
        "flagReason": "",
        "flaggedAt": None,
        "updatedAt": now,
    }


def list_blogs(
    *,
    published_only: bool = True,
    author_email: str | None = None,
    sample: int | None = None,
    include_disabled: bool = False,
    hide_disabled_teachers: bool = False,
) -> list[dict[str, Any]]:
    ensure_db()
    author = (author_email or "").strip().lower() or None
    if _use_firestore():
        client = _get_firestore_client()
        query = client.collection(YOGA_BLOGS_COLLECTION)
        docs = list(query.stream())
        out = []
        disabled_teacher_cache: dict[str, bool] = {}
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = data.get("id") or doc.id
            blog = _blog_from_row(data)
            if published_only and blog.get("status") != "published":
                continue
            if not include_disabled and blog_is_disabled(blog):
                continue
            if author and blog.get("authorEmail") != author:
                continue
            if hide_disabled_teachers:
                email = (blog.get("authorEmail") or "").strip().lower()
                if email:
                    if email not in disabled_teacher_cache:
                        disabled_teacher_cache[email] = teacher_is_disabled(
                            get_teacher(email)
                        )
                    if disabled_teacher_cache[email]:
                        continue
            out.append(blog)
        out.sort(
            key=lambda b: float(b.get("publishedAt") or b.get("updatedAt") or 0),
            reverse=True,
        )
        if sample is not None:
            return out[: max(0, int(sample))]
        return out
    clauses = []
    params: list[Any] = []
    if published_only:
        clauses.append("status = 'published'")
    if not include_disabled:
        clauses.append("coalesce(disabled, 0) = 0")
    if author:
        clauses.append("author_email = ?")
        params.append(author)
    if hide_disabled_teachers:
        clauses.append(
            """author_email NOT IN (
                SELECT email FROM yoga_teachers WHERE coalesce(disabled, 0) != 0
            )"""
        )
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"SELECT * FROM yoga_blogs{where} ORDER BY coalesce(published_at, updated_at) DESC"
    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()
        out = [_blog_from_row(r) for r in rows]
    if sample is not None:
        return out[: max(0, int(sample))]
    return out


def get_blog(blog_id: str) -> dict[str, Any] | None:
    ensure_db()
    blog_id = (blog_id or "").strip()
    if not blog_id:
        return None
    if _use_firestore():
        doc = _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = blog_id
        return _blog_from_row(data)
    with _connect() as conn:
        row = conn.execute("SELECT * FROM yoga_blogs WHERE id = ?", (blog_id,)).fetchone()
        return _blog_from_row(row) if row else None


def _normalize_blog_body(raw: Any) -> list[str]:
    """Accept list of paragraphs/HTML chunks, or a single HTML string."""
    if raw is None:
        return []
    if isinstance(raw, str):
        text = raw.strip()
        return [text] if text else []
    if isinstance(raw, list):
        return [str(p).strip() for p in raw if str(p).strip()]
    return []


def upsert_blog(
    *,
    blog_id: str | None,
    author_email: str,
    title: str,
    summary: str,
    body: list[str] | str,
    image: str,
    status: str | None = None,
    assessment_ok: bool | None = None,
    assessment_reason: str | None = None,
    assessed_at: float | None = None,
) -> dict[str, Any]:
    ensure_db()
    author_email = author_email.strip().lower()
    now = _now()
    existing = get_blog(blog_id) if blog_id else None
    bid = (blog_id or "").strip() or (existing or {}).get("id") or str(uuid.uuid4())
    created_at = (existing or {}).get("createdAt") or now
    next_status = status or (existing or {}).get("status") or "draft"
    published_at = (existing or {}).get("publishedAt")
    if next_status == "published" and not published_at:
        published_at = now
    if next_status != "published":
        published_at = published_at if next_status == "published" else (existing or {}).get("publishedAt")
    view_count = int((existing or {}).get("viewCount") or 0)
    like_count = int((existing or {}).get("likeCount") or 0)
    body_list = _normalize_blog_body(body)
    if assessment_ok is None:
        next_assessment_ok = True if existing is None else bool(existing.get("assessmentOk", True))
        next_assessment_reason = (
            "" if existing is None else str(existing.get("assessmentReason") or "")
        )
        next_assessed_at = None if existing is None else existing.get("assessedAt")
    else:
        next_assessment_ok = bool(assessment_ok)
        next_assessment_reason = (assessment_reason or "").strip() if not next_assessment_ok else ""
        next_assessed_at = assessed_at if assessed_at is not None else now
    if _use_firestore():
        payload = {
            "id": bid,
            "authorEmail": author_email,
            "title": title.strip(),
            "summary": summary.strip(),
            "body": body_list,
            "image": (image or "").strip(),
            "status": next_status,
            "viewCount": view_count,
            "likeCount": like_count,
            "createdAt": created_at,
            "updatedAt": now,
            "publishedAt": published_at,
            "assessmentOk": next_assessment_ok,
            "assessmentReason": next_assessment_reason,
            "assessedAt": next_assessed_at,
        }
        _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(bid).set(payload, merge=True)
        return _blog_from_row(payload)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_blogs (
                id, author_email, title, summary, body_json, image, status,
                view_count, like_count, created_at, updated_at, published_at,
                assessment_ok, assessment_reason, assessed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                author_email = excluded.author_email,
                title = excluded.title,
                summary = excluded.summary,
                body_json = excluded.body_json,
                image = excluded.image,
                status = excluded.status,
                updated_at = excluded.updated_at,
                published_at = excluded.published_at,
                assessment_ok = excluded.assessment_ok,
                assessment_reason = excluded.assessment_reason,
                assessed_at = excluded.assessed_at
            """,
            (
                bid,
                author_email,
                title.strip(),
                summary.strip(),
                json.dumps(body_list),
                (image or "").strip(),
                next_status,
                view_count,
                like_count,
                created_at,
                now,
                published_at,
                1 if next_assessment_ok else 0,
                next_assessment_reason,
                next_assessed_at,
            ),
        )
        conn.commit()
    return get_blog(bid) or {}


def set_blog_assessment(
    blog_id: str,
    *,
    ok: bool,
    reason: str = "",
    demote_if_published: bool = True,
) -> dict[str, Any]:
    """Persist assessment result; optionally demote published posts that fail."""
    ensure_db()
    blog_id = (blog_id or "").strip()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    now = _now()
    passed = bool(ok)
    reason_clean = "" if passed else (reason or "").strip()[:500]
    next_status = blog.get("status") or "draft"
    if not passed and demote_if_published and next_status == "published":
        next_status = "draft"
    if _use_firestore():
        payload: dict[str, Any] = {
            "assessmentOk": passed,
            "assessmentReason": reason_clean,
            "assessedAt": now,
            "updatedAt": now,
            "status": next_status,
        }
        _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id).set(
            payload,
            merge=True,
        )
        return get_blog(blog_id) or {**blog, **payload}
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_blogs
            SET assessment_ok = ?, assessment_reason = ?, assessed_at = ?,
                status = ?, updated_at = ?
            WHERE id = ?
            """,
            (1 if passed else 0, reason_clean, now, next_status, now, blog_id),
        )
        conn.commit()
    return get_blog(blog_id) or {
        **blog,
        "assessmentOk": passed,
        "assessmentReason": reason_clean,
        "assessedAt": now,
        "status": next_status,
        "updatedAt": now,
    }


def publish_blog(blog_id: str, author_email: str) -> dict[str, Any]:
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    if blog.get("authorEmail") != author_email.strip().lower():
        raise PermissionError("not_author")
    if not blog.get("assessmentOk", True):
        raise ValueError("assessment_failed")
    published = upsert_blog(
        blog_id=blog_id,
        author_email=author_email,
        title=blog.get("title") or "",
        summary=blog.get("summary") or "",
        body=list(blog.get("body") or []),
        image=blog.get("image") or "",
        status="published",
        assessment_ok=True,
        assessment_reason="",
    )
    return published


def increment_blog_views(blog_id: str) -> int:
    ensure_db()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    if blog_is_disabled(blog):
        raise KeyError("blog_not_found")
    if blog.get("status") != "published":
        return int(blog.get("viewCount") or 0)
    next_count = int(blog.get("viewCount") or 0) + 1
    if _use_firestore():
        from google.cloud import firestore as fs

        ref = _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id)
        ref.update({"viewCount": fs.Increment(1)})
        return next_count
    with _connect() as conn:
        conn.execute(
            "UPDATE yoga_blogs SET view_count = view_count + 1 WHERE id = ?",
            (blog_id,),
        )
        conn.commit()
        row = conn.execute(
            "SELECT view_count FROM yoga_blogs WHERE id = ?",
            (blog_id,),
        ).fetchone()
        return int(row["view_count"]) if row else next_count


def _blog_like_id(blog_id: str, user_email: str) -> str:
    return f"{blog_id.strip()}__{user_email.strip().lower()}"


def is_blog_liked(blog_id: str, user_email: str) -> bool:
    ensure_db()
    lid = _blog_like_id(blog_id, user_email)
    if _use_firestore():
        doc = (
            _get_firestore_client()
            .collection(YOGA_BLOG_LIKES_COLLECTION)
            .document(lid)
            .get()
        )
        return bool(doc.exists)
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM yoga_blog_likes WHERE id = ?", (lid,)
        ).fetchone()
        return bool(row)


def like_blog(blog_id: str, user_email: str) -> dict[str, Any]:
    """Record a like from user_email. Idempotent. Returns {likeCount, liked}."""
    ensure_db()
    blog_id = (blog_id or "").strip()
    user_email = (user_email or "").strip().lower()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    if blog_is_disabled(blog):
        raise KeyError("blog_not_found")
    if blog.get("status") != "published":
        raise PermissionError("not_published")
    author_email = (blog.get("authorEmail") or "").strip().lower()
    if user_email == author_email:
        raise ValueError("cannot_like_own")
    lid = _blog_like_id(blog_id, user_email)
    if is_blog_liked(blog_id, user_email):
        return {
            "likeCount": int(blog.get("likeCount") or 0),
            "liked": True,
        }
    now = _now()
    payload = {
        "id": lid,
        "blogId": blog_id,
        "userEmail": user_email,
        "authorEmail": author_email,
        "createdAt": now,
    }
    if _use_firestore():
        from google.cloud import firestore as fs

        client = _get_firestore_client()
        client.collection(YOGA_BLOG_LIKES_COLLECTION).document(lid).set(payload)
        client.collection(YOGA_BLOGS_COLLECTION).document(blog_id).update(
            {"likeCount": fs.Increment(1)}
        )
        return {
            "likeCount": int(blog.get("likeCount") or 0) + 1,
            "liked": True,
        }
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_blog_likes (
                id, blog_id, user_email, author_email, created_at
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (lid, blog_id, user_email, author_email, now),
        )
        conn.execute(
            "UPDATE yoga_blogs SET like_count = like_count + 1 WHERE id = ?",
            (blog_id,),
        )
        conn.commit()
        row = conn.execute(
            "SELECT like_count FROM yoga_blogs WHERE id = ?",
            (blog_id,),
        ).fetchone()
        return {
            "likeCount": int(row["like_count"]) if row else int(blog.get("likeCount") or 0) + 1,
            "liked": True,
        }


def unlike_blog(blog_id: str, user_email: str) -> dict[str, Any]:
    """Remove a like. Idempotent. Returns {likeCount, liked}."""
    ensure_db()
    blog_id = (blog_id or "").strip()
    user_email = (user_email or "").strip().lower()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    lid = _blog_like_id(blog_id, user_email)
    if not is_blog_liked(blog_id, user_email):
        return {
            "likeCount": int(blog.get("likeCount") or 0),
            "liked": False,
        }
    if _use_firestore():
        from google.cloud import firestore as fs

        client = _get_firestore_client()
        client.collection(YOGA_BLOG_LIKES_COLLECTION).document(lid).delete()
        next_count = max(0, int(blog.get("likeCount") or 0) - 1)
        client.collection(YOGA_BLOGS_COLLECTION).document(blog_id).update(
            {"likeCount": next_count}
        )
        return {"likeCount": next_count, "liked": False}
    with _connect() as conn:
        conn.execute("DELETE FROM yoga_blog_likes WHERE id = ?", (lid,))
        conn.execute(
            """
            UPDATE yoga_blogs
            SET like_count = CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END
            WHERE id = ?
            """,
            (blog_id,),
        )
        conn.commit()
        row = conn.execute(
            "SELECT like_count FROM yoga_blogs WHERE id = ?",
            (blog_id,),
        ).fetchone()
        return {
            "likeCount": int(row["like_count"]) if row else max(0, int(blog.get("likeCount") or 0) - 1),
            "liked": False,
        }


def count_subscriptions_by_teacher() -> dict[str, int]:
    ensure_db()
    if _use_firestore():
        docs = _get_firestore_client().collection(YOGA_SUBSCRIPTIONS_COLLECTION).stream()
        counts: dict[str, int] = {}
        for doc in docs:
            data = doc.to_dict() or {}
            teacher = (data.get("teacherEmail") or "").strip().lower()
            if not teacher:
                continue
            counts[teacher] = counts.get(teacher, 0) + 1
        return counts
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT teacher_email, COUNT(*) AS n
            FROM yoga_teacher_subscriptions
            GROUP BY teacher_email
            """
        ).fetchall()
        return {str(r["teacher_email"]): int(r["n"]) for r in rows}


def count_blog_likes_by_author() -> dict[str, int]:
    ensure_db()
    if _use_firestore():
        docs = _get_firestore_client().collection(YOGA_BLOG_LIKES_COLLECTION).stream()
        counts: dict[str, int] = {}
        for doc in docs:
            data = doc.to_dict() or {}
            author = (data.get("authorEmail") or "").strip().lower()
            if not author:
                continue
            counts[author] = counts.get(author, 0) + 1
        return counts
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT author_email, COUNT(*) AS n
            FROM yoga_blog_likes
            GROUP BY author_email
            """
        ).fetchall()
        return {str(r["author_email"]): int(r["n"]) for r in rows}


def list_top_teachers(
    *,
    limit: int = 10,
    country: str | None = None,
    region: str | None = None,
) -> list[dict[str, Any]]:
    """Publicly listed teachers ranked by likes + weighted subscriptions."""
    ensure_db()
    limit = max(1, min(int(limit or 10), 50))
    country_code = (country or "").strip().upper()
    region_name = (region or "").strip()
    teachers = [t for t in list_teachers() if teacher_appears_in_directory(t)]
    if country_code:
        if country_code == "_":
            teachers = [t for t in teachers if not (t.get("country") or "").strip()]
        else:
            teachers = [
                t
                for t in teachers
                if (t.get("country") or "").strip().upper() == country_code
            ]
    if region_name:
        teachers = [
            t for t in teachers if (t.get("region") or "").strip() == region_name
        ]
    like_counts = count_blog_likes_by_author()
    sub_counts = count_subscriptions_by_teacher()
    ranked: list[dict[str, Any]] = []
    for teacher in teachers:
        email = (teacher.get("email") or "").strip().lower()
        likes = int(like_counts.get(email, 0))
        subs = int(sub_counts.get(email, 0))
        score = likes + (subs * TEACHER_SCORE_SUBSCRIPTION_WEIGHT)
        ranked.append(
            {
                **teacher,
                "likeCount": likes,
                "subscriberCount": subs,
                "score": score,
            }
        )
    ranked.sort(
        key=lambda t: (
            -int(t.get("score") or 0),
            (t.get("displayName") or t.get("email") or "").lower(),
        )
    )
    return ranked[:limit]


def list_routines(
    *,
    published_only: bool = True,
    author_email: str | None = None,
    hide_disabled_teachers: bool = False,
) -> list[dict[str, Any]]:
    ensure_db()
    author = (author_email or "").strip().lower() or None
    if _use_firestore():
        docs = _get_firestore_client().collection(YOGA_ROUTINES_COLLECTION).stream()
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = data.get("id") or doc.id
            routine = _routine_from_row(data)
            if published_only and routine.get("status") != "published":
                continue
            if author and routine.get("authorEmail") != author:
                continue
            out.append(routine)
        out.sort(key=lambda r: float(r.get("updatedAt") or 0), reverse=True)
    else:
        clauses = []
        params: list[Any] = []
        if published_only:
            clauses.append("status = 'published'")
        if author:
            clauses.append("author_email = ?")
            params.append(author)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with _connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM yoga_community_routines{where} ORDER BY updated_at DESC",
                params,
            ).fetchall()
            out = [_routine_from_row(r) for r in rows]
    if hide_disabled_teachers:
        disabled_cache: dict[str, bool] = {}
        filtered = []
        for routine in out:
            email = (routine.get("authorEmail") or "").strip().lower()
            if email not in disabled_cache:
                disabled_cache[email] = teacher_is_disabled(get_teacher(email))
            if disabled_cache[email]:
                continue
            filtered.append(routine)
        return filtered
    return out


def get_routine(routine_id: str) -> dict[str, Any] | None:
    ensure_db()
    routine_id = (routine_id or "").strip()
    if not routine_id:
        return None
    if _use_firestore():
        doc = _get_firestore_client().collection(YOGA_ROUTINES_COLLECTION).document(routine_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = routine_id
        return _routine_from_row(data)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM yoga_community_routines WHERE id = ?",
            (routine_id,),
        ).fetchone()
        return _routine_from_row(row) if row else None


def upsert_routine(
    *,
    routine_id: str | None,
    author_email: str,
    name: str,
    description: str,
    payload: dict[str, Any],
    status: str | None = None,
) -> dict[str, Any]:
    ensure_db()
    author_email = author_email.strip().lower()
    now = _now()
    existing = get_routine(routine_id) if routine_id else None
    rid = (routine_id or "").strip() or (existing or {}).get("id") or str(uuid.uuid4())
    created_at = (existing or {}).get("createdAt") or now
    next_status = status or (existing or {}).get("status") or "draft"
    published_at = (existing or {}).get("publishedAt")
    if next_status == "published" and not published_at:
        published_at = now
    if _use_firestore():
        record = {
            "id": rid,
            "authorEmail": author_email,
            "name": name.strip(),
            "description": description.strip(),
            "payload": payload or {},
            "status": next_status,
            "createdAt": created_at,
            "updatedAt": now,
            "publishedAt": published_at,
        }
        _get_firestore_client().collection(YOGA_ROUTINES_COLLECTION).document(rid).set(
            record, merge=True
        )
        return _routine_from_row(record)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_community_routines (
                id, author_email, name, description, payload_json, status,
                created_at, updated_at, published_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                author_email = excluded.author_email,
                name = excluded.name,
                description = excluded.description,
                payload_json = excluded.payload_json,
                status = excluded.status,
                updated_at = excluded.updated_at,
                published_at = excluded.published_at
            """,
            (
                rid,
                author_email,
                name.strip(),
                description.strip(),
                json.dumps(payload or {}),
                next_status,
                created_at,
                now,
                published_at,
            ),
        )
        conn.commit()
    return get_routine(rid) or {}


def publish_routine(routine_id: str, author_email: str) -> dict[str, Any]:
    routine = get_routine(routine_id)
    if not routine:
        raise KeyError("routine_not_found")
    if routine.get("authorEmail") != author_email.strip().lower():
        raise PermissionError("not_author")
    return upsert_routine(
        routine_id=routine_id,
        author_email=author_email,
        name=routine.get("name") or "",
        description=routine.get("description") or "",
        payload=dict(routine.get("payload") or {}),
        status="published",
    )


def _subscription_id(subscriber_email: str, teacher_email: str) -> str:
    return f"{subscriber_email.strip().lower()}__{teacher_email.strip().lower()}"


def _registration_id(class_id: str, user_email: str) -> str:
    return f"{class_id.strip()}__{user_email.strip().lower()}"


def _normalize_starts_at(raw: Any) -> str:
    """Normalize to UTC ISO ending with Z for lexicographic range queries."""
    value = str(raw or "").strip()
    if not value:
        raise ValueError("starts_at_required")
    # Accept "YYYY-MM-DDTHH:MM" / "YYYY-MM-DDTHH:MM:SS" / with Z or offset
    normalized = value
    if normalized.endswith("Z"):
        pass
    elif re.search(r"[+-]\d{2}:\d{2}$", normalized):
        # Leave offset form; convert via datetime if available
        try:
            from datetime import datetime, timezone

            dt = datetime.fromisoformat(normalized)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            normalized = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError as exc:
            raise ValueError("starts_at_invalid") from exc
    else:
        # Treat naive local-looking ISO as UTC
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", normalized):
            normalized = normalized + ":00Z"
        elif re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", normalized):
            normalized = normalized + "Z"
        elif re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+", normalized):
            normalized = normalized.split(".")[0] + "Z"
        else:
            raise ValueError("starts_at_invalid")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", normalized):
        raise ValueError("starts_at_invalid")
    return normalized


def _class_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        d = dict(row)
    else:
        d = dict(row)
    return {
        "id": d.get("id") or "",
        "teacherEmail": d.get("teacher_email") or d.get("teacherEmail") or "",
        "title": d.get("title") or "",
        "description": d.get("description") or "",
        "location": d.get("location") or "",
        "startsAt": d.get("starts_at") or d.get("startsAt") or "",
        "maxRegistrants": int(
            d.get("max_registrants")
            if d.get("max_registrants") is not None
            else d.get("maxRegistrants") or 1
        ),
        "image": d.get("image") or "",
        "registrantCount": int(
            d.get("registrant_count")
            if d.get("registrant_count") is not None
            else d.get("registrantCount") or 0
        ),
        "seriesId": (d.get("series_id") or d.get("seriesId") or "").strip(),
        "createdAt": d.get("created_at") or d.get("createdAt"),
        "updatedAt": d.get("updated_at") or d.get("updatedAt"),
    }


def get_class(class_id: str) -> dict[str, Any] | None:
    ensure_db()
    class_id = (class_id or "").strip()
    if not class_id:
        return None
    if _use_firestore():
        doc = (
            _get_firestore_client()
            .collection(YOGA_CLASSES_COLLECTION)
            .document(class_id)
            .get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = class_id
        return _class_from_row(data)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM yoga_classes WHERE id = ?", (class_id,)
        ).fetchone()
        return _class_from_row(row) if row else None


def list_classes_for_teacher(
    teacher_email: str,
    *,
    upcoming_only: bool = False,
    from_starts_at: str | None = None,
) -> list[dict[str, Any]]:
    ensure_db()
    teacher_email = (teacher_email or "").strip().lower()
    now_iso = from_starts_at or _normalize_starts_at(
        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    )
    if _use_firestore():
        docs = (
            _get_firestore_client()
            .collection(YOGA_CLASSES_COLLECTION)
            .where("teacherEmail", "==", teacher_email)
            .stream()
        )
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = data.get("id") or doc.id
            cls = _class_from_row(data)
            if upcoming_only and (cls.get("startsAt") or "") < now_iso:
                continue
            out.append(cls)
        out.sort(key=lambda c: str(c.get("startsAt") or ""))
        return out
    clauses = ["teacher_email = ?"]
    params: list[Any] = [teacher_email]
    if upcoming_only:
        clauses.append("starts_at >= ?")
        params.append(now_iso)
    where = " WHERE " + " AND ".join(clauses)
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM yoga_classes{where} ORDER BY starts_at ASC",
            params,
        ).fetchall()
        return [_class_from_row(r) for r in rows]


def list_upcoming_classes(
    *,
    teacher_emails: list[str] | None = None,
    from_starts_at: str | None = None,
    to_starts_at: str | None = None,
) -> list[dict[str, Any]]:
    ensure_db()
    emails = sorted(
        {
            e.strip().lower()
            for e in (teacher_emails or [])
            if (e or "").strip()
        }
    )
    now_iso = from_starts_at or _normalize_starts_at(
        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    )
    to_iso = (to_starts_at or "").strip() or None
    if _use_firestore():
        docs = _get_firestore_client().collection(YOGA_CLASSES_COLLECTION).stream()
        out = []
        email_set = set(emails) if emails else None
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = data.get("id") or doc.id
            cls = _class_from_row(data)
            starts = str(cls.get("startsAt") or "")
            if starts < now_iso:
                continue
            if to_iso and starts > to_iso:
                continue
            if email_set is not None and cls.get("teacherEmail") not in email_set:
                continue
            out.append(cls)
        out.sort(key=lambda c: str(c.get("startsAt") or ""))
        return out
    clauses = ["starts_at >= ?"]
    params: list[Any] = [now_iso]
    if to_iso:
        clauses.append("starts_at <= ?")
        params.append(to_iso)
    if emails:
        placeholders = ",".join("?" for _ in emails)
        clauses.append(f"teacher_email IN ({placeholders})")
        params.extend(emails)
    where = " WHERE " + " AND ".join(clauses)
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM yoga_classes{where} ORDER BY starts_at ASC",
            params,
        ).fetchall()
        return [_class_from_row(r) for r in rows]


def teacher_directory_counts() -> dict[str, dict[str, int]]:
    """Per-teacher upcoming class count (series-deduped) and public blog count.

    Repeating class instances that share a seriesId count as one class.
    """
    counts: dict[str, dict[str, int]] = {}

    def bucket(email: str) -> dict[str, int]:
        key = (email or "").strip().lower()
        if not key:
            return {"classCount": 0, "blogCount": 0}
        if key not in counts:
            counts[key] = {"classCount": 0, "blogCount": 0}
        return counts[key]

    series_seen: dict[str, set[str]] = {}
    for cls in list_upcoming_classes():
        email = (cls.get("teacherEmail") or "").strip().lower()
        if not email:
            continue
        series_or_id = (cls.get("seriesId") or "").strip() or (cls.get("id") or "").strip()
        if not series_or_id:
            continue
        seen = series_seen.setdefault(email, set())
        if series_or_id in seen:
            continue
        seen.add(series_or_id)
        bucket(email)["classCount"] += 1

    for blog in list_blogs(published_only=True, hide_disabled_teachers=True):
        email = (blog.get("authorEmail") or "").strip().lower()
        if email:
            bucket(email)["blogCount"] += 1

    return counts


def upsert_class(
    *,
    class_id: str | None,
    teacher_email: str,
    title: str,
    description: str,
    location: str,
    starts_at: str,
    max_registrants: int,
    image: str,
    series_id: str | None = None,
) -> dict[str, Any]:
    ensure_db()
    teacher_email = teacher_email.strip().lower()
    now = _now()
    existing = get_class(class_id) if class_id else None
    cid = (class_id or "").strip() or (existing or {}).get("id") or str(uuid.uuid4())
    if existing and existing.get("teacherEmail") != teacher_email:
        raise PermissionError("not_owner")
    starts = _normalize_starts_at(starts_at if starts_at is not None else (existing or {}).get("startsAt"))
    title_clean = (title or "").strip()[:MAX_CLASS_TITLE_LEN]
    if not title_clean:
        raise ValueError("title_required")
    description_clean = (description or "").strip()[:MAX_CLASS_DESCRIPTION_LEN]
    location_clean = (location or "").strip()[:MAX_CLASS_LOCATION_LEN]
    if not location_clean:
        raise ValueError("location_required")
    try:
        max_reg = int(max_registrants)
    except (TypeError, ValueError) as exc:
        raise ValueError("max_registrants_invalid") from exc
    if max_reg < 1 or max_reg > MAX_CLASS_REGISTRANTS:
        raise ValueError("max_registrants_invalid")
    image_clean = (image or "").strip()
    if len(image_clean) > MAX_CLASS_IMAGE_CHARS:
        raise ValueError("image_too_large")
    registrant_count = int((existing or {}).get("registrantCount") or 0)
    if max_reg < registrant_count:
        raise ValueError("max_registrants_below_count")
    created_at = (existing or {}).get("createdAt") or now
    if series_id is None:
        series_clean = (existing or {}).get("seriesId") or ""
    else:
        series_clean = (series_id or "").strip()
    if _use_firestore():
        payload = {
            "id": cid,
            "teacherEmail": teacher_email,
            "title": title_clean,
            "description": description_clean,
            "location": location_clean,
            "startsAt": starts,
            "maxRegistrants": max_reg,
            "image": image_clean,
            "registrantCount": registrant_count,
            "seriesId": series_clean,
            "createdAt": created_at,
            "updatedAt": now,
        }
        _get_firestore_client().collection(YOGA_CLASSES_COLLECTION).document(cid).set(
            payload, merge=True
        )
        return _class_from_row(payload)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_classes (
                id, teacher_email, title, description, location, starts_at,
                max_registrants, image, registrant_count, series_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                teacher_email = excluded.teacher_email,
                title = excluded.title,
                description = excluded.description,
                location = excluded.location,
                starts_at = excluded.starts_at,
                max_registrants = excluded.max_registrants,
                image = excluded.image,
                series_id = excluded.series_id,
                updated_at = excluded.updated_at
            """,
            (
                cid,
                teacher_email,
                title_clean,
                description_clean,
                location_clean,
                starts,
                max_reg,
                image_clean,
                registrant_count,
                series_clean,
                created_at,
                now,
            ),
        )
        conn.commit()
    return get_class(cid) or {}


def _parse_starts_at_datetime(starts_at: str):
    from datetime import datetime, timezone

    normalized = _normalize_starts_at(starts_at)
    raw = normalized[:-1] if normalized.endswith("Z") else normalized
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError("starts_at_invalid") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.replace(microsecond=0)


def _add_months(dt, months: int):
    from datetime import datetime

    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    # Clamp day for shorter months (e.g. Jan 31 → Feb 28)
    for day in range(dt.day, 0, -1):
        try:
            return dt.replace(year=year, month=month, day=day)
        except ValueError:
            continue
    return datetime(
        year, month, 1, dt.hour, dt.minute, dt.second, tzinfo=dt.tzinfo
    )


def expand_class_starts_at(
    starts_at: str,
    *,
    frequency: str,
    until: str,
) -> list[str]:
    """Return UTC ISO startsAt values for a recurrence (first occurrence included)."""
    from datetime import datetime, timedelta, timezone

    freq = (frequency or "").strip().lower()
    if freq not in CLASS_RECURRENCE_FREQUENCIES:
        raise ValueError("recurrence_frequency_invalid")
    until_raw = (until or "").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", until_raw):
        raise ValueError("recurrence_until_invalid")
    until_date = datetime.strptime(until_raw, "%Y-%m-%d").date()
    start_dt = _parse_starts_at_datetime(starts_at)
    start_date = start_dt.date()
    if until_date < start_date:
        raise ValueError("recurrence_until_before_start")

    out: list[str] = []
    current = start_dt
    while current.date() <= until_date and len(out) < MAX_CLASS_RECURRENCE_OCCURRENCES:
        out.append(current.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        if freq == "weekly":
            current = current + timedelta(days=7)
        elif freq == "biweekly":
            current = current + timedelta(days=14)
        else:
            current = _add_months(current, 1)
    if not out:
        raise ValueError("recurrence_empty")
    return out


def create_recurring_classes(
    *,
    teacher_email: str,
    title: str,
    description: str,
    location: str,
    starts_at: str,
    max_registrants: int,
    image: str,
    frequency: str,
    until: str,
) -> list[dict[str, Any]]:
    """Materialize a series of class instances sharing one seriesId."""
    starts_list = expand_class_starts_at(
        starts_at, frequency=frequency, until=until
    )
    series_id = str(uuid.uuid4())
    created: list[dict[str, Any]] = []
    for starts in starts_list:
        created.append(
            upsert_class(
                class_id=None,
                teacher_email=teacher_email,
                title=title,
                description=description,
                location=location,
                starts_at=starts,
                max_registrants=max_registrants,
                image=image,
                series_id=series_id,
            )
        )
    return created


def _cancellation_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        d = dict(row)
    else:
        d = dict(row)
    return {
        "id": d.get("id") or "",
        "userEmail": d.get("user_email") or d.get("userEmail") or "",
        "classId": d.get("class_id") or d.get("classId") or "",
        "teacherEmail": d.get("teacher_email") or d.get("teacherEmail") or "",
        "teacherDisplayName": (
            d.get("teacher_display_name") or d.get("teacherDisplayName") or ""
        ),
        "title": d.get("title") or "",
        "location": d.get("location") or "",
        "startsAt": d.get("starts_at") or d.get("startsAt") or "",
        "cancelledAt": d.get("cancelled_at") or d.get("cancelledAt"),
    }


def record_class_cancellations_for_registrants(cls: dict[str, Any]) -> int:
    """Notify each registrant that this class was cancelled. Call before deleting regs."""
    ensure_db()
    class_id = (cls.get("id") or "").strip()
    if not class_id:
        return 0
    regs = list_registrants(class_id)
    if not regs:
        return 0
    teacher_email = (cls.get("teacherEmail") or "").strip().lower()
    teacher = get_teacher(teacher_email) if teacher_email else None
    display_name = ((teacher or {}).get("displayName") or teacher_email or "").strip()
    title = (cls.get("title") or "").strip()
    location = (cls.get("location") or "").strip()
    starts_at = (cls.get("startsAt") or "").strip()
    now = time.time()
    written = 0
    if _use_firestore():
        client = _get_firestore_client()
        batch = client.batch()
        pending = 0
        for reg in regs:
            user_email = (reg.get("userEmail") or "").strip().lower()
            if not user_email:
                continue
            cid = f"{class_id}__{user_email}"
            ref = client.collection(YOGA_CLASS_CANCELLATIONS_COLLECTION).document(cid)
            batch.set(
                ref,
                {
                    "id": cid,
                    "userEmail": user_email,
                    "classId": class_id,
                    "teacherEmail": teacher_email,
                    "teacherDisplayName": display_name,
                    "title": title,
                    "location": location,
                    "startsAt": starts_at,
                    "cancelledAt": now,
                },
            )
            pending += 1
            written += 1
            if pending >= 400:
                batch.commit()
                batch = client.batch()
                pending = 0
        if pending:
            batch.commit()
        return written
    with _connect() as conn:
        for reg in regs:
            user_email = (reg.get("userEmail") or "").strip().lower()
            if not user_email:
                continue
            cid = f"{class_id}__{user_email}"
            conn.execute(
                """
                INSERT INTO yoga_class_cancellations (
                    id, user_email, class_id, teacher_email, teacher_display_name,
                    title, location, starts_at, cancelled_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    teacher_email = excluded.teacher_email,
                    teacher_display_name = excluded.teacher_display_name,
                    title = excluded.title,
                    location = excluded.location,
                    starts_at = excluded.starts_at,
                    cancelled_at = excluded.cancelled_at
                """,
                (
                    cid,
                    user_email,
                    class_id,
                    teacher_email,
                    display_name,
                    title,
                    location,
                    starts_at,
                    now,
                ),
            )
            written += 1
        conn.commit()
    return written


def list_class_cancellations(user_email: str) -> list[dict[str, Any]]:
    ensure_db()
    user_email = (user_email or "").strip().lower()
    if not user_email:
        return []
    if _use_firestore():
        docs = (
            _get_firestore_client()
            .collection(YOGA_CLASS_CANCELLATIONS_COLLECTION)
            .where("userEmail", "==", user_email)
            .stream()
        )
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            if not data.get("id"):
                data["id"] = doc.id
            out.append(_cancellation_from_row(data))
        out.sort(key=lambda c: float(c.get("cancelledAt") or 0), reverse=True)
        return out
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM yoga_class_cancellations
            WHERE user_email = ?
            ORDER BY cancelled_at DESC
            """,
            (user_email,),
        ).fetchall()
        return [_cancellation_from_row(r) for r in rows]


def clear_class_cancellation(cancellation_id: str, user_email: str) -> bool:
    ensure_db()
    cancellation_id = (cancellation_id or "").strip()
    user_email = (user_email or "").strip().lower()
    if not cancellation_id or not user_email:
        return False
    if _use_firestore():
        ref = (
            _get_firestore_client()
            .collection(YOGA_CLASS_CANCELLATIONS_COLLECTION)
            .document(cancellation_id)
        )
        snap = ref.get()
        if not snap.exists:
            return False
        data = snap.to_dict() or {}
        if (data.get("userEmail") or "").strip().lower() != user_email:
            raise PermissionError("not_owner")
        ref.delete()
        return True
    with _connect() as conn:
        row = conn.execute(
            "SELECT user_email FROM yoga_class_cancellations WHERE id = ?",
            (cancellation_id,),
        ).fetchone()
        if not row:
            return False
        if (row["user_email"] or "").strip().lower() != user_email:
            raise PermissionError("not_owner")
        conn.execute(
            "DELETE FROM yoga_class_cancellations WHERE id = ?", (cancellation_id,)
        )
        conn.commit()
        return True


def clear_all_class_cancellations(user_email: str) -> int:
    ensure_db()
    user_email = (user_email or "").strip().lower()
    if not user_email:
        return 0
    if _use_firestore():
        client = _get_firestore_client()
        docs = list(
            client.collection(YOGA_CLASS_CANCELLATIONS_COLLECTION)
            .where("userEmail", "==", user_email)
            .stream()
        )
        batch = client.batch()
        pending = 0
        for doc in docs:
            batch.delete(doc.reference)
            pending += 1
            if pending >= 400:
                batch.commit()
                batch = client.batch()
                pending = 0
        if pending:
            batch.commit()
        return len(docs)
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM yoga_class_cancellations WHERE user_email = ?",
            (user_email,),
        )
        conn.commit()
        return int(cur.rowcount or 0)


def delete_class(class_id: str, teacher_email: str | None = None) -> None:
    ensure_db()
    class_id = (class_id or "").strip()
    cls = get_class(class_id)
    if not cls:
        raise KeyError("class_not_found")
    if teacher_email is not None and cls.get("teacherEmail") != teacher_email.strip().lower():
        raise PermissionError("not_owner")
    # Snapshot notices for registrants before registrations are removed.
    record_class_cancellations_for_registrants(cls)
    if _use_firestore():
        client = _get_firestore_client()
        client.collection(YOGA_CLASSES_COLLECTION).document(class_id).delete()
        regs = (
            client.collection(YOGA_CLASS_REGISTRATIONS_COLLECTION)
            .where("classId", "==", class_id)
            .stream()
        )
        for doc in regs:
            doc.reference.delete()
        return
    with _connect() as conn:
        conn.execute("DELETE FROM yoga_class_registrations WHERE class_id = ?", (class_id,))
        conn.execute("DELETE FROM yoga_classes WHERE id = ?", (class_id,))
        conn.commit()


def delete_class_series_from(
    class_id: str, teacher_email: str
) -> dict[str, Any]:
    """Delete this class and later occurrences in the same series (same teacher)."""
    ensure_db()
    teacher_email = teacher_email.strip().lower()
    cls = get_class(class_id)
    if not cls:
        raise KeyError("class_not_found")
    if cls.get("teacherEmail") != teacher_email:
        raise PermissionError("not_owner")
    series_id = (cls.get("seriesId") or "").strip()
    starts_at = (cls.get("startsAt") or "").strip()
    if not series_id or not starts_at:
        delete_class(class_id, teacher_email)
        return {"deletedCount": 1, "ids": [class_id]}

    ids: list[str] = []
    if _use_firestore():
        docs = (
            _get_firestore_client()
            .collection(YOGA_CLASSES_COLLECTION)
            .where("seriesId", "==", series_id)
            .stream()
        )
        for doc in docs:
            data = doc.to_dict() or {}
            if (data.get("teacherEmail") or "").strip().lower() != teacher_email:
                continue
            starts = (data.get("startsAt") or "").strip()
            if starts >= starts_at:
                ids.append(data.get("id") or doc.id)
    else:
        with _connect() as conn:
            rows = conn.execute(
                """
                SELECT id FROM yoga_classes
                WHERE series_id = ?
                  AND teacher_email = ?
                  AND starts_at >= ?
                ORDER BY starts_at ASC
                """,
                (series_id, teacher_email, starts_at),
            ).fetchall()
            ids = [str(r["id"]) for r in rows]

    if class_id not in ids:
        ids.insert(0, class_id)
    # De-dupe while preserving order
    seen: set[str] = set()
    ordered: list[str] = []
    for cid in ids:
        if cid in seen:
            continue
        seen.add(cid)
        ordered.append(cid)

    for cid in ordered:
        delete_class(cid, teacher_email)
    return {"deletedCount": len(ordered), "ids": ordered}


def subscribe_to_teacher(subscriber_email: str, teacher_email: str) -> dict[str, Any]:
    ensure_db()
    subscriber_email = subscriber_email.strip().lower()
    teacher_email = teacher_email.strip().lower()
    if subscriber_email == teacher_email:
        raise ValueError("cannot_subscribe_self")
    teacher = get_teacher(teacher_email)
    if not teacher_is_publicly_listed(teacher):
        raise KeyError("teacher_not_found")
    sid = _subscription_id(subscriber_email, teacher_email)
    now = _now()
    payload = {
        "id": sid,
        "subscriberEmail": subscriber_email,
        "teacherEmail": teacher_email,
        "createdAt": now,
    }
    if _use_firestore():
        _get_firestore_client().collection(YOGA_SUBSCRIPTIONS_COLLECTION).document(sid).set(
            payload
        )
        return payload
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_teacher_subscriptions (
                id, subscriber_email, teacher_email, created_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (sid, subscriber_email, teacher_email, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM yoga_teacher_subscriptions WHERE id = ?", (sid,)
        ).fetchone()
        if row:
            return {
                "id": row["id"],
                "subscriberEmail": row["subscriber_email"],
                "teacherEmail": row["teacher_email"],
                "createdAt": row["created_at"],
            }
    return payload


def unsubscribe_from_teacher(subscriber_email: str, teacher_email: str) -> None:
    ensure_db()
    sid = _subscription_id(subscriber_email, teacher_email)
    if _use_firestore():
        _get_firestore_client().collection(YOGA_SUBSCRIPTIONS_COLLECTION).document(sid).delete()
        return
    with _connect() as conn:
        conn.execute("DELETE FROM yoga_teacher_subscriptions WHERE id = ?", (sid,))
        conn.commit()


def is_subscribed(subscriber_email: str, teacher_email: str) -> bool:
    ensure_db()
    sid = _subscription_id(subscriber_email, teacher_email)
    if _use_firestore():
        doc = (
            _get_firestore_client()
            .collection(YOGA_SUBSCRIPTIONS_COLLECTION)
            .document(sid)
            .get()
        )
        return bool(doc.exists)
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM yoga_teacher_subscriptions WHERE id = ?", (sid,)
        ).fetchone()
        return bool(row)


def list_subscriptions(subscriber_email: str) -> list[dict[str, Any]]:
    ensure_db()
    subscriber_email = subscriber_email.strip().lower()
    if _use_firestore():
        docs = (
            _get_firestore_client()
            .collection(YOGA_SUBSCRIPTIONS_COLLECTION)
            .where("subscriberEmail", "==", subscriber_email)
            .stream()
        )
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            out.append(
                {
                    "id": data.get("id") or doc.id,
                    "subscriberEmail": data.get("subscriberEmail") or "",
                    "teacherEmail": data.get("teacherEmail") or "",
                    "createdAt": data.get("createdAt"),
                }
            )
        out.sort(key=lambda s: str(s.get("teacherEmail") or ""))
        return out
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM yoga_teacher_subscriptions
            WHERE subscriber_email = ?
            ORDER BY teacher_email ASC
            """,
            (subscriber_email,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "subscriberEmail": r["subscriber_email"],
                "teacherEmail": r["teacher_email"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ]


def is_registered_for_class(class_id: str, user_email: str) -> bool:
    ensure_db()
    rid = _registration_id(class_id, user_email)
    if _use_firestore():
        doc = (
            _get_firestore_client()
            .collection(YOGA_CLASS_REGISTRATIONS_COLLECTION)
            .document(rid)
            .get()
        )
        return bool(doc.exists)
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM yoga_class_registrations WHERE id = ?", (rid,)
        ).fetchone()
        return bool(row)


def list_registrants(class_id: str) -> list[dict[str, Any]]:
    ensure_db()
    class_id = (class_id or "").strip()
    if _use_firestore():
        docs = (
            _get_firestore_client()
            .collection(YOGA_CLASS_REGISTRATIONS_COLLECTION)
            .where("classId", "==", class_id)
            .stream()
        )
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            out.append(
                {
                    "id": data.get("id") or doc.id,
                    "classId": data.get("classId") or "",
                    "userEmail": data.get("userEmail") or "",
                    "teacherEmail": data.get("teacherEmail") or "",
                    "createdAt": data.get("createdAt"),
                }
            )
        out.sort(key=lambda r: float(r.get("createdAt") or 0))
        return out
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM yoga_class_registrations
            WHERE class_id = ?
            ORDER BY created_at ASC
            """,
            (class_id,),
        ).fetchall()
        return [
            {
                "id": r["id"],
                "classId": r["class_id"],
                "userEmail": r["user_email"],
                "teacherEmail": r["teacher_email"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ]


def register_for_class(class_id: str, user_email: str) -> dict[str, Any]:
    ensure_db()
    class_id = (class_id or "").strip()
    user_email = user_email.strip().lower()
    cls = get_class(class_id)
    if not cls:
        raise KeyError("class_not_found")
    teacher_email = (cls.get("teacherEmail") or "").strip().lower()
    if user_email == teacher_email:
        raise ValueError("cannot_register_own_class")
    if not teacher_is_publicly_listed(get_teacher(teacher_email)):
        raise KeyError("class_not_found")
    rid = _registration_id(class_id, user_email)
    now = _now()
    if _use_firestore():
        from google.cloud import firestore as fs

        client = _get_firestore_client()
        class_ref = client.collection(YOGA_CLASSES_COLLECTION).document(class_id)
        reg_ref = client.collection(YOGA_CLASS_REGISTRATIONS_COLLECTION).document(rid)
        transaction = client.transaction()

        @fs.transactional
        def _txn(txn):
            snap = class_ref.get(transaction=txn)
            if not snap.exists:
                raise KeyError("class_not_found")
            data = snap.to_dict() or {}
            count = int(data.get("registrantCount") or 0)
            max_reg = int(data.get("maxRegistrants") or 1)
            reg_snap = reg_ref.get(transaction=txn)
            if reg_snap.exists:
                return {
                    "id": rid,
                    "classId": class_id,
                    "userEmail": user_email,
                    "teacherEmail": teacher_email,
                    "createdAt": (reg_snap.to_dict() or {}).get("createdAt") or now,
                    "alreadyRegistered": True,
                }
            if count >= max_reg:
                raise PermissionError("class_full")
            payload = {
                "id": rid,
                "classId": class_id,
                "userEmail": user_email,
                "teacherEmail": teacher_email,
                "createdAt": now,
            }
            txn.set(reg_ref, payload)
            txn.update(class_ref, {"registrantCount": count + 1, "updatedAt": now})
            return payload

        return _txn(transaction)
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT * FROM yoga_class_registrations WHERE id = ?", (rid,)
        ).fetchone()
        if existing:
            conn.commit()
            return {
                "id": existing["id"],
                "classId": existing["class_id"],
                "userEmail": existing["user_email"],
                "teacherEmail": existing["teacher_email"],
                "createdAt": existing["created_at"],
                "alreadyRegistered": True,
            }
        row = conn.execute(
            "SELECT registrant_count, max_registrants FROM yoga_classes WHERE id = ?",
            (class_id,),
        ).fetchone()
        if not row:
            conn.rollback()
            raise KeyError("class_not_found")
        if int(row["registrant_count"]) >= int(row["max_registrants"]):
            conn.rollback()
            raise PermissionError("class_full")
        conn.execute(
            """
            INSERT INTO yoga_class_registrations (
                id, class_id, user_email, teacher_email, created_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (rid, class_id, user_email, teacher_email, now),
        )
        conn.execute(
            """
            UPDATE yoga_classes
            SET registrant_count = registrant_count + 1, updated_at = ?
            WHERE id = ?
            """,
            (now, class_id),
        )
        conn.commit()
    return {
        "id": rid,
        "classId": class_id,
        "userEmail": user_email,
        "teacherEmail": teacher_email,
        "createdAt": now,
    }


def unregister_from_class(class_id: str, user_email: str) -> None:
    ensure_db()
    class_id = (class_id or "").strip()
    user_email = user_email.strip().lower()
    rid = _registration_id(class_id, user_email)
    now = _now()
    if _use_firestore():
        from google.cloud import firestore as fs

        client = _get_firestore_client()
        class_ref = client.collection(YOGA_CLASSES_COLLECTION).document(class_id)
        reg_ref = client.collection(YOGA_CLASS_REGISTRATIONS_COLLECTION).document(rid)
        transaction = client.transaction()

        @fs.transactional
        def _txn(txn):
            reg_snap = reg_ref.get(transaction=txn)
            if not reg_snap.exists:
                return
            class_snap = class_ref.get(transaction=txn)
            count = 0
            if class_snap.exists:
                count = int((class_snap.to_dict() or {}).get("registrantCount") or 0)
            txn.delete(reg_ref)
            if class_snap.exists:
                txn.update(
                    class_ref,
                    {"registrantCount": max(0, count - 1), "updatedAt": now},
                )

        _txn(transaction)
        return
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT 1 FROM yoga_class_registrations WHERE id = ?", (rid,)
        ).fetchone()
        if not existing:
            conn.commit()
            return
        conn.execute("DELETE FROM yoga_class_registrations WHERE id = ?", (rid,))
        conn.execute(
            """
            UPDATE yoga_classes
            SET registrant_count = CASE
                WHEN registrant_count > 0 THEN registrant_count - 1
                ELSE 0
            END,
            updated_at = ?
            WHERE id = ?
            """,
            (now, class_id),
        )
        conn.commit()


def enrich_class_for_viewer(
    cls: dict[str, Any],
    *,
    viewer_email: str | None = None,
) -> dict[str, Any]:
    """Add display fields for API responses."""
    teacher_email = (cls.get("teacherEmail") or "").strip().lower()
    teacher = get_teacher(teacher_email) if teacher_email else None
    max_reg = int(cls.get("maxRegistrants") or 1)
    count = int(cls.get("registrantCount") or 0)
    out = dict(cls)
    out["teacherDisplayName"] = (
        (teacher or {}).get("displayName") or teacher_email or ""
    )
    out["isFull"] = count >= max_reg
    out["spotsLeft"] = max(0, max_reg - count)
    if viewer_email:
        out["isRegistered"] = is_registered_for_class(cls.get("id") or "", viewer_email)
    else:
        out["isRegistered"] = False
    return out


EXAMPLE_TEACHER_BLURBS = [
    "I teach slow morning flows for desk necks and stiff hips.",
    "Yin + fascia geek; props welcome, ego optional.",
    "Breath-led restorative sequences for anxious evenings.",
]

SEED_BLOGS: list[dict[str, Any]] = [
    {
        "id": "yoga-nidra-hypnagogic",
        "title": "Yoga nidra and the hypnagogic edge",
        "summary": "How yoga nidra rides the same twilight as falling asleep — and why that matters for nervous-system rest.",
        "image": "learn/breath.jpg",
        "body": [
            "Yoga nidra is often sold as a nap with a script. The more interesting claim is subtler: it trains attention at the hypnagogic edge, the thin band between waking thought and sleep where imagery loosens and the body drops guard.",
            "Classical nidra protocols rotate awareness through body maps, breath, and opposites so the mind stays lightly engaged while muscle tone melts. You are not trying to sleep; you are practicing staying present while the sleep system begins its work. That dual state is why many practitioners finish more restored than after an ordinary lie-down.",
            "Obscure but useful: when hypnagogic images appear — flashes of light, half-dream scenes — treat them as weather, not content to chase. Chasing returns you to ordinary waking. Soft naming (“seeing”) then returning to the rotation keeps the edge open.",
            "For home practice, dim light, a warm room, and a consistent voice recording help more than perfect alignment cues. If you truly fall asleep, that still counts as rest; the training lives in the sessions where you hover without collapsing all the way under.",
            "Pair nidra after strong asana rather than before skill work. The hypnagogic edge is a closing practice: it consolidates the day’s load instead of priming you for balance drills.",
        ],
    },
    {
        "id": "bandhas-subtle-pressure",
        "title": "Bandhas as subtle pressure, not a gym brace",
        "summary": "Mula, uddiyana, and jalandhara as directional cues — not abs-maxing or throat gripping.",
        "image": "learn/effort.jpg",
        "body": [
            "Bandha literally means to bind. In modern classes the word often collapses into “brace your core.” That gym translation misses the older idea: a light directional seal that organizes breath and attention.",
            "Mula bandha is closer to a soft lift of the pelvic floor timed with exhale than a hard clench. Uddiyana in its classical form is an empty-lung abdominal draw used in specific kriya contexts; the mild “navel toward spine” cue in vinyasa is only a distant cousin. Jalandhara is a chin-to-chest gesture that lengthens the back of the neck — not a double chin smash.",
            "When bandhas become max-effort bracing, breath shortens and jaws grip. The obscure diagnostic is simple: if you cannot speak a full sentence, you are not in a subtle bandha.",
            "Use bandha language as volume knobs. In standing balance, a 10% pelvic-floor whisper can steady you. In restoratives, drop the idea entirely. Intensity 5 poses do not automatically need intensity 5 locks.",
            "Teachers who love obscure anatomy can map bandhas to fascial continuity without turning every pose into a core seminar. One clear cue beats five Sanskrit names stacked on a beginner.",
        ],
    },
    {
        "id": "neti-jala-asana",
        "title": "Neti and jala — when nasal irrigation meets asana",
        "summary": "A practical look at jala neti timing around practice, salt ratios, and when to skip.",
        "image": "learn/pranayama-basics.jpg",
        "body": [
            "Jala neti — saline rinse through a neti pot — sits in the kriya toolkit more than the asana catalog, yet many practitioners discover it because mouth breathing wrecks their flow.",
            "The obscure detail that matters: water should be lukewarm, isotonic (about 0.9% salt), and pH-comfortable. Too salty burns; too fresh stings. Use non-iodized fine salt and previously boiled or sterile water. Technique is gentle — no force, no “power rinse.”",
            "Timing around asana: rinse before practice if congestion blocks nose breathing, then wait a few minutes so drips settle. Avoid aggressive inversions immediately after if you feel waterlogged. Skip neti entirely during acute ear infections, significant nosebleeds, or when a clinician has advised against sinus irrigation.",
            "Neti is not a personality upgrade. It is hygiene for the airway so ujjayi and alternate-nostril work stop feeling like underwater swimming. If your practice already breathes easily, you do not need a ritual pot on the altar.",
            "Pair with simple pranayama after the rinse: three minutes of soft belly breath beats jumping into kapalabhati on irritated mucosa.",
        ],
    },
    {
        "id": "trataka-candle-gazing",
        "title": "The forgotten art of trataka (candle gazing)",
        "summary": "Steady-gaze meditation with a flame — benefits, safety limits, and why studios quietly dropped it.",
        "image": "learn/eight-limbs.jpg",
        "body": [
            "Trataka means to gaze steadily. Classically you sit with a candle at eye level, look without blinking until tears come, then rest with eyes closed on the afterimage. It trains visual steadiness as a doorway to mental steadiness.",
            "Studios quietly shelved it for liability and logistics: open flame, smoke alarms, and eye strain. Home practitioners still find it oddly potent for attention residue after screen days.",
            "Obscure safety notes: no contact lenses during practice for many teachers; stop if you feel headache, eye pain, or dizziness; keep the flame stable and the room free of drafts; never practice where fabric or curtains can catch. Pregnant practitioners and anyone with eye disease should get clinical clearance first.",
            "Start with 30–60 seconds of soft gaze, not heroic stare-downs. The skill is relaxed focus, not winning a blinking contest. After closing the eyes, watch the mental flame fade without chasing it.",
            "Trataka pairs well before seated meditation and poorly before driving or detailed screen work if your eyes feel fatigued. Treat it as spice, not a daily main course.",
        ],
    },
    {
        "id": "mudra-sequencing-between-poses",
        "title": "Mudra sequencing between poses, not only in meditation",
        "summary": "Hand seals as transitions — how a few seconds of mudra can change the nervous tone of a flow.",
        "image": "learn/sequencing.jpg",
        "body": [
            "Mudras are usually parked at the end of class in a seated coda. An obscure sequencing trick is to use them as micro-transitions: three breaths of chin mudra after a backbend cluster, or apana-oriented gestures before forward folds.",
            "The point is not occult symbolism for its own sake. Hands feed dense sensory information into the nervous system. Changing hand shape changes what the brain monitors while you reset between shapes.",
            "Practical pattern: after a peak standing series, sit on heels, join thumb and index, rest wrists on thighs, and take four slow exhales before cool-down. After intense core work, open palms on thighs (hasta karavalambana style rest) to signal release rather than another brace.",
            "Avoid stacking ten mudras with Sanskrit quizzes mid-flow. One intentional seal with a clear breath count reads as teaching; a mudra catalog dump reads as cosplay.",
            "If students have hand or wrist injuries, offer forearm or mental-imagery alternatives. Mudra should never become another place to grip.",
        ],
    },
]


def _editorial_seed_blogs() -> list[dict[str, Any]]:
    """Optional extra seed posts from YogApp draft export (if present on disk)."""
    candidates = [
        os.path.join(
            os.path.dirname(__file__),
            "seed_blogs_editorial.json",
        ),
        os.path.join(
            os.path.dirname(__file__),
            "data",
            "seed_blogs_editorial.json",
        ),
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "yogapp",
            "scripts",
            "drafts",
            "blog_posts",
            "seed_blogs.json",
        ),
        "/home/stever/projects/yogapp/scripts/drafts/blog_posts/seed_blogs.json",
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, list) and data:
                return [e for e in data if isinstance(e, dict) and e.get("id")]
        except (OSError, json.JSONDecodeError):
            continue
    return []


def seed_community_content(*, force: bool = False) -> dict[str, Any]:
    """Upsert seed teacher blurbs reference + published blogs if missing."""
    ensure_db()
    created_blogs = 0
    updated_blogs = 0
    seed_entries = list(SEED_BLOGS) + _editorial_seed_blogs()
    # Deduplicate by id (editorial wins over classic if same id)
    by_id: dict[str, dict[str, Any]] = {}
    for entry in seed_entries:
        by_id[str(entry["id"])] = entry
    for entry in by_id.values():
        existing = get_blog(entry["id"])
        if existing and not force:
            continue
        upsert_blog(
            blog_id=entry["id"],
            author_email=SEED_AUTHOR_EMAIL,
            title=entry["title"],
            summary=entry["summary"],
            body=list(entry["body"]),
            image=entry.get("image") or "",
            status="published",
            assessment_ok=True,
            assessment_reason="",
        )
        if existing:
            updated_blogs += 1
        else:
            created_blogs += 1

    # Example directory teachers (only if missing) — placeholder photos via photoUrl
    example_teachers = [
        {
            "email": "maya.example@synthesized.yoga",
            "displayName": "Maya Chen",
            "blurb": EXAMPLE_TEACHER_BLURBS[0],
            "photoUrl": "learn/home-vs-studio.jpg",
            "contactEmail": "maya.example@synthesized.yoga",
            "contactPhone": "",
            "contactLink": "https://example.com/maya-yoga",
            "country": "AU",
            "region": "Yarra",
        },
        {
            "email": "jordan.example@synthesized.yoga",
            "displayName": "Jordan Okonkwo",
            "blurb": EXAMPLE_TEACHER_BLURBS[1],
            "photoUrl": "learn/yin-origins.jpg",
            "contactEmail": "",
            "contactPhone": "",
            "contactLink": "https://example.com/jordan-yin",
            "country": "AU",
            "region": "Byron",
        },
        {
            "email": "sam.example@synthesized.yoga",
            "displayName": "Sam Rivera",
            "blurb": EXAMPLE_TEACHER_BLURBS[2],
            "photoUrl": "learn/nervous-system.jpg",
            "contactEmail": "sam.example@synthesized.yoga",
            "contactPhone": "",
            "contactLink": "",
            "country": "US",
            "region": "California",
        },
    ]
    created_teachers = 0
    updated_teachers = 0
    for t in example_teachers:
        existing = get_teacher(t["email"])
        if existing and not force:
            # Backfill country/region on older seed records
            if not (existing.get("country") or "").strip() or not (
                existing.get("region") or ""
            ).strip():
                upsert_teacher(
                    t["email"],
                    country=t["country"],
                    region=t["region"],
                )
                updated_teachers += 1
            continue
        upsert_teacher(
            t["email"],
            display_name=t["displayName"],
            blurb=t["blurb"],
            photo_data_url="",
            photo_url=t["photoUrl"],
            contact_email=t["contactEmail"],
            contact_phone=t["contactPhone"],
            contact_link=t["contactLink"],
            country=t["country"],
            region=t["region"],
            approved=True,
        )
        created_teachers += 1

    return {
        "blogsCreated": created_blogs,
        "blogsUpdated": updated_blogs,
        "teachersCreated": created_teachers,
        "teachersUpdated": updated_teachers,
        "exampleBlurbs": EXAMPLE_TEACHER_BLURBS,
        "seedAuthorEmail": SEED_AUTHOR_EMAIL,
    }


def _feedback_from_row(
    row: sqlite3.Row | dict[str, Any],
    *,
    include_screenshot: bool = True,
) -> dict[str, Any]:
    if isinstance(row, sqlite3.Row):
        d = dict(row)
    else:
        d = dict(row)
    screenshot = (
        d.get("screenshot_data_url")
        or d.get("screenshotDataUrl")
        or ""
    )
    if not isinstance(screenshot, str):
        screenshot = ""
    raw_status = str(d.get("status") or "open").strip().lower()
    if raw_status not in FEEDBACK_STATUSES:
        raw_status = "open"
    out: dict[str, Any] = {
        "id": d.get("id") or "",
        "authorEmail": d.get("author_email") or d.get("authorEmail") or "",
        "authorName": d.get("author_name") or d.get("authorName") or "",
        "comment": d.get("comment") or "",
        "debugJson": d.get("debug_json") if "debug_json" in d else d.get("debugJson") or "",
        "userAgent": d.get("user_agent") or d.get("userAgent") or "",
        "route": d.get("route") or "",
        "status": raw_status,
        "createdAt": d.get("created_at") if "created_at" in d else d.get("createdAt"),
    }
    if include_screenshot and screenshot:
        out["screenshotDataUrl"] = screenshot
    elif screenshot:
        out["hasScreenshot"] = True
    return out


def create_feedback(
    *,
    author_email: str,
    author_name: str = "",
    comment: str,
    screenshot_data_url: str = "",
    debug_json: str = "",
    user_agent: str = "",
    route: str = "",
) -> dict[str, Any]:
    ensure_db()
    email = (author_email or "").strip().lower()
    if not email:
        raise ValueError("author_email_required")
    comment_clean = (comment or "").strip()
    if not comment_clean:
        raise ValueError("comment_required")
    if len(comment_clean) > MAX_FEEDBACK_COMMENT_LEN:
        raise ValueError("comment_too_long")
    screenshot = (screenshot_data_url or "").strip()
    if screenshot and len(screenshot) > MAX_FEEDBACK_SCREENSHOT_CHARS:
        raise ValueError("screenshot_too_large")
    if screenshot and not screenshot.lower().startswith("data:image/"):
        raise ValueError("screenshot_invalid")
    debug_clean = debug_json if isinstance(debug_json, str) else ""
    if len(debug_clean) > MAX_FEEDBACK_DEBUG_CHARS:
        debug_clean = debug_clean[:MAX_FEEDBACK_DEBUG_CHARS]
    name = (author_name or "").strip()[:MAX_FEEDBACK_AUTHOR_NAME_LEN]
    ua = (user_agent or "").strip()[:MAX_FEEDBACK_USER_AGENT_LEN]
    route_clean = (route or "").strip()[:MAX_FEEDBACK_ROUTE_LEN]
    fid = str(uuid.uuid4())
    now = _now()
    if _use_firestore():
        payload = {
            "id": fid,
            "authorEmail": email,
            "authorName": name,
            "comment": comment_clean,
            "screenshotDataUrl": screenshot,
            "debugJson": debug_clean,
            "userAgent": ua,
            "route": route_clean,
            "status": "open",
            "createdAt": now,
        }
        _get_firestore_client().collection(YOGA_FEEDBACK_COLLECTION).document(fid).set(
            payload
        )
        return _feedback_from_row(payload, include_screenshot=True)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO yoga_feedback (
                id, author_email, author_name, comment, screenshot_data_url,
                debug_json, user_agent, route, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fid,
                email,
                name,
                comment_clean,
                screenshot,
                debug_clean,
                ua,
                route_clean,
                "open",
                now,
            ),
        )
        conn.commit()
    return get_feedback(fid) or {}


def list_feedback(*, include_screenshot: bool = False) -> list[dict[str, Any]]:
    ensure_db()
    if _use_firestore():
        docs = list(_get_firestore_client().collection(YOGA_FEEDBACK_COLLECTION).stream())
        out = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = data.get("id") or doc.id
            out.append(_feedback_from_row(data, include_screenshot=include_screenshot))
        out.sort(key=lambda f: float(f.get("createdAt") or 0), reverse=True)
        return out
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM yoga_feedback ORDER BY created_at DESC"
        ).fetchall()
        return [
            _feedback_from_row(r, include_screenshot=include_screenshot) for r in rows
        ]


def get_feedback(feedback_id: str) -> dict[str, Any] | None:
    ensure_db()
    fid = (feedback_id or "").strip()
    if not fid:
        return None
    if _use_firestore():
        doc = (
            _get_firestore_client()
            .collection(YOGA_FEEDBACK_COLLECTION)
            .document(fid)
            .get()
        )
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = fid
        return _feedback_from_row(data, include_screenshot=True)
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM yoga_feedback WHERE id = ?", (fid,)
        ).fetchone()
        return _feedback_from_row(row, include_screenshot=True) if row else None


def delete_feedback(feedback_id: str) -> None:
    ensure_db()
    fid = (feedback_id or "").strip()
    if not fid:
        raise KeyError("feedback_not_found")
    if _use_firestore():
        ref = _get_firestore_client().collection(YOGA_FEEDBACK_COLLECTION).document(fid)
        if not ref.get().exists:
            raise KeyError("feedback_not_found")
        ref.delete()
        return
    with _connect() as conn:
        cur = conn.execute("DELETE FROM yoga_feedback WHERE id = ?", (fid,))
        conn.commit()
        if cur.rowcount < 1:
            raise KeyError("feedback_not_found")


def set_feedback_status(feedback_id: str, status: str) -> dict[str, Any]:
    ensure_db()
    fid = (feedback_id or "").strip()
    if not fid:
        raise KeyError("feedback_not_found")
    status_clean = (status or "").strip().lower()
    if status_clean not in FEEDBACK_STATUSES:
        raise ValueError("invalid_feedback_status")
    existing = get_feedback(fid)
    if not existing:
        raise KeyError("feedback_not_found")
    if _use_firestore():
        _get_firestore_client().collection(YOGA_FEEDBACK_COLLECTION).document(fid).set(
            {"status": status_clean},
            merge=True,
        )
        return get_feedback(fid) or {**existing, "status": status_clean}
    with _connect() as conn:
        conn.execute(
            "UPDATE yoga_feedback SET status = ? WHERE id = ?",
            (status_clean, fid),
        )
        conn.commit()
    return get_feedback(fid) or {**existing, "status": status_clean}


def set_blog_admin_reviewed(blog_id: str) -> dict[str, Any]:
    """Stamp adminReviewedAt so the post leaves the admin 'new blog' inbox."""
    ensure_db()
    blog_id = (blog_id or "").strip()
    blog = get_blog(blog_id)
    if not blog:
        raise KeyError("blog_not_found")
    now = _now()
    if _use_firestore():
        _get_firestore_client().collection(YOGA_BLOGS_COLLECTION).document(blog_id).set(
            {"adminReviewedAt": now, "updatedAt": now},
            merge=True,
        )
        return get_blog(blog_id) or {
            **blog,
            "adminReviewedAt": now,
            "updatedAt": now,
        }
    with _connect() as conn:
        conn.execute(
            """
            UPDATE yoga_blogs
            SET admin_reviewed_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (now, now, blog_id),
        )
        conn.commit()
    return get_blog(blog_id) or {
        **blog,
        "adminReviewedAt": now,
        "updatedAt": now,
    }