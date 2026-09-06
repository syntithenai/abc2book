"""AI Art gallery email digest subscribe/unsubscribe API (peppertrees resolver)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

from fastapi import Body, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from ai_art_subscribe_store import (
    FREQUENCIES,
    delete_subscription,
    ensure_db,
    get_subscription,
    upsert_subscription,
)

AuthUserFn = Callable[[Optional[str]], Awaitable[dict[str, Any]]]
CorsFn = Callable[[Optional[str]], dict[str, str]]
VerifyTokenFn = Callable[[str], Awaitable[dict[str, Any] | None]]
GetBearerFn = Callable[[Optional[str]], Optional[str]]


def register_ai_art_subscribe_routes(
    app,
    *,
    get_bearer_token: GetBearerFn,
    verify_google_access_token: VerifyTokenFn,
    cors_headers: CorsFn,
) -> None:
    """Public Google-login subscribe API — any verified Google email (not resolver allowlist)."""

    ensure_db()

    async def _require_google_email(authorization: str | None) -> dict[str, Any]:
        token = get_bearer_token(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
        verified = await verify_google_access_token(token)
        if not verified:
            raise HTTPException(status_code=401, detail="Invalid or expired Google token")
        email = (verified.get("email") or "").strip().lower()
        if not email:
            raise HTTPException(status_code=401, detail="Missing email on token")
        # Prefer profile fields from Google userinfo when present.
        return {
            "email": email,
            "name": (verified.get("name") or "").strip(),
            "picture": (verified.get("picture") or verified.get("photoUrl") or "").strip(),
        }

    @app.options("/ai-art/subscribe")
    @app.options("/ai-art/health")
    async def ai_art_options(request: Request):
        return JSONResponse({}, headers=cors_headers(request.headers.get("origin")))

    @app.get("/ai-art/health")
    async def ai_art_health(request: Request):
        """Probe used by the static gallery to enable/disable subscribe UI."""
        return JSONResponse(
            {
                "ok": True,
                "service": "ai-art-subscribe",
                "frequencies": sorted(FREQUENCIES),
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.get("/ai-art/subscribe")
    async def ai_art_get_subscribe(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        user = await _require_google_email(authorization)
        sub = get_subscription(user["email"])
        return JSONResponse(
            {
                "email": user["email"],
                "subscribed": bool(sub),
                "frequency": (sub or {}).get("frequency"),
                "subscription": sub,
            },
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.post("/ai-art/subscribe")
    @app.put("/ai-art/subscribe")
    async def ai_art_set_subscribe(
        request: Request,
        authorization: str | None = Header(default=None),
        body: dict[str, Any] = Body(default_factory=dict),
    ):
        user = await _require_google_email(authorization)
        frequency = str((body or {}).get("frequency") or "").strip().lower()
        if frequency not in FREQUENCIES:
            raise HTTPException(
                status_code=400,
                detail=f"frequency must be one of: {', '.join(sorted(FREQUENCIES))}",
            )
        sub = upsert_subscription(
            email=user["email"],
            frequency=frequency,
            name=user.get("name") or "",
            picture=user.get("picture") or "",
        )
        return JSONResponse(
            {"subscribed": True, "frequency": sub["frequency"], "subscription": sub},
            headers=cors_headers(request.headers.get("origin")),
        )

    @app.delete("/ai-art/subscribe")
    async def ai_art_unsubscribe(
        request: Request,
        authorization: str | None = Header(default=None),
    ):
        user = await _require_google_email(authorization)
        deleted = delete_subscription(user["email"])
        return JSONResponse(
            {"subscribed": False, "cancelled": deleted, "email": user["email"]},
            headers=cors_headers(request.headers.get("origin")),
        )
