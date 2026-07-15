"""
Cloud Run / light gateway: auth, health, provider-backed Whisper+LLM, music21 convert.

Heavy ML (stems, OMR, local whisper.cpp) is refused. Configure PROVIDER_* env vars
and EMBEDDED_CREDS_EMAILS / FREE_ACCESS_EMAILS as documented in .env.example.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from allowlists import email_allowed, load_embedded_creds_emails, load_free_access_emails
from provider_cloud import chat_openai_compat, transcribe_openai_compat
from providers import (
    parse_overlay_header,
    providers_health_payload,
    resolve_provider,
)

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


def cors_headers(origin: str | None) -> dict[str, str]:
    headers = {
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Tunebook-Provider-llm,X-Tunebook-Provider-whisper,X-Tunebook-Provider-ocr,X-Tunebook-Ytdlp-Proxy",
        "Access-Control-Max-Age": "86400",
    }
    if origin and origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    elif not ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin or "*"
    return headers


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


def light_features() -> dict[str, Any]:
    host_proxy = bool(os.getenv("YTDLP_PROXY", "").strip())
    require_egress = os.getenv("YTDLP_REQUIRE_USER_PROXY", "true").lower() in ("1", "true", "yes")
    return {
        "proxy": True,
        "stems": False,
        "whisper": True,
        "llm": True,
        "practiceAnalysis": False,
        "sheetImage": True,  # cloud OCR only
        "sheetImageOcr": True,
        "sheetImageOmr": False,
        "imageSearch": False,
        "playwright": False,
        "oauthBff": False,
        "soundfonts": False,
        "lightMode": True,
        "midiConvert": True,
        "wordTools": True,
        "youtubeAudio": bool(host_proxy) or not require_egress,
        "youtubeEgressRequired": require_egress and not host_proxy,
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
    body: dict[str, Any] = {
        "ok": True,
        "requireAuth": REQUIRE_AUTH,
        "lightMode": True,
        "features": light_features(),
        "oauthBff": False,
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
    body["providers"] = providers_health_payload(
        allow_embedded=flags["embeddedCreds"],
        local_backends={"llm": False, "whisper": False, "ocr": False},
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
        xml = await convert_midi_to_musicxml(data, file.filename or "import.mid")
        return Response(content=xml, media_type="application/xml", headers=cors_headers(origin))
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
@app.post("/analyze-media")
@app.post("/detect-chords")
@app.post("/analyze-practice")
async def heavy_refused(request: Request):
    origin = request.headers.get("origin")
    return JSONResponse(
        {
            "error": "heavy_ml_unavailable",
            "hint": "Use a full home resolver (BYOR) or free-access host for stems/OMR/melody",
        },
        status_code=503,
        headers=cors_headers(origin),
    )
