"""
Cloud Run / light gateway: auth, health, provider-backed Whisper+LLM+OCR+Stems, music21 convert.

Heavy ML that needs a home GPU stack (OMR, local whisper.cpp, analyze-media) is refused.
Stems can run via fal.ai / Replicate when the user or host provides a key.
Configure PROVIDER_* env vars and EMBEDDED_CREDS_EMAILS / FREE_ACCESS_EMAILS as documented
in .env.example.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import time
from typing import Any

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response

from allowlists import email_allowed, load_embedded_creds_emails, load_free_access_emails
from provider_cloud import chat_openai_compat, transcribe_openai_compat
from providers import (
    is_cloud_stems_provider,
    parse_overlay_header,
    providers_health_payload,
    resolve_provider,
)
from oauth_bff_routes import register_oauth_bff_routes
from provider_stems_cloud import demucs_stems_for_model

app = FastAPI(title="tunebook-resolver-light")

FREE_ACCESS_EMAILS = load_free_access_emails()
EMBEDDED_CREDS_EMAILS = load_embedded_creds_emails()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() in ("1", "true", "yes")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
STEM_CACHE_DIR = os.getenv("STEM_CACHE_DIR", "/tmp/stem-cache")
STEM_SEPARATION_TIMEOUT_SECONDS = float(os.getenv("STEM_SEPARATION_TIMEOUT_SECONDS", "900"))
MAX_STREAM_BYTES = int(os.getenv("MAX_STREAM_BYTES", str(80 * 1024 * 1024)))

_stem_background_tasks: dict[str, asyncio.Task] = {}
_stem_inflight_locks: dict[str, asyncio.Lock] = {}


def oauth_bff_available() -> bool:
    try:
        from oauth_bff import oauth_bff_configured

        return bool(oauth_bff_configured())
    except Exception:
        return False


def cors_headers(origin: str | None) -> dict[str, str]:
    headers = {
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": (
            "Authorization,Content-Type,X-Abc-Auth-Session,"
            "X-Tunebook-Provider-llm,X-Tunebook-Provider-whisper,"
            "X-Tunebook-Provider-ocr,X-Tunebook-Provider-stems,"
            "X-Tunebook-Ytdlp-Proxy"
        ),
        "Access-Control-Max-Age": "86400",
    }
    if origin and origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    elif not ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin or "*"
    return headers


register_oauth_bff_routes(
    app,
    get_allowed_emails=lambda: FREE_ACCESS_EMAILS,
    cors_headers=cors_headers,
)


def get_bearer_token(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


async def verify_google_access_token(access_token: str) -> dict | None:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": "Bearer " + access_token},
        )
        if resp.status_code != 200:
            return None
        user = resp.json()
        email = (user.get("email") or "").lower()
        if not email:
            return None
        free = email_allowed(FREE_ACCESS_EMAILS, email)
        embedded = email_allowed(EMBEDDED_CREDS_EMAILS, email)
        return {
            "email": email,
            "allowed": free,
            "freeAccess": free,
            "embeddedCreds": embedded,
        }


async def require_auth(authorization: str | None) -> dict | None:
    if not REQUIRE_AUTH:
        return None
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
    verified = await verify_google_access_token(token)
    if not verified:
        raise HTTPException(status_code=401, detail="Invalid or expired Google token")
    if not verified["allowed"]:
        raise HTTPException(status_code=403, detail="Email not authorized")
    return verified


def auth_flags(verified: dict | None) -> dict[str, bool]:
    if not verified:
        if not REQUIRE_AUTH:
            return {"freeAccess": True, "embeddedCreds": True}
        return {"freeAccess": False, "embeddedCreds": False}
    return {
        "freeAccess": bool(verified.get("freeAccess")),
        "embeddedCreds": bool(verified.get("embeddedCreds")),
    }


def light_features(allow_embedded: bool = False) -> dict[str, Any]:
    host_proxy = bool(os.getenv("YTDLP_PROXY", "").strip())
    require_egress = os.getenv("YTDLP_REQUIRE_USER_PROXY", "true").lower() in ("1", "true", "yes")
    stems_cfg = resolve_provider(
        "stems",
        local_available=False,
        allow_embedded=allow_embedded,
    )
    stems_available = is_cloud_stems_provider(stems_cfg)
    oauth_bff = oauth_bff_available()
    return {
        "proxy": True,
        "stems": stems_available,
        "whisper": True,
        "llm": True,
        "practiceAnalysis": False,
        "sheetImage": True,  # cloud OCR only
        "sheetImageOcr": True,
        "sheetImageOmr": False,
        "imageSearch": False,
        "playwright": False,
        "oauthBff": oauth_bff,
        "soundfonts": False,
        "lightMode": True,
        "midiConvert": True,
        "wordTools": True,
        "youtubeAudio": bool(host_proxy) or not require_egress,
        "youtubeEgressRequired": require_egress and not host_proxy,
        "bandcamp": True,
        "internetArchive": True,
        "europeana": bool(os.getenv("EUROPEANA_API_KEY", "").strip()),
        "locAudio": True,
    }


@app.options("/{path:path}")
async def options_handler(path: str, request: Request):
    return JSONResponse(content={}, headers=cors_headers(request.headers.get("origin")))


@app.get("/")
async def root(request: Request):
    return JSONResponse(
        {
            "service": "abc2book-resolver-light",
            "health": "/health",
            "mode": "light",
            "auth": "REQUIRE_AUTH=" + str(REQUIRE_AUTH).lower(),
        },
        headers=cors_headers(request.headers.get("origin")),
    )


async def _health_body(authorization: str | None) -> dict:
    token = get_bearer_token(authorization)
    verified = None
    oauth_bff = oauth_bff_available()
    body: dict[str, Any] = {
        "ok": True,
        "requireAuth": REQUIRE_AUTH,
        "lightMode": True,
        "oauthBff": oauth_bff,
        "staticSite": False,
    }
    if REQUIRE_AUTH:
        if not token:
            body["authorized"] = False
            body["authReason"] = "login_required"
            body["freeAccess"] = False
            body["embeddedCreds"] = False
        else:
            verified = await verify_google_access_token(token)
            if not verified:
                body["authorized"] = False
                body["authReason"] = "invalid_token"
                body["freeAccess"] = False
                body["embeddedCreds"] = False
            elif not verified["allowed"]:
                body["authorized"] = False
                body["authReason"] = "email_not_authorized"
                body["freeAccess"] = False
                body["embeddedCreds"] = bool(verified.get("embeddedCreds"))
            else:
                body["authorized"] = True
                body["freeAccess"] = True
                body["embeddedCreds"] = bool(verified.get("embeddedCreds"))
    else:
        body["authorized"] = True
        body["freeAccess"] = True
        body["embeddedCreds"] = True

    flags = auth_flags(verified if body.get("authorized") else None)
    if not REQUIRE_AUTH:
        flags = auth_flags(None)
    body["features"] = light_features(allow_embedded=flags["embeddedCreds"])
    body["providers"] = providers_health_payload(
        allow_embedded=flags["embeddedCreds"],
        local_backends={"llm": False, "whisper": False, "ocr": False, "stems": False},
    )
    return body


@app.get("/health")
async def health(request: Request, authorization: str | None = Header(default=None)):
    return JSONResponse(
        await _health_body(authorization),
        headers=cors_headers(request.headers.get("origin")),
    )


@app.get("/health/ready")
async def health_ready(request: Request, authorization: str | None = Header(default=None)):
    return JSONResponse(
        await _health_body(authorization),
        headers=cors_headers(request.headers.get("origin")),
    )


@app.post("/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await require_auth(authorization)
        flags = auth_flags(verified)
        overlay = parse_overlay_header(request.headers.get("x-tunebook-provider-whisper"))
        cfg = resolve_provider(
            "whisper",
            overlay=overlay,
            allow_embedded=flags["embeddedCreds"],
            local_available=False,
        )
        if not cfg or cfg.get("provider") == "local" or not cfg.get("apiUrl"):
            raise HTTPException(
                status_code=503,
                detail="Whisper provider required (Settings → Providers or host PROVIDER_WHISPER_*)",
            )
        if file is None:
            raise HTTPException(status_code=400, detail="file upload required on light gateway")
        audio_bytes = await file.read()
        body = await transcribe_openai_compat(
            audio_bytes,
            file.filename or "audio.wav",
            file.content_type or "application/octet-stream",
            cfg,
        )
        return JSONResponse(body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            {"error": str(exc.detail)},
            status_code=exc.status_code,
            headers=cors_headers(origin),
        )
    except Exception as exc:
        return JSONResponse(
            {"error": str(exc)[:500]},
            status_code=502,
            headers=cors_headers(origin),
        )


@app.post("/provider-llm-chat")
async def provider_llm_chat(request: Request, authorization: str | None = Header(default=None)):
    """Generic OpenAI-compat chat via user/host LLM provider."""
    origin = request.headers.get("origin")
    try:
        verified = await require_auth(authorization)
        flags = auth_flags(verified)
        overlay = parse_overlay_header(request.headers.get("x-tunebook-provider-llm"))
        cfg = resolve_provider(
            "llm",
            overlay=overlay,
            allow_embedded=flags["embeddedCreds"],
            local_available=False,
        )
        if not cfg or not cfg.get("apiUrl"):
            raise HTTPException(status_code=503, detail="LLM provider required")
        payload = await request.json()
        messages = payload.get("messages") or []
        text = await chat_openai_compat(messages, cfg)
        return JSONResponse({"text": text, "backend": "provider:" + cfg.get("provider", "cloud")}, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/midi2xml")
async def midi2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        from midi_convert import convert_midi_to_musicxml

        if file is None:
            raise HTTPException(status_code=400, detail="Missing MIDI file upload")
        data = await file.read()
        xml, _diagnostics = await convert_midi_to_musicxml(data, file.filename or "import.mid")
        return Response(content=xml, media_type="application/xml", headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/score2xml")
async def score2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        import os
        import tempfile
        from musescore_fetch import _convert_score_file_to_musicxml

        if file is None:
            raise HTTPException(status_code=400, detail="Missing score file upload")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Score file is empty")
        suffix = os.path.splitext(file.filename or "")[1].lower() or ".mscx"
        with tempfile.TemporaryDirectory() as temp_dir:
            in_path = os.path.join(temp_dir, "upload" + suffix)
            with open(in_path, "wb") as handle:
                handle.write(data)
            xml = _convert_score_file_to_musicxml(in_path, temp_dir, output_stem="score_import")
        return Response(content=xml, media_type="application/xml", headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/midi2abc")
async def midi2abc_light(
    request: Request,
    file: UploadFile | None = File(default=None),
    mode: str | None = None,
    strategy: str = "auto",
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        from midi_convert import MAX_MIDI_IMPORT_BYTES
        from midi_import_orchestrator import import_midi_bytes
        import asyncio

        if file is None:
            raise HTTPException(status_code=400, detail="Missing MIDI file upload")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="MIDI file is empty")
        if len(data) > MAX_MIDI_IMPORT_BYTES:
            raise HTTPException(status_code=413, detail="MIDI file too large")

        forced_mode = (mode or "").strip().lower() or None
        if forced_mode not in (None, "melody", "multi_voice"):
            forced_mode = None
        include_chords_param = (request.query_params.get("include_chords") or "").strip().lower()
        forced_include_chords = None
        if include_chords_param in ("1", "true", "yes"):
            forced_include_chords = True
        elif include_chords_param in ("0", "false", "no"):
            forced_include_chords = False
        result = await asyncio.to_thread(
            import_midi_bytes,
            data,
            file.filename or "import.mid",
            mode=forced_mode,
            strategy=(strategy or "auto").strip().lower() or "auto",
            include_chords=forced_include_chords,
        )
        return JSONResponse(result, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/abc2xml")
async def abc2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    return JSONResponse(
        {
            "error": "abc2xml_unavailable",
            "hint": "ABC→MusicXML is on the full resolver; use home BYOR or fat image",
        },
        status_code=503,
        headers=cors_headers(origin),
    )


@app.get("/youtube/{video_id}/audio")
async def youtube_audio(
    video_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    """Stream YouTube audio via yt-dlp. Requires user/host residential proxy."""
    import asyncio
    import re

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not re.match(r"^[a-zA-Z0-9_-]{11}$", video_id or ""):
            raise HTTPException(status_code=400, detail="Invalid YouTube video id")
        proxy = (request.headers.get("x-tunebook-ytdlp-proxy") or "").strip() or os.getenv("YTDLP_PROXY", "").strip()
        require_egress = os.getenv("YTDLP_REQUIRE_USER_PROXY", "true").lower() in ("1", "true", "yes")
        if require_egress and not proxy:
            raise HTTPException(
                status_code=503,
                detail=(
                    "YouTube audio requires a residential proxy. "
                    "Set Webshare in Settings → Providers, or use the YouTube Helper extension."
                ),
            )
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "-f",
            "ba/b",
            "-o",
            "-",
        ]
        if proxy:
            cmd.extend(["--proxy", proxy])
        cmd.append("https://www.youtube.com/watch?v=" + video_id)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        first = await proc.stdout.read(8192)
        if not first:
            err = (await proc.stderr.read()).decode("utf-8", errors="ignore")[:400]
            raise HTTPException(status_code=502, detail=err or "yt-dlp produced no audio")

        async def body():
            yield first
            try:
                while True:
                    chunk = await proc.stdout.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except Exception:
                        proc.kill()

        from fastapi.responses import StreamingResponse

        return StreamingResponse(
            body(),
            media_type="application/octet-stream",
            headers={**cors_headers(origin), "Cache-Control": "private, max-age=3600"},
        )
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.get("/bandcamp/audio")
async def bandcamp_audio(
    request: Request,
    url: str,
    authorization: str | None = Header(default=None),
):
    """Stream Bandcamp audio via yt-dlp."""
    import asyncio

    from bandcamp import bandcamp_enabled, is_bandcamp_url

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not bandcamp_enabled():
            raise HTTPException(status_code=404, detail="Bandcamp is not available")
        if not is_bandcamp_url(url):
            raise HTTPException(status_code=400, detail="Invalid Bandcamp URL")
        proxy = (request.headers.get("x-tunebook-ytdlp-proxy") or "").strip() or os.getenv("YTDLP_PROXY", "").strip()
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--no-warnings",
            "-f",
            "ba/b",
            "-o",
            "-",
            url,
        ]
        if proxy:
            cmd.extend(["--proxy", proxy])
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        first = await proc.stdout.read(8192)
        if not first:
            err = (await proc.stderr.read()).decode("utf-8", errors="ignore")[:400]
            raise HTTPException(status_code=502, detail=err or "yt-dlp produced no audio")

        async def body():
            yield first
            try:
                while True:
                    chunk = await proc.stdout.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except Exception:
                        proc.kill()

        from fastapi.responses import StreamingResponse

        return StreamingResponse(
            body(),
            media_type="application/octet-stream",
            headers={**cors_headers(origin), "Cache-Control": "private, max-age=3600"},
        )
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/search-bandcamp")
async def search_bandcamp_light(
    request: Request,
    authorization: str | None = Header(default=None),
):
    from bandcamp import bandcamp_enabled, build_bandcamp_candidate, search_bandcamp

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not bandcamp_enabled():
            return JSONResponse({"error": "Bandcamp is not available"}, status_code=404, headers=cors_headers(origin))
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_bandcamp(query, title=title, artist=artist, limit=limit)
        candidates = [build_bandcamp_candidate(match, title=title, artist=artist) for match in matches]
        return JSONResponse({"ok": True, "candidates": candidates}, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=500, headers=cors_headers(origin))


async def _stream_https_audio(target_url: str, origin: str | None):
    from fastapi.responses import StreamingResponse

    timeout = httpx.Timeout(60.0, connect=10.0)
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout)
    upstream = await client.send(
        client.build_request("GET", target_url),
        stream=True,
    )
    if upstream.status_code not in (200, 206):
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=upstream.status_code, detail="Upstream fetch failed")

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    headers = {"Cache-Control": "private, max-age=3600"}
    content_type = upstream.headers.get("content-type")
    if content_type:
        headers["Content-Type"] = content_type
    return StreamingResponse(body(), media_type=content_type or "application/octet-stream", headers={**cors_headers(origin), **headers})


@app.get("/internet-archive/audio")
async def internet_archive_audio_light(
    request: Request,
    url: str,
    authorization: str | None = Header(default=None),
):
    from internet_archive import internet_archive_enabled, is_archive_org_url, resolve_archive_playback_url

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not internet_archive_enabled():
            raise HTTPException(status_code=404, detail="Internet Archive is not available")
        if not is_archive_org_url(url):
            raise HTTPException(status_code=400, detail="Invalid Internet Archive URL")
        playback_url = await resolve_archive_playback_url(url)
        if not playback_url:
            raise HTTPException(status_code=502, detail="Could not resolve Internet Archive audio file")
        return await _stream_https_audio(playback_url, origin)
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.get("/loc/audio")
async def loc_audio_light(
    request: Request,
    url: str,
    authorization: str | None = Header(default=None),
):
    from loc_audio import is_loc_gov_url, loc_audio_enabled, resolve_loc_playback_url

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not loc_audio_enabled():
            raise HTTPException(status_code=404, detail="Library of Congress audio is not available")
        if not is_loc_gov_url(url):
            raise HTTPException(status_code=400, detail="Invalid Library of Congress URL")
        playback_url = await resolve_loc_playback_url(url)
        if not playback_url:
            raise HTTPException(status_code=502, detail="Could not resolve Library of Congress audio file")
        return await _stream_https_audio(playback_url, origin)
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/search-internet-archive")
async def search_internet_archive_light(
    request: Request,
    authorization: str | None = Header(default=None),
):
    from internet_archive import (
        build_internet_archive_candidate,
        internet_archive_enabled,
        search_internet_archive,
    )

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not internet_archive_enabled():
            return JSONResponse({"error": "Internet Archive is not available"}, status_code=404, headers=cors_headers(origin))
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_internet_archive(query, title=title, artist=artist, limit=limit)
        candidates = [
            build_internet_archive_candidate(match, title=title, artist=artist) for match in matches
        ]
        return JSONResponse({"ok": True, "candidates": candidates}, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=500, headers=cors_headers(origin))


@app.post("/search-europeana")
async def search_europeana_light(
    request: Request,
    authorization: str | None = Header(default=None),
):
    from europeana import build_europeana_candidate, europeana_enabled, search_europeana

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not europeana_enabled():
            return JSONResponse({"error": "Europeana is not available"}, status_code=404, headers=cors_headers(origin))
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_europeana(query, title=title, artist=artist, limit=limit)
        candidates = [build_europeana_candidate(match, title=title, artist=artist) for match in matches]
        return JSONResponse({"ok": True, "candidates": candidates}, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=500, headers=cors_headers(origin))


@app.post("/search-loc-audio")
async def search_loc_audio_light(
    request: Request,
    authorization: str | None = Header(default=None),
):
    from loc_audio import build_loc_audio_candidate, loc_audio_enabled, search_loc_audio

    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not loc_audio_enabled():
            return JSONResponse({"error": "Library of Congress audio is not available"}, status_code=404, headers=cors_headers(origin))
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_loc_audio(query, title=title, artist=artist, limit=limit)
        candidates = [build_loc_audio_candidate(match, title=title, artist=artist) for match in matches]
        return JSONResponse({"ok": True, "candidates": candidates}, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=500, headers=cors_headers(origin))


@app.post("/transcribe-sheet-image")
async def transcribe_sheet_image_cloud(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    """Cloud OCR only on the light gateway (no local Paddle/homr)."""
    origin = request.headers.get("origin")
    try:
        verified = await require_auth(authorization)
        flags = auth_flags(verified)
        overlay = parse_overlay_header(request.headers.get("x-tunebook-provider-ocr"))
        cfg = resolve_provider(
            "ocr",
            overlay=overlay,
            allow_embedded=flags["embeddedCreds"],
            local_available=False,
        )
        if not cfg or not cfg.get("apiUrl"):
            raise HTTPException(
                status_code=503,
                detail="OCR provider required on light gateway (Settings → Providers)",
            )
        if file is None:
            raise HTTPException(status_code=400, detail="Missing image upload")
        image_bytes = await file.read()
        from provider_cloud import ocr_openai_vision

        body = await ocr_openai_vision(image_bytes, file.filename or "upload.png", cfg)
        return JSONResponse(body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))
    except Exception as exc:
        return JSONResponse({"error": str(exc)[:500]}, status_code=502, headers=cors_headers(origin))


@app.post("/separate-stems")
async def separate_stems_cloud_endpoint(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    """Cloud Demucs via fal.ai / Replicate (BYO or host PROVIDER_STEMS_*)."""
    origin = request.headers.get("origin")
    try:
        verified = await require_auth(authorization)
        flags = auth_flags(verified)
        overlay = parse_overlay_header(request.headers.get("x-tunebook-provider-stems"))
        cfg = resolve_provider(
            "stems",
            overlay=overlay,
            allow_embedded=flags["embeddedCreds"],
            local_available=False,
        )
        if not is_cloud_stems_provider(cfg):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Stems provider required on light gateway "
                    "(Settings → Providers fal/Replicate, or host PROVIDER_STEMS_*)"
                ),
            )
        if file is not None:
            audio_bytes = await file.read()
            filename = file.filename or "audio.bin"
            source_key = "upload:" + hashlib.sha256(audio_bytes).hexdigest()
        else:
            try:
                payload = await request.json()
            except Exception:
                payload = {}
            source_url = str((payload or {}).get("sourceUrl") or "").strip()
            if not source_url:
                raise HTTPException(status_code=400, detail="file upload or sourceUrl required")
            if not (source_url.startswith("http://") or source_url.startswith("https://")):
                raise HTTPException(status_code=400, detail="sourceUrl must be http(s)")
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
                audio_resp = await client.get(source_url)
                if audio_resp.status_code >= 400:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to fetch sourceUrl ({audio_resp.status_code})",
                    )
                audio_bytes = audio_resp.content
            filename = str((payload or {}).get("sourceName") or "audio.bin")
            source_type = str((payload or {}).get("sourceType") or "audio").strip().lower()
            source_key = source_type + ":" + source_url

        if not audio_bytes:
            raise HTTPException(status_code=400, detail="No audio data")
        if len(audio_bytes) > MAX_STREAM_BYTES:
            raise HTTPException(status_code=413, detail="Media file too large")

        from provider_stems_cloud import cloud_stems_model_name, separate_stems_cloud

        model_name = cloud_stems_model_name(cfg)
        cache_key = model_name + "|cloud:" + str(cfg.get("provider") or "")
        cache_id = hashlib.sha256((source_key + "|" + cache_key).encode("utf-8")).hexdigest()[:32]
        cache_dir = os.path.join(STEM_CACHE_DIR, cache_id)

        def stems_cached() -> bool:
            if not os.path.isdir(cache_dir):
                return False
            stems = demucs_stems_for_model(model_name)
            return all(os.path.isfile(os.path.join(cache_dir, stem + ".wav")) for stem in stems)

        def read_meta() -> dict:
            path = os.path.join(cache_dir, "metadata.json")
            if not os.path.isfile(path):
                return {}
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}

        def write_meta(payload: dict) -> None:
            os.makedirs(cache_dir, exist_ok=True)
            with open(os.path.join(cache_dir, "metadata.json"), "w", encoding="utf-8") as handle:
                json.dump(payload, handle)

        def write_progress(payload: dict) -> None:
            os.makedirs(cache_dir, exist_ok=True)
            with open(os.path.join(cache_dir, "progress.json"), "w", encoding="utf-8") as handle:
                json.dump(payload, handle)

        def read_progress() -> dict:
            path = os.path.join(cache_dir, "progress.json")
            if not os.path.isfile(path):
                return {}
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}

        def build_response(pending: bool = False) -> dict:
            meta = read_meta()
            stems = {
                stem: "/stems/" + cache_id + "/" + stem
                for stem in demucs_stems_for_model(model_name)
            }
            if pending:
                return {
                    "cacheId": cache_id,
                    "model": model_name,
                    "samplerate": 0,
                    "duration": 0,
                    "backend": "",
                    "stems": stems,
                    "cached": False,
                    "pending": True,
                }
            return {
                "cacheId": cache_id,
                "model": model_name,
                "samplerate": int(meta.get("samplerate") or 0),
                "duration": float(meta.get("duration") or 0),
                "backend": meta.get("backend") or "",
                "stems": stems,
                "cached": True,
            }

        if stems_cached():
            return JSONResponse(build_response(False), headers=cors_headers(origin))

        existing = _stem_background_tasks.get(cache_id)
        if existing and not existing.done():
            return JSONResponse(build_response(True), headers=cors_headers(origin))

        lock = _stem_inflight_locks.get(cache_id)
        if lock is None:
            lock = asyncio.Lock()
            _stem_inflight_locks[cache_id] = lock

        async def run_job():
            try:
                async with lock:
                    if stems_cached():
                        return
                    started_at = time.time()
                    write_progress({
                        "stage": "separating",
                        "progress": 10,
                        "message": "Separating stems (cloud)...",
                        "startedAt": started_at,
                        "estimatedSeconds": 120,
                        "elapsedSeconds": 0,
                    })
                    result = await asyncio.wait_for(
                        separate_stems_cloud(audio_bytes, filename, cfg, cache_dir),
                        timeout=STEM_SEPARATION_TIMEOUT_SECONDS,
                    )
                    write_meta({
                        "samplerate": result.get("samplerate") or 0,
                        "duration": result.get("duration") or 0,
                        "backend": result.get("backend") or "",
                        "model": result.get("model") or model_name,
                    })
                    write_progress({
                        "stage": "complete",
                        "progress": 100,
                        "message": "Stems ready",
                        "duration": float(result.get("duration") or 0),
                    })
            except Exception as exc:
                write_progress({
                    "stage": "error",
                    "progress": 0,
                    "message": str(exc)[:200],
                })
            finally:
                _stem_background_tasks.pop(cache_id, None)
                _stem_inflight_locks.pop(cache_id, None)

        _stem_background_tasks[cache_id] = asyncio.create_task(run_job())
        return JSONResponse(build_response(True), headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            {"error": str(exc.detail)},
            status_code=exc.status_code,
            headers=cors_headers(origin),
        )
    except Exception as exc:
        return JSONResponse(
            {"error": str(exc)[:500]},
            status_code=502,
            headers=cors_headers(origin),
        )


@app.get("/stems/{cache_id}/status")
async def get_stem_status_light(
    cache_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not re.fullmatch(r"[a-f0-9]{32}", cache_id or ""):
            raise HTTPException(status_code=400, detail="Invalid cache id")
        cache_dir = os.path.join(STEM_CACHE_DIR, cache_id)
        meta_path = os.path.join(cache_dir, "metadata.json")
        progress_path = os.path.join(cache_dir, "progress.json")
        metadata = {}
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as handle:
                    metadata = json.load(handle) or {}
            except Exception:
                metadata = {}
        model_name = str(metadata.get("model") or "htdemucs")
        stems = demucs_stems_for_model(model_name)
        cached = all(os.path.isfile(os.path.join(cache_dir, stem + ".wav")) for stem in stems)
        if cached:
            body = {
                "cacheId": cache_id,
                "stage": "complete",
                "progress": 100,
                "message": "Stems ready",
                "cached": True,
                "duration": float(metadata.get("duration") or 0),
            }
        elif os.path.isfile(progress_path):
            try:
                with open(progress_path, "r", encoding="utf-8") as handle:
                    progress = json.load(handle) or {}
            except Exception:
                progress = {}
            body = {
                "cacheId": cache_id,
                "stage": progress.get("stage") or "separating",
                "progress": int(progress.get("progress") or 0),
                "message": progress.get("message") or "Separating stems...",
                "cached": False,
                "duration": float(progress.get("duration") or 0),
                "elapsedSeconds": float(progress.get("elapsedSeconds") or 0),
                "estimatedSeconds": float(progress.get("estimatedSeconds") or 0),
            }
        else:
            body = {
                "cacheId": cache_id,
                "stage": "queued",
                "progress": 0,
                "message": "Queued for stem separation",
                "cached": False,
            }
        return JSONResponse(body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))


@app.get("/stems/{cache_id}/{stem_name}")
async def get_stem_audio_light(
    cache_id: str,
    stem_name: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        if not re.fullmatch(r"[a-f0-9]{32}", cache_id or ""):
            raise HTTPException(status_code=400, detail="Invalid cache id")
        cache_dir = os.path.join(STEM_CACHE_DIR, cache_id)
        meta_path = os.path.join(cache_dir, "metadata.json")
        metadata = {}
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as handle:
                    metadata = json.load(handle) or {}
            except Exception:
                metadata = {}
        allowed = demucs_stems_for_model(metadata.get("model"))
        if stem_name not in allowed:
            raise HTTPException(status_code=400, detail="Unknown stem")
        stem_path = os.path.join(cache_dir, stem_name + ".wav")
        if not os.path.isfile(stem_path):
            raise HTTPException(status_code=404, detail="Stem not found")
        return FileResponse(
            stem_path,
            media_type="audio/wav",
            filename=stem_name + ".wav",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code, headers=cors_headers(origin))


@app.post("/analyze-media")
@app.post("/detect-chords")
@app.post("/analyze-practice")
async def heavy_refused(request: Request):
    origin = request.headers.get("origin")
    return JSONResponse(
        {
            "error": "heavy_ml_unavailable",
            "hint": "Use a full home resolver (BYOR) or free-access host for OMR/melody analysis",
        },
        status_code=503,
        headers=cors_headers(origin),
    )
