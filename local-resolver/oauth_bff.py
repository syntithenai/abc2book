"""Google OAuth BFF: authorization-code exchange + silent refresh for the SPA.

Session ids are opaque and sent only via the X-Abc-Auth-Session header.
Media routes continue to use Authorization: Bearer <google_access_token>.
ALLOWED_EMAILS never blocks exchange — it only informs allowed_for_media via RESOLVER_ACCESS_EMAILS.

Session storage:
  AUTH_SESSION_STORE=sqlite (default) — home resolver / local dev
  AUTH_SESSION_STORE=firestore — Cloud Run (durable, multi-instance)
"""

from __future__ import annotations

import asyncio
import os
import secrets
import sqlite3
import time
from typing import Any

import httpx

AUTH_SESSION_HEADER = "X-Abc-Auth-Session"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
AUTH_SESSION_SECRET = os.getenv("AUTH_SESSION_SECRET", "").strip()
AUTH_SESSION_STORE = os.getenv("AUTH_SESSION_STORE", "sqlite").strip().lower()
AUTH_SESSION_DB_PATH = os.getenv(
    "AUTH_SESSION_DB_PATH",
    os.path.join(os.path.dirname(__file__), "data", "oauth_sessions.sqlite"),
).strip()
AUTH_SESSION_FIRESTORE_PROJECT = os.getenv("AUTH_SESSION_FIRESTORE_PROJECT", "").strip()
AUTH_SESSION_FIRESTORE_COLLECTION = os.getenv(
    "AUTH_SESSION_FIRESTORE_COLLECTION",
    "oauth_sessions",
).strip()
AUTH_REFRESH_TOKEN_FERNET_KEY = os.getenv("AUTH_REFRESH_TOKEN_FERNET_KEY", "").strip()
REFRESH_MIN_INTERVAL_SECONDS = float(os.getenv("AUTH_REFRESH_MIN_INTERVAL_SECONDS", "45"))
ACCESS_TOKEN_CACHE_SKEW_SECONDS = float(os.getenv("AUTH_ACCESS_TOKEN_CACHE_SKEW_SECONDS", "60"))

_db_initialized = False
_fernet = None
_fernet_checked = False
_firestore_client = None
_refresh_locks: dict[str, asyncio.Lock] = {}


def oauth_bff_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and AUTH_SESSION_SECRET)


def _use_firestore() -> bool:
    return AUTH_SESSION_STORE == "firestore"


def _get_fernet():
    global _fernet, _fernet_checked
    if _fernet_checked:
        return _fernet
    _fernet_checked = True
    if not AUTH_REFRESH_TOKEN_FERNET_KEY:
        _fernet = None
        return None
    try:
        from cryptography.fernet import Fernet

        _fernet = Fernet(AUTH_REFRESH_TOKEN_FERNET_KEY.encode("utf-8"))
    except Exception:
        _fernet = None
    return _fernet


def _encrypt_refresh_token(refresh_token: str) -> str:
    fernet = _get_fernet()
    if not fernet:
        return refresh_token
    return fernet.encrypt(refresh_token.encode("utf-8")).decode("utf-8")


def _decrypt_refresh_token(stored: str) -> str:
    fernet = _get_fernet()
    if not fernet:
        return stored
    try:
        return fernet.decrypt(stored.encode("utf-8")).decode("utf-8")
    except Exception:
        return stored


def _doc_to_session(session_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "email": data.get("email") or "",
        "refresh_token": _decrypt_refresh_token(data.get("refresh_token_enc") or ""),
        "scopes": data.get("scopes") or "",
        "created_at": float(data.get("created_at") or 0),
        "last_used_at": float(data.get("last_used_at") or 0),
        "allowed_for_media": bool(data.get("allowed_for_media")),
        "access_token_enc": data.get("access_token_enc") or "",
        "access_expires_at": float(data.get("access_expires_at") or 0),
        "last_refresh_at": float(data.get("last_refresh_at") or 0),
    }


def _get_firestore_client():
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client
    from google.cloud import firestore

    project = AUTH_SESSION_FIRESTORE_PROJECT or None
    _firestore_client = firestore.Client(project=project)
    return _firestore_client


