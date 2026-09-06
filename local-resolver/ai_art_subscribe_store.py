"""SQLite persistence for AI Art email digest subscriptions."""

from __future__ import annotations

import os
import sqlite3
import time
from typing import Any

AI_ART_DB_PATH = os.getenv(
    "AI_ART_DB_PATH",
    os.path.join(os.path.dirname(__file__), "data", "ai_art_subscriptions.sqlite"),
).strip()

FREQUENCIES = frozenset({"daily", "weekly"})


def _db_path() -> str:
    path = AI_ART_DB_PATH
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    return path


def ensure_db() -> None:
    conn = sqlite3.connect(_db_path())
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_art_subscriptions (
                email TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                picture TEXT NOT NULL DEFAULT '',
                frequency TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_subscription(email: str) -> dict[str, Any] | None:
    ensure_db()
    email = (email or "").strip().lower()
    if not email:
        return None
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT email, name, picture, frequency, created_at, updated_at "
            "FROM ai_art_subscriptions WHERE email = ?",
            (email,),
        ).fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def upsert_subscription(
    *,
    email: str,
    frequency: str,
    name: str = "",
    picture: str = "",
) -> dict[str, Any]:
    ensure_db()
    email = (email or "").strip().lower()
    frequency = (frequency or "").strip().lower()
    if not email:
        raise ValueError("email_required")
    if frequency not in FREQUENCIES:
        raise ValueError("invalid_frequency")
    now = time.time()
    existing = get_subscription(email)
    conn = sqlite3.connect(_db_path())
    try:
        if existing:
            conn.execute(
                """
                UPDATE ai_art_subscriptions
                SET frequency = ?, name = COALESCE(NULLIF(?, ''), name),
                    picture = COALESCE(NULLIF(?, ''), picture),
                    updated_at = ?
                WHERE email = ?
                """,
                (frequency, (name or "").strip(), (picture or "").strip(), now, email),
            )
        else:
            conn.execute(
                """
                INSERT INTO ai_art_subscriptions
                    (email, name, picture, frequency, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    email,
                    (name or "").strip(),
                    (picture or "").strip(),
                    frequency,
                    now,
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()
    sub = get_subscription(email)
    if not sub:
        raise RuntimeError("subscription_missing_after_upsert")
    return sub


def delete_subscription(email: str) -> bool:
    ensure_db()
    email = (email or "").strip().lower()
    if not email:
        return False
    conn = sqlite3.connect(_db_path())
    try:
        cur = conn.execute(
            "DELETE FROM ai_art_subscriptions WHERE email = ?", (email,)
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_subscribers(*, frequency: str | None = None) -> list[dict[str, Any]]:
    ensure_db()
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        if frequency:
            freq = frequency.strip().lower()
            rows = conn.execute(
                "SELECT email, name, picture, frequency, created_at, updated_at "
                "FROM ai_art_subscriptions WHERE frequency = ? ORDER BY email",
                (freq,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT email, name, picture, frequency, created_at, updated_at "
                "FROM ai_art_subscriptions ORDER BY email"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
