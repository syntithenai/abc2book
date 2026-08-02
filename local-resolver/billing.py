"""Credit ledger for hosted resolver billing.

Storage follows oauth_bff: sqlite (home) or firestore (Cloud Run).
Balance is stored in millicents (1 millicent = $0.00001).
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, AsyncIterator, Callable

from billing_rates import (
    MILLICENTS_PER_CENT,
    TRIAL_CREDIT_CENTS,
    cents_to_millicents,
    millicents_to_cents,
)

BILLING_ENABLED = os.getenv("BILLING_ENABLED", "false").lower() in ("1", "true", "yes")
BILLING_STORE = os.getenv("BILLING_STORE", os.getenv("AUTH_SESSION_STORE", "sqlite")).strip().lower()
BILLING_DB_PATH = os.getenv(
    "BILLING_DB_PATH",
    os.path.join(os.path.dirname(__file__), "data", "billing.sqlite"),
).strip()
BILLING_FIRESTORE_PROJECT = os.getenv(
    "BILLING_FIRESTORE_PROJECT",
    os.getenv("AUTH_SESSION_FIRESTORE_PROJECT", ""),
).strip()
BILLING_FIRESTORE_COLLECTION = os.getenv("BILLING_FIRESTORE_COLLECTION", "billing_accounts").strip()
BILLING_LEDGER_COLLECTION = os.getenv("BILLING_LEDGER_COLLECTION", "billing_ledger").strip()
BILLING_STRIPE_EVENTS_COLLECTION = os.getenv(
    "BILLING_STRIPE_EVENTS_COLLECTION",
    "billing_stripe_events",
).strip()
BILLING_PAYMENT_EVENTS_COLLECTION = os.getenv(
    "BILLING_PAYMENT_EVENTS_COLLECTION",
    "billing_payment_events",
).strip()
BILLING_HOLDS_COLLECTION = os.getenv("BILLING_HOLDS_COLLECTION", "billing_holds").strip()
BILLING_RESERVATIONS_ENABLED = os.getenv("BILLING_RESERVATIONS_ENABLED", "true").lower() in ("1", "true", "yes")
HOLD_TTL_SECONDS = float(os.getenv("BILLING_HOLD_TTL_SECONDS", "600"))

_db_initialized = False
_firestore_client = None


def billing_enabled() -> bool:
    return BILLING_ENABLED


def _use_firestore() -> bool:
    return BILLING_STORE == "firestore"


def _get_firestore_client():
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client
    from google.cloud import firestore

    project = BILLING_FIRESTORE_PROJECT or None
    _firestore_client = firestore.Client(project=project)
    return _firestore_client


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(BILLING_DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(BILLING_DB_PATH, timeout=30)
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
            CREATE TABLE IF NOT EXISTS credit_accounts (
                email TEXT PRIMARY KEY,
                balance_millicents INTEGER NOT NULL DEFAULT 0,
                trial_granted INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_ledger (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                delta_millicents INTEGER NOT NULL,
                balance_after_millicents INTEGER NOT NULL,
                entry_type TEXT NOT NULL,
                usage_type TEXT NOT NULL DEFAULT '',
                detail_json TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_credit_ledger_email ON credit_ledger(email, created_at DESC)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stripe_events (
                event_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_events (
                provider TEXT NOT NULL,
                event_id TEXT NOT NULL,
                email TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY (provider, event_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credit_holds (
                hold_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                millicents INTEGER NOT NULL,
                operation_id TEXT NOT NULL DEFAULT '',
                detail_json TEXT NOT NULL DEFAULT '{}',
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                released INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_credit_holds_email ON credit_holds(email, released, expires_at)"
        )
        conn.commit()
    _db_initialized = True


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def is_unlimited_user(
    email: str,
    *,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> bool:
    from allowlists import email_allowed

    normalized = _normalize_email(email)
    if not normalized:
        return False
    return email_allowed(free_allowlist, normalized) or email_allowed(embedded_allowlist, normalized)


def should_bill_user(
    email: str,
    *,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> bool:
    if not billing_enabled():
        return False
    return not is_unlimited_user(
        email,
        free_allowlist=free_allowlist,
        embedded_allowlist=embedded_allowlist,
    )


def _sqlite_get_account(email: str) -> dict[str, Any] | None:
    ensure_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT email, balance_millicents, trial_granted, created_at, updated_at FROM credit_accounts WHERE email = ?",
            (email,),
        ).fetchone()
    if not row:
        return None
    return {
        "email": row["email"],
        "balance_millicents": int(row["balance_millicents"]),
        "trial_granted": bool(row["trial_granted"]),
        "created_at": float(row["created_at"]),
        "updated_at": float(row["updated_at"]),
    }


def _firestore_account_ref(email: str):
    client = _get_firestore_client()
    return client.collection(BILLING_FIRESTORE_COLLECTION).document(email)


def _firestore_get_account(email: str) -> dict[str, Any] | None:
    doc = _firestore_account_ref(email).get()
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    return {
        "email": email,
        "balance_millicents": int(data.get("balance_millicents") or 0),
        "trial_granted": bool(data.get("trial_granted")),
        "created_at": float(data.get("created_at") or 0),
        "updated_at": float(data.get("updated_at") or 0),
    }


def get_account(email: str) -> dict[str, Any] | None:
    email = _normalize_email(email)
    if not email:
        return None
    if _use_firestore():
        return _firestore_get_account(email)
    return _sqlite_get_account(email)


def get_balance_millicents(email: str) -> int:
    account = get_account(email)
    if not account:
        return 0
    return int(account["balance_millicents"])


def get_balance_cents(email: str) -> float:
    return millicents_to_cents(get_balance_millicents(email))


def has_credit_access(
    email: str,
    *,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> bool:
    if not billing_enabled():
        return True
    if is_unlimited_user(email, free_allowlist=free_allowlist, embedded_allowlist=embedded_allowlist):
        return True
    return get_balance_millicents(email) > 0


def _append_ledger_sqlite(
    conn: sqlite3.Connection,
    *,
    email: str,
    delta_millicents: int,
    balance_after: int,
    entry_type: str,
    usage_type: str,
    detail: dict[str, Any],
) -> str:
    entry_id = uuid.uuid4().hex
    now = time.time()
    conn.execute(
        """
        INSERT INTO credit_ledger (
            id, email, delta_millicents, balance_after_millicents,
            entry_type, usage_type, detail_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry_id,
            email,
            delta_millicents,
            balance_after,
            entry_type,
            usage_type or "",
            json.dumps(detail or {}),
            now,
        ),
    )
    return entry_id


