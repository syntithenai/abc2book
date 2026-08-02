"""Balance/history API and billing route registration."""

from __future__ import annotations

from typing import Callable
from urllib.parse import unquote

from fastapi import Header, HTTPException, Request
from fastapi.responses import JSONResponse

from allowlists import email_allowed
from billing import (
    admin_rename_account,
    admin_set_balance,
    billing_enabled,
    billing_health_fields,
    get_account,
    get_available_balance_millicents,
    get_balance_cents,
    get_balance_millicents,
    is_unlimited_user,
    list_accounts,
    list_ledger,
)
from billing_estimates import affordance_payload, catalog_for_api, estimate_operation_millicents
from billing_rates import CREDIT_PACKS, cents_to_millicents
from billing_payment_methods import payment_methods_payload
from billing_paypal import paypal_cpm_status
from billing_stripe import register_stripe_billing_routes


def register_billing_routes(
    app,
    *,
    get_bearer_token: Callable[[str | None], str | None],
    verify_google_access_token: Callable,
    cors_headers: Callable[[str | None], dict[str, str]],
    get_free_allowlist: Callable[[], set[str]],
    get_embedded_allowlist: Callable[[], set[str]],
    get_admin_allowlist: Callable[[], set[str]] | None = None,
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

    async def _require_admin(authorization: str | None) -> str:
        if not billing_enabled():
            raise HTTPException(status_code=403, detail="Billing disabled")
        email = await _verified_email(authorization)
        allowlist = get_admin_allowlist() if get_admin_allowlist else set()
        if not email_allowed(allowlist, email):
            raise HTTPException(status_code=403, detail="Admin access required")
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

    @app.get("/billing/estimates")
    async def billing_estimates(request: Request):
        origin = request.headers.get("origin")
        if not billing_enabled():
            return JSONResponse({"operations": []}, headers=cors_headers(origin))
        return JSONResponse(
            {"billingEnabled": True, "operations": catalog_for_api()},
            headers=cors_headers(origin),
        )

    @app.post("/billing/can-afford")
    async def billing_can_afford(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        if not billing_enabled():
            return JSONResponse({"billingEnabled": False, "results": []}, headers=cors_headers(origin))
        email = await _verified_email(authorization)
        free = get_free_allowlist()
        embedded = get_embedded_allowlist()
        unlimited = is_unlimited_user(email, free_allowlist=free, embedded_allowlist=embedded)
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}
        operations = body.get("operations") or []
        model = str(body.get("model") or "")
        balance = get_balance_millicents(email)
        available = get_available_balance_millicents(email)
        results = []
        total_estimate = 0
        for item in operations:
            if not isinstance(item, dict):
                continue
            op_id = str(item.get("id") or item.get("operation") or "").strip()
            if not op_id:
                continue
            params = item.get("params") if isinstance(item.get("params"), dict) else {}
            op_model = str(item.get("model") or model or "")
            if unlimited:
                est = estimate_operation_millicents(op_id, params, model=op_model)
                from billing_rates import millicents_to_cents as _mc

                results.append(
                    {
                        "id": op_id,
                        "affordable": True,
                        "estimateCents": _mc(est),
                        "estimateMillicents": est,
                        "creditUnlimited": True,
                    }
                )
                continue
            payload = affordance_payload(
                email,
                op_id,
                params,
                model=op_model,
                available_millicents=available,
                balance_millicents=balance,
            )
            results.append(payload)
            total_estimate += int(payload.get("estimateMillicents") or 0)

        total_shortfall = max(0, total_estimate - available)
        from billing_rates import millicents_to_cents

        return JSONResponse(
            {
                "billingEnabled": True,
                "creditUnlimited": unlimited,
                "results": results,
                "totalEstimateCents": millicents_to_cents(total_estimate),
                "availableCents": millicents_to_cents(available),
                "balanceCents": get_balance_cents(email),
                "totalShortfallCents": millicents_to_cents(total_shortfall),
                "affordable": unlimited or total_shortfall == 0,
            },
            headers=cors_headers(origin),
        )

    @app.get("/billing/admin/accounts")
    async def billing_admin_accounts(
        request: Request,
        authorization: str | None = Header(default=None),
        limit: int = 100,
        offset: int = 0,
        q: str = "",
    ):
        origin = request.headers.get("origin")
        await _require_admin(authorization)
        result = list_accounts(limit=limit, offset=offset, query=q)
        return JSONResponse(result, headers=cors_headers(origin))

    @app.get("/billing/admin/accounts/{email}/ledger")
    async def billing_admin_account_ledger(
        request: Request,
        email: str,
        authorization: str | None = Header(default=None),
        limit: int = 200,
    ):
        origin = request.headers.get("origin")
        await _require_admin(authorization)
        target_email = unquote(email or "").strip().lower()
        if not target_email:
            raise HTTPException(status_code=400, detail="Missing email")
        entries = list_ledger(target_email, limit=limit)
        return JSONResponse({"entries": entries}, headers=cors_headers(origin))

    @app.patch("/billing/admin/accounts/{email}")
    async def billing_admin_patch_account(
        request: Request,
        email: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        admin_email = await _require_admin(authorization)
        target_email = unquote(email or "").strip().lower()
        if not target_email:
            raise HTTPException(status_code=400, detail="Missing email")
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}

        current_email = target_email
        new_email = (payload.get("newEmail") or payload.get("new_email") or "").strip().lower()
        if new_email and new_email != current_email:
            rename_result = admin_rename_account(
                current_email,
                new_email,
                admin_email=admin_email,
            )
            if not rename_result.get("ok"):
                error = rename_result.get("error") or "rename_failed"
                status = 404 if error == "account_not_found" else 409 if error == "target_exists" else 400
                raise HTTPException(status_code=status, detail=error)
            current_email = new_email

        balance_cents = payload.get("balanceCents")
        if balance_cents is None:
            balance_cents = payload.get("balance_cents")
        if balance_cents is not None:
            try:
                target_millicents = cents_to_millicents(float(balance_cents))
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="invalid_balance")
            balance_result = admin_set_balance(
                current_email,
                target_millicents,
                admin_email=admin_email,
                reason=str(payload.get("reason") or ""),
            )
            if not balance_result.get("ok"):
                error = balance_result.get("error") or "balance_update_failed"
                raise HTTPException(status_code=400, detail=error)

        account = get_account(current_email)
        if not account:
            raise HTTPException(status_code=404, detail="account_not_found")
        from billing import account_to_api

        return JSONResponse({"account": account_to_api(account)}, headers=cors_headers(origin))

    register_stripe_billing_routes(
        app,
        get_bearer_token=get_bearer_token,
        verify_google_access_token=verify_google_access_token,
        cors_headers=cors_headers,
        verified_email=_verified_email,
    )
