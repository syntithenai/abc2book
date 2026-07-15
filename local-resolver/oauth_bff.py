"""Google OAuth BFF: authorization-code exchange + silent refresh for the SPA.

Session ids are opaque and sent only via the X-Abc-Auth-Session header.
Media routes continue to use Authorization: Bearer <google_access_token>.
ALLOWED_EMAILS never blocks exchange — it only informs allowed_for_media.
"""

from __future__ import annotations

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
AUTH_SESSION_DB_PATH = os.getenv(
    "AUTH_SESSION_DB_PATH",
    os.path.join(os.path.dirname(__file__), "data", "oauth_sessions.sqlite"),
).strip()
AUTH_REFRESH_TOKEN_FERNET_KEY = os.getenv("AUTH_REFRESH_TOKEN_FERNET_KEY", "").strip()

_db_initialized = False
_fernet = None
_fernet_checked = False


def oauth_bff_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and AUTH_SESSION_SECRET)


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
        # Allow reading plaintext rows written before a key was configured.
        return stored


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(AUTH_SESSION_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(AUTH_SESSION_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db() -> None:
    global _db_initialized
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
    return {
        "session_id": row["session_id"],
        "email": row["email"],
        "refresh_token": _decrypt_refresh_token(row["refresh_token_enc"]),
        "scopes": row["scopes"] or "",
        "created_at": row["created_at"],
        "last_used_at": row["last_used_at"],
        "allowed_for_media": bool(row["allowed_for_media"]),
    }


def get_session(session_id: str) -> dict[str, Any] | None:
    if not session_id:
        return None
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
    ensure_db()
    with _connect() as conn:
        conn.execute("DELETE FROM oauth_sessions WHERE session_id = ?", (session_id,))
        conn.commit()


def delete_sessions_for_email(email: str) -> None:
    if not email:
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
    ensure_db()
    now = time.time()
    sid = session_id or secrets.token_urlsafe(32)
    enc = _encrypt_refresh_token(refresh_token)
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
    ensure_db()
    now = time.time()
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

        if not refresh_token:
            return {
                "error": "refresh_token_missing",
                "status": 400,
                "hint": "Re-consent with prompt=consent to obtain a refresh token",
            }

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
        session_id = upsert_session(
            email=email,
            refresh_token=refresh_token,
            scopes=scope,
            allowed_for_media=allowed,
        )

        return {
            "session_id": session_id,
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


async def refresh_access_token(session_id: str) -> dict[str, Any]:
    if not oauth_bff_configured():
        return {"error": "oauth_bff_unavailable", "status": 503}

    session = get_session(session_id)
    if not session:
        return {"error": "invalid_session", "status": 401}

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
            # Invalid refresh token — drop session so SPA can fall back.
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

        return {
            "session_id": session_id,
            "access_token": access_token,
            "expires_in": expires_in,
            "scope": scope,
        }


async def load_session_with_token(session_id: str) -> dict[str, Any]:
    """Return session metadata and a freshly refreshed access token when possible."""
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
    session = get_session(session_id)
    if session:
        await _revoke_token_best_effort(session["refresh_token"])
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