def _apply_delta_sqlite(
    email: str,
    delta_millicents: int,
    *,
    entry_type: str,
    usage_type: str = "",
    detail: dict[str, Any] | None = None,
    allow_negative: bool = False,
) -> dict[str, Any]:
    ensure_db()
    email = _normalize_email(email)
    now = time.time()
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT balance_millicents, trial_granted, created_at FROM credit_accounts WHERE email = ?",
            (email,),
        ).fetchone()
        if row:
            balance = int(row["balance_millicents"])
            trial_granted = bool(row["trial_granted"])
            created_at = float(row["created_at"])
        else:
            balance = 0
            trial_granted = False
            created_at = now
            conn.execute(
                "INSERT INTO credit_accounts (email, balance_millicents, trial_granted, created_at, updated_at) VALUES (?, 0, 0, ?, ?)",
                (email, now, now),
            )
        new_balance = balance + int(delta_millicents)
        if not allow_negative and new_balance < 0:
            conn.execute("ROLLBACK")
            return {"ok": False, "error": "insufficient_credit", "balance_millicents": balance}
        conn.execute(
            "UPDATE credit_accounts SET balance_millicents = ?, updated_at = ? WHERE email = ?",
            (new_balance, now, email),
        )
        entry_id = _append_ledger_sqlite(
            conn,
            email=email,
            delta_millicents=int(delta_millicents),
            balance_after=new_balance,
            entry_type=entry_type,
            usage_type=usage_type,
            detail=detail or {},
        )
        conn.commit()
    return {
        "ok": True,
        "entry_id": entry_id,
        "balance_millicents": new_balance,
        "trial_granted": trial_granted,
        "created_at": created_at,
    }


