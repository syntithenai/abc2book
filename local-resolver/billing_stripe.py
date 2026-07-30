"""Stripe Checkout session creation and webhook handling."""

from __future__ import annotations

import json
import os
from typing import Any, Callable

from fastapi import Header, Request
from fastapi.responses import JSONResponse

from billing import billing_enabled, grant_purchase
from billing_paypal import apply_paypal_cpm_to_checkout_params
from billing_rates import CREDIT_PACKS

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


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY)


def _pack_by_id(pack_id: str) -> dict[str, Any] | None:
    for pack in CREDIT_PACKS:
        if pack["id"] == pack_id:
            return pack
    return None


def extract_checkout_payment_method(session: dict[str, Any], stripe_api: Any) -> str:
    """Best-effort payment method label for ledger detail (card, google_pay, apple_pay, paypal)."""
    payment_intent_id = session.get("payment_intent")
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

    types = session.get("payment_method_types") or []
    if isinstance(types, list) and len(types) == 1:
        only = str(types[0])
        if only in ("card", "paypal"):
            return only
    return "card"


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

        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        session_params: dict[str, Any] = {
            "mode": "payment",
            "customer_email": email,
            "client_reference_id": email,
            "automatic_payment_methods": {"enabled": True},
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
            "success_url": BILLING_CHECKOUT_SUCCESS_URL,
            "cancel_url": BILLING_CHECKOUT_CANCEL_URL,
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
            return JSONResponse(status_code=400, content={"error": "invalid_payload", "detail": str(exc)[:200]})

        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            metadata = session.get("metadata") or {}
            email = (metadata.get("email") or session.get("customer_email") or "").strip().lower()
            amount_cents = int(metadata.get("amount_cents") or session.get("amount_total") or 0)
            event_id = str(event.get("id") or "")
            if email and amount_cents > 0 and event_id:
                payment_method = extract_checkout_payment_method(session, stripe)
                grant_purchase(
                    email,
                    amount_cents,
                    provider="stripe",
                    provider_event_id=event_id,
                    detail={
                        "payment_method": payment_method,
                        "checkout_session_id": session.get("id"),
                        "pack_id": metadata.get("pack_id"),
                    },
                )
        return JSONResponse({"received": True})
