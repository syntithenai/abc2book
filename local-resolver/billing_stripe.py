"""Stripe Checkout session creation and webhook handling."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable

from fastapi import Header, Request
from fastapi.responses import JSONResponse

from urllib.parse import urlparse

from billing import billing_enabled, grant_purchase
from billing_paypal import apply_paypal_cpm_to_checkout_params
from billing_rates import CREDIT_PACKS

logger = logging.getLogger("tunebook.billing")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
BILLING_CHECKOUT_SUCCESS_URL = os.getenv(
    "BILLING_CHECKOUT_SUCCESS_URL",
    "https://tunebook.net/#/billing/success?session_id={CHECKOUT_SESSION_ID}",
).strip()
BILLING_CHECKOUT_CANCEL_URL = os.getenv(
    "BILLING_CHECKOUT_CANCEL_URL",
    "https://tunebook.net/#/billing/cancel",
).strip()
_DEFAULT_CHECKOUT_RETURN_ORIGINS = (
    "https://tunebook.net",
    "https://www.tunebook.net",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def _checkout_return_origins() -> tuple[str, ...]:
    raw = os.getenv("BILLING_CHECKOUT_ALLOWED_RETURN_ORIGINS", "").strip()
    if not raw:
        return _DEFAULT_CHECKOUT_RETURN_ORIGINS
    return tuple(part.strip().rstrip("/") for part in raw.split(",") if part.strip())


def _checkout_return_url_allowed(url: str) -> bool:
    try:
        parsed = urlparse((url or "").strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return origin in _checkout_return_origins()


def _resolve_checkout_return_urls(body: dict[str, Any]) -> tuple[str, str]:
    success = str(body.get("success_url") or body.get("successUrl") or "").strip() or BILLING_CHECKOUT_SUCCESS_URL
    cancel = str(body.get("cancel_url") or body.get("cancelUrl") or "").strip() or BILLING_CHECKOUT_CANCEL_URL
    if not _checkout_return_url_allowed(success) or not _checkout_return_url_allowed(cancel):
        raise ValueError("invalid_checkout_return_url")
    return success, cancel


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY)


def _pack_by_id(pack_id: str) -> dict[str, Any] | None:
    for pack in CREDIT_PACKS:
        if pack["id"] == pack_id:
            return pack
    return None


def stripe_object_to_dict(obj: Any) -> dict[str, Any]:
    """Normalize Stripe SDK objects for dict-style access in webhooks."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    to_dict = getattr(obj, "to_dict", None)
    if callable(to_dict):
        try:
            data = to_dict()
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def extract_checkout_payment_method(session: Any, stripe_api: Any) -> str:
    """Best-effort payment method label for ledger detail (card, google_pay, apple_pay, paypal)."""
    session_data = stripe_object_to_dict(session)
    payment_intent_id = session_data.get("payment_intent")
    if payment_intent_id:
        try:
            pi = stripe_api.PaymentIntent.retrieve(
                payment_intent_id,
                expand=["payment_method"],
            )
            pm = pi.get("payment_method") if isinstance(pi, dict) else getattr(pi, "payment_method", None)
            if pm:
                if isinstance(pm, str):
                    pm = stripe_api.PaymentMethod.retrieve(pm)
                pm_type = pm.get("type") if isinstance(pm, dict) else getattr(pm, "type", None)
                if pm_type == "paypal":
                    return "paypal"
                if pm_type == "card":
                    card = pm.get("card") if isinstance(pm, dict) else getattr(pm, "card", None)
                    wallet = None
                    if card:
                        wallet = card.get("wallet") if isinstance(card, dict) else getattr(card, "wallet", None)
                    if wallet:
                        wallet_type = wallet.get("type") if isinstance(wallet, dict) else getattr(wallet, "type", None)
                        if wallet_type in ("google_pay", "apple_pay"):
                            return str(wallet_type)
                    return "card"
                if pm_type:
                    return str(pm_type)
        except Exception:
            pass

    types = session_data.get("payment_method_types") or []
    if isinstance(types, list) and len(types) == 1:
        only = str(types[0])
        if only in ("card", "paypal"):
            return only
    return "card"