def _firestore_apply_delta(
    email: str,
    delta_millicents: int,
    *,
    entry_type: str,
    usage_type: str = "",
    detail: dict[str, Any] | None = None,
    allow_negative: bool = False,
) -> dict[str, Any]:
    from google.cloud import firestore as fs

    client = _get_firestore_client()
    account_ref = _firestore_account_ref(email)
    ledger_ref = client.collection(BILLING_LEDGER_COLLECTION).document()
    now = time.time()

    @fs.transactional
    def _txn(transaction):
        snap = account_ref.get(transaction=transaction)
        if snap.exists:
            data = snap.to_dict() or {}
            balance = int(data.get("balance_millicents") or 0)
            trial_granted = bool(data.get("trial_granted"))
            created_at = float(data.get("created_at") or now)
        else:
            balance = 0
            trial_granted = False
            created_at = now
        new_balance = balance + int(delta_millicents)
        if not allow_negative and new_balance < 0:
            return {"ok": False, "error": "insufficient_credit", "balance_millicents": balance}
        transaction.set(
            account_ref,
            {
                "email": email,
                "balance_millicents": new_balance,
                "trial_granted": trial_granted,
                "created_at": created_at,
                "updated_at": now,
            },
            merge=True,
        )
        transaction.set(
            ledger_ref,
            {
                "email": email,
                "delta_millicents": int(delta_millicents),
                "balance_after_millicents": new_balance,
                "entry_type": entry_type,
                "usage_type": usage_type or "",
                "detail": detail or {},
                "created_at": now,
            },
        )
        return {
            "ok": True,
            "entry_id": ledger_ref.id,
            "balance_millicents": new_balance,
            "trial_granted": trial_granted,
            "created_at": created_at,
        }

    transaction = client.transaction()
    return _txn(transaction)


def apply_delta(
    email: str,
    delta_millicents: int,
    *,
    entry_type: str,
    usage_type: str = "",
    detail: dict[str, Any] | None = None,
    allow_negative: bool = False,
) -> dict[str, Any]:
    email = _normalize_email(email)
    if not email:
        return {"ok": False, "error": "missing_email"}
    if _use_firestore():
        return _firestore_apply_delta(
            email,
            delta_millicents,
            entry_type=entry_type,
            usage_type=usage_type,
            detail=detail,
            allow_negative=allow_negative,
        )
    return _apply_delta_sqlite(
        email,
        delta_millicents,
        entry_type=entry_type,
        usage_type=usage_type,
        detail=detail,
        allow_negative=allow_negative,
    )


def grant_trial_if_new(email: str) -> dict[str, Any]:
    if not billing_enabled():
        return {"granted": False, "reason": "billing_disabled"}
    email = _normalize_email(email)
    if not email:
        return {"granted": False, "reason": "missing_email"}
    trial_millicents = cents_to_millicents(TRIAL_CREDIT_CENTS)
    if trial_millicents <= 0:
        return {"granted": False, "reason": "trial_disabled"}

    if _use_firestore():
        account = _firestore_get_account(email)
        if account and account.get("trial_granted"):
            return {"granted": False, "reason": "already_granted", "balance_millicents": account["balance_millicents"]}
        if not account:
            apply_delta(email, 0, entry_type="account_created")
        result = apply_delta(
            email,
            trial_millicents,
            entry_type="trial",
            usage_type="trial_credit",
            detail={"cents": TRIAL_CREDIT_CENTS},
        )
        if result.get("ok"):
            _firestore_account_ref(email).set({"trial_granted": True}, merge=True)
        return {"granted": bool(result.get("ok")), **result}

    ensure_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT trial_granted FROM credit_accounts WHERE email = ?",
            (email,),
        ).fetchone()
        if row and bool(row["trial_granted"]):
            balance = get_balance_millicents(email)
            return {"granted": False, "reason": "already_granted", "balance_millicents": balance}
    if not get_account(email):
        apply_delta(email, 0, entry_type="account_created")
    result = apply_delta(
        email,
        trial_millicents,
        entry_type="trial",
        usage_type="trial_credit",
        detail={"cents": TRIAL_CREDIT_CENTS},
    )
    if result.get("ok"):
        with _connect() as conn:
            conn.execute(
                "UPDATE credit_accounts SET trial_granted = 1 WHERE email = ?",
                (email,),
            )
            conn.commit()
    return {"granted": bool(result.get("ok")), **result}


