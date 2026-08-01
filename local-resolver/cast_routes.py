"""HTTP routes for Chromecast HLS playback sessions."""

from __future__ import annotations

import os
from typing import Any, Awaitable, Callable

from fastapi import Body, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from cast_config import cast_public_url
from request_public_url import request_public_base
from cast_playback import (
    CastQueueItem,
    get_cast_manager,
    parse_queue_items,
)
from cast_transcode_session import ffmpeg_available, parse_transcode_settings
from remote_playback_resolve import resolve_queue_input_paths, resolve_session_input_path
ResolveAudioFn = Callable[..., Awaitable[tuple[bytes, str, str | None]]]
ResolveProxyFn = Callable[[Request], str | None]
AuthFn = Callable[[str | None], Awaitable[None]]
CorsFn = Callable[[str | None], dict[str, str]]


def cast_feature_enabled() -> bool:
    return ffmpeg_available()


def build_cast_public_base(request: Request) -> str:
    public = cast_public_url()
    if public:
        return public.rstrip("/")
    return request_public_base(request).rstrip("/")


async def build_cast_health_payload(request: Request) -> dict[str, Any]:
    if not cast_feature_enabled():
        return {
            "enabled": False,
            "publicBase": None,
        }
    payload = {
        "enabled": True,
        "publicBase": build_cast_public_base(request) or None,
    }
    payload.update(get_cast_manager().health_fields())
    return payload


