from chords_fetch import fetch_chords_url, search_chords
from lyrics_fetch import fetch_lyrics_url, search_lyrics
from notation_fetch import search_notation
from playback_region_detect import (
    PLAYBACK_SCAN_WHISPER_OPTIONS,
    detect_playback_region_from_wav,
)
from tune_background_research import research_tune_background
from voice_command import (
    VOICE_WHISPER_OPTIONS,
    _empty_intent,
    parse_catalog_json,
    parse_voice_intent,
)
import asyncio
import hashlib
import json
import os
import re
import shutil
import tempfile
import time
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

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
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "false").lower() in ("1", "true", "yes")
YTDLP_COOKIES_PATH = os.getenv("YTDLP_COOKIES_PATH", "")
YTDLP_COOKIES_WRITABLE = "/tmp/youtube-cookies.txt"
MAX_STREAM_BYTES = int(os.getenv("MAX_STREAM_BYTES", str(80 * 1024 * 1024)))
MAX_MIDI_IMPORT_BYTES = int(os.getenv("MAX_MIDI_IMPORT_BYTES", str(4 * 1024 * 1024)))
GOATCOUNTER_API_URL = os.getenv("GOATCOUNTER_API_URL", "").strip()
GOATCOUNTER_API_TOKEN = os.getenv("GOATCOUNTER_API_TOKEN", "").strip()
GOATCOUNTER_TIMEOUT_SECONDS = float(os.getenv("GOATCOUNTER_TIMEOUT_SECONDS", "5"))
WHISPER_TIMEOUT_SECONDS = float(os.getenv("WHISPER_TIMEOUT_SECONDS", "600"))
AUTOCHORD_TIMEOUT_SECONDS = float(os.getenv("AUTOCHORD_TIMEOUT_SECONDS", "900"))
WHISPER_CPP_PATH = os.getenv("WHISPER_CPP_PATH", "/app/build/bin/whisper-cli")
MODEL_PATH = os.getenv("MODEL_PATH", "/models/ggml-large-v3.bin")
WHISPER_BACKEND_PREFERENCE = os.getenv("WHISPER_BACKEND_PREFERENCE", "auto").strip().lower() or "auto"
WHISPER_CPU_FALLBACK = os.getenv("WHISPER_CPU_FALLBACK", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_CPP_BEST_OF = int(os.getenv("WHISPER_CPP_BEST_OF", "5"))
WHISPER_CPP_BEAM_SIZE = int(os.getenv("WHISPER_CPP_BEAM_SIZE", "5"))
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en").strip() or "en"
WHISPER_WORD_TIMESTAMPS = os.getenv("WHISPER_WORD_TIMESTAMPS", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_CPP_NO_CONTEXT = os.getenv("WHISPER_CPP_NO_CONTEXT", "false").strip().lower() not in {"0", "false", "no"}
WHISPER_LYRICS_FORMAT = os.getenv("WHISPER_LYRICS_FORMAT", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_LYRICS_MAX_WORDS = max(1, int(os.getenv("WHISPER_LYRICS_MAX_WORDS", "10")))
WHISPER_LYRICS_LINE_PAUSE_SECONDS = float(os.getenv("WHISPER_LYRICS_LINE_PAUSE_SECONDS", "1.2"))
WHISPER_LYRICS_STANZA_PAUSE_SECONDS = float(os.getenv("WHISPER_LYRICS_STANZA_PAUSE_SECONDS", "4.0"))
ANALYZE_MEDIA_TIMEOUT_SECONDS = float(os.getenv("ANALYZE_MEDIA_TIMEOUT_SECONDS", "1200"))
STEM_CACHE_DIR = os.getenv("STEM_CACHE_DIR", "/tmp/stem-cache")
STEM_SEPARATION_TIMEOUT_SECONDS = float(os.getenv("STEM_SEPARATION_TIMEOUT_SECONDS", "900"))
# Demucs stem separation is heavily CPU/GPU bound. Without a cap, repeated
# requests for the same source (each a cache miss until the first finishes)
# spawn one full separation subprocess apiece, oversubscribing the box. Bound
# the number of concurrent heavy jobs and coalesce duplicate in-flight work.
MAX_CONCURRENT_STEM_JOBS = max(1, int(os.getenv("MAX_CONCURRENT_STEM_JOBS", "1")))
HTDEMUCS_STEMS = ("drums", "bass", "other", "vocals")


def _demucs_stems_for_model(model_name=None):
    name = model_name or os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    if name == "htdemucs_6s":
        return ("drums", "bass", "other", "vocals", "guitar", "piano")
    return HTDEMUCS_STEMS

# Lazily created so they bind to the running event loop on first use.
_stem_job_semaphore = None
_stem_inflight_locks = {}
_stem_background_tasks = {}
STEM_SECONDS_PER_TRACK_SECOND = float(os.getenv("STEM_SECONDS_PER_TRACK_SECOND", "1.5"))
PROXY_ENABLED = os.getenv("PROXY_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
STEMS_ENABLED = os.getenv("STEMS_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_ENABLED = os.getenv("WHISPER_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
LLM_ENABLED = os.getenv("LLM_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
LLM_HEALTH_CACHE_SECONDS = float(os.getenv("LLM_HEALTH_CACHE_SECONDS", "60"))
_llm_available_cache = False
_llm_checked_at = 0.0


def _get_stem_job_semaphore():
    global _stem_job_semaphore
    if _stem_job_semaphore is None:
        _stem_job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_STEM_JOBS)
    return _stem_job_semaphore


def _get_stem_inflight_lock(cache_id):
    lock = _stem_inflight_locks.get(cache_id)
    if lock is None:
        lock = asyncio.Lock()
        _stem_inflight_locks[cache_id] = lock
    return lock

BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"}
BLOCKED_SUFFIXES = (".local", ".internal")
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
SENTENCE_END_RE = re.compile(r"[.!?][\"')\]]*$")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
# whisper.cpp emits special control tokens (e.g. [_TT_542], [_BEG_], [_SOT_],
# [_EOT_], [_NOSP_]) alongside real word tokens when token timestamps (-ojf) are
# enabled. These must be stripped so they never leak into transcribed lyrics.
WHISPER_SPECIAL_TOKEN_RE = re.compile(r"^\[_.*\]$")


def is_dev_origin(origin):
    try:
        parsed = urlparse(origin)
        host = (parsed.hostname or "").lower()
        if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
            return True
        if host.startswith("192.168.") or host.startswith("10.") or host.startswith("172."):
            return True
    except Exception:
        pass
    return False


def cors_headers(origin):
    allow_origin = "*"
    if origin and (origin in ALLOWED_ORIGINS or is_dev_origin(origin)):
        allow_origin = origin
    elif ALLOWED_ORIGINS:
        allow_origin = ALLOWED_ORIGINS[0]

    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    }


def json_error(status, message, origin, hint=None):
    body = {"error": message}
    if hint:
        body["hint"] = hint
    return JSONResponse(status_code=status, content=body, headers=cors_headers(origin))


async def _send_goatcounter_resolver_event(path):
    if not GOATCOUNTER_API_URL or not GOATCOUNTER_API_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=GOATCOUNTER_TIMEOUT_SECONDS) as client:
            await client.post(
                GOATCOUNTER_API_URL,
                headers={
                    "Authorization": "Bearer " + GOATCOUNTER_API_TOKEN,
                    "Content-Type": "application/json",
                },
                json={
                    "no_sessions": True,
                    "hits": [{"path": "resolver-server/" + path, "event": True}],
                },
            )
    except Exception as exc:
        print("WARNING: GoatCounter resolver analytics failed:", str(exc)[:200])


def track_resolver_usage(path):
    if not GOATCOUNTER_API_URL or not GOATCOUNTER_API_TOKEN:
        return
    try:
        asyncio.create_task(_send_goatcounter_resolver_event(path))
    except RuntimeError:
        pass


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    origin = request.headers.get("origin")
    return json_error(exc.status_code, str(exc.detail), origin)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin")
    detail = str(exc).strip()[:500] or "Internal server error"
    return json_error(500, detail, origin)


@app.on_event("startup")
async def verify_autochord_runtime():
    autochord_python = os.getenv("AUTOCHORD_VENV_PYTHON", "/opt/autochord-venv/bin/python")
    if not os.path.exists(autochord_python):
        print(f"WARNING: autochord python not found at {autochord_python}")
    asyncio.create_task(_probe_llm_available())


def _proxy_available():
    return PROXY_ENABLED


def _stems_available():
    return STEMS_ENABLED and _proxy_available()


def _whisper_runtime_available():
    if not WHISPER_ENABLED:
        return False
    return os.path.isfile(WHISPER_CPP_PATH) and os.path.isfile(MODEL_PATH)


def _llm_runtime_available():
    if not LLM_ENABLED:
        return False
    return _llm_available_cache


async def _probe_llm_available():
    global _llm_available_cache, _llm_checked_at
    if not LLM_ENABLED:
        _llm_available_cache = False
        _llm_checked_at = time.time()
        return False

    from tune_background_research import LLM_API_KEY, LLM_BASE_URL

    if not LLM_BASE_URL:
        _llm_available_cache = False
        _llm_checked_at = time.time()
        return False

    headers = {}
    if LLM_API_KEY:
        headers["Authorization"] = "Bearer " + LLM_API_KEY

    available = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(LLM_BASE_URL + "/models", headers=headers)
            available = response.status_code < 500
    except Exception:
        available = False

    _llm_available_cache = available
    _llm_checked_at = time.time()
    return available


async def _refresh_llm_health_if_stale():
    if time.time() - _llm_checked_at < LLM_HEALTH_CACHE_SECONDS:
        return _llm_runtime_available()
    return await _probe_llm_available()


def resolver_features():
    return {
        "proxy": _proxy_available(),
        "stems": _stems_available(),
        "whisper": _whisper_runtime_available(),
        "llm": _llm_runtime_available(),
    }


def require_resolver_feature(feature_name):
    features = resolver_features()
    if not features.get(feature_name):
        raise HTTPException(status_code=503, detail=f"{feature_name} is not available on this resolver")


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


async def maybe_require_auth(authorization):
    if not REQUIRE_AUTH:
        return None
    return await require_auth(authorization)


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


def prepare_ytdlp_cookies_path():
    """yt-dlp writes cookies back on exit; copy read-only mount to /tmp first."""
    if not YTDLP_COOKIES_PATH or not os.path.exists(YTDLP_COOKIES_PATH):
        return None
    shutil.copy2(YTDLP_COOKIES_PATH, YTDLP_COOKIES_WRITABLE)
    return YTDLP_COOKIES_WRITABLE


def build_ytdlp_cmd(video_id, stream_to_stdout=False):
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "-f",
        "ba/b",
    ]

    cookies_path = prepare_ytdlp_cookies_path()
    if cookies_path:
        cmd.extend(["--cookies", cookies_path])

    if stream_to_stdout:
        cmd.extend(["-o", "-"])
    else:
        cmd.append("-g")

    cmd.append("https://www.youtube.com/watch?v=" + video_id)
    return cmd


def ytdlp_error_hint(stderr_text):
    hint = stderr_text or "yt-dlp produced no audio output"
    if "Sign in to confirm" in hint or "LOGIN_REQUIRED" in hint:
        hint += " — export YouTube cookies to local-resolver/secrets/youtube-cookies.txt"
    elif (
        "Requested format is not available" in hint
        or "Only images are available" in hint
        or "Signature solving failed" in hint
    ):
        hint += (
            " — rebuild the resolver image (docker compose up --build); "
            "logged-in YouTube cookies need Deno + yt-dlp-ejs in the container"
        )
    return hint


def extract_youtube_video_id(raw_value):
    value = (raw_value or "").strip()
    if YOUTUBE_ID_RE.match(value):
        return value

    try:
        parsed = urlparse(value)
    except Exception:
        return None

    host = (parsed.hostname or "").lower()
    if host in {"youtu.be", "www.youtu.be"}:
        candidate = parsed.path.strip("/").split("/")[0]
        return candidate if YOUTUBE_ID_RE.match(candidate) else None

    if "youtube.com" not in host:
        return None

    query_id = parse_qs(parsed.query).get("v", [None])[0]
    if query_id and YOUTUBE_ID_RE.match(query_id):
        return query_id

    path_parts = [part for part in parsed.path.split("/") if part]
    for idx, part in enumerate(path_parts):
        if part in {"embed", "shorts", "live", "v"} and idx + 1 < len(path_parts):
            candidate = path_parts[idx + 1]
            return candidate if YOUTUBE_ID_RE.match(candidate) else None

    return None


async def stream_youtube_via_ytdlp(video_id):
    cmd = build_ytdlp_cmd(video_id, stream_to_stdout=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    first_chunk = await proc.stdout.read(8192)
    if not first_chunk:
        await proc.wait()
        stderr = (await proc.stderr.read()).decode("utf-8", errors="ignore").strip()[:500]
        return None, ytdlp_error_hint(stderr)

    async def body():
        yield first_chunk
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
                except asyncio.TimeoutError:
                    proc.kill()
                    await proc.wait()

    return StreamingResponse(
        body(),
        media_type="application/octet-stream",
        headers={"Cache-Control": "private, max-age=3600", "Accept-Ranges": "none"},
    ), None


async def fetch_youtube_audio_bytes(video_id):
    cmd = build_ytdlp_cmd(video_id, stream_to_stdout=True)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    stderr_text = stderr.decode("utf-8", errors="ignore").strip()[:500]

    if proc.returncode != 0 or not stdout:
        return None, None, ytdlp_error_hint(stderr_text)

    if len(stdout) > MAX_STREAM_BYTES:
        return None, None, "Media file too large"

    return stdout, "audio/mpeg", None


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


async def fetch_upstream_audio_bytes(target_url):
    headers = upstream_headers_for(target_url, None)
    async with httpx.AsyncClient(follow_redirects=True, timeout=None) as client:
        async with client.stream("GET", target_url, headers=headers) as upstream:
            if upstream.status_code not in (200, 206):
                raise HTTPException(status_code=upstream.status_code, detail="Upstream fetch failed")

            content_length = upstream.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > MAX_STREAM_BYTES:
                        raise HTTPException(status_code=413, detail="Media file too large")
                except ValueError:
                    pass

            chunks = bytearray()
            async for chunk in upstream.aiter_bytes():
                chunks.extend(chunk)
                if len(chunks) > MAX_STREAM_BYTES:
                    raise HTTPException(status_code=413, detail="Media file too large")

            return bytes(chunks), upstream.headers.get("content-type") or "application/octet-stream"


def _gpu_device_visible():
    return os.path.exists("/dev/dri")


def _whisper_backend_attempts():
    if WHISPER_BACKEND_PREFERENCE == "cpu":
        return ["cpu"]
    if WHISPER_BACKEND_PREFERENCE == "gpu":
        return ["gpu", "cpu"] if WHISPER_CPU_FALLBACK else ["gpu"]
    if _gpu_device_visible():
        return ["gpu", "cpu"] if WHISPER_CPU_FALLBACK else ["gpu"]
    return ["cpu"]


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _parse_timestamp_text(value):
    raw = str(value or "").strip().replace(",", ".")
    if not raw:
        return 0.0
    parts = raw.split(":")
    try:
        if len(parts) == 3:
            return (float(parts[0]) * 3600.0) + (float(parts[1]) * 60.0) + float(parts[2])
        if len(parts) == 2:
            return (float(parts[0]) * 60.0) + float(parts[1])
        return float(raw)
    except Exception:
        return 0.0


def _normalize_whisper_segments(output):
    rows = output.get("transcription") or []
    normalized = []
    for row in rows:
        text = str(row.get("text", "") or "").strip()
        offsets = row.get("offsets") or {}
        timestamps = row.get("timestamps") or {}
        tokens = row.get("tokens") or []

        start = None
        end = None
        if "from" in offsets or "to" in offsets:
            start = _safe_float(offsets.get("from", 0.0)) / 1000.0
            end = _safe_float(offsets.get("to", 0.0)) / 1000.0
        elif "from" in timestamps or "to" in timestamps:
            start = _parse_timestamp_text(timestamps.get("from", "0"))
            end = _parse_timestamp_text(timestamps.get("to", "0"))

        if start is None:
            start = 0.0
        if end is None:
            end = start

        words = []
        for token in tokens:
            token_text = str(token.get("text", "") or "").strip()
            if not token_text:
                continue
            if WHISPER_SPECIAL_TOKEN_RE.match(token_text):
                continue
            token_offsets = token.get("offsets") or {}
            token_timestamps = token.get("timestamps") or {}
            word_start = None
            word_end = None
            if "from" in token_offsets or "to" in token_offsets:
                word_start = _safe_float(token_offsets.get("from", 0.0)) / 1000.0
                word_end = _safe_float(token_offsets.get("to", 0.0)) / 1000.0
            elif "from" in token_timestamps or "to" in token_timestamps:
                word_start = _parse_timestamp_text(token_timestamps.get("from", "0"))
                word_end = _parse_timestamp_text(token_timestamps.get("to", "0"))
            if word_start is None:
                word_start = start
            if word_end is None:
                word_end = end
            words.append({
                "text": token_text,
                "start": float(max(0.0, word_start)),
                "end": float(max(float(word_start), word_end)),
            })

        normalized.append({
            "start": float(max(0.0, start)),
            "end": float(max(float(start), end)),
            "text": text,
            "words": words,
        })
    return normalized


def _clean_transcription_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _split_sentence_chunks(text):
    cleaned = _clean_transcription_text(text)
    if not cleaned:
        return []
    return [
        chunk.strip()
        for chunk in SENTENCE_SPLIT_RE.split(cleaned)
        if chunk.strip()
    ]


def _append_wrapped_words(lines, words):
    while len(words) > WHISPER_LYRICS_MAX_WORDS:
        lines.append(" ".join(words[:WHISPER_LYRICS_MAX_WORDS]))
        words = words[WHISPER_LYRICS_MAX_WORDS:]
    return words


def _format_transcribed_lyrics(segments, fallback_text=""):
    if not WHISPER_LYRICS_FORMAT:
        return _clean_transcription_text(fallback_text)

    lines = []
    current_words = []

    def flush_line():
        nonlocal current_words
        if current_words:
            current_words = _append_wrapped_words(lines, current_words)
            if current_words:
                lines.append(" ".join(current_words))
                current_words = []

    def add_blank_line():
        if lines and lines[-1] != "":
            lines.append("")

    previous_end = None
    usable_segments = [
        segment
        for segment in segments or []
        if _clean_transcription_text(segment.get("text", ""))
    ]

    for segment in usable_segments:
        start = _safe_float(segment.get("start", 0.0))
        end = _safe_float(segment.get("end", start))
        if previous_end is not None:
            pause = max(0.0, start - previous_end)
            if pause >= WHISPER_LYRICS_STANZA_PAUSE_SECONDS:
                flush_line()
                add_blank_line()
            elif pause >= WHISPER_LYRICS_LINE_PAUSE_SECONDS:
                flush_line()

        for chunk in _split_sentence_chunks(segment.get("text", "")):
            current_words.extend(chunk.split())
            if SENTENCE_END_RE.search(chunk) or len(current_words) >= WHISPER_LYRICS_MAX_WORDS:
                flush_line()

        previous_end = max(previous_end or 0.0, end)

    if not usable_segments:
        for chunk in _split_sentence_chunks(fallback_text):
            current_words.extend(chunk.split())
            flush_line()

    flush_line()
    return "\n".join(lines).strip()


async def _convert_audio_to_wav(input_path):
    wav_path = input_path + ".whisper.wav"
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ar",
        "16000",
        "-ac",
        "1",
        wav_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await proc.communicate()
    if proc.returncode != 0 or not os.path.exists(wav_path):
        detail = stderr.decode("utf-8", errors="ignore").strip()[:500]
        raise HTTPException(status_code=502, detail=detail or "Audio conversion failed")
    return wav_path


async def _run_whisper_cli(temp_audio_path, backend, request, whisper_options=None):
    env = os.environ.copy()
    options = whisper_options if isinstance(whisper_options, dict) else {}
    prompt = str(options.get("whisperPrompt") or options.get("prompt") or "").strip()
    language = str(options.get("whisperLanguage") or options.get("language") or WHISPER_LANGUAGE).strip()
    best_of = int(options.get("whisperBestOf") or WHISPER_CPP_BEST_OF)
    beam_size = int(options.get("whisperBeamSize") or WHISPER_CPP_BEAM_SIZE)
    cmd = [
        WHISPER_CPP_PATH,
        "-m",
        MODEL_PATH,
        "-f",
        temp_audio_path,
        "-oj",
        "-of",
        temp_audio_path,
        "--best-of",
        str(max(1, best_of)),
    ]
    if beam_size > 0:
        cmd.extend(["--beam-size", str(beam_size)])
    if language:
        cmd.extend(["-l", language])
    if prompt:
        cmd.extend(["--prompt", prompt[:800]])
    if WHISPER_WORD_TIMESTAMPS:
        cmd.append("-ojf")
    if WHISPER_CPP_NO_CONTEXT:
        cmd.append("--no-context")

    if backend == "cpu":
        env["GGML_VK_DISABLE"] = "1"
    else:
        env.pop("GGML_VK_DISABLE", None)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    communicate_task = asyncio.create_task(proc.communicate())

    try:
        while True:
            done, _ = await asyncio.wait({communicate_task}, timeout=0.5)
            if done:
                stdout, stderr = await communicate_task
                return (
                    proc.returncode or 0,
                    stdout.decode("utf-8", errors="ignore"),
                    stderr.decode("utf-8", errors="ignore"),
                    backend,
                )
            if await request.is_disconnected():
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                communicate_task.cancel()
                raise ClientDisconnected()
    finally:
        if not communicate_task.done():
            communicate_task.cancel()


async def forward_to_whisper(audio_bytes, filename, content_type, request):
    if not audio_bytes:
        return {"text": "", "segments": [], "language": "", "backend": "none"}
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    wav_path = None
    whisper_input_path = temp_audio_path
    temp_json_path = temp_audio_path + ".json"

    try:
        wav_path = await _convert_audio_to_wav(temp_audio_path)
        whisper_input_path = wav_path
        temp_json_path = whisper_input_path + ".json"

        result = None
        active_backend = "unknown"
        last_error = ""
        for backend in _whisper_backend_attempts():
            returncode, stdout_text, stderr_text, active_backend = await asyncio.wait_for(
                _run_whisper_cli(whisper_input_path, backend, request),
                timeout=WHISPER_TIMEOUT_SECONDS,
            )
            result = {
                "returncode": returncode,
                "stdout": stdout_text,
                "stderr": stderr_text,
            }
            if returncode == 0:
                break
            last_error = stderr_text or stdout_text or f"whisper.cpp {backend} attempt failed"

        if result is None or result["returncode"] != 0:
            raise HTTPException(status_code=502, detail=(last_error or "Transcription failed").strip()[:500])

        body = None
        if os.path.exists(temp_json_path):
            with open(temp_json_path, "r", encoding="utf-8") as handle:
                output = json.load(handle)
            segments = _normalize_whisper_segments(output)
            raw_text = " ".join(
                segment.get("text", "").strip()
                for segment in segments
                if segment.get("text", "").strip()
            )
            text = _format_transcribed_lyrics(segments, raw_text)
            body = {
                "text": text,
                "segments": segments,
                "language": "en",
                "backend": active_backend,
            }
        else:
            raw_text = result["stdout"].strip() if result["stdout"] else ""
            text = _format_transcribed_lyrics([], raw_text)
            body = {
                "text": text,
                "segments": [],
                "language": "en",
                "backend": active_backend,
            }

        if not body["text"]:
            raise HTTPException(status_code=502, detail="Transcription produced no lyrics")

        return body
    except ClientDisconnected as exc:
        raise HTTPException(status_code=499, detail="Transcription cancelled") from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Transcription timeout") from exc
    finally:
        try:
            os.unlink(temp_audio_path)
        except FileNotFoundError:
            pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except FileNotFoundError:
                pass
        try:
            os.unlink(temp_json_path)
        except FileNotFoundError:
            pass


class ClientDisconnected(Exception):
    pass


def _parse_subprocess_json(stdout_text):
    text = (stdout_text or "").strip()
    if not text:
        raise ValueError("empty stdout")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        marker = '{"segments"'
        start = text.find(marker)
        if start >= 0:
            return json.loads(text[start:])
        raise


async def _run_detect_chords(temp_audio_path, request):
    autochord_python = os.getenv("AUTOCHORD_VENV_PYTHON", "/opt/autochord-venv/bin/python")
    if not os.path.exists(autochord_python):
        raise HTTPException(
            status_code=502,
            detail=f"Chord detector runtime missing ({autochord_python})",
        )
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else ""
        )
    env["TF_CPP_MIN_LOG_LEVEL"] = "2"
    proc = await asyncio.create_subprocess_exec(
        autochord_python,
        "/app/detect_chords.py",
        temp_audio_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    communicate_task = asyncio.create_task(proc.communicate())

    try:
        while True:
            done, _ = await asyncio.wait({communicate_task}, timeout=0.5)
            if done:
                stdout, stderr = await communicate_task
                return (
                    proc.returncode or 0,
                    stdout.decode("utf-8", errors="ignore"),
                    stderr.decode("utf-8", errors="ignore"),
                )
            if await request.is_disconnected():
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                communicate_task.cancel()
                raise ClientDisconnected()
    finally:
        if not communicate_task.done():
            communicate_task.cancel()


async def detect_chords_from_path(temp_audio_path, request):
    returncode, stdout_text, stderr_text = await asyncio.wait_for(
        _run_detect_chords(temp_audio_path, request),
        timeout=AUTOCHORD_TIMEOUT_SECONDS,
    )
    if returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=(stderr_text or stdout_text or "Chord detection failed").strip()[:500],
        )
    try:
        return _parse_subprocess_json(stdout_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Chord detector returned invalid JSON") from exc


async def detect_chords_from_audio(audio_bytes, filename, request):
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    try:
        return await detect_chords_from_path(temp_audio_path, request)
    except ClientDisconnected as exc:
        raise HTTPException(status_code=499, detail="Chord discovery cancelled") from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Chord discovery timeout") from exc
    finally:
        try:
            os.unlink(temp_audio_path)
        except FileNotFoundError:
            pass


def _autochord_python_path():
    autochord_python = os.getenv("AUTOCHORD_VENV_PYTHON", "/opt/autochord-venv/bin/python")
    if not os.path.exists(autochord_python):
        raise HTTPException(
            status_code=502,
            detail=f"Chord detector runtime missing ({autochord_python})",
        )
    return autochord_python


async def _run_detect_melody(temp_audio_path, request, config_path=None):
    autochord_python = _autochord_python_path()
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else ""
        )
    command = [
        autochord_python,
        "/app/detect_melody.py",
        temp_audio_path,
    ]
    if config_path:
        command.append(config_path)
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    communicate_task = asyncio.create_task(proc.communicate())

    try:
        while True:
            done, _ = await asyncio.wait({communicate_task}, timeout=0.5)
            if done:
                stdout, stderr = await communicate_task
                return (
                    proc.returncode or 0,
                    stdout.decode("utf-8", errors="ignore"),
                    stderr.decode("utf-8", errors="ignore"),
                )
            if await request.is_disconnected():
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                communicate_task.cancel()
                raise ClientDisconnected()
    finally:
        if not communicate_task.done():
            communicate_task.cancel()


async def detect_melody_from_path(temp_audio_path, request, timing=None, processing=None):
    config_path = None
    try:
        config = {}
        if isinstance(timing, dict):
            config.update(timing)
        if isinstance(processing, dict):
            config.update(processing)
        if config:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
                json.dump(config, handle)
                config_path = handle.name
        returncode, stdout_text, stderr_text = await asyncio.wait_for(
            _run_detect_melody(temp_audio_path, request, config_path),
            timeout=AUTOCHORD_TIMEOUT_SECONDS,
        )
    finally:
        if config_path:
            try:
                os.unlink(config_path)
            except FileNotFoundError:
                pass
    if returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=(stderr_text or stdout_text or "Melody detection failed").strip()[:500],
        )
    try:
        return _parse_subprocess_json(stdout_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Melody detector returned invalid JSON") from exc


async def _run_detect_timing(temp_audio_path, request):
    autochord_python = _autochord_python_path()
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else ""
        )
    proc = await asyncio.create_subprocess_exec(
        autochord_python,
        "/app/detect_timing.py",
        temp_audio_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    communicate_task = asyncio.create_task(proc.communicate())

    try:
        while True:
            done, _ = await asyncio.wait({communicate_task}, timeout=0.5)
            if done:
                stdout, stderr = await communicate_task
                return (
                    proc.returncode or 0,
                    stdout.decode("utf-8", errors="ignore"),
                    stderr.decode("utf-8", errors="ignore"),
                )
            if await request.is_disconnected():
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                communicate_task.cancel()
                raise ClientDisconnected()
    finally:
        if not communicate_task.done():
            communicate_task.cancel()


async def detect_timing_from_path(temp_audio_path, request):
    returncode, stdout_text, stderr_text = await asyncio.wait_for(
        _run_detect_timing(temp_audio_path, request),
        timeout=AUTOCHORD_TIMEOUT_SECONDS,
    )
    if returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=(stderr_text or stdout_text or "Timing detection failed").strip()[:500],
        )
    try:
        return _parse_subprocess_json(stdout_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Timing detector returned invalid JSON") from exc


def _stem_cache_dir(cache_id):
    return os.path.join(STEM_CACHE_DIR, cache_id)


def _stem_cache_id(source_key, model_name):
    digest = hashlib.sha256((source_key + "|" + model_name).encode("utf-8")).hexdigest()
    return digest[:32]


def _stems_are_cached(cache_id, model_name=None):
    cache_dir = _stem_cache_dir(cache_id)
    if not os.path.isdir(cache_dir):
        return False
    metadata = _read_stem_cache_metadata(cache_dir)
    stems = _demucs_stems_for_model(model_name or metadata.get("model"))
    return all(os.path.isfile(os.path.join(cache_dir, stem + ".wav")) for stem in stems)


def _read_stem_cache_metadata(cache_dir):
    metadata_path = os.path.join(cache_dir, "metadata.json")
    if os.path.isfile(metadata_path):
        try:
            with open(metadata_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def _write_stem_cache_metadata(cache_dir, payload):
    metadata_path = os.path.join(cache_dir, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def _stem_progress_path(cache_dir):
    return os.path.join(cache_dir, "progress.json")


def _write_stem_progress(cache_dir, payload):
    os.makedirs(cache_dir, exist_ok=True)
    with open(_stem_progress_path(cache_dir), "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def _read_stem_progress(cache_dir):
    progress_path = _stem_progress_path(cache_dir)
    if not os.path.isfile(progress_path):
        return {}
    try:
        with open(progress_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _estimate_stem_job_seconds(audio_bytes):
    duration_guess = max(30.0, len(audio_bytes or b"") / 16000.0)
    return max(45.0, min(float(STEM_SEPARATION_TIMEOUT_SECONDS), duration_guess * STEM_SECONDS_PER_TRACK_SECOND))


def _build_pending_stem_response(cache_id, model_name):
    stems = {stem: "/stems/" + cache_id + "/" + stem for stem in _demucs_stems_for_model(model_name)}
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


def _build_stem_status_response(cache_id, model_name, cache_dir):
    if _stems_are_cached(cache_id):
        metadata = _read_stem_cache_metadata(cache_dir)
        return {
            "cacheId": cache_id,
            "stage": "complete",
            "progress": 100,
            "message": "Stems ready",
            "cached": True,
            "duration": float(metadata.get("duration") or 0),
        }
    progress = _read_stem_progress(cache_dir)
    if progress:
        return {
            "cacheId": cache_id,
            "stage": progress.get("stage") or "separating",
            "progress": int(progress.get("progress") or 0),
            "message": progress.get("message") or "Separating stems...",
            "cached": False,
            "duration": float(progress.get("duration") or 0),
            "elapsedSeconds": float(progress.get("elapsedSeconds") or 0),
            "estimatedSeconds": float(progress.get("estimatedSeconds") or 0),
        }
    return {
        "cacheId": cache_id,
        "stage": "queued",
        "progress": 0,
        "message": "Queued for stem separation",
        "cached": False,
    }


def _build_stem_response(cache_id, model_name, cache_dir):
    metadata = _read_stem_cache_metadata(cache_dir)
    stems = {stem: "/stems/" + cache_id + "/" + stem for stem in _demucs_stems_for_model(model_name or metadata.get("model"))}
    return {
        "cacheId": cache_id,
        "model": model_name,
        "samplerate": int(metadata.get("samplerate") or 0),
        "duration": float(metadata.get("duration") or 0),
        "backend": metadata.get("backend") or "",
        "stems": stems,
        "cached": True,
    }


async def _run_separate_stems(temp_audio_path, output_dir, request):
    autochord_python = _autochord_python_path()
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else ""
        )
    command = [
        autochord_python,
        "/app/separate_stems.py",
        temp_audio_path,
        output_dir,
    ]
    async with _get_stem_job_semaphore():
        return await _run_subprocess_with_disconnect(command, env, request)


async def _run_subprocess_with_disconnect(command, env, request):
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    communicate_task = asyncio.create_task(proc.communicate())

    try:
        while True:
            done, _ = await asyncio.wait({communicate_task}, timeout=0.5)
            if done:
                stdout, stderr = await communicate_task
                return (
                    proc.returncode or 0,
                    stdout.decode("utf-8", errors="ignore"),
                    stderr.decode("utf-8", errors="ignore"),
                )
            # `request` is None for detached background jobs (e.g. stem
            # separation), which must keep running after the originating HTTP
            # request has returned its "pending" response and disconnected.
            if request is not None and await request.is_disconnected():
                if proc.returncode is None:
                    proc.terminate()
                    try:
                        await asyncio.wait_for(proc.wait(), timeout=5)
                    except asyncio.TimeoutError:
                        proc.kill()
                        await proc.wait()
                communicate_task.cancel()
                raise ClientDisconnected()
    finally:
        if not communicate_task.done():
            communicate_task.cancel()


async def separate_stems_from_audio(audio_bytes, filename, source_key, request):
    model_name = os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    cache_id = _stem_cache_id(source_key, model_name)
    cache_dir = _stem_cache_dir(cache_id)

    if _stems_are_cached(cache_id):
        return _build_stem_response(cache_id, model_name, cache_dir)

    inflight_lock = _get_stem_inflight_lock(cache_id)
    existing_task = _stem_background_tasks.get(cache_id)
    if existing_task and not existing_task.done():
        return _build_pending_stem_response(cache_id, model_name)

    async def run_job():
        try:
            async with inflight_lock:
                if _stems_are_cached(cache_id):
                    return
                # Detach from `request`: this job outlives the HTTP request that
                # kicked it off (which returns a "pending" response immediately),
                # so disconnect monitoring must not cancel the separation.
                await _separate_stems_uncached(
                    audio_bytes, filename, model_name, cache_id, cache_dir, None
                )
        except Exception as exc:
            _write_stem_progress(cache_dir, {
                "stage": "error",
                "progress": 0,
                "message": str(exc)[:200],
            })
            raise
        finally:
            _stem_background_tasks.pop(cache_id, None)
            _stem_inflight_locks.pop(cache_id, None)

    _stem_background_tasks[cache_id] = asyncio.create_task(run_job())
    return _build_pending_stem_response(cache_id, model_name)


async def _separate_stems_uncached(audio_bytes, filename, model_name, cache_id, cache_dir, request):
    os.makedirs(cache_dir, exist_ok=True)
    estimated_seconds = _estimate_stem_job_seconds(audio_bytes)
    started_at = time.time()
    _write_stem_progress(cache_dir, {
        "stage": "preparing",
        "progress": 5,
        "message": "Preparing audio...",
        "startedAt": started_at,
        "estimatedSeconds": estimated_seconds,
        "elapsedSeconds": 0,
    })

    async def update_progress_loop():
        while True:
            await asyncio.sleep(2)
            if _stems_are_cached(cache_id):
                return
            elapsed = max(0.0, time.time() - started_at)
            ratio = min(0.95, elapsed / max(1.0, estimated_seconds))
            progress = int(10 + ratio * 85)
            _write_stem_progress(cache_dir, {
                "stage": "separating",
                "progress": progress,
                "message": "Separating stems...",
                "startedAt": started_at,
                "estimatedSeconds": estimated_seconds,
                "elapsedSeconds": elapsed,
            })

    progress_task = asyncio.create_task(update_progress_loop())
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    wav_path = None
    try:
        wav_path = await _convert_audio_to_wav(temp_audio_path)
        returncode, stdout_text, stderr_text = await asyncio.wait_for(
            _run_separate_stems(wav_path, cache_dir, request),
            timeout=STEM_SEPARATION_TIMEOUT_SECONDS,
        )
        if returncode != 0:
            raise HTTPException(
                status_code=502,
                detail=(stderr_text or stdout_text or "Stem separation failed").strip()[:500],
            )
        result = _parse_subprocess_json(stdout_text)
        _write_stem_cache_metadata(cache_dir, {
            "samplerate": result.get("samplerate") or 0,
            "duration": result.get("duration") or 0,
            "backend": result.get("backend") or "",
            "model": result.get("model") or model_name,
        })
        _write_stem_progress(cache_dir, {
            "stage": "complete",
            "progress": 100,
            "message": "Stems ready",
            "startedAt": started_at,
            "estimatedSeconds": estimated_seconds,
            "elapsedSeconds": max(0.0, time.time() - started_at),
            "duration": float(result.get("duration") or 0),
        })
        return _build_stem_response(cache_id, model_name, cache_dir)
    except ClientDisconnected as exc:
        raise HTTPException(status_code=499, detail="Stem separation cancelled") from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Stem separation timeout") from exc
    finally:
        progress_task.cancel()
        try:
            os.unlink(temp_audio_path)
        except FileNotFoundError:
            pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except FileNotFoundError:
                pass


async def _transcribe_from_wav_path(wav_path, request, require_text=True, whisper_options=None, format_as_lyrics=True):
    temp_json_path = wav_path + ".json"
    result = None
    active_backend = "unknown"
    last_error = ""

    try:
        for backend in _whisper_backend_attempts():
            returncode, stdout_text, stderr_text, active_backend = await asyncio.wait_for(
                _run_whisper_cli(wav_path, backend, request, whisper_options),
                timeout=WHISPER_TIMEOUT_SECONDS,
            )
            result = {
                "returncode": returncode,
                "stdout": stdout_text,
                "stderr": stderr_text,
            }
            if returncode == 0:
                break
            last_error = stderr_text or stdout_text or f"whisper.cpp {backend} attempt failed"

        if result is None or result["returncode"] != 0:
            raise HTTPException(status_code=502, detail=(last_error or "Transcription failed").strip()[:500])

        body = None
        if os.path.exists(temp_json_path):
            with open(temp_json_path, "r", encoding="utf-8") as handle:
                output = json.load(handle)
            segments = _normalize_whisper_segments(output)
            raw_text = " ".join(
                segment.get("text", "").strip()
                for segment in segments
                if segment.get("text", "").strip()
            )
            text = _format_transcribed_lyrics(segments, raw_text) if format_as_lyrics else raw_text
            body = {
                "text": text,
                "segments": segments,
                "language": "en",
                "backend": active_backend,
            }
        else:
            raw_text = result["stdout"].strip() if result["stdout"] else ""
            text = _format_transcribed_lyrics([], raw_text) if format_as_lyrics else raw_text
            body = {
                "text": text,
                "segments": [],
                "language": "en",
                "backend": active_backend,
            }

        if require_text and not body["text"]:
            raise HTTPException(status_code=502, detail="Transcription produced no lyrics")

        return body
    finally:
        try:
            os.unlink(temp_json_path)
        except FileNotFoundError:
            pass


def _empty_analysis_part(part_name):
    if part_name == "lyrics":
        return {"text": "", "segments": [], "language": "", "backend": "none", "error": ""}
    if part_name == "chords":
        return {"segments": [], "beatTimes": [], "tempo": 0, "duration": 0, "backend": "none", "error": ""}
    if part_name == "timing":
        return {
            "beatTimes": [],
            "downbeatTimes": [],
            "tempo": 0,
            "meter": "",
            "beatsPerBar": 0,
            "meterChanges": [],
            "detectedKey": "",
            "detectedMeter": "",
            "duration": 0,
            "backend": "none",
            "error": "",
        }
    return {"notes": [], "duration": 0, "backend": "none", "error": ""}


def _analysis_error_message(exc):
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return str(exc).strip()[:500] or "Analysis step failed"


def _parse_processing_config(raw):
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _fallback_analysis_audio_paths(wav_path):
    return {
        "timing": wav_path,
        "lyrics": wav_path,
        "chords": wav_path,
        "melody": wav_path,
        "stem_dir": None,
        "filtered_paths": [],
    }


async def _run_prepare_analysis_filters(wav_path, processing, request):
    """Run stem separation + per-task stem mixing in the autochord venv.

    librosa and demucs only exist in the venv, so this must run as a subprocess
    rather than in the (system python) server process.
    """
    autochord_python = _autochord_python_path()
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else ""
        )
    command = [
        autochord_python,
        "/app/audio_analysis_filters.py",
        wav_path,
        json.dumps(processing or {}),
    ]
    async with _get_stem_job_semaphore():
        return await _run_subprocess_with_disconnect(command, env, request)


async def prepare_analysis_audio_paths_async(wav_path, processing, request):
    try:
        returncode, stdout_text, _stderr_text = await asyncio.wait_for(
            _run_prepare_analysis_filters(wav_path, processing, request),
            timeout=STEM_SEPARATION_TIMEOUT_SECONDS,
        )
    except ClientDisconnected:
        raise
    except Exception:
        return _fallback_analysis_audio_paths(wav_path)

    if returncode != 0:
        return _fallback_analysis_audio_paths(wav_path)

    parsed = None
    for line in reversed((stdout_text or "").splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                parsed = json.loads(line)
                break
            except Exception:
                continue
    if not isinstance(parsed, dict) or parsed.get("error"):
        return _fallback_analysis_audio_paths(wav_path)
    return parsed


async def analyze_media_from_audio(audio_bytes, filename, request, processing=None, on_progress=None):
    from audio_analysis_filters import cleanup_analysis_audio_paths

    async def report(stage, message, progress):
        if on_progress:
            result = on_progress(stage, message, progress)
            if asyncio.iscoroutine(result):
                await result

    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"

    await report("prepare", "Preparing audio...", 5)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    wav_path = None
    audio_paths = None
    try:
        await report("convert", "Converting audio...", 10)
        wav_path = await _convert_audio_to_wav(temp_audio_path)

        await report("filters", "Preparing audio filters...", 12)
        audio_paths = await prepare_analysis_audio_paths_async(wav_path, processing, request)
        melody_processing = dict(processing or {})
        if audio_paths.get("filtered_paths"):
            melody_processing["sourceSeparation"] = "off"

        timing = _empty_analysis_part("timing")
        try:
            await report("timing", "Detecting timing...", 15)
            timing = await detect_timing_from_path(wav_path, request)
            timing["error"] = ""
            await report("timing", "Timing detected", 25)
        except Exception as exc:
            timing["error"] = _analysis_error_message(exc)

        lyrics_task = asyncio.create_task(
            _transcribe_from_wav_path(
                audio_paths.get("lyrics") or wav_path,
                request,
                require_text=False,
                whisper_options=processing,
            )
        )
        chords_task = asyncio.create_task(
            detect_chords_from_path(audio_paths.get("chords") or wav_path, request)
        )
        melody_task = asyncio.create_task(
            detect_melody_from_path(
                audio_paths.get("melody") or wav_path,
                request,
                timing,
                melody_processing,
            )
        )
        task_meta = {
            lyrics_task: ("lyrics", "Transcribing lyrics", 40),
            chords_task: ("chords", "Detecting chords", 65),
            melody_task: ("melody", "Extracting melody", 85),
        }
        pending = set(task_meta.keys())
        results_by_task = {}

        async def wait_for_parallel_tasks():
            while pending:
                done, still_pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                pending.clear()
                pending.update(still_pending)
                for task in done:
                    stage, label, progress = task_meta[task]
                    await report(stage, label + "...", progress)
                    exc = task.exception()
                    if exc is not None:
                        results_by_task[task] = exc
                    else:
                        results_by_task[task] = task.result()
                    await report(stage, label + " complete", min(progress + 8, 92))

        await asyncio.wait_for(wait_for_parallel_tasks(), timeout=ANALYZE_MEDIA_TIMEOUT_SECONDS)

        results = [results_by_task.get(lyrics_task), results_by_task.get(chords_task), results_by_task.get(melody_task)]

        lyrics = _empty_analysis_part("lyrics")
        chords = _empty_analysis_part("chords")
        melody = _empty_analysis_part("melody")

        if isinstance(results[0], Exception):
            lyrics["error"] = _analysis_error_message(results[0])
        else:
            lyrics = results[0]
            lyrics["error"] = ""

        if isinstance(results[1], Exception):
            chords["error"] = _analysis_error_message(results[1])
        else:
            chords = results[1]
            chords["error"] = ""

        if isinstance(results[2], Exception):
            melody["error"] = _analysis_error_message(results[2])
        else:
            melody = results[2]
            melody["error"] = ""

        shared_beat_times = timing.get("beatTimes") if isinstance(timing, dict) else None
        if shared_beat_times and isinstance(chords, dict):
            chords["beatTimes"] = shared_beat_times
            if timing.get("tempo"):
                chords["tempo"] = timing.get("tempo")

        if isinstance(chords, dict) and isinstance(melody, dict) and chords.get("segments"):
            try:
                from chord_processing import post_process_chords

                detected_key = melody.get("detectedKey") or melody.get("key") or ""
                chords["segments"] = post_process_chords(
                    chords.get("segments") or [],
                    key_text=detected_key,
                    constrain_to_key=True,
                    beat_times=shared_beat_times or chords.get("beatTimes") or [],
                )
            except Exception:
                pass

        if not lyrics.get("text") and not chords.get("segments") and not melody.get("notes"):
            detail = lyrics.get("error") or chords.get("error") or melody.get("error") or "Media analysis produced no results"
            raise HTTPException(status_code=502, detail=detail)

        await report("finalize", "Finalizing analysis...", 98)
        body = {
            "lyrics": lyrics,
            "chords": chords,
            "melody": melody,
            "timing": timing,
        }
        await report("complete", "Analysis complete", 100)
        return body
    except ClientDisconnected as exc:
        raise HTTPException(status_code=499, detail="Media analysis cancelled") from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Media analysis timeout") from exc
    finally:
        if audio_paths:
            try:
                cleanup_analysis_audio_paths(audio_paths)
            except Exception:
                pass
        try:
            os.unlink(temp_audio_path)
        except FileNotFoundError:
            pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except FileNotFoundError:
                pass


async def stream_analyze_media_events(audio_bytes, filename, request, processing_config):
    queue = asyncio.Queue()

    async def on_progress(stage, message, progress):
        await queue.put({
            "type": "progress",
            "stage": stage,
            "message": message,
            "progress": progress,
        })

    async def run():
        try:
            body = await analyze_media_from_audio(
                audio_bytes,
                filename,
                request,
                processing_config,
                on_progress=on_progress,
            )
            await queue.put({"type": "result", "body": body})
        except HTTPException as exc:
            await queue.put({
                "type": "error",
                "message": str(exc.detail),
                "status": exc.status_code,
            })
        except Exception as exc:
            await queue.put({
                "type": "error",
                "message": str(exc),
                "status": 500,
            })
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"
    finally:
        await task


async def _resolve_audio_payload(request, file, payload=None):
    audio_bytes = b""
    filename = "audio.bin"
    content_type = "application/octet-stream"
    processing = {}

    if file is not None:
        audio_bytes = await file.read()
        filename = file.filename or filename
        content_type = file.content_type or content_type
        return audio_bytes, filename, content_type, processing

    if payload is None:
        payload = await request.json()
    processing = _parse_processing_config(payload.get("processing"))
    source_url = str(payload.get("sourceUrl") or "").strip()
    source_type = str(payload.get("sourceType") or "").strip().lower()
    if not source_url:
        raise HTTPException(status_code=400, detail="Missing sourceUrl")

    if source_type == "youtube" or "youtu" in source_url.lower():
        video_id = extract_youtube_video_id(source_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        audio_bytes, content_type, error = await fetch_youtube_audio_bytes(video_id)
        if error:
            raise HTTPException(
                status_code=502,
                detail=("Could not resolve YouTube audio stream" + (": " + error if error else "")).strip(),
            )
        filename = video_id + ".mp3"
    else:
        validated, error = validate_target_url(source_url)
        if error:
            raise HTTPException(status_code=400, detail=error)
        audio_bytes, content_type = await fetch_upstream_audio_bytes(validated)
        parsed = urlparse(validated)
        filename = os.path.basename(parsed.path) or filename

    return audio_bytes, filename, content_type, processing


@app.options("/{path:path}")
async def options_handler(path: str, request: Request):
    return JSONResponse(content={}, headers=cors_headers(request.headers.get("origin")))


@app.get("/")
async def root(request: Request):
    return JSONResponse(
        {
            "service": "abc2book-local-resolver",
            "health": "/health",
            "endpoints": ["/youtube/:videoId/audio", "/proxy-audio?url=...", "/transcribe", "/detect-playback-region", "/voice-command", "/detect-chords", "/analyze-media", "/search-lyrics", "/search-chords", "/search-notation", "/research-tune-background", "/separate-stems", "/stems/:cacheId/:stem", "/midi2xml"],
            "auth": "optional (set REQUIRE_AUTH=true to require Google login)",
        },
        headers=cors_headers(request.headers.get("origin")),
    )


@app.get("/health")
async def health(request: Request, authorization: str | None = Header(default=None)):
    await _refresh_llm_health_if_stale()
    body = {
        "ok": True,
        "requireAuth": REQUIRE_AUTH,
        "demucsModel": os.getenv("MELODY_DEMUCS_MODEL", "htdemucs"),
        "demucsStems": list(_demucs_stems_for_model()),
        "features": resolver_features(),
    }
    if REQUIRE_AUTH:
        token = get_bearer_token(authorization)
        if not token:
            body["authorized"] = False
            body["authReason"] = "login_required"
        else:
            verified = await verify_google_access_token(token)
            if not verified:
                body["authorized"] = False
                body["authReason"] = "invalid_token"
            elif not verified["allowed"]:
                body["authorized"] = False
                body["authReason"] = "email_not_authorized"
            else:
                body["authorized"] = True
    return JSONResponse(body, headers=cors_headers(request.headers.get("origin")))


@app.get("/proxy-audio")
async def proxy_audio(
    request: Request,
    url: str = Query(...),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        require_resolver_feature("proxy")
        track_resolver_usage('proxy-audio')
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
        await maybe_require_auth(authorization)
        require_resolver_feature("proxy")
        track_resolver_usage('youtube-audio')
        response, error = await stream_youtube_via_ytdlp(video_id)
        if error:
            status = 400 if error == "Invalid YouTube video id" else 502
            return json_error(status, "Could not resolve YouTube audio stream", origin, error)
        response.headers.update(cors_headers(origin))
        return response
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/detect-chords")
async def detect_chords(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('detect-chords')

        audio_bytes = b""
        filename = "audio.bin"
        content_type = "application/octet-stream"

        if file is not None:
            audio_bytes = await file.read()
            filename = file.filename or filename
            content_type = file.content_type or content_type
        else:
            payload = await request.json()
            source_url = str(payload.get("sourceUrl") or "").strip()
            source_type = str(payload.get("sourceType") or "").strip().lower()
            if not source_url:
                return json_error(400, "Missing sourceUrl", origin)

            if source_type == "youtube" or "youtu" in source_url.lower():
                video_id = extract_youtube_video_id(source_url)
                if not video_id:
                    return json_error(400, "Invalid YouTube URL", origin)
                audio_bytes, content_type, error = await fetch_youtube_audio_bytes(video_id)
                if error:
                    return json_error(502, "Could not resolve YouTube audio stream", origin, error)
                filename = video_id + ".mp3"
            else:
                validated, error = validate_target_url(source_url)
                if error:
                    return json_error(400, error, origin)
                audio_bytes, content_type = await fetch_upstream_audio_bytes(validated)
                parsed = urlparse(validated)
                filename = os.path.basename(parsed.path) or filename

        if not audio_bytes:
            return JSONResponse(
                {"segments": [], "beatTimes": [], "tempo": 0, "duration": 0, "backend": "none"},
                headers=cors_headers(origin),
            )

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        body = await detect_chords_from_audio(audio_bytes, filename, request)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/analyze-media")
async def analyze_media(
    request: Request,
    file: UploadFile | None = File(default=None),
    processing: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('analyze-media')

        try:
            if file is not None:
                audio_bytes = await file.read()
                filename = file.filename or "audio.bin"
                processing_config = _parse_processing_config(processing)
            else:
                payload = await request.json()
                audio_bytes, filename, _content_type, processing_config = await _resolve_audio_payload(
                    request, file, payload
                )
        except HTTPException as exc:
            return json_error(exc.status_code, str(exc.detail), origin)

        if not audio_bytes:
            return JSONResponse(
                {
                    "lyrics": _empty_analysis_part("lyrics"),
                    "chords": _empty_analysis_part("chords"),
                    "melody": _empty_analysis_part("melody"),
                },
                headers=cors_headers(origin),
            )

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept
        if wants_stream:
            async def body():
                async for line in stream_analyze_media_events(
                    audio_bytes, filename, request, processing_config
                ):
                    yield line.encode("utf-8")

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(body(), media_type="application/x-ndjson", headers=headers)

        body = await analyze_media_from_audio(audio_bytes, filename, request, processing_config)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/transcribe")
async def transcribe(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        require_resolver_feature("whisper")
        track_resolver_usage('transcribe')

        audio_bytes = b""
        filename = "audio.bin"
        content_type = "application/octet-stream"

        if file is not None:
            audio_bytes = await file.read()
            filename = file.filename or filename
            content_type = file.content_type or content_type
        else:
            payload = await request.json()
            source_url = str(payload.get("sourceUrl") or "").strip()
            source_type = str(payload.get("sourceType") or "").strip().lower()
            if not source_url:
                return json_error(400, "Missing sourceUrl", origin)

            if source_type == "youtube" or "youtu" in source_url.lower():
                video_id = extract_youtube_video_id(source_url)
                if not video_id:
                    return json_error(400, "Invalid YouTube URL", origin)
                audio_bytes, content_type, error = await fetch_youtube_audio_bytes(video_id)
                if error:
                    return json_error(502, "Could not resolve YouTube audio stream", origin, error)
                filename = video_id + ".mp3"
            else:
                validated, error = validate_target_url(source_url)
                if error:
                    return json_error(400, error, origin)
                audio_bytes, content_type = await fetch_upstream_audio_bytes(validated)
                parsed = urlparse(validated)
                filename = os.path.basename(parsed.path) or filename

        if not audio_bytes:
            return JSONResponse(
                {"text": "", "segments": [], "language": "", "backend": "none"},
                headers=cors_headers(origin),
            )

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        body = await forward_to_whisper(audio_bytes, filename, content_type, request)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


async def _transcribe_wav_for_playback_scan(wav_path, request):
    return await _transcribe_from_wav_path(
        wav_path,
        request,
        require_text=False,
        whisper_options=PLAYBACK_SCAN_WHISPER_OPTIONS,
        format_as_lyrics=False,
    )


async def detect_playback_region_from_audio(audio_bytes, filename, request, on_progress=None):
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"
    temp_audio_path = None
    wav_path = None

    async def emit(stage, message, progress):
        if callable(on_progress):
            await on_progress(stage, message, progress)

    try:
        await emit("resolve", "Preparing audio...", 0.05)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        wav_path = await _convert_audio_to_wav(temp_audio_path)
        return await detect_playback_region_from_wav(
            wav_path,
            request,
            _transcribe_wav_for_playback_scan,
            on_progress=emit,
        )
    finally:
        if temp_audio_path:
            try:
                os.unlink(temp_audio_path)
            except FileNotFoundError:
                pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except FileNotFoundError:
                pass
            temp_json_path = wav_path + ".json"
            try:
                os.unlink(temp_json_path)
            except FileNotFoundError:
                pass


async def stream_playback_region_detect_events(audio_bytes, filename, request):
    queue = asyncio.Queue()

    async def on_progress(stage, message, progress):
        await queue.put({
            "type": "progress",
            "stage": stage,
            "message": message,
            "progress": progress,
        })

    async def run():
        try:
            body = await detect_playback_region_from_audio(
                audio_bytes,
                filename,
                request,
                on_progress=on_progress,
            )
            await queue.put({"type": "result", "body": body})
        except HTTPException as exc:
            await queue.put({
                "type": "error",
                "message": str(exc.detail),
                "status": exc.status_code,
            })
        except Exception as exc:
            await queue.put({
                "type": "error",
                "message": str(exc),
                "status": 500,
            })
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"
    finally:
        await task


@app.post("/detect-playback-region")
async def detect_playback_region_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        require_resolver_feature("whisper")
        track_resolver_usage("detect-playback-region")

        audio_bytes, filename, _content_type, _processing = await _resolve_audio_payload(
            request,
            None,
        )
        if not audio_bytes:
            return JSONResponse(
                {
                    "startAt": 0,
                    "endAt": 0,
                    "duration": 0,
                    "confidence": 0,
                    "method": "none",
                    "backend": "none",
                },
                headers=cors_headers(origin),
            )

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept
        if wants_stream:
            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(
                stream_playback_region_detect_events(audio_bytes, filename, request),
                media_type="application/x-ndjson",
                headers=headers,
            )

        body = await detect_playback_region_from_audio(audio_bytes, filename, request)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


async def _process_voice_command_audio(audio_bytes, filename, books, tags, request):
    total_started = time.monotonic()
    transcribe_started = time.monotonic()
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"
    temp_audio_path = None
    wav_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        wav_path = await _convert_audio_to_wav(temp_audio_path)
        transcription = await _transcribe_from_wav_path(
            wav_path,
            request,
            require_text=False,
            whisper_options=VOICE_WHISPER_OPTIONS,
            format_as_lyrics=False,
        )
        transcribe_ms = int((time.monotonic() - transcribe_started) * 1000)
        transcript = str(transcription.get("text") or "").strip()
        if not transcript:
            result = _empty_intent("", "none")
            result["timing"] = {
                "transcribeMs": transcribe_ms,
                "parseMs": 0,
                "totalMs": int((time.monotonic() - total_started) * 1000),
            }
            return result

        parse_started = time.monotonic()
        try:
            intent = await parse_voice_intent(transcript, books, tags)
        except Exception as exc:
            intent = _empty_intent(transcript, "llm")
            intent["error"] = str(exc)[:200]
        parse_ms = int((time.monotonic() - parse_started) * 1000)
        intent["timing"] = {
            "transcribeMs": transcribe_ms,
            "parseMs": parse_ms,
            "totalMs": int((time.monotonic() - total_started) * 1000),
        }
        return intent
    finally:
        if temp_audio_path:
            try:
                os.unlink(temp_audio_path)
            except FileNotFoundError:
                pass
        if wav_path:
            try:
                os.unlink(wav_path)
            except FileNotFoundError:
                pass
            temp_json_path = wav_path + ".json"
            try:
                os.unlink(temp_json_path)
            except FileNotFoundError:
                pass


@app.post("/voice-command")
async def voice_command_endpoint(
    request: Request,
    file: UploadFile = File(...),
    books: str = Form(default="[]"),
    tags: str = Form(default="[]"),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        require_resolver_feature("whisper")
        track_resolver_usage("voice-command")

        audio_bytes = await file.read()
        if not audio_bytes:
            return json_error(400, "Missing audio file", origin)

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        try:
            book_list = parse_catalog_json(books, "books")
            tag_list = parse_catalog_json(tags, "tags")
        except ValueError as exc:
            return json_error(400, str(exc), origin)

        filename = file.filename or "voice-command.webm"
        body = await _process_voice_command_audio(
            audio_bytes,
            filename,
            book_list,
            tag_list,
            request,
        )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/search-lyrics")
async def search_lyrics_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('search-lyrics')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        page_url = str(payload.get("url") or "").strip()

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept

        if wants_stream:
            async def stream_events():
                queue = asyncio.Queue()

                async def on_progress(stage, message, progress):
                    await queue.put({
                        "type": "progress",
                        "stage": stage,
                        "message": message,
                        "progress": progress,
                    })

                async def run():
                    try:
                        if page_url:
                            body = await fetch_lyrics_url(page_url, on_progress=on_progress)
                        else:
                            body = await search_lyrics(title, artist, on_progress=on_progress)
                        await queue.put({"type": "result", "body": body})
                    except ValueError as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc),
                            "status": 400,
                        })
                    except HTTPException as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc.detail),
                            "status": exc.status_code,
                        })
                    except Exception as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc),
                            "status": 500,
                        })
                    finally:
                        await queue.put(None)

                task = asyncio.create_task(run())
                try:
                    while True:
                        item = await queue.get()
                        if item is None:
                            break
                        yield json.dumps(item) + "\n"
                finally:
                    await task

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(stream_events(), media_type="application/x-ndjson", headers=headers)

        if page_url:
            body = await fetch_lyrics_url(page_url)
        else:
            body = await search_lyrics(title, artist)

        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/search-chords")
async def search_chords_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('search-chords')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        page_url = str(payload.get("url") or "").strip()

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept

        if wants_stream:
            async def stream_events():
                queue = asyncio.Queue()

                async def on_progress(stage, message, progress):
                    await queue.put({
                        "type": "progress",
                        "stage": stage,
                        "message": message,
                        "progress": progress,
                    })

                async def run():
                    try:
                        if page_url:
                            body = await fetch_chords_url(page_url, on_progress=on_progress)
                        else:
                            body = await search_chords(title, artist, on_progress=on_progress)
                        await queue.put({"type": "result", "body": body})
                    except ValueError as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc),
                            "status": 400,
                        })
                    except HTTPException as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc.detail),
                            "status": exc.status_code,
                        })
                    except Exception as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc),
                            "status": 500,
                        })
                    finally:
                        await queue.put(None)

                task = asyncio.create_task(run())
                try:
                    while True:
                        item = await queue.get()
                        if item is None:
                            break
                        yield json.dumps(item) + "\n"
                finally:
                    await task

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(stream_events(), media_type="application/x-ndjson", headers=headers)

        if page_url:
            body = await fetch_chords_url(page_url)
        else:
            body = await search_chords(title, artist)

        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/search-notation")
