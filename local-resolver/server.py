import asyncio
import json
import os
import re
import shutil
import tempfile
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse

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
WHISPER_TIMEOUT_SECONDS = float(os.getenv("WHISPER_TIMEOUT_SECONDS", "600"))
AUTOCHORD_TIMEOUT_SECONDS = float(os.getenv("AUTOCHORD_TIMEOUT_SECONDS", "900"))
WHISPER_CPP_PATH = os.getenv("WHISPER_CPP_PATH", "/app/build/bin/whisper-cli")
MODEL_PATH = os.getenv("MODEL_PATH", "/models/ggml-large-v3.bin")
WHISPER_BACKEND_PREFERENCE = os.getenv("WHISPER_BACKEND_PREFERENCE", "auto").strip().lower() or "auto"
WHISPER_CPU_FALLBACK = os.getenv("WHISPER_CPU_FALLBACK", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_CPP_BEST_OF = int(os.getenv("WHISPER_CPP_BEST_OF", "1"))
WHISPER_CPP_NO_CONTEXT = os.getenv("WHISPER_CPP_NO_CONTEXT", "false").strip().lower() not in {"0", "false", "no"}
WHISPER_LYRICS_FORMAT = os.getenv("WHISPER_LYRICS_FORMAT", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_LYRICS_MAX_WORDS = max(1, int(os.getenv("WHISPER_LYRICS_MAX_WORDS", "10")))
WHISPER_LYRICS_LINE_PAUSE_SECONDS = float(os.getenv("WHISPER_LYRICS_LINE_PAUSE_SECONDS", "1.2"))
WHISPER_LYRICS_STANZA_PAUSE_SECONDS = float(os.getenv("WHISPER_LYRICS_STANZA_PAUSE_SECONDS", "4.0"))
ANALYZE_MEDIA_TIMEOUT_SECONDS = float(os.getenv("ANALYZE_MEDIA_TIMEOUT_SECONDS", "1200"))

BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"}
BLOCKED_SUFFIXES = (".local", ".internal")
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
SENTENCE_END_RE = re.compile(r"[.!?][\"')\]]*$")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


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

        normalized.append({
            "start": float(max(0.0, start)),
            "end": float(max(float(start), end)),
            "text": text,
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


async def _run_whisper_cli(temp_audio_path, backend, request):
    env = os.environ.copy()
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
        str(WHISPER_CPP_BEST_OF),
    ]
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


async def _run_detect_melody(temp_audio_path, request):
    autochord_python = _autochord_python_path()
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env["LD_LIBRARY_PATH"]) if env.get("LD_LIBRARY_PATH") else ""
        )
    proc = await asyncio.create_subprocess_exec(
        autochord_python,
        "/app/detect_melody.py",
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


async def detect_melody_from_path(temp_audio_path, request):
    returncode, stdout_text, stderr_text = await asyncio.wait_for(
        _run_detect_melody(temp_audio_path, request),
        timeout=AUTOCHORD_TIMEOUT_SECONDS,
    )
    if returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=(stderr_text or stdout_text or "Melody detection failed").strip()[:500],
        )
    try:
        return _parse_subprocess_json(stdout_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Melody detector returned invalid JSON") from exc


async def _transcribe_from_wav_path(wav_path, request, require_text=True):
    temp_json_path = wav_path + ".json"
    result = None
    active_backend = "unknown"
    last_error = ""

    try:
        for backend in _whisper_backend_attempts():
            returncode, stdout_text, stderr_text, active_backend = await asyncio.wait_for(
                _run_whisper_cli(wav_path, backend, request),
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
    return {"notes": [], "duration": 0, "backend": "none", "error": ""}


def _analysis_error_message(exc):
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return str(exc).strip()[:500] or "Analysis step failed"


async def analyze_media_from_audio(audio_bytes, filename, request):
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    wav_path = None
    try:
        wav_path = await _convert_audio_to_wav(temp_audio_path)
        lyrics_task = asyncio.create_task(_transcribe_from_wav_path(wav_path, request, require_text=False))
        chords_task = asyncio.create_task(detect_chords_from_path(wav_path, request))
        melody_task = asyncio.create_task(detect_melody_from_path(wav_path, request))
        results = await asyncio.wait_for(
            asyncio.gather(lyrics_task, chords_task, melody_task, return_exceptions=True),
            timeout=ANALYZE_MEDIA_TIMEOUT_SECONDS,
        )

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

        if not lyrics.get("text") and not chords.get("segments") and not melody.get("notes"):
            detail = lyrics.get("error") or chords.get("error") or melody.get("error") or "Media analysis produced no results"
            raise HTTPException(status_code=502, detail=detail)

        return {
            "lyrics": lyrics,
            "chords": chords,
            "melody": melody,
        }
    except ClientDisconnected as exc:
        raise HTTPException(status_code=499, detail="Media analysis cancelled") from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Media analysis timeout") from exc
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


async def _resolve_audio_payload(request, file):
    audio_bytes = b""
    filename = "audio.bin"
    content_type = "application/octet-stream"

    if file is not None:
        audio_bytes = await file.read()
        filename = file.filename or filename
        content_type = file.content_type or content_type
        return audio_bytes, filename, content_type

    payload = await request.json()
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

    return audio_bytes, filename, content_type


@app.options("/{path:path}")
async def options_handler(path: str, request: Request):
    return JSONResponse(content={}, headers=cors_headers(request.headers.get("origin")))


@app.get("/")
async def root(request: Request):
    return JSONResponse(
        {
            "service": "abc2book-local-resolver",
            "health": "/health",
            "endpoints": ["/youtube/:videoId/audio", "/proxy-audio?url=...", "/transcribe", "/detect-chords", "/analyze-media", "/midi2xml"],
            "auth": "optional (set REQUIRE_AUTH=true to require Google login)",
        },
        headers=cors_headers(request.headers.get("origin")),
    )


@app.get("/health")
async def health(request: Request, authorization: str | None = Header(default=None)):
    body = {
        "ok": True,
        "requireAuth": REQUIRE_AUTH,
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
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)

        try:
            audio_bytes, filename, _content_type = await _resolve_audio_payload(request, file)
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

        body = await analyze_media_from_audio(audio_bytes, filename, request)
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


@app.post("/midi2xml")
async def midi2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)

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
