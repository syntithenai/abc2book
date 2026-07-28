"""HTTP routes for Snapcast playback and stream plugin API."""

from __future__ import annotations

import os
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from fastapi import Body, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from cast_transcode_session import ffmpeg_available, parse_transcode_settings
from snapcast_config import snapcast_enabled, snapcast_public_url, snapcast_stream_name
from snapcast_playback import get_snapcast_manager, probe_snapserver_http, write_temp_audio_file

ResolveAudioFn = Callable[..., Awaitable[tuple[bytes, str, str | None]]]
ResolveProxyFn = Callable[[Request], str | None]
AuthFn = Callable[[str | None], Awaitable[None]]
CorsFn = Callable[[str | None], dict[str, str]]


def snapcast_feature_enabled() -> bool:
    return snapcast_enabled() and ffmpeg_available()


async def build_snapcast_health_payload(
    request: Request,
    *,
    server_host: str,
) -> dict[str, Any]:
    if not snapcast_enabled():
        return {
            "enabled": False,
            "reachable": False,
            "controlUrl": None,
            "streamName": snapcast_stream_name(),
        }
    public = snapcast_public_url()
    if public:
        control_url = public.rstrip("/")
    else:
        host = request.headers.get("host", "").split(",")[0].strip()
        scheme = request.url.scheme if request.url.scheme in ("http", "https") else "http"
        if host:
            control_url = f"{scheme}://{host.split(':')[0]}:1780"
        else:
            control_url = f"http://{server_host}:1780"
    reachable = await probe_snapserver_http(server_host, 1780)
    manager = get_snapcast_manager()
    payload = {
        "enabled": True,
        "reachable": reachable,
        "controlUrl": control_url,
        "streamName": snapcast_stream_name(),
        "tcpClients": manager.tcp_client_count(),
    }
    payload.update(manager.health_fields())
    return payload


def register_snapcast_routes(
    app,
    *,
    maybe_require_auth: AuthFn,
    cors_headers: CorsFn,
    resolve_linked_media_audio_bytes: ResolveAudioFn,
    resolve_ytdlp_proxy_from_request: ResolveProxyFn,
    snapcast_server_host: str,
) -> None:
    @app.get("/snapcast-playback/plugin")
    async def snapcast_plugin_get(request: Request):
        origin = request.headers.get("origin")
        if not snapcast_feature_enabled():
            return JSONResponse(
                {"canPlay": False, "canPause": False, "canSeek": False, "isPlaying": False},
                headers=cors_headers(origin),
            )
        return JSONResponse(get_snapcast_manager().plugin_state(), headers=cors_headers(origin))

    @app.post("/snapcast-playback/plugin")
    async def snapcast_plugin_post(
        request: Request,
        body: dict = Body(default_factory=dict),
    ):
        origin = request.headers.get("origin")
        if not snapcast_feature_enabled():
            return JSONResponse({"ok": False}, headers=cors_headers(origin))
        action = str(body.get("action") or "").strip().lower()
        manager = get_snapcast_manager()
        session = manager.get_active_session()
        if not session:
            return JSONResponse({"ok": False}, headers=cors_headers(origin))
        if action == "play":
            manager.set_playing(session.session_id, True)
        elif action == "pause":
            manager.set_playing(session.session_id, False)
        elif action == "seek":
            seconds = float(body.get("seconds") or 0)
            manager.seek_session(session.session_id, seconds)
        return JSONResponse({"ok": True}, headers=cors_headers(origin))

    @app.post("/snapcast-playback/session")
    async def snapcast_create_session(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            if not snapcast_feature_enabled():
                raise HTTPException(status_code=503, detail="Snapcast playback is not available")
            source = str(body.get("source") or body.get("sourceUrl") or "").strip()
            if not source:
                raise HTTPException(status_code=400, detail="Missing source")
            source_type = str(body.get("sourceType") or "").strip().lower()
            proxy = resolve_ytdlp_proxy_from_request(request)
            audio_bytes, filename, _content_type = await resolve_linked_media_audio_bytes(
                source,
                source_type,
                proxy=proxy,
            )
            suffix = os.path.splitext(filename or "")[1] or ".audio"
            input_path = write_temp_audio_file(audio_bytes, suffix=suffix)
            settings = parse_transcode_settings(body)
            duration = float(body.get("duration") or 0)
            if duration <= 0:
                duration = max(0.0, float(body.get("durationSeconds") or 0))
            session = get_snapcast_manager().create_session(
                source=source,
                input_path=input_path,
                duration=duration,
                settings=settings,
                group_id=body.get("groupId"),
                title=body.get("title"),
                artist=body.get("artist"),
                input_is_temp=True,
            )
            return JSONResponse(
                {
                    "sessionId": session.session_id,
                    "streamId": session.stream_name,
                    "status": session.to_status(),
                },
                headers=cors_headers(origin),
            )
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.get("/snapcast-playback/session/{session_id}/status")
    async def snapcast_session_status(
        request: Request,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            session = get_snapcast_manager().get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return JSONResponse(session.to_status(), headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.post("/snapcast-playback/session/{session_id}/seek")
    async def snapcast_session_seek(
        request: Request,
        session_id: str,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            seconds = float(body.get("seconds") or 0)
            session = get_snapcast_manager().seek_session(session_id, seconds)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return JSONResponse(session.to_status(), headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.delete("/snapcast-playback/session/{session_id}")
    async def snapcast_delete_session(
        request: Request,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            deleted = get_snapcast_manager().delete_session(session_id)
            if not deleted:
                raise HTTPException(status_code=404, detail="Session not found")
            return JSONResponse({"ok": True}, headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    async def _snapcast_health(request: Request) -> dict[str, Any]:
        return await build_snapcast_health_payload(
            request,
            server_host=snapcast_server_host,
        )

    app.state.snapcast_health_builder = _snapcast_health