def record_usage(
    email: str,
    millicents: int,
    *,
    usage_type: str,
    detail: dict[str, Any] | None = None,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> dict[str, Any]:
    if millicents <= 0:
        return {"ok": True, "skipped": True}
    if not should_bill_user(
        email,
        free_allowlist=free_allowlist,
        embedded_allowlist=embedded_allowlist,
    ):
        return {"ok": True, "skipped": True, "unlimited": True}
    return apply_delta(
        email,
        -int(millicents),
        entry_type="usage",
        usage_type=usage_type,
        detail=detail,
        allow_negative=False,
    )


def _payment_event_exists(provider: str, event_id: str) -> bool:
    provider = (provider or "").strip().lower()
    event_id = (event_id or "").strip()
    if not provider or not event_id:
        return False
    if _use_firestore():
        client = _get_firestore_client()
        doc_id = f"{provider}:{event_id}"
        if client.collection(BILLING_PAYMENT_EVENTS_COLLECTION).document(doc_id).get().exists:
            return True
        if provider == "stripe":
            return client.collection(BILLING_STRIPE_EVENTS_COLLECTION).document(event_id).get().exists
        return False

    ensure_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT provider FROM payment_events WHERE provider = ? AND event_id = ?",
            (provider, event_id),
        ).fetchone()
        if row:
            return True
        if provider == "stripe":
            legacy = conn.execute(
                "SELECT event_id FROM stripe_events WHERE event_id = ?",
                (event_id,),
            ).fetchone()
            return legacy is not None
    return False