async def search_notation_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('search-notation')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        song_type = str(payload.get("songType") or "instrumental").strip()

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept

        if wants_stream:
            async def stream_events():
                queue = asyncio.Queue()

                async def on_progress(stage, message, progress):
                    await queue.put({
                        "type": "progress",
                        "stage": stage,
                        "message": message,
                        "progress": progress,
                    })

                async def run():
                    try:
                        body = await search_notation(
                            title,
                            artist,
                            song_type=song_type,
                            on_progress=on_progress,
                        )
                        await queue.put({"type": "result", "body": body})
                    except ValueError as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc),
                            "status": 400,
                        })
                    except HTTPException as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc.detail),
                            "status": exc.status_code,
                        })
                    except Exception as exc:
                        await queue.put({
                            "type": "error",
                            "message": str(exc),
                            "status": 500,
                        })
                    finally:
                        await queue.put(None)

                task = asyncio.create_task(run())
                try:
                    while True:
                        item = await queue.get()
                        if item is None:
                            break
                        yield json.dumps(item) + "\n"
                finally:
                    await task

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(stream_events(), media_type="application/x-ndjson", headers=headers)

        body = await search_notation(title, artist, song_type=song_type)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


async def stream_tune_background_research_events(title, artist, lyrics=""):
    queue = asyncio.Queue()

    async def on_progress(stage, message, progress, elapsed_ms=None):
        await queue.put({
            "type": "progress",
            "stage": stage,
            "message": message,
            "progress": progress,
            "elapsedMs": elapsed_ms,
        })

    async def run():
        try:
            body = await research_tune_background(title, artist, lyrics, on_progress=on_progress)
            await queue.put({"type": "result", "body": body})
        except ValueError as exc:
            await queue.put({
                "type": "error",
                "message": str(exc),
                "status": 400,
            })
        except HTTPException as exc:
            await queue.put({
                "type": "error",
                "message": str(exc.detail),
                "status": exc.status_code,
            })
        except Exception as exc:
            await queue.put({
                "type": "error",
                "message": str(exc),
                "status": 500,
            })
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            yield json.dumps(item) + "\n"
    finally:
        await task


