"""Balance/history API and billing route registration."""

from __future__ import annotations

from typing import Callable

from fastapi import Header, HTTPException, Request
from fastapi.responses import JSONResponse

from billing import billing_enabled, billing_health_fields, get_balance_cents, list_ledger
from billing_payment_methods import payment_methods_payload
from billing_paypal import paypal_cpm_status
from billing_rates import CREDIT_PACKS
from billing_stripe import register_stripe_billing_routes


def register_billing_routes(
    app,
    *,
    get_bearer_token: Callable[[str | None], str | None],
    verify_google_access_token: Callable,
    cors_headers: Callable[[str | None], dict[str, str]],
    get_free_allowlist: Callable[[], set[str]],
    get_embedded_allowlist: Callable[[], set[str]],
) -> None:
    async def _verified_email(authorization: str | None) -> str:
        token = get_bearer_token(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
        verified = await verify_google_access_token(token)
        if not verified:
            raise HTTPException(status_code=401, detail="Invalid or expired Google token")
        email = (verified.get("email") or "").strip().lower()
        if not email:
            raise HTTPException(status_code=401, detail="Missing email on token")
        return email

    @app.get("/billing/balance")
    async def billing_balance(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        if not billing_enabled():
            return JSONResponse(
                {"billingEnabled": False},
                headers=cors_headers(origin),
            )
        email = await _verified_email(authorization)
        free = get_free_allowlist()
        embedded = get_embedded_allowlist()
        fields = billing_health_fields(email, free_allowlist=free, embedded_allowlist=embedded)
        return JSONResponse(
            {
                "billingEnabled": True,
                "email": email,
                "balanceCents": get_balance_cents(email),
                "creditUnlimited": fields.get("creditUnlimited"),
                "packs": CREDIT_PACKS,
                "paymentMethods": payment_methods_payload(),
            },
            headers=cors_headers(origin),
        )

    @app.get("/billing/history")
    async def billing_history(
        request: Request,
        authorization: str | None = Header(default=None),
        limit: int = 50,
    ):
        origin = request.headers.get("origin")
        if not billing_enabled():
            return JSONResponse({"entries": []}, headers=cors_headers(origin))
        email = await _verified_email(authorization)
        entries = list_ledger(email, limit=limit)
        return JSONResponse({"entries": entries}, headers=cors_headers(origin))

    @app.get("/billing/payment-methods")
    async def billing_payment_methods(request: Request):
        origin = request.headers.get("origin")
        payload = payment_methods_payload()
        payload["paypalCpm"] = paypal_cpm_status()
        return JSONResponse(payload, headers=cors_headers(origin))

    register_stripe_billing_routes(
        app,
        get_bearer_token=get_bearer_token,
        verify_google_access_token=verify_google_access_token,
        cors_headers=cors_headers,
        verified_email=_verified_email,
    )