def _record_payment_event(provider: str, event_id: str, email: str, amount_cents: int) -> None:
    provider = (provider or "").strip().lower()
    event_id = (event_id or "").strip()
    email = _normalize_email(email)
    if not provider or not event_id or not email:
        return
    now = time.time()
    if _use_firestore():
        client = _get_firestore_client()
        doc_id = f"{provider}:{event_id}"
        client.collection(BILLING_PAYMENT_EVENTS_COLLECTION).document(doc_id).set(
            {
                "provider": provider,
                "event_id": event_id,
                "email": email,
                "amount_cents": int(amount_cents),
                "created_at": now,
            }
        )
        if provider == "stripe":
            client.collection(BILLING_STRIPE_EVENTS_COLLECTION).document(event_id).set(
                {"email": email, "amount_cents": int(amount_cents), "created_at": now}
            )
        return

    ensure_db()
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO payment_events (provider, event_id, email, amount_cents, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (provider, event_id, email, int(amount_cents), now),
        )
        if provider == "stripe":
            conn.execute(
                """
                INSERT OR IGNORE INTO stripe_events (event_id, email, amount_cents, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (event_id, email, int(amount_cents), now),
            )
        conn.commit()


def grant_purchase(
    email: str,
    amount_cents: int,
    *,
    provider: str,
    provider_event_id: str,
    detail: dict[str, Any] | None = None,
) -> dict[str, Any]:
    email = _normalize_email(email)
    provider = (provider or "").strip().lower()
    event_id = (provider_event_id or "").strip()
    if not email or amount_cents <= 0 or not provider or not event_id:
        return {"ok": False, "error": "invalid_purchase"}

    if _payment_event_exists(provider, event_id):
        return {"ok": True, "duplicate": True, "balance_millicents": get_balance_millicents(email)}

    purchase_detail: dict[str, Any] = {"amount_cents": amount_cents, "provider": provider, "provider_event_id": event_id}
    if detail:
        purchase_detail.update(detail)
    usage_type = f"purchase_{provider}"
    result = apply_delta(
        email,
        cents_to_millicents(amount_cents),
        entry_type="purchase",
        usage_type=usage_type,
        detail=purchase_detail,
    )
    if result.get("ok"):
        _record_payment_event(provider, event_id, email, amount_cents)
    return result


def grant_purchase_cents(email: str, amount_cents: int, *, stripe_event_id: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    """Backward-compatible Stripe purchase grant."""
    merged = dict(detail or {})
    merged.setdefault("stripe_event_id", stripe_event_id)
    return grant_purchase(
        email,
        amount_cents,
        provider="stripe",
        provider_event_id=stripe_event_id,
        detail=merged,
    )


def account_to_api(account: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": account["email"],
        "balanceCents": millicents_to_cents(int(account["balance_millicents"])),
        "balanceMillicents": int(account["balance_millicents"]),
        "trialGranted": bool(account.get("trial_granted")),
        "createdAt": float(account.get("created_at") or 0),
        "updatedAt": float(account.get("updated_at") or 0),
    }


_account_to_api = account_to_api


def list_accounts(
    *,
    limit: int = 100,
    offset: int = 0,
    query: str = "",
) -> dict[str, Any]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    q = (query or "").strip().lower()

    if _use_firestore():
        client = _get_firestore_client()
        coll = client.collection(BILLING_FIRESTORE_COLLECTION)
        if q:
            docs = [doc for doc in coll.stream() if q in doc.id]
            docs.sort(key=lambda d: float((d.to_dict() or {}).get("updated_at") or 0), reverse=True)
            total = len(docs)
            page = docs[offset : offset + limit]
        else:
            docs = list(coll.order_by("updated_at", direction="DESCENDING").offset(offset).limit(limit).stream())
            total = coll.count().get()[0][0].value
        accounts = []
        for doc in page:
            data = doc.to_dict() or {}
            accounts.append(
                _account_to_api(
                    {
                        "email": doc.id,
                        "balance_millicents": int(data.get("balance_millicents") or 0),
                        "trial_granted": bool(data.get("trial_granted")),
                        "created_at": float(data.get("created_at") or 0),
                        "updated_at": float(data.get("updated_at") or 0),
                    }
                )
            )
        return {"accounts": accounts, "total": int(total)}

    ensure_db()
    where = ""
    params: list[Any] = []
    if q:
        where = " WHERE email LIKE ?"
        params.append(f"%{q}%")
    with _connect() as conn:
        total_row = conn.execute(
            f"SELECT COUNT(*) AS c FROM credit_accounts{where}",
            params,
        ).fetchone()
        total = int(total_row["c"]) if total_row else 0
        rows = conn.execute(
            f"""
            SELECT email, balance_millicents, trial_granted, created_at, updated_at
            FROM credit_accounts{where}
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()
    accounts = [
        _account_to_api(
            {
                "email": row["email"],
                "balance_millicents": int(row["balance_millicents"]),
                "trial_granted": bool(row["trial_granted"]),
                "created_at": float(row["created_at"]),
                "updated_at": float(row["updated_at"]),
            }
        )
        for row in rows
    ]
    return {"accounts": accounts, "total": total}


def admin_set_balance(
    email: str,
    target_millicents: int,
    *,
    admin_email: str,
    reason: str = "",
) -> dict[str, Any]:
    email = _normalize_email(email)
    admin_email = _normalize_email(admin_email)
    if not email:
        return {"ok": False, "error": "missing_email"}
    if not admin_email:
        return {"ok": False, "error": "missing_admin_email"}
    target_millicents = int(target_millicents)
    current = get_balance_millicents(email)
    delta = target_millicents - current
    if delta == 0:
        account = get_account(email)
        return {
            "ok": True,
            "no_change": True,
            "account": _account_to_api(account) if account else None,
        }
    detail: dict[str, Any] = {
        "admin_email": admin_email,
        "previous_millicents": current,
        "target_millicents": target_millicents,
    }
    if reason:
        detail["reason"] = reason
    result = apply_delta(
        email,
        delta,
        entry_type="admin_adjustment",
        usage_type="admin_set_balance",
        detail=detail,
        allow_negative=True,
    )
    if not result.get("ok"):
        return result
    account = get_account(email)
    return {"ok": True, "account": _account_to_api(account) if account else None}


def admin_rename_account(
    old_email: str,
    new_email: str,
    *,
    admin_email: str = "",
) -> dict[str, Any]:
    old_email = _normalize_email(old_email)
    new_email = _normalize_email(new_email)
    admin_email = _normalize_email(admin_email)
    if not old_email or not new_email:
        return {"ok": False, "error": "missing_email"}
    if old_email == new_email:
        account = get_account(old_email)
        return {
            "ok": True,
            "no_change": True,
            "account": _account_to_api(account) if account else None,
        }
    if get_account(new_email):
        return {"ok": False, "error": "target_exists"}

    if _use_firestore():
        return _firestore_rename_account(old_email, new_email, admin_email=admin_email)

    ensure_db()
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT balance_millicents, trial_granted, created_at, updated_at FROM credit_accounts WHERE email = ?",
            (old_email,),
        ).fetchone()
        if not row:
            conn.execute("ROLLBACK")
            return {"ok": False, "error": "account_not_found"}
        exists = conn.execute(
            "SELECT email FROM credit_accounts WHERE email = ?",
            (new_email,),
        ).fetchone()
        if exists:
            conn.execute("ROLLBACK")
            return {"ok": False, "error": "target_exists"}
        now = time.time()
        conn.execute(
            """
            INSERT INTO credit_accounts (email, balance_millicents, trial_granted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                new_email,
                int(row["balance_millicents"]),
                int(row["trial_granted"]),
                float(row["created_at"]),
                now,
            ),
        )
        conn.execute("DELETE FROM credit_accounts WHERE email = ?", (old_email,))
        conn.execute("UPDATE credit_ledger SET email = ? WHERE email = ?", (new_email, old_email))
        conn.execute("UPDATE payment_events SET email = ? WHERE email = ?", (new_email, old_email))
        conn.execute("UPDATE stripe_events SET email = ? WHERE email = ?", (new_email, old_email))
        conn.commit()
    account = get_account(new_email)
    return {"ok": True, "account": _account_to_api(account) if account else None}


def _firestore_rename_account(old_email: str, new_email: str, *, admin_email: str = "") -> dict[str, Any]:
    client = _get_firestore_client()
    old_ref = _firestore_account_ref(old_email)
    new_ref = _firestore_account_ref(new_email)
    old_snap = old_ref.get()
    if not old_snap.exists:
        return {"ok": False, "error": "account_not_found"}
    if new_ref.get().exists:
        return {"ok": False, "error": "target_exists"}

    data = old_snap.to_dict() or {}
    now = time.time()
    new_ref.set(
        {
            "email": new_email,
            "balance_millicents": int(data.get("balance_millicents") or 0),
            "trial_granted": bool(data.get("trial_granted")),
            "created_at": float(data.get("created_at") or now),
            "updated_at": now,
        }
    )
    old_ref.delete()

    batch_size = 400
    while True:
        query = (
            client.collection(BILLING_LEDGER_COLLECTION)
            .where("email", "==", old_email)
            .limit(batch_size)
        )
        docs = list(query.stream())
        if not docs:
            break
        batch = client.batch()
        for doc in docs:
            batch.update(doc.reference, {"email": new_email})
        batch.commit()

    for coll_name in (BILLING_PAYMENT_EVENTS_COLLECTION, BILLING_STRIPE_EVENTS_COLLECTION):
        for doc in client.collection(coll_name).where("email", "==", old_email).stream():
            doc.reference.update({"email": new_email})

    account = get_account(new_email)
    return {"ok": True, "account": _account_to_api(account) if account else None}


def list_ledger(email: str, *, limit: int = 50) -> list[dict[str, Any]]:
    email = _normalize_email(email)
    if not email:
        return []
    limit = max(1, min(int(limit), 200))
    if _use_firestore():
        client = _get_firestore_client()
        query = (
            client.collection(BILLING_LEDGER_COLLECTION)
            .where("email", "==", email)
            .order_by("created_at", direction="DESCENDING")
            .limit(limit)
        )
        out = []
        for doc in query.stream():
            data = doc.to_dict() or {}
            out.append(
                {
                    "id": doc.id,
                    "delta_millicents": int(data.get("delta_millicents") or 0),
                    "balance_after_millicents": int(data.get("balance_after_millicents") or 0),
                    "entry_type": data.get("entry_type") or "",
                    "usage_type": data.get("usage_type") or "",
                    "detail": data.get("detail") or {},
                    "created_at": float(data.get("created_at") or 0),
                }
            )
        return out

    ensure_db()
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, delta_millicents, balance_after_millicents, entry_type, usage_type, detail_json, created_at
            FROM credit_ledger WHERE email = ? ORDER BY created_at DESC LIMIT ?
            """,
            (email, limit),
        ).fetchall()
    out = []
    for row in rows:
        try:
            detail = json.loads(row["detail_json"] or "{}")
        except Exception:
            detail = {}
        out.append(
            {
                "id": row["id"],
                "delta_millicents": int(row["delta_millicents"]),
                "balance_after_millicents": int(row["balance_after_millicents"]),
                "entry_type": row["entry_type"],
                "usage_type": row["usage_type"],
                "detail": detail,
                "created_at": float(row["created_at"]),
            }
        )
    return out