def _firestore_collection():
    client = _get_firestore_client()
    return client.collection(AUTH_SESSION_FIRESTORE_COLLECTION)


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(AUTH_SESSION_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(AUTH_SESSION_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db() -> None:
    global _db_initialized
    if _use_firestore():
        return
    if _db_initialized:
        return
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS oauth_sessions (
                session_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                refresh_token_enc TEXT NOT NULL,
                scopes TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL,
                last_used_at REAL NOT NULL,
                allowed_for_media INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_oauth_sessions_email ON oauth_sessions(email)"
        )
        for ddl in (
            "ALTER TABLE oauth_sessions ADD COLUMN access_token_enc TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE oauth_sessions ADD COLUMN access_expires_at REAL NOT NULL DEFAULT 0",
            "ALTER TABLE oauth_sessions ADD COLUMN last_refresh_at REAL NOT NULL DEFAULT 0",
        ):
            try:
                conn.execute(ddl)
            except sqlite3.OperationalError:
                pass
        conn.commit()
    _db_initialized = True
    if not AUTH_REFRESH_TOKEN_FERNET_KEY and oauth_bff_configured():
        try:
            os.chmod(AUTH_SESSION_DB_PATH, 0o600)
        except OSError:
            pass


def _email_allowed(email: str, allowed_emails: set[str]) -> bool:
    if not email or not allowed_emails:
        return False
    normalized = email.strip().lower()
    if "all" in allowed_emails:
        return True
    return normalized in allowed_emails


def _row_to_session(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if not row:
        return None
    keys = row.keys()
    return {
        "session_id": row["session_id"],
        "email": row["email"],
        "refresh_token": _decrypt_refresh_token(row["refresh_token_enc"]),
        "scopes": row["scopes"] or "",
        "created_at": row["created_at"],
        "last_used_at": row["last_used_at"],
        "allowed_for_media": bool(row["allowed_for_media"]),
        "access_token_enc": row["access_token_enc"] if "access_token_enc" in keys else "",
        "access_expires_at": float(row["access_expires_at"]) if "access_expires_at" in keys else 0.0,
        "last_refresh_at": float(row["last_refresh_at"]) if "last_refresh_at" in keys else 0.0,
    }


def _get_refresh_lock(session_id: str) -> asyncio.Lock:
    lock = _refresh_locks.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _refresh_locks[session_id] = lock
    return lock


def _access_cache_valid(session: dict[str, Any]) -> bool:
    enc = session.get("access_token_enc") or ""
    expires_at = float(session.get("access_expires_at") or 0)
    if not enc or expires_at <= 0:
        return False
    return expires_at > time.time() + ACCESS_TOKEN_CACHE_SKEW_SECONDS


def _cached_refresh_response(session_id: str, session: dict[str, Any]) -> dict[str, Any]:
    expires_at = float(session.get("access_expires_at") or 0)
    return {
        "session_id": session_id,
        "access_token": _decrypt_refresh_token(session.get("access_token_enc") or ""),
        "expires_in": max(0, int(expires_at - time.time())),
        "scope": session.get("scopes") or "",
        "cached": True,
    }


def _store_access_cache(session_id: str, access_token: str, expires_in: int, scope: str) -> None:
    now = time.time()
    expires_at = now + max(0, int(expires_in))
    enc = _encrypt_refresh_token(access_token)
    if _use_firestore():
        _firestore_collection().document(session_id).update({
            "access_token_enc": enc,
            "access_expires_at": expires_at,
            "last_refresh_at": now,
            "last_used_at": now,
            "scopes": scope or "",
        })
        return
    ensure_db()
    with _connect() as conn:
        conn.execute(
            """
            UPDATE oauth_sessions
            SET access_token_enc = ?, access_expires_at = ?, last_refresh_at = ?,
                last_used_at = ?, scopes = ?
            WHERE session_id = ?
            """,
            (enc, expires_at, now, now, scope or "", session_id),
        )
        conn.commit()


def get_session(session_id: str) -> dict[str, Any] | None:
    if not session_id:
        return None
    if _use_firestore():
        doc = _firestore_collection().document(session_id).get()
        if not doc.exists:
            return None
        return _doc_to_session(session_id, doc.to_dict() or {})
    ensure_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM oauth_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    return _row_to_session(row)


def delete_session(session_id: str) -> None:
    if not session_id:
        return
    if _use_firestore():
        _firestore_collection().document(session_id).delete()
        return
    ensure_db()
    with _connect() as conn:
        conn.execute("DELETE FROM oauth_sessions WHERE session_id = ?", (session_id,))
        conn.commit()


def delete_sessions_for_email(email: str) -> None:
    if not email:
        return
    if _use_firestore():
        normalized = email.strip().lower()
        for doc in _firestore_collection().where("email", "==", normalized).stream():
            doc.reference.delete()
        return
    ensure_db()
    with _connect() as conn:
        conn.execute(
            "DELETE FROM oauth_sessions WHERE lower(email) = lower(?)",
            (email,),
        )
        conn.commit()


def upsert_session(
    *,
    email: str,
    refresh_token: str,
    scopes: str,
    allowed_for_media: bool,
    session_id: str | None = None,
) -> str:
    now = time.time()
    sid = session_id or secrets.token_urlsafe(32)
    enc = _encrypt_refresh_token(refresh_token)
    normalized_email = email.strip().lower()

    if _use_firestore():
        collection = _firestore_collection()
        for doc in collection.where("email", "==", normalized_email).stream():
            if doc.id != sid:
                doc.reference.delete()
        existing = collection.document(sid).get()
        payload = {
            "email": normalized_email,
            "refresh_token_enc": enc,
            "scopes": scopes or "",
            "last_used_at": now,
            "allowed_for_media": allowed_for_media,
        }
        if existing.exists:
            collection.document(sid).update(payload)
        else:
            payload["created_at"] = now
            collection.document(sid).set(payload)
        return sid

    ensure_db()
    with _connect() as conn:
        conn.execute(
            "DELETE FROM oauth_sessions WHERE lower(email) = lower(?) AND session_id != ?",
            (email, sid),
        )
        existing = conn.execute(
            "SELECT session_id FROM oauth_sessions WHERE session_id = ?",
            (sid,),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE oauth_sessions
                SET email = ?, refresh_token_enc = ?, scopes = ?, last_used_at = ?,
                    allowed_for_media = ?
                WHERE session_id = ?
                """,
                (email, enc, scopes or "", now, 1 if allowed_for_media else 0, sid),
            )
        else:
            conn.execute(
                """
                INSERT INTO oauth_sessions (
                    session_id, email, refresh_token_enc, scopes,
                    created_at, last_used_at, allowed_for_media
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (sid, email, enc, scopes or "", now, now, 1 if allowed_for_media else 0),
            )
        conn.commit()
    return sid


def touch_session(session_id: str, scopes: str | None = None) -> None:
    now = time.time()
    if _use_firestore():
        ref = _firestore_collection().document(session_id)
        if scopes is not None:
            ref.update({"last_used_at": now, "scopes": scopes})
        else:
            ref.update({"last_used_at": now})
        return
    ensure_db()
    with _connect() as conn:
        if scopes is not None:
            conn.execute(
                "UPDATE oauth_sessions SET last_used_at = ?, scopes = ? WHERE session_id = ?",
                (now, scopes, session_id),
            )
        else:
            conn.execute(
                "UPDATE oauth_sessions SET last_used_at = ? WHERE session_id = ?",
                (now, session_id),
            )
        conn.commit()


def session_id_from_headers(headers) -> str:
    if not headers:
        return ""
    value = headers.get(AUTH_SESSION_HEADER) or headers.get(AUTH_SESSION_HEADER.lower())
    return (value or "").strip()


async def exchange_authorization_code(
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    allowed_emails: set[str],
    existing_refresh_token: str | None = None,
) -> dict[str, Any]:
    if not oauth_bff_configured():
        return {"error": "oauth_bff_unavailable", "status": 503}

    if not code or not redirect_uri:
        return {"error": "missing_parameters", "status": 400}

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
    }
    if code_verifier:
        data["code_verifier"] = code_verifier

    async with httpx.AsyncClient(timeout=30) as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data=data)
        if token_resp.status_code >= 400:
            detail = _safe_error_detail(token_resp)
            return {
                "error": "token_exchange_failed",
                "status": 400,
                "detail": detail,
            }
        token_body = token_resp.json()
        access_token = token_body.get("access_token")
        refresh_token = token_body.get("refresh_token") or existing_refresh_token
        expires_in = int(token_body.get("expires_in") or 3600)
        scope = token_body.get("scope") or ""

        if not access_token:
            return {"error": "token_exchange_failed", "status": 400, "detail": "no access_token"}

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": "Bearer " + access_token},
        )
        if userinfo_resp.status_code >= 400:
            return {"error": "userinfo_failed", "status": 400}
        profile = userinfo_resp.json()
        email = (profile.get("email") or "").strip().lower()
        if not email:
            return {"error": "userinfo_failed", "status": 400, "detail": "no email"}

        if not scope:
            scope = " ".join(
                part
                for part in [
                    "openid",
                    "email",
                    "profile",
                    "https://www.googleapis.com/auth/drive.file",
                ]
                if part
            )

        allowed = _email_allowed(email, allowed_emails)
        profile_payload = {
            "access_token": access_token,
            "expires_in": expires_in,
            "scope": scope,
            "email": email,
            "name": profile.get("name") or email,
            "picture": profile.get("picture") or "",
            "given_name": profile.get("given_name") or "",
            "family_name": profile.get("family_name") or "",
            "allowed_for_media": allowed,
        }

        if not refresh_token:
            return {
                "session_id": "",
                "offline": False,
                **profile_payload,
            }

        session_id = upsert_session(
            email=email,
            refresh_token=refresh_token,
            scopes=scope,
            allowed_for_media=allowed,
        )
        _store_access_cache(session_id, access_token, expires_in, scope)

        return {
            "session_id": session_id,
            "offline": True,
            **profile_payload,
        }


async def refresh_access_token(session_id: str) -> dict[str, Any]:
    if not oauth_bff_configured():
        return {"error": "oauth_bff_unavailable", "status": 503}

    lock = _get_refresh_lock(session_id)
    async with lock:
        session = get_session(session_id)
        if not session:
            return {"error": "invalid_session", "status": 401}

        if _access_cache_valid(session):
            return _cached_refresh_response(session_id, session)

        now = time.time()
        last_refresh = float(session.get("last_refresh_at") or 0)
        if last_refresh > 0 and (now - last_refresh) < REFRESH_MIN_INTERVAL_SECONDS:
            retry_after = int(REFRESH_MIN_INTERVAL_SECONDS - (now - last_refresh)) + 1
            return {
                "error": "refresh_rate_limited",
                "status": 429,
                "retry_after": retry_after,
                "detail": (
                    "Refresh rate limited to once every "
                    + str(int(REFRESH_MIN_INTERVAL_SECONDS))
                    + " seconds per session"
                ),
            }

        data = {
            "grant_type": "refresh_token",
            "refresh_token": session["refresh_token"],
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            token_resp = await client.post(GOOGLE_TOKEN_URL, data=data)
            if token_resp.status_code >= 400:
                detail = _safe_error_detail(token_resp)
                if token_resp.status_code in (400, 401):
                    delete_session(session_id)
                return {
                    "error": "refresh_failed",
                    "status": 401,
                    "detail": detail,
                }
            token_body = token_resp.json()
            access_token = token_body.get("access_token")
            if not access_token:
                delete_session(session_id)
                return {"error": "refresh_failed", "status": 401, "detail": "no access_token"}

            expires_in = int(token_body.get("expires_in") or 3600)
            scope = token_body.get("scope") or session["scopes"]
            new_refresh = token_body.get("refresh_token")
            if new_refresh:
                upsert_session(
                    email=session["email"],
                    refresh_token=new_refresh,
                    scopes=scope,
                    allowed_for_media=session["allowed_for_media"],
                    session_id=session_id,
                )
            else:
                touch_session(session_id, scopes=scope)
            _store_access_cache(session_id, access_token, expires_in, scope)

            return {
                "session_id": session_id,
                "access_token": access_token,
                "expires_in": expires_in,
                "scope": scope,
            }


async def load_session_with_token(session_id: str) -> dict[str, Any]:
    session = get_session(session_id)
    if not session:
        return {"error": "invalid_session", "status": 401}

    refreshed = await refresh_access_token(session_id)
    if refreshed.get("error"):
        return refreshed

    return {
        "ok": True,
        "session_id": session_id,
        "email": session["email"],
        "scope": refreshed.get("scope") or session["scopes"],
        "allowed_for_media": session["allowed_for_media"],
        "access_token": refreshed["access_token"],
        "expires_in": refreshed["expires_in"],
    }


async def logout_session(session_id: str) -> dict[str, Any]:
    if session_id:
        delete_session(session_id)
    return {"ok": True}


async def _revoke_token_best_effort(token: str) -> None:
    if not token:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(GOOGLE_REVOKE_URL, data={"token": token})
    except Exception:
        pass


def _safe_error_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
        return str(body.get("error_description") or body.get("error") or response.text)[:500]
    except Exception:
        return (response.text or "")[:500]
