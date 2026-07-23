"""Shared FastAPI routes for Google OAuth BFF."""

from __future__ import annotations

from typing import Any, Callable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse


def _json_error(
    status: int,
    message: str,
    origin: str | None,
    cors_headers: Callable[[str | None], dict[str, str]],
    hint: str | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {"error": message}
    if hint:
        body["hint"] = hint
    return JSONResponse(status_code=status, content=body, headers=cors_headers(origin))


def register_oauth_bff_routes(
    app,
    *,
    get_allowed_emails: Callable[[], set[str]],
    cors_headers: Callable[[str | None], dict[str, str]],
) -> None:
    """Mount /auth/google/* on a FastAPI app."""

    @app.post("/auth/google/exchange")
    async def auth_google_exchange(request: Request):
        origin = request.headers.get("origin")
        try:
            from oauth_bff import exchange_authorization_code
        except Exception:
            return _json_error(503, "oauth_bff_unavailable", origin, cors_headers)

        try:
            body = await request.json()
        except Exception:
            return _json_error(400, "Invalid JSON body", origin, cors_headers)

        try:
            result = await exchange_authorization_code(
                code=(body or {}).get("code") or "",
                code_verifier=(body or {}).get("code_verifier") or "",
                redirect_uri=(body or {}).get("redirect_uri") or "",
                allowed_emails=get_allowed_emails(),
            )
        except Exception as exc:
            return _json_error(
                503,
                "session_store_failed",
                origin,
                cors_headers,
                hint=str(exc)[:500],
            )
        if result.get("error"):
            status = int(result.get("status") or 400)
            err_body: dict[str, Any] = {"error": result["error"]}
            if result.get("hint"):
                err_body["hint"] = result["hint"]
            if result.get("detail"):
                err_body["detail"] = result["detail"]
            return JSONResponse(status_code=status, content=err_body, headers=cors_headers(origin))
        return JSONResponse(content=result, headers=cors_headers(origin))

    @app.post("/auth/google/refresh")
    async def auth_google_refresh(request: Request):
        origin = request.headers.get("origin")
        from oauth_bff import refresh_access_token, session_id_from_headers

        session_id = session_id_from_headers(request.headers)
        if not session_id:
            return JSONResponse(
                status_code=401,
                content={"error": "missing_session"},
                headers=cors_headers(origin),
            )
        try:
            result = await refresh_access_token(session_id)
        except Exception as exc:
            return JSONResponse(
                status_code=503,
                content={"error": "session_store_failed", "hint": str(exc)[:500]},
                headers=cors_headers(origin),
            )
        if result.get("error"):
            status = int(result.get("status") or 401)
            body: dict[str, Any] = {
                "error": result["error"],
                "detail": result.get("detail"),
            }
            if result.get("retry_after") is not None:
                body["retry_after"] = result["retry_after"]
            return JSONResponse(
                status_code=status,
                content=body,
                headers=cors_headers(origin),
            )
        return JSONResponse(content=result, headers=cors_headers(origin))

    @app.get("/auth/google/session")
    async def auth_google_session(request: Request):
        origin = request.headers.get("origin")
        from oauth_bff import load_session_with_token, session_id_from_headers

        session_id = session_id_from_headers(request.headers)
        if not session_id:
            return JSONResponse(
                status_code=401,
                content={"error": "missing_session"},
                headers=cors_headers(origin),
            )
        try:
            result = await load_session_with_token(session_id)
        except Exception as exc:
            return JSONResponse(
                status_code=503,
                content={"error": "session_store_failed", "hint": str(exc)[:500]},
                headers=cors_headers(origin),
            )
        if result.get("error"):
            status = int(result.get("status") or 401)
            return JSONResponse(
                status_code=status,
                content={"error": result["error"], "detail": result.get("detail")},
                headers=cors_headers(origin),
            )
        return JSONResponse(content=result, headers=cors_headers(origin))

    @app.post("/auth/google/logout")
    async def auth_google_logout(request: Request):
        origin = request.headers.get("origin")
        from oauth_bff import logout_session, session_id_from_headers

        session_id = session_id_from_headers(request.headers)
        result = await logout_session(session_id)
        return JSONResponse(content=result, headers=cors_headers(origin))
