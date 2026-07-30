"""HTTP routes for Snapcast playback and stream plugin API."""

from __future__ import annotations

import logging
import os
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from fastapi import Body, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from cast_transcode_session import ffmpeg_available, parse_transcode_settings
from cast_playback import CastQueueItem, parse_queue_items
from remote_playback_resolve import resolve_session_audio_bytes, resolve_session_input_path
from request_public_url import request_public_base, request_public_host, request_public_scheme
from snapcast_config import (
    snapcast_enabled,
    snapcast_public_url,
    snapcast_stream_name,
    snapclient_enabled,
    snapclient_hostname,
    snapclient_soundcard,
)
from snapcast_playback import get_snapcast_manager, probe_snapserver_http, write_temp_audio_file

logger = logging.getLogger(__name__)

ResolveAudioFn = Callable[..., Awaitable[tuple[bytes, str, str | None]]]
ResolveProxyFn = Callable[[Request], str | None]
AuthFn = Callable[[str | None], Awaitable[None]]
CorsFn = Callable[[str | None], dict[str, str]]


def snapcast_feature_enabled() -> bool:
    return snapcast_enabled() and ffmpeg_available()


async def advance_snapcast_session_queue(
    session_id: str,
    *,
    manager,
    request: Request,
    resolve_linked_media_audio_bytes: ResolveAudioFn,
    resolve_ytdlp_proxy_from_request: ResolveProxyFn,
) -> Any:
    session = manager.get_session(session_id)
    if not session:
        return None
    next_index = session.queue_index + 1
    if next_index >= len(session.queue):
        return None
    next_item = session.queue[next_index]
    proxy = resolve_ytdlp_proxy_from_request(request)
    input_path, _filename, input_is_temp = await resolve_session_input_path(
        source=next_item.source,
        source_type=next_item.source_type,
        body={},
        resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
        proxy=proxy,
    )
    return manager.advance_queue(
        session_id,
        input_path=input_path,
        source=next_item.source,
        duration=next_item.duration,
        title=next_item.title,
        artist=next_item.artist,
        input_is_temp=input_is_temp,
    )


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
            "localClient": {
                "enabled": False,
                "hostname": None,
                "soundcard": None,
            },
        }
    public = snapcast_public_url()
    if public:
        control_url = public.rstrip("/")
    else:
        public_base = request_public_base(request)
        if public_base and request_public_scheme(request) == "https":
            control_url = f"{public_base.rstrip('/')}/snapcast"
        else:
            host = request_public_host(request) or server_host
            control_url = f"http://{host}:1780"
    lan_host = request_public_host(request) or server_host
    control_url_lan = f"http://{lan_host}:1780"
    reachable = await probe_snapserver_http(server_host, 1780)
    manager = get_snapcast_manager()
    tcp_clients = manager.tcp_client_count()
    payload = {
        "enabled": True,
        "reachable": reachable,
        "controlUrl": control_url,
        "controlUrlLan": control_url_lan,
        "pcmLinked": tcp_clients > 0,
        "streamName": snapcast_stream_name(),
        "tcpClients": tcp_clients,
        "localClient": {
            "enabled": snapclient_enabled(),
            "hostname": snapclient_hostname(),
            "soundcard": snapclient_soundcard(),
        },
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
        elif action == "next":
            advanced = await advance_snapcast_session_queue(
                session.session_id,
                manager=manager,
                request=request,
                resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                resolve_ytdlp_proxy_from_request=resolve_ytdlp_proxy_from_request,
            )
            if advanced:
                return JSONResponse(
                    {"ok": True, "status": advanced.to_status()},
                    headers=cors_headers(origin),
                )
            return JSONResponse(
                {"ok": False, "error": "No next track"},
                headers=cors_headers(origin),
            )
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
            input_path, _filename, input_is_temp = await resolve_session_input_path(
                source=source,
                source_type=source_type,
                body=body,
                resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                proxy=proxy,
            )
            settings = parse_transcode_settings(body)
            duration = float(body.get("duration") or 0)
            if duration <= 0:
                duration = max(0.0, float(body.get("durationSeconds") or 0))
            queue = parse_queue_items(body)
            if not queue:
                queue = [
                    CastQueueItem(
                        source=source,
                        source_type=source_type,
                        title=body.get("title"),
                        artist=body.get("artist"),
                        duration=duration,
                    )
                ]
            session = get_snapcast_manager().create_session(
                source=source,
                input_path=input_path,
                duration=duration,
                settings=settings,
                group_id=body.get("groupId"),
                title=body.get("title"),
                artist=body.get("artist"),
                input_is_temp=input_is_temp,
                queue=queue,
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
        except Exception as exc:
            logger.exception("Snapcast session create failed")
            return JSONResponse(
                {"error": str(exc) or "Snapcast session failed"},
                status_code=500,
                headers=cors_headers(origin),
            )

    @app.post("/snapcast-playback/session/{session_id}/next")
    async def snapcast_session_next(
        request: Request,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            manager = get_snapcast_manager()
            session = manager.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            advanced = await advance_snapcast_session_queue(
                session_id,
                manager=manager,
                request=request,
                resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                resolve_ytdlp_proxy_from_request=resolve_ytdlp_proxy_from_request,
            )
            if not advanced:
                raise HTTPException(status_code=400, detail="Could not advance queue")
            return JSONResponse(
                {"sessionId": session_id, "status": advanced.to_status()},
                headers=cors_headers(origin),
            )
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.post("/snapcast-playback/session/{session_id}/prefetch")
    async def snapcast_session_prefetch(
        request: Request,
        session_id: str,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            if not snapcast_feature_enabled():
                raise HTTPException(status_code=503, detail="Snapcast playback is not available")
            manager = get_snapcast_manager()
            session = manager.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            count = max(1, min(3, int(body.get("count") or 2)))
            proxy = resolve_ytdlp_proxy_from_request(request)
            prefetched = 0
            start_index = session.queue_index + 1
            end_index = min(len(session.queue), start_index + count)
            for index in range(start_index, end_index):
                item = session.queue[index]
                await resolve_session_input_path(
                    source=item.source,
                    source_type=item.source_type,
                    body={},
                    resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                    proxy=proxy,
                )
                prefetched += 1
            return JSONResponse({"ok": True, "prefetched": prefetched}, headers=cors_headers(origin))
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