@app.post("/research-tune-background")
async def research_tune_background_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        require_resolver_feature("llm")
        track_resolver_usage('research-tune-background')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        lyrics = str(payload.get("lyrics") or "")

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept
        if wants_stream:
            async def body():
                async for line in stream_tune_background_research_events(title, artist, lyrics):
                    yield line.encode("utf-8")

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(body(), media_type="application/x-ndjson", headers=headers)

        body = await research_tune_background(title, artist, lyrics)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


async def convert_midi_to_musicxml(midi_bytes: bytes, filename: str) -> str:
    def _convert():
        from music21 import converter

        score = converter.parseData(midi_bytes, quarterLengthDivisors=(4, 6))
        with tempfile.NamedTemporaryFile(mode="w+", suffix=".musicxml", delete=False) as temp_file:
            temp_path = temp_file.name
        try:
            score.write("musicxml", fp=temp_path)
            musicxml_path = temp_path + ".musicxml"
            with open(musicxml_path, "r", encoding="utf-8") as handle:
                return handle.read()
        finally:
            for path in (temp_path, temp_path + ".musicxml"):
                try:
                    os.remove(path)
                except FileNotFoundError:
                    pass

    return await asyncio.to_thread(_convert)


@app.post("/separate-stems")
async def separate_stems(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        require_resolver_feature("stems")
        track_resolver_usage('separate-stems')

        if file is not None:
            audio_bytes = await file.read()
            filename = file.filename or "audio.bin"
            source_key = "upload:" + hashlib.sha256(audio_bytes).hexdigest()
        else:
            payload = await request.json()
            source_url = str(payload.get("sourceUrl") or "").strip()
            source_type = str(payload.get("sourceType") or "").strip().lower()
            if not source_url:
                return json_error(400, "Missing sourceUrl", origin)
            audio_bytes, filename, _content_type, _processing = await _resolve_audio_payload(
                request,
                None,
                payload=payload,
            )
            source_key = source_type + ":" + source_url

        if not audio_bytes:
            return json_error(400, "No audio data", origin)

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        body = await separate_stems_from_audio(audio_bytes, filename, source_key, request)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/stems/{cache_id}/status")
async def get_stem_status(
    cache_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        if not re.fullmatch(r"[a-f0-9]{32}", cache_id or ""):
            return json_error(400, "Invalid cache id", origin)
        model_name = os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
        cache_dir = _stem_cache_dir(cache_id)
        body = _build_stem_status_response(cache_id, model_name, cache_dir)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/stems/{cache_id}/{stem_name}")
async def get_stem_audio(
    cache_id: str,
    stem_name: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('stem-audio')
        if not re.fullmatch(r"[a-f0-9]{32}", cache_id or ""):
            return json_error(400, "Invalid cache id", origin)
        cache_dir = _stem_cache_dir(cache_id)
        metadata = _read_stem_cache_metadata(cache_dir)
        allowed_stems = _demucs_stems_for_model(metadata.get("model"))
        if stem_name not in allowed_stems:
            return json_error(400, "Unknown stem", origin)
        stem_path = os.path.join(cache_dir, stem_name + ".wav")
        if not os.path.isfile(stem_path):
            return json_error(404, "Stem not found", origin)
        return FileResponse(
            stem_path,
            media_type="audio/wav",
            filename=stem_name + ".wav",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/midi2xml")
async def midi2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('midi2xml')

        midi_bytes = b""
        filename = "import.mid"

        if file is not None:
            midi_bytes = await file.read()
            filename = file.filename or filename
        else:
            return json_error(400, "Missing MIDI file upload", origin)

        if not midi_bytes:
            return json_error(400, "MIDI file is empty", origin)

        if len(midi_bytes) > MAX_MIDI_IMPORT_BYTES:
            return json_error(
                413,
                "MIDI file too large (limit is " + str(MAX_MIDI_IMPORT_BYTES) + " bytes)",
                origin,
            )

        music_xml = await convert_midi_to_musicxml(midi_bytes, filename)
        return Response(
            content=music_xml,
            media_type="application/xml",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "MIDI conversion failed"
        return json_error(500, detail, origin)