def process_checkout_session_completed(event: Any, stripe_api: Any) -> dict[str, Any]:
    """Apply credit for a checkout.session.completed Stripe event."""
    event_data = stripe_object_to_dict(event)
    session = stripe_object_to_dict((event_data.get("data") or {}).get("object"))
    metadata = session.get("metadata") or {}
    if not isinstance(metadata, dict):
        metadata = stripe_object_to_dict(metadata)
    email = (
        metadata.get("email")
        or session.get("customer_email")
        or session.get("client_reference_id")
        or ""
    )
    email = str(email).strip().lower()
    pack_id = str(metadata.get("pack_id") or "").strip()
    pack = _pack_by_id(pack_id) if pack_id else None
    if pack:
        amount_cents = int(pack["amount_cents"])
    else:
        amount_cents = int(metadata.get("amount_cents") or 0)
    # Never use session amount_total: localized card charges (e.g. AUD) are not USD credit.
    event_id = str(event_data.get("id") or "")
    if not email or amount_cents <= 0 or not event_id:
        logger.warning(
            "checkout.session.completed missing fields email=%r amount_cents=%r event_id=%r session_id=%r",
            email,
            amount_cents,
            event_id,
            session.get("id"),
        )
        return {"ok": False, "error": "missing_checkout_fields"}

    payment_method = extract_checkout_payment_method(session, stripe_api)
    result = grant_purchase(
        email,
        amount_cents,
        provider="stripe",
        provider_event_id=event_id,
        detail={
            "payment_method": payment_method,
            "checkout_session_id": session.get("id"),
            "pack_id": metadata.get("pack_id"),
            "charge_currency": session.get("currency"),
            "charge_amount_total": session.get("amount_total"),
        },
    )
    if result.get("duplicate"):
        logger.info("checkout.session.completed duplicate event_id=%s email=%s", event_id, email)
    elif result.get("ok"):
        logger.info(
            "checkout.session.completed credited email=%s amount_cents=%s event_id=%s",
            email,
            amount_cents,
            event_id,
        )
    else:
        logger.error(
            "checkout.session.completed grant failed email=%s amount_cents=%s event_id=%s result=%s",
            email,
            amount_cents,
            event_id,
            result,
        )
    return result


def register_stripe_billing_routes(
    app,
    *,
    get_bearer_token: Callable[[str | None], str | None],
    verify_google_access_token: Callable,
    cors_headers: Callable[[str | None], dict[str, str]],
    verified_email: Callable[[str | None], Any],
) -> None:
    @app.post("/billing/create-checkout-session")
    async def billing_create_checkout_session(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        if not billing_enabled():
            return JSONResponse(
                status_code=503,
                content={"error": "billing_disabled"},
                headers=cors_headers(origin),
            )
        if not stripe_configured():
            return JSONResponse(
                status_code=503,
                content={"error": "stripe_not_configured"},
                headers=cors_headers(origin),
            )
        email = await verified_email(authorization)
        try:
            body = await request.json()
        except Exception:
            body = {}
        pack_id = str((body or {}).get("pack_id") or (body or {}).get("packId") or "").strip()
        pack = _pack_by_id(pack_id)
        if not pack:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_pack"},
                headers=cors_headers(origin),
            )
        try:
            success_url, cancel_url = _resolve_checkout_return_urls(body if isinstance(body, dict) else {})
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_checkout_return_url"},
                headers=cors_headers(origin),
            )

        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        session_params: dict[str, Any] = {
            "mode": "payment",
            "customer_email": email,
            "client_reference_id": email,
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": "Tunebook resolver credit (" + pack["label"] + ")",
                            "description": "Prepaid credit for hosted resolver features",
                        },
                        "unit_amount": int(pack["amount_cents"]),
                    },
                    "quantity": 1,
                }
            ],
            "metadata": {
                "email": email,
                "pack_id": pack["id"],
                "amount_cents": str(pack["amount_cents"]),
            },
            "success_url": success_url,
            "cancel_url": cancel_url,
        }
        session_params = apply_paypal_cpm_to_checkout_params(session_params)
        session = stripe.checkout.Session.create(**session_params)
        return JSONResponse(
            {"sessionId": session.id, "url": session.url},
            headers=cors_headers(origin),
        )

    @app.post("/billing/webhook")
    async def billing_webhook(request: Request):
        if not billing_enabled() or not stripe_configured():
            return JSONResponse(status_code=503, content={"error": "billing_unavailable"})
        payload = await request.body()
        sig = request.headers.get("stripe-signature")
        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        try:
            if STRIPE_WEBHOOK_SECRET:
                event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
            else:
                event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
        except Exception as exc:
            logger.warning("billing webhook invalid payload: %s", exc)
            return JSONResponse(status_code=400, content={"error": "invalid_payload", "detail": str(exc)[:200]})

        try:
            event_type = str(stripe_object_to_dict(event).get("type") or "")
            if event_type == "checkout.session.completed":
                result = process_checkout_session_completed(event, stripe)
                if not result.get("ok") and not result.get("duplicate"):
                    return JSONResponse(
                        status_code=500,
                        content={"error": result.get("error") or "grant_failed"},
                    )
            return JSONResponse({"received": True})
        except Exception as exc:
            logger.exception("billing webhook handler failed")
            return JSONResponse(
                status_code=500,
                content={"error": "webhook_failed", "detail": str(exc)[:200]},
            )
