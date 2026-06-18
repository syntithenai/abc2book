import asyncio
import os
import re
from urllib.parse import urlparse

import httpx
from fastapi import Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi import FastAPI

app = FastAPI()

ALLOWED_EMAILS = {
    email.strip().lower()
    for email in os.getenv("ALLOWED_EMAILS", "").split(",")
    if email.strip()
}
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
YTDLP_COOKIES_PATH = os.getenv("YTDLP_COOKIES_PATH", "")
MAX_STREAM_BYTES = int(os.getenv("MAX_STREAM_BYTES", str(80 * 1024 * 1024)))

BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"}
BLOCKED_SUFFIXES = (".local", ".internal")


def cors_headers(origin):
    allow_origin = "*"
    if origin and origin in ALLOWED_ORIGINS:
        allow_origin = origin
    elif ALLOWED_ORIGINS:
        allow_origin = ALLOWED_ORIGINS[0]

    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    }


def json_error(status, message, origin, hint=None):
    body = {"error": message}
    if hint:
        body["hint"] = hint
    return JSONResponse(status_code=status, content=body, headers=cors_headers(origin))


def get_bearer_token(auth_header):
    if not auth_header:
        return None
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


async def verify_google_access_token(access_token):
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

        if GOOGLE_CLIENT_ID:
            try:
                await client.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"access_token": access_token},
                )
            except Exception:
                pass

        return {"email": email, "allowed": email in ALLOWED_EMAILS}


async def require_auth(authorization):
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")

    verified = await verify_google_access_token(token)
    if not verified:
        raise HTTPException(status_code=401, detail="Invalid or expired Google token")
    if not verified["allowed"]:
        raise HTTPException(status_code=403, detail="Email not authorized for media proxy")

    return verified


def is_blocked_host(hostname):
    host = (hostname or "").lower()
    if not host or host in BLOCKED_HOSTS:
        return True
    if any(host.endswith(suffix) for suffix in BLOCKED_SUFFIXES):
        return True

    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
        parts = [int(part) for part in host.split(".")]
        if parts[0] == 10:
            return True
        if parts[0] == 127:
            return True
        if parts[0] == 0:
            return True
        if parts[0] == 169 and parts[1] == 254:
            return True
        if parts[0] == 192 and parts[1] == 168:
            return True
        if parts[0] == 172 and 16 <= parts[1] <= 31:
            return True

    return False


def validate_target_url(raw_url):
    try:
        parsed = urlparse(raw_url)
    except Exception:
        return None, "Invalid URL"

    if parsed.scheme != "https":
        return None, "Only https URLs are allowed"

    if is_blocked_host(parsed.hostname):
        return None, "Target host is not allowed"

    return raw_url, None


def upstream_headers_for(target_url, range_header):
    headers = {}
    if range_header:
        headers["Range"] = range_header

    lower = target_url.lower()
    if (
        "googlevideo.com" in lower
        or "youtube.com" in lower
        or "videoplayback" in lower
    ):
        headers["User-Agent"] = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        headers["Referer"] = "https://www.youtube.com/"
        headers["Origin"] = "https://www.youtube.com"

    return headers


async def resolve_youtube_audio_url(video_id):
    if not re.match(r"^[A-Za-z0-9_-]{11}$", video_id):
        return None, "Invalid YouTube video id"

    cmd = [
        "yt-dlp",
        "-f",
        "bestaudio",
        "-g",
        "https://www.youtube.com/watch?v=" + video_id,
    ]

    if YTDLP_COOKIES_PATH and os.path.exists(YTDLP_COOKIES_PATH):
        cmd[1:1] = ["--cookies", YTDLP_COOKIES_PATH]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="ignore").strip()[:300]
        return None, err or "yt-dlp failed"

    lines = stdout.decode("utf-8", errors="ignore").strip().splitlines()
    if not lines:
        return None, "yt-dlp returned no URL"

    validated, error = validate_target_url(lines[0])
    if error:
        return None, error

    return validated, None


async def stream_upstream(target_url, request):
    range_header = request.headers.get("range")
    headers = upstream_headers_for(target_url, range_header)

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    upstream = await client.send(
        client.build_request("GET", target_url, headers=headers),
        stream=True,
    )

    if upstream.status_code not in (200, 206):
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=upstream.status_code, detail="Upstream fetch failed")

    content_length = upstream.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_STREAM_BYTES:
                await upstream.aclose()
                await client.aclose()
                raise HTTPException(status_code=413, detail="Media file too large")
        except ValueError:
            pass

    response_headers = {"Cache-Control": "private, max-age=3600"}
    for name in ("content-type", "content-length", "content-range", "accept-ranges"):
        value = upstream.headers.get(name)
        if value:
            response_headers[name] = value

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(body(), status_code=upstream.status_code, headers=response_headers)


@app.options("/{path:path}")
async def options_handler(path: str, request: Request):
    return JSONResponse(content={}, headers=cors_headers(request.headers.get("origin")))


@app.get("/")
async def root(request: Request):
    return JSONResponse(
        {
            "service": "abc2book-local-resolver",
            "health": "/health",
            "endpoints": ["/youtube/:videoId/audio", "/proxy-audio?url=..."],
            "auth": "Authorization: Bearer <google_access_token>",
        },
        headers=cors_headers(request.headers.get("origin")),
    )


@app.get("/health")
async def health(request: Request):
    return JSONResponse({"ok": True}, headers=cors_headers(request.headers.get("origin")))


@app.get("/proxy-audio")
async def proxy_audio(
    request: Request,
    url: str = Query(...),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        validated, error = validate_target_url(url)
        if error:
            return json_error(400, error, origin)
        response = await stream_upstream(validated, request)
        response.headers.update(cors_headers(origin))
        return response
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/youtube/{video_id}/audio")
async def youtube_audio(
    video_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_auth(authorization)
        resolved, error = await resolve_youtube_audio_url(video_id)
        if error:
            status = 400 if error == "Invalid YouTube video id" else 502
            return json_error(status, "Could not resolve YouTube audio stream", origin, error)
        response = await stream_upstream(resolved, request)
        response.headers.update(cors_headers(origin))
        return response
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