def billing_health_fields(
    email: str | None,
    *,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> dict[str, Any]:
    if not billing_enabled():
        return {
            "billingEnabled": False,
            "creditRequired": False,
            "creditBalanceCents": None,
            "creditUnlimited": False,
        }
    normalized = _normalize_email(email or "")
    unlimited = bool(
        normalized
        and is_unlimited_user(
            normalized,
            free_allowlist=free_allowlist,
            embedded_allowlist=embedded_allowlist,
        )
    )
    balance_cents = millicents_to_cents(get_balance_millicents(normalized)) if normalized else 0.0
    return {
        "billingEnabled": True,
        "creditRequired": True,
        "creditBalanceCents": balance_cents,
        "creditUnlimited": unlimited,
    }


def billing_reservations_enabled() -> bool:
    return billing_enabled() and BILLING_RESERVATIONS_ENABLED


def _sqlite_sum_active_holds(email: str) -> int:
    ensure_db()
    now = time.time()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT COALESCE(SUM(millicents), 0) AS total
            FROM credit_holds
            WHERE email = ? AND released = 0 AND expires_at > ?
            """,
            (email, now),
        ).fetchone()
    return int(row["total"] or 0) if row else 0


def _firestore_sum_active_holds(email: str) -> int:
    now = time.time()
    client = _get_firestore_client()
    total = 0
    for doc in client.collection(BILLING_HOLDS_COLLECTION).where("email", "==", email).stream():
        data = doc.to_dict() or {}
        if data.get("released"):
            continue
        if float(data.get("expires_at") or 0) <= now:
            continue
        total += int(data.get("millicents") or 0)
    return total


def get_active_holds_millicents(email: str) -> int:
    email = _normalize_email(email)
    if not email:
        return 0
    sweep_expired_holds(email)
    if _use_firestore():
        return _firestore_sum_active_holds(email)
    return _sqlite_sum_active_holds(email)


def get_available_balance_millicents(email: str) -> int:
    balance = get_balance_millicents(email)
    holds = get_active_holds_millicents(email)
    return max(0, balance - holds)


def sweep_expired_holds(email: str | None = None) -> int:
    """Mark expired holds as released. Returns count swept."""
    now = time.time()
    if _use_firestore():
        client = _get_firestore_client()
        query = client.collection(BILLING_HOLDS_COLLECTION)
        if email:
            query = query.where("email", "==", _normalize_email(email))
        swept = 0
        for doc in query.stream():
            data = doc.to_dict() or {}
            if data.get("released"):
                continue
            if float(data.get("expires_at") or 0) > now:
                continue
            doc.reference.update({"released": True, "released_at": now})
            swept += 1
        return swept

    ensure_db()
    email_norm = _normalize_email(email or "")
    with _connect() as conn:
        if email_norm:
            result = conn.execute(
                """
                UPDATE credit_holds SET released = 1
                WHERE email = ? AND released = 0 AND expires_at <= ?
                """,
                (email_norm, now),
            )
        else:
            result = conn.execute(
                """
                UPDATE credit_holds SET released = 1
                WHERE released = 0 AND expires_at <= ?
                """,
                (now,),
            )
        conn.commit()
        return int(result.rowcount or 0)


def reserve_credit(
    email: str,
    millicents: int,
    operation_id: str,
    *,
    detail: dict[str, Any] | None = None,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> dict[str, Any]:
    if not billing_reservations_enabled():
        return {"ok": True, "skipped": True, "hold_id": None}
    email = _normalize_email(email)
    millicents = int(millicents)
    if not email or millicents <= 0:
        return {"ok": True, "skipped": True, "hold_id": None}
    if not should_bill_user(email, free_allowlist=free_allowlist, embedded_allowlist=embedded_allowlist):
        return {"ok": True, "skipped": True, "unlimited": True, "hold_id": None}

    balance = get_balance_millicents(email)
    available = get_available_balance_millicents(email)
    if available < millicents:
        return {
            "ok": False,
            "error": "insufficient_credit",
            "balance_millicents": balance,
            "available_millicents": available,
            "estimate_millicents": millicents,
        }

    hold_id = uuid.uuid4().hex
    now = time.time()
    expires_at = now + HOLD_TTL_SECONDS
    hold_detail = dict(detail or {})
    hold_detail["operation_id"] = operation_id

    if _use_firestore():
        client = _get_firestore_client()
        client.collection(BILLING_HOLDS_COLLECTION).document(hold_id).set(
            {
                "hold_id": hold_id,
                "email": email,
                "millicents": millicents,
                "operation_id": operation_id or "",
                "detail": hold_detail,
                "created_at": now,
                "expires_at": expires_at,
                "released": False,
            }
        )
    else:
        ensure_db()
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO credit_holds (
                    hold_id, email, millicents, operation_id, detail_json, created_at, expires_at, released
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    hold_id,
                    email,
                    millicents,
                    operation_id or "",
                    json.dumps(hold_detail),
                    now,
                    expires_at,
                ),
            )
            conn.commit()

    return {
        "ok": True,
        "hold_id": hold_id,
        "millicents": millicents,
        "available_millicents": available - millicents,
        "balance_millicents": balance,
    }


def release_hold(hold_id: str | None) -> dict[str, Any]:
    if not hold_id:
        return {"ok": True, "skipped": True}
    hold_id = str(hold_id).strip()
    if not hold_id:
        return {"ok": True, "skipped": True}
    now = time.time()
    if _use_firestore():
        client = _get_firestore_client()
        ref = client.collection(BILLING_HOLDS_COLLECTION).document(hold_id)
        doc = ref.get()
        if not doc.exists:
            return {"ok": False, "error": "hold_not_found"}
        ref.update({"released": True, "released_at": now})
        return {"ok": True}

    ensure_db()
    with _connect() as conn:
        row = conn.execute(
            "SELECT hold_id FROM credit_holds WHERE hold_id = ? AND released = 0",
            (hold_id,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "hold_not_found"}
        conn.execute(
            "UPDATE credit_holds SET released = 1 WHERE hold_id = ?",
            (hold_id,),
        )
        conn.commit()
    return {"ok": True}


def finalize_hold(hold_id: str | None, consumed_millicents: int = 0) -> dict[str, Any]:
    """Release a hold after operation completes (usage already debited via record_usage)."""
    return release_hold(hold_id)


def ensure_available_for_millicents(
    email: str,
    millicents: int,
    *,
    free_allowlist: set[str],
    embedded_allowlist: set[str],
) -> dict[str, Any]:
    if not billing_reservations_enabled():
        return {"ok": True}
    email = _normalize_email(email)
    if not should_bill_user(email, free_allowlist=free_allowlist, embedded_allowlist=embedded_allowlist):
        return {"ok": True, "unlimited": True}
    available = get_available_balance_millicents(email)
    if available < int(millicents):
        return {
            "ok": False,
            "error": "insufficient_credit",
            "available_millicents": available,
            "balance_millicents": get_balance_millicents(email),
            "required_millicents": int(millicents),
        }
    return {"ok": True, "available_millicents": available}


def wrap_streaming_body(
    body_iter: AsyncIterator[bytes],
    on_complete: Callable[[int], None],
) -> AsyncIterator[bytes]:
    async def _gen():
        total = 0
        try:
            async for chunk in body_iter:
                if chunk:
                    total += len(chunk)
                yield chunk
        finally:
            on_complete(total)

    return _gen()