def register_cast_routes(
    app,
    *,
    maybe_require_auth: AuthFn,
    cors_headers: CorsFn,
    resolve_linked_media_audio_bytes: ResolveAudioFn,
    resolve_ytdlp_proxy_from_request: ResolveProxyFn,
) -> None:
    @app.post("/cast-playback/session")
    async def cast_create_session(
        request: Request,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            if not cast_feature_enabled():
                raise HTTPException(status_code=503, detail="Cast playback is not available")
            source = str(body.get("source") or body.get("sourceUrl") or "").strip()
            if not source:
                raise HTTPException(status_code=400, detail="Missing source")
            source_type = str(body.get("sourceType") or "").strip().lower()
            proxy = resolve_ytdlp_proxy_from_request(request)
            settings = parse_transcode_settings(body)
            duration = float(body.get("duration") or body.get("durationSeconds") or 0)
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
            input_paths: list[str] = []
            input_path = ""
            input_is_temp = True
            concat_set = bool(body.get("concatSet"))
            if concat_set and len(queue) > 1:
                input_paths, queue_duration = await resolve_queue_input_paths(
                    queue=queue,
                    body=body,
                    resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                    proxy=proxy,
                    first_item_body=body,
                )
                if queue_duration > 0:
                    duration = queue_duration
                input_path = input_paths[0] if input_paths else ""
            else:
                input_path, _filename, input_is_temp = await resolve_session_input_path(
                    source=source,
                    source_type=source_type,
                    body=body,
                    resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                    proxy=proxy,
                )
            session = get_cast_manager().create_session(
                source=source,
                input_path=input_path,
                duration=duration,
                settings=settings,
                title=body.get("title"),
                artist=body.get("artist"),
                input_is_temp=input_is_temp if len(queue) <= 1 else True,
                queue=queue,
                input_paths=input_paths,
            )
            playlist_url = f"/cast-playback/session/{session.session_id}/playlist.m3u8"
            return JSONResponse(
                {
                    "sessionId": session.session_id,
                    "playlistUrl": playlist_url,
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

    @app.get("/cast-playback/session/{session_id}/playlist.m3u8")
    async def cast_playlist(request: Request, session_id: str):
        origin = request.headers.get("origin")
        session = get_cast_manager().get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session.touch_activity()
        playlist = session.playlist_path()
        if not os.path.isfile(playlist):
            raise HTTPException(status_code=404, detail="Playlist not ready")
        return FileResponse(playlist, media_type="application/vnd.apple.mpegurl", headers=cors_headers(origin))

    @app.get("/cast-playback/session/{session_id}/{segment_name}")
    async def cast_segment(request: Request, session_id: str, segment_name: str):
        origin = request.headers.get("origin")
        if not segment_name.endswith(".ts"):
            raise HTTPException(status_code=404, detail="Not found")
        session = get_cast_manager().get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session.touch_activity()
        segment_path = os.path.join(session.output_dir, segment_name)
        if not os.path.isfile(segment_path):
            raise HTTPException(status_code=404, detail="Segment not found")
        return FileResponse(segment_path, media_type="video/mp2t", headers=cors_headers(origin))

    @app.get("/cast-playback/session/{session_id}/status")
    async def cast_session_status(
        request: Request,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            session = get_cast_manager().get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return JSONResponse(session.to_status(), headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.post("/cast-playback/session/{session_id}/seek")
    async def cast_session_seek(
        request: Request,
        session_id: str,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            seconds = float(body.get("seconds") or 0)
            session = get_cast_manager().seek_session(session_id, seconds)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            return JSONResponse(session.to_status(), headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.post("/cast-playback/session/{session_id}/heartbeat")
    async def cast_session_heartbeat(
        request: Request,
        session_id: str,
        body: dict = Body(default_factory=dict),
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            session = get_cast_manager().get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            playhead = body.get("playheadSeconds")
            session.touch_activity(
                float(playhead) if playhead is not None else None
            )
            return JSONResponse(session.to_status(), headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.delete("/cast-playback/session/{session_id}")
    async def cast_delete_session(
        request: Request,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            deleted = get_cast_manager().delete_session(session_id)
            if not deleted:
                raise HTTPException(status_code=404, detail="Session not found")
            return JSONResponse({"ok": True}, headers=cors_headers(origin))
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.post("/cast-playback/session/{session_id}/next")
    async def cast_session_next(
        request: Request,
        session_id: str,
        authorization: str | None = Header(default=None),
    ):
        origin = request.headers.get("origin")
        try:
            await maybe_require_auth(authorization)
            manager = get_cast_manager()
            session = manager.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
            next_index = session.queue_index + 1
            if next_index >= len(session.queue):
                raise HTTPException(status_code=400, detail="No next queue item")
            next_item = session.queue[next_index]
            proxy = resolve_ytdlp_proxy_from_request(request)
            input_path, _filename, input_is_temp = await resolve_session_input_path(
                source=next_item.source,
                source_type=next_item.source_type,
                body={},
                resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
                proxy=proxy,
            )
            advanced = manager.advance_queue(
                session_id,
                input_path=input_path,
                source=next_item.source,
                duration=next_item.duration,
                title=next_item.title,
                artist=next_item.artist,
                input_is_temp=input_is_temp,
            )
            if not advanced:
                raise HTTPException(status_code=400, detail="Could not advance queue")
            playlist_url = f"/cast-playback/session/{session_id}/playlist.m3u8"
            return JSONResponse(
                {
                    "sessionId": session_id,
                    "playlistUrl": playlist_url,
                    "status": advanced.to_status(),
                },
                headers=cors_headers(origin),
            )
        except HTTPException as exc:
            return JSONResponse(
                {"error": str(exc.detail)},
                status_code=exc.status_code,
                headers=cors_headers(origin),
            )

    @app.post("/cast-playback/plugin")
    async def cast_plugin_post(
        request: Request,
        body: dict = Body(default_factory=dict),
    ):
        origin = request.headers.get("origin")
        if not cast_feature_enabled():
            return JSONResponse({"ok": False}, headers=cors_headers(origin))
        action = str(body.get("action") or "").strip().lower()
        manager = get_cast_manager()
        sessions = manager.list_sessions()
        if not sessions:
            return JSONResponse({"ok": False}, headers=cors_headers(origin))
        session_id = sessions[0]["sessionId"]
        if action == "pause":
            manager.set_playing(session_id, False)
        elif action == "seek":
            seconds = float(body.get("seconds") or 0)
            manager.seek_session(session_id, seconds)
        elif action == "next":
            session = manager.get_session(session_id)
            if session and session.queue_index + 1 < len(session.queue):
                return JSONResponse(
                    {"ok": True, "needsResolve": True, "sessionId": session_id},
                    headers=cors_headers(origin),
                )
        return JSONResponse({"ok": True}, headers=cors_headers(origin))

    async def _cast_health(request: Request) -> dict[str, Any]:
        return await build_cast_health_payload(request)

    app.state.cast_health_builder = _cast_health
