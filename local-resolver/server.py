from oauth_bff_routes import register_oauth_bff_routes
from lyrics_fetch import fetch_lyrics_url, search_lyrics
from lyrics_word_tools import (
    lookup_alliteration,
    lookup_dictionary,
    lookup_phrase_ideas,
    lookup_reverse_dictionary,
    lookup_rhymes,
    lookup_thesaurus,
)
from image_search import image_search_available, search_images
from notation_fetch import search_notation, search_notation_midi_fallback, search_notation_secondary_fallback, search_notation_url
from midi_convert import MAX_MIDI_IMPORT_BYTES, convert_midi_to_musicxml
from midi_import_orchestrator import analyze_midi_for_import, import_midi_bytes
from playback_region_detect import (
    PLAYBACK_SCAN_WHISPER_OPTIONS,
    detect_playback_region_from_wav,
)
from tune_background_research import research_tune_background
from practice_track_api import (
    get_practice_track_audio,
    get_practice_track_backends,
    get_practice_track_job,
    post_generate_practice_track,
    post_render_midi,
    practice_track_health,
)
from feed_generation import generate_feed_articles, generate_feed_quizzes
from feed_source_scrape import enrich_feed_sources
from composer_discovery import discover_composer
from genre_discovery import discover_genre
from sheet_image_features import sheet_image_features
from soundfont_download import (
    get_soundfont_status,
    resolve_musyngkite_file,
    soundfonts_serving_available,
    start_soundfont_download_background,
)
from midi_resources import (
    midi_resources_enabled,
    midi_resources_health_fields,
    resolve_midi_resource_file,
)
from music_collection import (
    build_music_collection_candidate,
    guess_audio_mime_type,
    infer_title_artist_from_query,
    load_music_collection_stats,
    music_collection_enabled,
    music_collection_health_fields,
    music_collection_index_path,
    music_collection_root,
    music_collection_stats_path,
    rebuild_music_collection_index,
    resolve_music_collection_art_file,
    resolve_music_collection_file,
    search_music_collection,
)
from bandcamp import (
    bandcamp_enabled,
    build_bandcamp_candidate,
    is_bandcamp_url,
    search_bandcamp,
)
from internet_archive import (
    build_internet_archive_candidate,
    internet_archive_enabled,
    is_archive_org_url,
    resolve_archive_playback_url,
    search_internet_archive,
)
from europeana import (
    build_europeana_candidate,
    europeana_enabled,
    search_europeana,
)
from snapcast_config import snapcast_enabled, snapcast_server_host
from snapcast_routes import register_snapcast_routes, snapcast_feature_enabled
from loc_audio import (
    build_loc_audio_candidate,
    is_loc_gov_url,
    loc_audio_enabled,
    resolve_loc_playback_url,
    search_loc_audio,
)
from score_attachment_fetch import fetch_score_attachment_bytes, is_allowed_score_attachment_url
from subprocess_utils import (
    ClientDisconnected,
    HeavyJobQueueFull,
    heavy_job_slot,
    heavy_jobs_status,
    run_subprocess_with_disconnect,
    terminate_subprocess_tree,
)
from voice_command import (
    VOICE_WHISPER_OPTIONS,
    _empty_intent,
    parse_help_intent_llm,
    parse_catalog_json,
    parse_voice_intent,
)
import asyncio
import hashlib
import json
import mimetypes
import os
import re
import shutil
import tempfile
import time
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

app = FastAPI()

from allowlists import (
    email_allowed,
    load_embedded_creds_emails,
    load_free_access_emails,
)
from providers import (
    host_embedded_providers,
    is_cloud_stems_provider,
    parse_overlay_header,
    parse_providers_body,
    providers_health_payload,
    public_provider_summary,
    resolve_provider,
)
from llm_runtime import materialize_llm_config, use_llm_provider

FEATURE_CAPABILITY = {
    "llm": "llm",
    "whisper": "whisper",
    "stems": "stems",
    "sheetImage": "ocr",
}

# Free access to this host's media / heavy ML. FREE_ACCESS_EMAILS preferred;
# ALLOWED_EMAILS kept as legacy alias (see allowlists.load_free_access_emails).
ALLOWED_EMAILS = load_free_access_emails()
FREE_ACCESS_EMAILS = ALLOWED_EMAILS
EMBEDDED_CREDS_EMAILS = load_embedded_creds_emails()
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
AUTH_SESSION_SECRET = os.getenv("AUTH_SESSION_SECRET", "").strip()
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "false").lower() in ("1", "true", "yes")
# When true, this process is a slim Cloud Run / light gateway: no local Whisper/Demucs/OCR.
RESOLVER_LIGHT_MODE = os.getenv("RESOLVER_LIGHT_MODE", "false").lower() in ("1", "true", "yes")
YTDLP_COOKIES_PATH = os.getenv("YTDLP_COOKIES_PATH", "")
YTDLP_COOKIES_WRITABLE = "/tmp/youtube-cookies.txt"
# Operator-hosted residential/egress proxy for yt-dlp (home). Prefer user Webshare on light gateways.
YTDLP_PROXY = os.getenv("YTDLP_PROXY", "").strip()
# When true (default in RESOLVER_LIGHT_MODE), /youtube requires X-Tunebook-Ytdlp-Proxy or YTDLP_PROXY.
_ytdlp_require_raw = os.getenv("YTDLP_REQUIRE_USER_PROXY", "").strip().lower()
if _ytdlp_require_raw in ("1", "true", "yes"):
    YTDLP_REQUIRE_USER_PROXY = True
elif _ytdlp_require_raw in ("0", "false", "no"):
    YTDLP_REQUIRE_USER_PROXY = False
else:
    YTDLP_REQUIRE_USER_PROXY = RESOLVER_LIGHT_MODE
MAX_STREAM_BYTES = int(os.getenv("MAX_STREAM_BYTES", str(80 * 1024 * 1024)))
MAX_ABC_IMPORT_BYTES = int(os.getenv("MAX_ABC_IMPORT_BYTES", str(512 * 1024)))
MAX_SHEET_IMAGE_BYTES = int(os.getenv("MAX_SHEET_IMAGE_BYTES", str(20 * 1024 * 1024)))
SHEET_IMAGE_ENABLED = os.getenv("SHEET_IMAGE_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
VISION_VENV_PYTHON = os.getenv("VISION_VENV_PYTHON", "/opt/vision-venv/bin/python")
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
FFMPEG_TIMEOUT_SECONDS = float(os.getenv("FFMPEG_TIMEOUT_SECONDS", "120"))
YTDLP_TIMEOUT_SECONDS = float(os.getenv("YTDLP_TIMEOUT_SECONDS", "300"))
UPSTREAM_FETCH_TIMEOUT_SECONDS = float(os.getenv("UPSTREAM_FETCH_TIMEOUT_SECONDS", "120"))
HTDEMUCS_STEMS = ("drums", "bass", "other", "vocals")


def _demucs_stems_for_model(model_name=None):
    name = model_name or os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    if name == "htdemucs_6s":
        return ("drums", "bass", "other", "vocals", "guitar", "piano")
    return HTDEMUCS_STEMS

# Lazily created so they bind to the running event loop on first use.
_stem_inflight_locks = {}
_stem_background_tasks = {}
STEM_SECONDS_PER_TRACK_SECOND = float(os.getenv("STEM_SECONDS_PER_TRACK_SECOND", "1.5"))
PROXY_ENABLED = os.getenv("PROXY_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
STEMS_ENABLED = os.getenv("STEMS_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
WHISPER_ENABLED = os.getenv("WHISPER_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
LLM_ENABLED = os.getenv("LLM_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
LLM_HEALTH_CACHE_SECONDS = float(os.getenv("LLM_HEALTH_CACHE_SECONDS", "60"))
STATIC_SITE_DIR = os.getenv("STATIC_SITE_DIR", "").strip()
STATIC_SITE_ENABLED = os.getenv("STATIC_SITE_ENABLED", "auto").strip().lower() or "auto"
_llm_available_cache = False
_llm_checked_at = 0.0


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
        "Access-Control-Allow-Headers": (
            "Authorization, Content-Type, Range, X-Abc-Auth-Session, "
            "X-Tunebook-Ytdlp-Proxy, X-Tunebook-Provider-llm, "
            "X-Tunebook-Provider-whisper, X-Tunebook-Provider-ocr, "
            "X-Tunebook-Provider-stems"
        ),
        "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    }


register_oauth_bff_routes(
    app,
    get_allowed_emails=lambda: ALLOWED_EMAILS,
    cors_headers=cors_headers,
)


def static_site_root():
    if STATIC_SITE_DIR:
        return os.path.abspath(STATIC_SITE_DIR)
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def static_site_enabled():
    root = static_site_root()
    if not os.path.isdir(root):
        return False
    if STATIC_SITE_ENABLED in {"0", "false", "no"}:
        return False
    if STATIC_SITE_ENABLED in {"1", "true", "yes"}:
        return True
    return os.path.isfile(os.path.join(root, "index.html"))


_SENSITIVE_STATIC_DIR_PREFIXES = (
    ".git/",
    "local-resolver/",
    "node_modules/",
    ".cursor/",
    ".github/",
)
_SENSITIVE_STATIC_BASENAME_PREFIXES = (".env",)
_SENSITIVE_STATIC_BASENAMES = {
    ".env",
    ".git",
    "credentials.json",
    "client_secret.json",
    "service-account.json",
}


def is_sensitive_static_path(relative_path):
    """Refuse to serve secrets/source that live next to the built SPA."""
    path = (relative_path or "").lstrip("/").replace("\\", "/")
    if not path or path in {".", "./"}:
        return False
    lowered = path.lower()
    for prefix in _SENSITIVE_STATIC_DIR_PREFIXES:
        if lowered == prefix.rstrip("/") or lowered.startswith(prefix):
            return True
    base = os.path.basename(lowered)
    if base in _SENSITIVE_STATIC_BASENAMES:
        return True
    for prefix in _SENSITIVE_STATIC_BASENAME_PREFIXES:
        if base.startswith(prefix):
            return True
    return False


def resolve_static_file(relative_path):
    root = static_site_root()
    relative_path = (relative_path or "").lstrip("/")
    if not relative_path:
        relative_path = "index.html"
    if is_sensitive_static_path(relative_path):
        return None

    # Unified MusyngKite path: embed selection/abcjs first, then volume cache.
    musyng_prefix = "midi-js-soundfonts/MusyngKite/"
    if relative_path == "midi-js-soundfonts/MusyngKite" or relative_path.startswith(musyng_prefix):
        under_bank = relative_path[len(musyng_prefix):] if relative_path.startswith(musyng_prefix) else ""
        if under_bank:
            overlay = resolve_musyngkite_file(under_bank, root)
            if overlay:
                return overlay

    candidate = os.path.normpath(os.path.join(root, relative_path))
    root_prefix = root + os.sep
    if candidate != root and not candidate.startswith(root_prefix):
        return None
    if os.path.isfile(candidate):
        return candidate
    return None


def static_file_headers(origin, file_path):
    headers = cors_headers(origin)
    if os.path.basename(file_path) == "sw.js":
        headers["Service-Worker-Allowed"] = "/"
    lower = file_path.lower()
    if lower.endswith((".jpg", ".jpeg", ".gif", ".png", ".webp", ".ico")):
        headers["Cache-Control"] = "max-age=7200"
    elif lower.endswith((".mp3", ".js")) and "midi-js-soundfonts" in lower.replace("\\", "/"):
        headers["Cache-Control"] = "public, max-age=86400"
    return headers


def static_file_response(origin, relative_path):
    resolved = resolve_static_file(relative_path)
    if not resolved:
        return None
    media_type, _encoding = mimetypes.guess_type(resolved)
    if resolved.lower().endswith(".mp3") and not media_type:
        media_type = "audio/mpeg"
    return FileResponse(
        resolved,
        media_type=media_type or "application/octet-stream",
        headers=static_file_headers(origin, resolved),
    )


def soundfont_health_fields():
    status = get_soundfont_status()
    progress = {
        "downloaded": int(status.get("downloaded") or 0),
        "total": int(status.get("total") or 0),
    }
    if progress["total"] > 0:
        progress["fraction"] = round(progress["downloaded"] / progress["total"], 4)
    else:
        progress["fraction"] = 1.0 if status.get("ready") else 0.0
    return {
        "soundfontsReady": bool(status.get("ready")),
        "soundfontsProgress": progress,
        "soundfontsRunning": bool(status.get("running")),
        "soundfontsError": status.get("error"),
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


@app.exception_handler(HeavyJobQueueFull)
async def heavy_job_queue_full_handler(request: Request, exc: HeavyJobQueueFull):
    origin = request.headers.get("origin")
    return json_error(503, str(exc), origin)


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
    start_soundfont_download_background()
    # Vision import probes are expensive; start them off-thread so /health stays cheap.
    try:
        from sheet_image_ocr import warmup_paddleocr_probe
        from sheet_image_omr import warmup_homr_probe

        warmup_paddleocr_probe()
        warmup_homr_probe()
    except Exception as exc:
        print(f"WARNING: sheet-image warmup skipped: {exc}")


def _proxy_available():
    return PROXY_ENABLED


def _stems_available():
    if RESOLVER_LIGHT_MODE:
        return False
    return STEMS_ENABLED and _proxy_available()


def _whisper_local_available():
    if RESOLVER_LIGHT_MODE:
        return False
    if not WHISPER_ENABLED:
        return False
    return os.path.isfile(WHISPER_CPP_PATH) and os.path.isfile(MODEL_PATH)


def _whisper_cloud_configured():
    return "whisper" in host_embedded_providers()


def _whisper_runtime_available():
    """Whisper on when local binary, host cloud provider, or overlays accepted (WHISPER_ENABLED)."""
    if _whisper_local_available() or _whisper_cloud_configured():
        return True
    return bool(WHISPER_ENABLED)


def _llm_runtime_available():
    if not LLM_ENABLED and "llm" not in host_embedded_providers():
        return False
    if "llm" in host_embedded_providers():
        return True
    if not LLM_ENABLED:
        return False
    return _llm_available_cache


def _ocr_local_available():
    if RESOLVER_LIGHT_MODE:
        return False
    try:
        features = sheet_image_features()
        return bool(SHEET_IMAGE_ENABLED and features.get("ocr"))
    except Exception:
        return False


def _ocr_cloud_configured():
    return "ocr" in host_embedded_providers()


def local_provider_backends():
    return {
        "llm": bool(LLM_ENABLED and _llm_available_cache and not RESOLVER_LIGHT_MODE),
        "whisper": _whisper_local_available(),
        "ocr": _ocr_local_available(),
        "stems": bool(_stems_available() and not RESOLVER_LIGHT_MODE),
    }


def _practice_analysis_available():
    autochord_python = os.getenv("AUTOCHORD_VENV_PYTHON", "/opt/autochord-venv/bin/python")
    script = os.path.join(os.path.dirname(__file__), "analyze_practice.py")
    return os.path.isfile(autochord_python) and os.path.isfile(script)


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


def oauth_bff_available():
    try:
        from oauth_bff import oauth_bff_configured

        return bool(oauth_bff_configured())
    except Exception:
        # Do not advertise oauthBff when the module is missing/unloadable —
        # env vars alone cannot serve /auth/google/*.
        return False


def _youtube_audio_feature_flags():
    """Advertise whether this host can return YouTube audio bytes for DSP/cache."""
    proxy_ok = _proxy_available()
    require_egress = bool(YTDLP_REQUIRE_USER_PROXY)
    host_has_egress = bool(YTDLP_PROXY)
    youtube_audio = False
    if proxy_ok:
        if not require_egress:
            youtube_audio = True
        elif host_has_egress:
            youtube_audio = True
        # else: only with per-request user Webshare (SPA feature.youtubeEgressRequired)
    return {
        "youtubeAudio": youtube_audio,
        "youtubeEgressRequired": require_egress and not host_has_egress,
    }


def _practice_track_feature_flags():
    health = practice_track_health()
    return bool(health.get("ok")), health


def resolver_features(practice_track_ok=None):
    yt_flags = _youtube_audio_feature_flags()
    if practice_track_ok is None:
        practice_track_ok, _ = _practice_track_feature_flags()
    if RESOLVER_LIGHT_MODE:
        # Slim Cloud Run / light gateway: provider-proxy capabilities only.
        # Stems available via cloud BYO/host keys (fal / Replicate).
        return {
            "proxy": _proxy_available(),
            "stems": True,
            "whisper": _whisper_runtime_available(),
            "llm": _llm_runtime_available(),
            "practiceAnalysis": False,
            "sheetImage": bool(_ocr_cloud_configured()),
            "sheetImageOcr": bool(_ocr_cloud_configured()),
            "sheetImageOmr": False,
            "imageSearch": False,
            "playwright": False,
            "oauthBff": oauth_bff_available(),
            "soundfonts": False,
            "lightMode": True,
            "youtubeAudio": yt_flags["youtubeAudio"],
            "youtubeEgressRequired": yt_flags["youtubeEgressRequired"],
            "chordBackend": "unavailable",
            "bandcamp": bandcamp_enabled() and _proxy_available(),
            "internetArchive": internet_archive_enabled() and _proxy_available(),
            "europeana": europeana_enabled() and _proxy_available(),
            "locAudio": loc_audio_enabled() and _proxy_available(),
            "practiceTrack": practice_track_ok,
            "snapcastControl": snapcast_enabled(),
            "snapcastPlayback": snapcast_feature_enabled(),
        }
    features = sheet_image_features()
    playwright_ok = False
    try:
        from browser_fetch import playwright_available

        playwright_ok = bool(playwright_available())
    except Exception:
        playwright_ok = False
    return {
        "proxy": _proxy_available(),
        # STEMS_ENABLED gates the feature; local Demucs and/or cloud BYO/host keys run it.
        "stems": bool(STEMS_ENABLED),
        "whisper": _whisper_runtime_available(),
        "llm": _llm_runtime_available(),
        "practiceAnalysis": _practice_analysis_available(),
        "sheetImage": bool(
            (SHEET_IMAGE_ENABLED and features.get("available")) or _ocr_cloud_configured()
        ),
        "sheetImageOcr": bool(features.get("ocr") or _ocr_cloud_configured()),
        "sheetImageOmr": bool(features.get("omr")),
        "imageSearch": image_search_available(),
        "playwright": playwright_ok,
        "oauthBff": oauth_bff_available(),
        "soundfonts": soundfonts_serving_available(),
        "lightMode": False,
        "youtubeAudio": yt_flags["youtubeAudio"],
        "youtubeEgressRequired": yt_flags["youtubeEgressRequired"],
        "chordBackend": os.getenv("CHORD_BACKEND", "auto").strip().lower() or "auto",
        "musicCollection": music_collection_enabled(),
        "bandcamp": bandcamp_enabled() and _proxy_available(),
        "internetArchive": internet_archive_enabled() and _proxy_available(),
        "europeana": europeana_enabled() and _proxy_available(),
        "locAudio": loc_audio_enabled() and _proxy_available(),
        "practiceTrack": practice_track_ok,
        "snapcastControl": snapcast_enabled(),
        "snapcastPlayback": snapcast_feature_enabled(),
    }


async def require_resolver_feature(feature_name, request=None, verified=None):
    # LLM health is cached; startup can race the llm container and leave a
    # stale miss. Re-probe before gating LLM routes (not only /health/ready).
    if feature_name == "llm":
        await _refresh_llm_health_if_stale()
    features = resolver_features()
    if features.get(feature_name):
        return
    # BYO / host cloud providers can satisfy ML features without local backends.
    capability = FEATURE_CAPABILITY.get(feature_name)
    if capability and request is not None:
        local_ok = {
            "llm": _llm_runtime_available(),
            "whisper": _whisper_local_available(),
            "ocr": _ocr_local_available(),
            "stems": bool(_stems_available() and not RESOLVER_LIGHT_MODE),
        }.get(capability, False)
        cfg = await resolve_request_provider(
            capability,
            request,
            verified,
            local_available=local_ok,
        )
        if cfg and cfg.get("provider") != "local" and (cfg.get("apiUrl") or cfg.get("apiKey")):
            return
    raise HTTPException(status_code=503, detail=f"{feature_name} is not available on this resolver")


async def _resolve_llm_for_request(request, verified, *, voice=False):
    """Resolve BYO/host/local LLM and return a materialized config for use_llm_provider."""
    resolved = await resolve_request_provider(
        "llm",
        request,
        verified,
        local_available=_llm_runtime_available(),
    )
    return materialize_llm_config(resolved, voice=voice)


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

        free = email_allowed(FREE_ACCESS_EMAILS, email)
        embedded = email_allowed(EMBEDDED_CREDS_EMAILS, email)
        return {
            "email": email,
            "allowed": free,
            "freeAccess": free,
            "embeddedCreds": embedded,
        }


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


async def require_music_collection_access(authorization):
    """Music collection may use a dedicated allowlist even when REQUIRE_AUTH is off."""
    from music_collection import load_music_collection_emails
    from allowlists import email_allowed

    allowlist = load_music_collection_emails()
    if allowlist:
        token = get_bearer_token(authorization)
        if not token:
            raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
        verified = await verify_google_access_token(token)
        if not verified:
            raise HTTPException(status_code=401, detail="Invalid or expired Google token")
        email = verified.get("email")
        if not email_allowed(allowlist, email):
            raise HTTPException(status_code=403, detail="Email not authorized for music collection")
        return verified
    return await maybe_require_auth(authorization)


def auth_access_flags(verified):
    """Normalize freeAccess / embeddedCreds from require_auth result or anonymous."""
    if not verified:
        # Auth off (trusted LAN / personal): full access including host-embedded keys.
        if not REQUIRE_AUTH:
            return {"freeAccess": True, "embeddedCreds": True}
        return {"freeAccess": False, "embeddedCreds": False}
    return {
        "freeAccess": bool(verified.get("freeAccess")),
        "embeddedCreds": bool(verified.get("embeddedCreds")),
    }


async def resolve_request_provider(capability, request, verified, local_available):
    """Resolve provider for this request from header / body overlay then host / local."""
    flags = auth_access_flags(verified)
    overlay = parse_overlay_header(request.headers.get("x-tunebook-provider-" + capability))
    if overlay is None and request.method in ("POST", "PUT", "PATCH"):
        # Best-effort: do not consume body here if already read; callers can pass body overlays.
        pass
    return resolve_provider(
        capability,
        overlay=overlay,
        allow_embedded=flags["embeddedCreds"],
        local_available=local_available,
    )


def build_auth_health_fields(verified_or_none, token_present, verified_failed):
    """Shared authorized / freeAccess / embeddedCreds for /health responses."""
    fields = {}
    if not REQUIRE_AUTH:
        flags = auth_access_flags(None)
        fields["authorized"] = True
        fields["freeAccess"] = flags["freeAccess"]
        fields["embeddedCreds"] = flags["embeddedCreds"]
        return fields

    if not token_present:
        fields["authorized"] = False
        fields["authReason"] = "login_required"
        fields["freeAccess"] = False
        fields["embeddedCreds"] = False
        return fields

    if verified_failed or not verified_or_none:
        fields["authorized"] = False
        fields["authReason"] = "invalid_token"
        fields["freeAccess"] = False
        fields["embeddedCreds"] = False
        return fields

    if not verified_or_none.get("allowed"):
        fields["authorized"] = False
        fields["authReason"] = "email_not_authorized"
        fields["freeAccess"] = False
        fields["embeddedCreds"] = bool(verified_or_none.get("embeddedCreds"))
        return fields

    fields["authorized"] = True
    fields["freeAccess"] = bool(verified_or_none.get("freeAccess"))
    fields["embeddedCreds"] = bool(verified_or_none.get("embeddedCreds"))
    return fields


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


def build_ytdlp_cmd(video_id, stream_to_stdout=False, proxy=None):
    return build_ytdlp_cmd_for_url(
        "https://www.youtube.com/watch?v=" + str(video_id or "").strip(),
        stream_to_stdout=stream_to_stdout,
        proxy=proxy,
    )


def build_ytdlp_cmd_for_url(target_url, stream_to_stdout=False, proxy=None):
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

    effective_proxy = (proxy or "").strip() or YTDLP_PROXY
    if effective_proxy:
        cmd.extend(["--proxy", effective_proxy])

    if stream_to_stdout:
        cmd.extend(["-o", "-"])
    else:
        cmd.append("-g")

    cmd.append(str(target_url or "").strip())
    return cmd


def resolve_ytdlp_proxy_from_request(request: Request | None) -> str:
    if request is None:
        return YTDLP_PROXY
    header = (request.headers.get("x-tunebook-ytdlp-proxy") or "").strip()
    return header or YTDLP_PROXY


def ensure_youtube_egress_allowed(proxy: str) -> None:
    """Light / Cloud Run gateways must not pull YouTube on datacenter IPs alone."""
    if not YTDLP_REQUIRE_USER_PROXY:
        return
    if (proxy or "").strip():
        return
    raise HTTPException(
        status_code=503,
        detail=(
            "YouTube audio requires a residential proxy. "
            "Set Webshare (or similar) in Settings → Providers, or use the YouTube Helper extension / a home resolver."
        ),
    )


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


async def stream_youtube_via_ytdlp(video_id, proxy=None):
    return await stream_url_via_ytdlp(
        "https://www.youtube.com/watch?v=" + str(video_id or "").strip(),
        proxy=proxy,
    )


async def stream_url_via_ytdlp(target_url, proxy=None):
    cmd = build_ytdlp_cmd_for_url(target_url, stream_to_stdout=True, proxy=proxy)

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


async def fetch_youtube_audio_bytes(video_id, proxy=None):
    return await fetch_url_audio_bytes(
        "https://www.youtube.com/watch?v=" + str(video_id or "").strip(),
        proxy=proxy,
    )


async def fetch_url_audio_bytes(target_url, proxy=None):
    cmd = build_ytdlp_cmd_for_url(target_url, stream_to_stdout=True, proxy=proxy)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=YTDLP_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        await terminate_subprocess_tree(proc)
        raise HTTPException(status_code=504, detail="YouTube download timeout") from exc
    stderr_text = stderr.decode("utf-8", errors="ignore").strip()[:500]

    if proc.returncode != 0 or not stdout:
        return None, None, ytdlp_error_hint(stderr_text)

    if len(stdout) > MAX_STREAM_BYTES:
        return None, None, "Media file too large"

    return stdout, "audio/mpeg", None


async def resolve_linked_media_audio_bytes(source_url, source_type="", proxy=None):
    """Resolve audio bytes from a linked tune media URL (YouTube, Bandcamp, or direct HTTPS)."""
    source_url = str(source_url or "").strip()
    source_type = str(source_type or "").strip().lower()
    if not source_url:
        raise HTTPException(status_code=400, detail="Missing sourceUrl")

    if source_type == "youtube" or "youtu" in source_url.lower():
        video_id = extract_youtube_video_id(source_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        audio_bytes, content_type, error = await fetch_youtube_audio_bytes(video_id, proxy=proxy)
        if error:
            raise HTTPException(
                status_code=502,
                detail=("Could not resolve YouTube audio stream" + (": " + error if error else "")).strip(),
            )
        return audio_bytes, video_id + ".mp3", content_type

    if is_bandcamp_url(source_url):
        audio_bytes, content_type, error = await fetch_url_audio_bytes(source_url, proxy=proxy)
        if error:
            raise HTTPException(
                status_code=502,
                detail=("Could not resolve Bandcamp audio stream" + (": " + error if error else "")).strip(),
            )
        parsed = urlparse(source_url)
        filename = os.path.basename(parsed.path) or "bandcamp.mp3"
        return audio_bytes, filename, content_type

    if is_archive_org_url(source_url):
        playback_url = await resolve_archive_playback_url(source_url)
        if not playback_url:
            raise HTTPException(status_code=502, detail="Could not resolve Internet Archive audio file")
        validated, error = validate_target_url(playback_url)
        if error:
            raise HTTPException(status_code=400, detail=error)
        audio_bytes, content_type = await fetch_upstream_audio_bytes(validated)
        parsed = urlparse(validated)
        filename = os.path.basename(parsed.path) or "archive.mp3"
        return audio_bytes, filename, content_type

    if is_loc_gov_url(source_url):
        playback_url = await resolve_loc_playback_url(source_url)
        if not playback_url:
            raise HTTPException(status_code=502, detail="Could not resolve Library of Congress audio file")
        validated, error = validate_target_url(playback_url)
        if error:
            raise HTTPException(status_code=400, detail=error)
        audio_bytes, content_type = await fetch_upstream_audio_bytes(validated)
        parsed = urlparse(validated)
        filename = os.path.basename(parsed.path) or "loc.mp3"
        return audio_bytes, filename, content_type

    validated, error = validate_target_url(source_url)
    if error:
        raise HTTPException(status_code=400, detail=error)
    audio_bytes, content_type = await fetch_upstream_audio_bytes(validated)
    parsed = urlparse(validated)
    filename = os.path.basename(parsed.path) or "audio.bin"
    return audio_bytes, filename, content_type


register_snapcast_routes(
    app,
    maybe_require_auth=maybe_require_auth,
    cors_headers=cors_headers,
    resolve_linked_media_audio_bytes=resolve_linked_media_audio_bytes,
    resolve_ytdlp_proxy_from_request=resolve_ytdlp_proxy_from_request,
    snapcast_server_host=snapcast_server_host(),
)


async def stream_upstream(target_url, request):
    range_header = request.headers.get("range")
    headers = upstream_headers_for(target_url, range_header)

    timeout = httpx.Timeout(
        UPSTREAM_FETCH_TIMEOUT_SECONDS,
        connect=min(10.0, UPSTREAM_FETCH_TIMEOUT_SECONDS),
    )
    client = httpx.AsyncClient(follow_redirects=True, timeout=timeout)
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
    timeout = httpx.Timeout(
        UPSTREAM_FETCH_TIMEOUT_SECONDS,
        connect=min(10.0, UPSTREAM_FETCH_TIMEOUT_SECONDS),
    )
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
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
        start_new_session=True,
    )
    try:
        _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=FFMPEG_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        await terminate_subprocess_tree(proc)
        raise HTTPException(status_code=504, detail="Audio conversion timeout") from exc
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

    returncode, stdout_text, stderr_text = await run_subprocess_with_disconnect(cmd, env=env, request=request)
    return returncode, stdout_text, stderr_text, backend


async def forward_to_whisper(audio_bytes, filename, content_type, request, provider_cfg=None):
    if not audio_bytes:
        return {"text": "", "segments": [], "language": "", "backend": "none"}

    # Cloud / OpenAI-compatible path when active provider is not local.
    if provider_cfg and provider_cfg.get("provider") != "local" and provider_cfg.get("apiUrl"):
        try:
            from provider_cloud import transcribe_openai_compat

            return await transcribe_openai_compat(
                audio_bytes,
                filename,
                content_type,
                provider_cfg,
                timeout=WHISPER_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc).strip()[:500]) from exc

    if RESOLVER_LIGHT_MODE or not _whisper_local_available():
        raise HTTPException(
            status_code=503,
            detail="Local Whisper is not available; configure a Whisper provider",
        )

    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"

    async with heavy_job_slot():
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


def _autochord_env():
    env = os.environ.copy()
    autochord_libs = os.getenv("AUTOCHORD_LD_LIBRARY_PATH", "/opt/autochord-libs")
    if os.path.isdir(autochord_libs):
        env["LD_LIBRARY_PATH"] = autochord_libs + (
            (":" + env.get("LD_LIBRARY_PATH")) if env.get("LD_LIBRARY_PATH") else ""
        )
    env["TF_CPP_MIN_LOG_LEVEL"] = "2"
    return env


async def _run_detect_chords(temp_audio_path, request, config_path=None):
    autochord_python = os.getenv("AUTOCHORD_VENV_PYTHON", "/opt/autochord-venv/bin/python")
    if not os.path.exists(autochord_python):
        raise HTTPException(
            status_code=502,
            detail=f"Chord detector runtime missing ({autochord_python})",
        )
    command = [autochord_python, "/app/detect_chords.py", temp_audio_path]
    if config_path:
        command.append(config_path)
    return await run_subprocess_with_disconnect(
        command,
        env=_autochord_env(),
        request=request,
    )


def _chord_detect_config(timing=None, processing=None):
    config = {}
    if isinstance(timing, dict):
        beat_times = timing.get("beatTimes")
        if isinstance(beat_times, list) and beat_times:
            config["beatTimes"] = beat_times
        if timing.get("tempo") is not None:
            config["tempo"] = timing.get("tempo")
        if timing.get("beatsPerBar") is not None:
            config["beatsPerBar"] = timing.get("beatsPerBar")
    if isinstance(processing, dict):
        if processing.get("detectedKey") or processing.get("key"):
            config["detectedKey"] = processing.get("detectedKey") or processing.get("key")
        if processing.get("chordBackend"):
            config["chordBackend"] = processing.get("chordBackend")
        if "constrainChordsToKey" in processing:
            config["constrainChordsToKey"] = bool(processing.get("constrainChordsToKey"))
        if processing.get("chordChangeGrid"):
            config["chordChangeGrid"] = processing.get("chordChangeGrid")
        if processing.get("beatsPerBar") is not None:
            config["beatsPerBar"] = processing.get("beatsPerBar")
        if "chordChangePenalty" in processing:
            config["chordChangePenalty"] = bool(processing.get("chordChangePenalty"))
    return config


async def detect_chords_from_path(temp_audio_path, request, timing=None, processing=None):
    config_path = None
    try:
        config = _chord_detect_config(timing=timing, processing=processing)
        if config:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
                json.dump(config, handle)
                config_path = handle.name
        returncode, stdout_text, stderr_text = await asyncio.wait_for(
            _run_detect_chords(temp_audio_path, request, config_path),
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
            detail=(stderr_text or stdout_text or "Chord detection failed").strip()[:500],
        )
    try:
        return _parse_subprocess_json(stdout_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Chord detector returned invalid JSON") from exc


async def detect_chords_from_audio(audio_bytes, filename, request, timing=None, processing=None):
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"

    async with heavy_job_slot():
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
            temp_audio.write(audio_bytes)
            temp_audio_path = temp_audio.name

        try:
            return await detect_chords_from_path(
                temp_audio_path,
                request,
                timing=timing,
                processing=processing,
            )
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
    command = [
        autochord_python,
        "/app/detect_melody.py",
        temp_audio_path,
    ]
    if config_path:
        command.append(config_path)
    return await run_subprocess_with_disconnect(command, env=_autochord_env(), request=request)


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
    return await run_subprocess_with_disconnect(
        [autochord_python, "/app/detect_timing.py", temp_audio_path],
        env=_autochord_env(),
        request=request,
    )


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


async def _run_separate_stems(temp_audio_path, output_dir, request, model_name=None):
    autochord_python = _autochord_python_path()
    command = [
        autochord_python,
        "/app/separate_stems.py",
        temp_audio_path,
        output_dir,
    ]
    env = _autochord_env()
    if model_name:
        env["MELODY_DEMUCS_MODEL"] = str(model_name)
    return await run_subprocess_with_disconnect(command, env=env, request=request)


async def separate_stems_from_audio(audio_bytes, filename, source_key, request, provider_cfg=None, model_override=None):
    from provider_stems_cloud import cloud_stems_model_name

    use_cloud = is_cloud_stems_provider(provider_cfg)
    if use_cloud:
        model_name = cloud_stems_model_name(provider_cfg)
    else:
        model_name = os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
        if provider_cfg and provider_cfg.get("model"):
            model_name = str(provider_cfg.get("model") or model_name).strip() or model_name
        if model_override:
            model_name = str(model_override).strip() or model_name

    cache_key = model_name
    if use_cloud:
        cache_key = model_name + "|cloud:" + str((provider_cfg or {}).get("provider") or "")
    cache_id = _stem_cache_id(source_key, cache_key)
    cache_dir = _stem_cache_dir(cache_id)

    if _stems_are_cached(cache_id, model_name):
        return _build_stem_response(cache_id, model_name, cache_dir)

    inflight_lock = _get_stem_inflight_lock(cache_id)
    existing_task = _stem_background_tasks.get(cache_id)
    if existing_task and not existing_task.done():
        return _build_pending_stem_response(cache_id, model_name)

    async def run_job():
        try:
            async with heavy_job_slot():
                async with inflight_lock:
                    if _stems_are_cached(cache_id, model_name):
                        return
                    # Detach from `request`: this job outlives the HTTP request that
                    # kicked it off (which returns a "pending" response immediately),
                    # so disconnect monitoring must not cancel the separation.
                    await _separate_stems_uncached(
                        audio_bytes, filename, model_name, cache_id, cache_dir, None,
                        provider_cfg=provider_cfg if use_cloud else None,
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


async def _separate_stems_uncached(audio_bytes, filename, model_name, cache_id, cache_dir, request, provider_cfg=None):
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
            if _stems_are_cached(cache_id, model_name):
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

    if is_cloud_stems_provider(provider_cfg):
        try:
            from provider_stems_cloud import separate_stems_cloud

            result = await asyncio.wait_for(
                separate_stems_cloud(audio_bytes, filename or "audio.wav", provider_cfg, cache_dir),
                timeout=STEM_SEPARATION_TIMEOUT_SECONDS,
            )
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
        except asyncio.TimeoutError as exc:
            raise HTTPException(status_code=504, detail="Stem separation timeout") from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
        finally:
            progress_task.cancel()

    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name

    wav_path = None
    try:
        wav_path = await _convert_audio_to_wav(temp_audio_path)
        returncode, stdout_text, stderr_text = await asyncio.wait_for(
            _run_separate_stems(wav_path, cache_dir, request, model_name=model_name),
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


async def _transcribe_from_wav_path(
    wav_path,
    request,
    require_text=True,
    whisper_options=None,
    format_as_lyrics=True,
    verified=None,
    provider_cfg=None,
):
    """Transcribe a WAV via BYO/host Whisper cloud provider or local whisper.cpp."""
    cfg = provider_cfg
    if cfg is None and request is not None:
        cfg = await resolve_request_provider(
            "whisper",
            request,
            verified,
            local_available=_whisper_local_available(),
        )
    if cfg and cfg.get("provider") != "local" and cfg.get("apiUrl"):
        with open(wav_path, "rb") as handle:
            audio_bytes = handle.read()
        return await forward_to_whisper(
            audio_bytes,
            os.path.basename(wav_path) or "audio.wav",
            "audio/wav",
            request,
            provider_cfg=cfg,
        )

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
    command = [
        autochord_python,
        "/app/audio_analysis_filters.py",
        wav_path,
        json.dumps(processing or {}),
    ]
    return await run_subprocess_with_disconnect(command, env=_autochord_env(), request=request)


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

    async with heavy_job_slot():
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
                detect_chords_from_path(
                    audio_paths.get("chords") or wav_path,
                    request,
                    timing=timing if isinstance(timing, dict) and not timing.get("error") else None,
                    processing=processing,
                )
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

            warnings = []
            if isinstance(audio_paths, dict):
                warnings.extend(list(audio_paths.get("warnings") or []))

            key_source = "none"
            if isinstance(chords, dict) and isinstance(melody, dict) and chords.get("segments"):
                try:
                    from chord_processing import post_process_chords

                    tune_key = str(
                        (processing or {}).get("detectedKey")
                        or (processing or {}).get("key")
                        or ""
                    ).strip()
                    chord_key = str(chords.get("detectedKey") or "").strip()
                    melody_key = str(melody.get("detectedKey") or melody.get("key") or "").strip()
                    if tune_key:
                        detected_key = tune_key
                        key_source = "tune"
                    elif chord_key:
                        detected_key = chord_key
                        key_source = "chords"
                        warnings.append("key_inferred_from_chords")
                    elif melody_key:
                        detected_key = melody_key
                        key_source = "melody"
                        warnings.append("key_inferred_from_melody")
                    else:
                        detected_key = ""
                        warnings.append("no_key")

                    constrain = True
                    if isinstance(processing, dict) and "constrainChordsToKey" in processing:
                        constrain = bool(processing.get("constrainChordsToKey"))
                    else:
                        constrain = str(os.getenv("CHORD_CONSTRAIN_TO_KEY", "true")).strip().lower() not in {
                            "0",
                            "false",
                            "no",
                        }
                    beats_per_bar = int(
                        (processing or {}).get("beatsPerBar")
                        or (timing.get("beatsPerBar") if isinstance(timing, dict) else None)
                        or 4
                    )
                    change_grid = str(
                        (processing or {}).get("chordChangeGrid")
                        or os.getenv("CHORD_CHANGE_GRID", "beat")
                        or "beat"
                    )
                    chords["segments"] = post_process_chords(
                        chords.get("segments") or [],
                        key_text=detected_key,
                        constrain_to_key=constrain,
                        beat_times=shared_beat_times or chords.get("beatTimes") or [],
                        change_grid=change_grid,
                        beats_per_bar=beats_per_bar,
                    )
                    if detected_key:
                        chords["detectedKey"] = detected_key
                        chords["keySource"] = key_source
                except Exception:
                    pass
            elif isinstance(chords, dict) and chords.get("keySource"):
                key_source = str(chords.get("keySource") or "none")

            if not shared_beat_times:
                warnings.append("no_beat_grid")

            melody_backend = str((melody or {}).get("backend") or "")
            if melody_backend and "kong" not in melody_backend and "mt3" not in melody_backend:
                requested = str((processing or {}).get("melodyBackend") or "auto").lower()
                music_type = str((processing or {}).get("musicType") or "").lower()
                if requested in ("kong", "mt3") or (requested == "auto" and music_type == "piano"):
                    warnings.append("amt_fallback_basic_pitch")

            if isinstance(lyrics, dict) and not lyrics.get("text") and not lyrics.get("error"):
                warnings.append("empty_lyrics")
            if isinstance(chords, dict) and not chords.get("segments") and not chords.get("error"):
                warnings.append("empty_chords")
            if isinstance(melody, dict) and not melody.get("notes") and not melody.get("error"):
                warnings.append("empty_melody")

            if not lyrics.get("text") and not chords.get("segments") and not melody.get("notes"):
                detail = lyrics.get("error") or chords.get("error") or melody.get("error") or "Media analysis produced no results"
                raise HTTPException(status_code=502, detail=detail)

            from audio_analysis_filters import resolve_demucs_model, resolve_melody_voicing

            music_type = str((processing or {}).get("musicType") or "vocal")
            melody_voicing = resolve_melody_voicing(processing)
            stem_model = ""
            if isinstance(audio_paths, dict):
                stem_model = str(audio_paths.get("stem_model") or "")
            if not stem_model:
                stem_model = resolve_demucs_model(processing)

            # Deduplicate warnings while preserving order.
            seen = set()
            unique_warnings = []
            for item in warnings:
                if item and item not in seen:
                    seen.add(item)
                    unique_warnings.append(item)

            await report("finalize", "Finalizing analysis...", 98)
            body = {
                "lyrics": lyrics,
                "chords": chords,
                "melody": melody,
                "timing": timing,
                "inputsUsed": {
                    "fromStemCache": bool(isinstance(audio_paths, dict) and audio_paths.get("from_stem_cache")),
                    "stemCacheId": str((audio_paths or {}).get("stem_cache_id") or "") if isinstance(audio_paths, dict) else "",
                    "stemModel": stem_model,
                    "musicType": music_type,
                    "keySource": key_source,
                    "melodyBackend": melody_backend,
                    "chordBackend": str((chords or {}).get("backend") or ""),
                    "melodyVoicing": melody_voicing,
                },
                "warnings": unique_warnings,
            }
            if isinstance(audio_paths, dict) and audio_paths.get("stem_cache_id"):
                body["stemCacheId"] = audio_paths.get("stem_cache_id")
                body["fromStemCache"] = bool(audio_paths.get("from_stem_cache"))
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

    audio_bytes, filename, content_type = await resolve_linked_media_audio_bytes(
        source_url,
        source_type,
    )

    start_at = _parse_optional_seconds(payload.get("startAt"))
    end_at = _parse_optional_seconds(payload.get("endAt"))
    if start_at > 0 or end_at > 0:
        audio_bytes, filename = await _trim_audio_bytes(audio_bytes, filename, start_at, end_at)
        content_type = "audio/mpeg"

    return audio_bytes, filename, content_type, processing


def _parse_optional_seconds(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    if parsed != parsed or parsed <= 0:
        return 0.0
    return parsed


async def _trim_audio_bytes(audio_bytes, filename, start_sec=0.0, end_sec=0.0):
    """Trim media bytes with ffmpeg; returns (bytes, filename)."""
    start_sec = max(0.0, float(start_sec or 0.0))
    end_sec = max(0.0, float(end_sec or 0.0))
    if start_sec <= 0 and end_sec <= 0:
        return audio_bytes, filename

    suffix = os.path.splitext(filename or "")[1] or ".bin"
    inp_path = None
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
            temp_audio.write(audio_bytes)
            inp_path = temp_audio.name
        out_path = inp_path + ".trim.mp3"
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
        if start_sec > 0:
            cmd.extend(["-ss", str(start_sec)])
        cmd.extend(["-i", inp_path])
        if end_sec > start_sec:
            cmd.extend(["-t", str(end_sec - start_sec)])
        elif end_sec > 0 and start_sec <= 0:
            cmd.extend(["-t", str(end_sec)])
        cmd.extend(["-vn", "-acodec", "libmp3lame", "-q:a", "4", out_path])
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        try:
            _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=FFMPEG_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as exc:
            await terminate_subprocess_tree(proc)
            raise HTTPException(status_code=504, detail="Audio trim timeout") from exc
        if proc.returncode != 0 or not os.path.exists(out_path):
            detail = stderr.decode("utf-8", errors="ignore").strip()[:500]
            raise HTTPException(status_code=502, detail=detail or "Audio trim failed")
        with open(out_path, "rb") as trimmed_file:
            return trimmed_file.read(), (os.path.splitext(filename or "audio")[0] or "audio") + ".trim.mp3"
    finally:
        for path in (inp_path, out_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass


@app.options("/{path:path}")
async def options_handler(path: str, request: Request):
    return JSONResponse(content={}, headers=cors_headers(request.headers.get("origin")))


@app.get("/")
async def root(request: Request):
    origin = request.headers.get("origin")
    if static_site_enabled():
        response = static_file_response(origin, "index.html")
        if response:
            return response
    return JSONResponse(
        {
            "service": "abc2book-local-resolver",
            "health": "/health",
            "staticSite": static_site_enabled(),
            "staticSiteRoot": static_site_root() if static_site_enabled() else None,
            "endpoints": ["/youtube/:videoId/audio", "/bandcamp/audio?url=...", "/search-bandcamp", "/proxy-audio?url=...", "/transcribe", "/detect-playback-region", "/voice-command", "/detect-chords", "/analyze-media", "/search-lyrics", "/search-chords", "/search-notation", "/fetch-score-attachment", "/search-images", "/research-tune-background", "/discover-composer", "/discover-genre", "/separate-stems", "/stems/:cacheId/:stem", "/generate-practice-track", "/generate-practice-track/:jobId", "/midi-resources/:path", "/midi2xml", "/midi2analyze", "/midi2abc", "/abc2xml", "/extract-sheet-metadata", "/transcribe-sheet-image"],
            "auth": "optional (set REQUIRE_AUTH=true to require Google login)",
        },
        headers=cors_headers(origin),
    )


@app.get("/health")
async def health(request: Request, authorization: str | None = Header(default=None)):
    """Cheap liveness probe — must stay fast so static imports work under ML load."""
    oauth_bff = oauth_bff_available()
    token = get_bearer_token(authorization)
    verified = None
    verified_failed = False
    if token:
        verified = await verify_google_access_token(token)
        verified_failed = verified is None

    practice_track_ok, practice_track_backend = _practice_track_feature_flags()
    body = {
        "ok": True,
        "requireAuth": REQUIRE_AUTH,
        "staticSite": static_site_enabled(),
        "lightMode": RESOLVER_LIGHT_MODE,
        # Top-level oauthBff for auth selection; full features map so SPA
        # discovery does not assume ALL_RESOLVER_FEATURES for legacy bodies.
        "oauthBff": oauth_bff,
        "features": resolver_features(practice_track_ok),
        "practiceTrackBackend": practice_track_backend,
    }
    body.update(soundfont_health_fields())
    body.update(midi_resources_health_fields())
    body.update(music_collection_health_fields())
    body.update(build_auth_health_fields(verified, bool(token), verified_failed))
    flags = {
        "freeAccess": body.get("freeAccess", False),
        "embeddedCreds": body.get("embeddedCreds", False),
    }
    if not REQUIRE_AUTH:
        flags = auth_access_flags(None)
        body["freeAccess"] = flags["freeAccess"]
        body["embeddedCreds"] = flags["embeddedCreds"]
        body["authorized"] = True
    body["providers"] = providers_health_payload(
        allow_embedded=bool(flags.get("embeddedCreds")),
        local_backends=local_provider_backends(),
    )
    body["heavyJobs"] = heavy_jobs_status()
    if snapcast_enabled():
        builder = getattr(app.state, "snapcast_health_builder", None)
        if builder:
            body["snapcast"] = await builder(request)
        else:
            body["snapcast"] = {"enabled": True, "reachable": False, "controlUrl": None}
    return JSONResponse(body, headers=cors_headers(request.headers.get("origin")))


@app.get("/health/ready")
async def health_ready(request: Request, authorization: str | None = Header(default=None)):
    """Deep readiness probe with feature detection and optional LLM check."""
    await _refresh_llm_health_if_stale()
    features = resolver_features()
    token = get_bearer_token(authorization)
    verified = None
    verified_failed = False
    if token:
        verified = await verify_google_access_token(token)
        verified_failed = verified is None

    body = {
        "ok": True,
        "requireAuth": REQUIRE_AUTH,
        "lightMode": RESOLVER_LIGHT_MODE,
        "demucsModel": os.getenv("MELODY_DEMUCS_MODEL", "htdemucs"),
        "demucsStems": list(_demucs_stems_for_model()),
        "features": features,
        "oauthBff": bool(features.get("oauthBff")),
        "staticSite": static_site_enabled(),
    }
    body.update(soundfont_health_fields())
    body.update(midi_resources_health_fields())
    body.update(music_collection_health_fields())
    body.update(build_auth_health_fields(verified, bool(token), verified_failed))
    flags = {
        "freeAccess": body.get("freeAccess", False),
        "embeddedCreds": body.get("embeddedCreds", False),
    }
    if not REQUIRE_AUTH:
        flags = auth_access_flags(None)
        body["freeAccess"] = flags["freeAccess"]
        body["embeddedCreds"] = flags["embeddedCreds"]
        body["authorized"] = True
    body["providers"] = providers_health_payload(
        allow_embedded=bool(flags.get("embeddedCreds")),
        local_backends=local_provider_backends(),
    )
    body["heavyJobs"] = heavy_jobs_status()
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
        await require_resolver_feature("proxy")
        track_resolver_usage('proxy-audio')
        validated, error = validate_target_url(url)
        if error:
            return json_error(400, error, origin)
        response = await stream_upstream(validated, request)
        response.headers.update(cors_headers(origin))
        return response
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/bandcamp/audio")
async def bandcamp_audio(
    request: Request,
    url: str = Query(...),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("proxy")
        if not bandcamp_enabled():
            return json_error(404, "Bandcamp is not available", origin)
        track_resolver_usage("bandcamp-audio")
        if not is_bandcamp_url(url):
            return json_error(400, "Invalid Bandcamp URL", origin)
        proxy = resolve_ytdlp_proxy_from_request(request)
        response, error = await stream_url_via_ytdlp(url, proxy=proxy)
        if error:
            return json_error(502, "Could not resolve Bandcamp audio stream", origin, error)
        response.headers.update(cors_headers(origin))
        return response
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/internet-archive/audio")
async def internet_archive_audio(
    request: Request,
    url: str = Query(...),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("proxy")
        if not internet_archive_enabled():
            return json_error(404, "Internet Archive is not available", origin)
        track_resolver_usage("internet-archive-audio")
        if not is_archive_org_url(url):
            return json_error(400, "Invalid Internet Archive URL", origin)
        playback_url = await resolve_archive_playback_url(url)
        if not playback_url:
            return json_error(502, "Could not resolve Internet Archive audio file", origin)
        validated, error = validate_target_url(playback_url)
        if error:
            return json_error(400, error, origin)
        response = await stream_upstream(validated, request)
        response.headers.update(cors_headers(origin))
        return response
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/loc/audio")
async def loc_audio(
    request: Request,
    url: str = Query(...),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("proxy")
        if not loc_audio_enabled():
            return json_error(404, "Library of Congress audio is not available", origin)
        track_resolver_usage("loc-audio")
        if not is_loc_gov_url(url):
            return json_error(400, "Invalid Library of Congress URL", origin)
        playback_url = await resolve_loc_playback_url(url)
        if not playback_url:
            return json_error(502, "Could not resolve Library of Congress audio file", origin)
        validated, error = validate_target_url(playback_url)
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
        await require_resolver_feature("proxy")
        track_resolver_usage('youtube-audio')
        proxy = resolve_ytdlp_proxy_from_request(request)
        ensure_youtube_egress_allowed(proxy)
        response, error = await stream_youtube_via_ytdlp(video_id, proxy=proxy)
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

            try:
                audio_bytes, filename, content_type = await resolve_linked_media_audio_bytes(
                    source_url,
                    source_type,
                )
            except HTTPException as exc:
                return json_error(exc.status_code, str(exc.detail), origin)

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


async def analyze_practice_from_audio(audio_bytes, filename, request, expected_config):
    autochord_python = os.getenv("AUTOCHORD_VENV_PYTHON", "/opt/autochord-venv/bin/python")
    script_path = os.path.join(os.path.dirname(__file__), "analyze_practice.py")
    suffix = os.path.splitext(filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        temp_audio.write(audio_bytes)
        temp_audio_path = temp_audio.name
    config_path = None
    try:
        if expected_config:
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".json", mode="w", encoding="utf-8"
            ) as config_file:
                json.dump(expected_config, config_file)
                config_path = config_file.name
        command = [autochord_python, script_path, temp_audio_path]
        if config_path:
            command.append(config_path)
        returncode, stdout_text, stderr_text = await run_subprocess_with_disconnect(
            command, env=_autochord_env(), request=request
        )
        if returncode != 0:
            return {"error": stderr_text or "practice analysis failed", "backend": "none"}
        return _parse_subprocess_json(stdout_text)
    finally:
        try:
            os.unlink(temp_audio_path)
        except OSError:
            pass
        if config_path:
            try:
                os.unlink(config_path)
            except OSError:
                pass


@app.post("/analyze-practice")
async def analyze_practice(
    request: Request,
    file: UploadFile | None = File(default=None),
    expected: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("practiceAnalysis")
        track_resolver_usage("analyze-practice")

        if file is None:
            return json_error(400, "file is required", origin)

        audio_bytes = await file.read()
        filename = file.filename or "practice.webm"
        if not audio_bytes:
            return json_error(400, "empty audio", origin)
        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        expected_config = {}
        if expected:
            try:
                expected_config = json.loads(expected)
            except json.JSONDecodeError:
                return json_error(400, "invalid expected JSON", origin)

        body = await analyze_practice_from_audio(
            audio_bytes, filename, request, expected_config
        )
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
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("whisper", request, verified)
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

            try:
                audio_bytes, filename, content_type = await resolve_linked_media_audio_bytes(
                    source_url,
                    source_type,
                )
            except HTTPException as exc:
                return json_error(exc.status_code, str(exc.detail), origin)

        if not audio_bytes:
            return JSONResponse(
                {"text": "", "segments": [], "language": "", "backend": "none"},
                headers=cors_headers(origin),
            )

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        provider_cfg = await resolve_request_provider(
            "whisper",
            request,
            verified,
            local_available=_whisper_local_available(),
        )
        body = await forward_to_whisper(
            audio_bytes, filename, content_type, request, provider_cfg=provider_cfg
        )
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

    async with heavy_job_slot():
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
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("whisper", request, verified)
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


async def _process_voice_command_audio(
    audio_bytes, filename, books, tags, request, voice_mode, verified=None
):
    total_started = time.monotonic()
    transcribe_started = time.monotonic()
    suffix = os.path.splitext(filename or "audio.wav")[1] or ".wav"
    temp_audio_path = None
    wav_path = None

    try:
        async with heavy_job_slot():
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
                verified=verified,
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
                llm_cfg = await _resolve_llm_for_request(request, verified, voice=True)
                with use_llm_provider(llm_cfg):
                    intent = await parse_voice_intent(
                        transcript, books, tags, voice_mode=voice_mode
                    )
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
    mode: str = Form(default="playback"),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("whisper", request, verified)
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

        voice_mode = (mode or "playback").strip().lower() or "playback"
        if voice_mode not in {"playback", "help"}:
            voice_mode = "playback"

        filename = file.filename or "voice-command.webm"
        body = await _process_voice_command_audio(
            audio_bytes,
            filename,
            book_list,
            tag_list,
            request,
            voice_mode,
            verified=verified,
        )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/help-query")
async def help_query_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("llm", request, verified)
        track_resolver_usage("help-query")

        payload = await request.json()
        question = str(payload.get("question") or payload.get("query") or "").strip()
        if not question:
            return json_error(400, "Missing help question", origin)

        llm_cfg = await _resolve_llm_for_request(request, verified, voice=True)
        with use_llm_provider(llm_cfg):
            intent = await parse_help_intent_llm(question)
        body = {
            "question": question,
            "answer": intent.get("helpAnswer")
            or "Open the related help topic below for step-by-step guidance on this question.",
            "links": list(intent.get("helpLinks") or []),
            "confidence": float(intent.get("confidence") or 0.0),
            "parseMethod": str(intent.get("parseMethod") or "llm"),
        }
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
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


def _lyrics_word_term(payload):
    return str(
        payload.get("term")
        or payload.get("query")
        or payload.get("word")
        or payload.get("phrase")
        or ""
    ).strip()


async def _run_lyrics_word_lookup(request, authorization, usage_name, lookup_fn):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage(usage_name)
        payload = await request.json()
        term = _lyrics_word_term(payload)
        if not term:
            return json_error(400, "Missing search term", origin)
        body = await lookup_fn(term)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "Lyrics word lookup failed"
        return json_error(500, detail, origin)


@app.post("/lyrics-dictionary")
async def lyrics_dictionary_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await _run_lyrics_word_lookup(request, authorization, "lyrics-dictionary", lookup_dictionary)


@app.post("/lyrics-thesaurus")
async def lyrics_thesaurus_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await _run_lyrics_word_lookup(request, authorization, "lyrics-thesaurus", lookup_thesaurus)


@app.post("/lyrics-rhyme")
async def lyrics_rhyme_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await _run_lyrics_word_lookup(request, authorization, "lyrics-rhyme", lookup_rhymes)


@app.post("/lyrics-reverse-dictionary")
async def lyrics_reverse_dictionary_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await _run_lyrics_word_lookup(
        request,
        authorization,
        "lyrics-reverse-dictionary",
        lookup_reverse_dictionary,
    )


@app.post("/lyrics-phrases")
async def lyrics_phrases_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await _run_lyrics_word_lookup(request, authorization, "lyrics-phrases", lookup_phrase_ideas)


@app.post("/lyrics-alliteration")
async def lyrics_alliteration_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await _run_lyrics_word_lookup(request, authorization, "lyrics-alliteration", lookup_alliteration)


@app.post("/search-chords")
async def search_chords_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        track_resolver_usage('search-chords')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        page_url = str(payload.get("url") or "").strip()
        llm_cfg = await _resolve_llm_for_request(request, verified)

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
                        with use_llm_provider(llm_cfg):
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

        with use_llm_provider(llm_cfg):
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
        page_url = str(payload.get("url") or "").strip()
        midi_fallback = bool(payload.get("midiFallback"))

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
                            body = await search_notation_url(
                                page_url,
                                on_progress=on_progress,
                            )
                        elif midi_fallback:
                            body = await search_notation_secondary_fallback(
                                title,
                                artist,
                                song_type=song_type,
                                on_progress=on_progress,
                            )
                        else:
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

        if page_url:
            body = await search_notation_url(page_url)
        elif midi_fallback:
            body = await search_notation_secondary_fallback(
                title,
                artist,
                song_type=song_type,
            )
        else:
            body = await search_notation(title, artist, song_type=song_type)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/fetch-score-attachment")
async def fetch_score_attachment_endpoint(
    request: Request,
    url: str = Query(default=""),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage("fetch-score-attachment")
        page_url = str(url or "").strip()
        if not page_url:
            raise ValueError("url query parameter is required")
        if not is_allowed_score_attachment_url(page_url):
            raise ValueError("URL host is not allowed for score attachment download")
        data, content_type = await fetch_score_attachment_bytes(page_url)
        headers = cors_headers(origin)
        headers["Content-Type"] = content_type
        headers["Content-Disposition"] = 'inline; filename="score.pdf"'
        return Response(content=data, headers=headers)
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/search-images")
async def search_images_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        if not image_search_available():
            return json_error(503, "Image search is not configured (set BRAVE_SEARCH_API_KEY)", origin)
        track_resolver_usage("search-images")

        payload = await request.json()
        query = str(payload.get("query") or payload.get("q") or "").strip()
        count = payload.get("count")
        body = await search_images(query, count=count or 24)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except RuntimeError as exc:
        return json_error(502, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


async def stream_tune_background_research_events(
    title, artist, lyrics="", existing_background=""
):
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
            body = await research_tune_background(
                title,
                artist,
                lyrics,
                existing_background,
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


@app.post("/research-tune-background")
async def research_tune_background_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("llm", request, verified)
        track_resolver_usage('research-tune-background')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        lyrics = str(payload.get("lyrics") or "")
        existing_background = str(
            payload.get("backgroundInfo")
            or payload.get("existingBackground")
            or ""
        )
        llm_cfg = await _resolve_llm_for_request(request, verified)

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept
        if wants_stream:
            async def body():
                with use_llm_provider(llm_cfg):
                    async for line in stream_tune_background_research_events(
                        title, artist, lyrics, existing_background
                    ):
                        yield line.encode("utf-8")

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(body(), media_type="application/x-ndjson", headers=headers)

        with use_llm_provider(llm_cfg):
            body = await research_tune_background(
                title, artist, lyrics, existing_background
            )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/generate-feed-articles")
async def generate_feed_articles_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("llm", request, verified)
        track_resolver_usage("generate-feed-articles")
        payload = await request.json()
        llm_cfg = await _resolve_llm_for_request(request, verified)
        with use_llm_provider(llm_cfg):
            body = await generate_feed_articles(
                str(payload.get("title") or "").strip(),
                str(payload.get("artist") or "").strip(),
                payload.get("facts") if isinstance(payload.get("facts"), list) else [],
                str(payload.get("backgroundInfo") or ""),
            )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/generate-feed-quizzes")
async def generate_feed_quizzes_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("llm", request, verified)
        track_resolver_usage("generate-feed-quizzes")
        payload = await request.json()
        llm_cfg = await _resolve_llm_for_request(request, verified)
        with use_llm_provider(llm_cfg):
            body = await generate_feed_quizzes(
                str(payload.get("title") or "").strip(),
                str(payload.get("artist") or "").strip(),
                payload.get("facts") if isinstance(payload.get("facts"), list) else [],
                str(payload.get("backgroundInfo") or ""),
            )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/enrich-feed-sources")
async def enrich_feed_sources_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage("enrich-feed-sources")
        payload = await request.json()
        body = await enrich_feed_sources(
            str(payload.get("title") or "").strip(),
            str(payload.get("artist") or "").strip(),
        )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/discover-composer")
async def discover_composer_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        track_resolver_usage('discover-composer')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        title_hint = str(payload.get("titleHint") or payload.get("title_hint") or "").strip()
        llm_cfg = await _resolve_llm_for_request(request, verified)

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
                        with use_llm_provider(llm_cfg):
                            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                                body = await discover_composer(
                                    client,
                                    title,
                                    artist=artist,
                                    title_hint=title_hint,
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

        with use_llm_provider(llm_cfg):
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                body = await discover_composer(
                    client,
                    title,
                    artist=artist,
                    title_hint=title_hint,
                )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/discover-genre")
async def discover_genre_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        track_resolver_usage('discover-genre')

        payload = await request.json()
        title = str(payload.get("title") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        rhythm = str(payload.get("rhythm") or "").strip()
        background_info = str(
            payload.get("backgroundInfo") or payload.get("background_info") or ""
        ).strip()
        current_genre = str(
            payload.get("currentGenre") or payload.get("current_genre") or ""
        ).strip()
        llm_cfg = await _resolve_llm_for_request(request, verified)

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
                        with use_llm_provider(llm_cfg):
                            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                                body = await discover_genre(
                                    client,
                                    title,
                                    artist=artist,
                                    rhythm=rhythm,
                                    background_info=background_info,
                                    current_genre=current_genre,
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

        with use_llm_provider(llm_cfg):
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                body = await discover_genre(
                    client,
                    title,
                    artist=artist,
                    rhythm=rhythm,
                    background_info=background_info,
                    current_genre=current_genre,
                )
        return JSONResponse(content=body, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


def _sanitize_abc_for_musicxml(abc_text: str) -> str:
    import re

    lines = []
    for line in str(abc_text or "").splitlines():
        stripped = line.rstrip()
        if not stripped:
            continue
        if stripped.startswith("%"):
            continue
        if re.match(r"^M:\s*$", stripped):
            continue
        lines.append(stripped)

    cleaned = "\n".join(lines).strip()
    if not cleaned:
        raise ValueError("ABC notation is empty after cleanup")
    return cleaned


_ABC_HEADER_FIELD_RE = re.compile(r"^[A-Za-z]:")


def _parse_abc_lyrics(abc_text: str):
    block_lines = []
    voice_w_lines = {}
    voice_order = []
    current_voice = "1"

    for line in str(abc_text or "").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("%"):
            continue
        if stripped.startswith("W:"):
            text = stripped[2:].strip()
            if text:
                block_lines.append(text)
            continue
        if stripped.startswith("w:"):
            text = stripped[2:].strip().rstrip("|").strip()
            if text:
                voice_w_lines.setdefault(current_voice, []).append(text)
            continue
        if stripped.startswith("V:"):
            voice_id = stripped[2:].strip().split(None, 1)[0] or "1"
            current_voice = voice_id
            if voice_id not in voice_order:
                voice_order.append(voice_id)
            continue
        if _ABC_HEADER_FIELD_RE.match(stripped):
            continue

    if not voice_order and voice_w_lines:
        voice_order = list(voice_w_lines.keys())

    return block_lines, voice_w_lines, voice_order


def _tokenize_abc_w_verse(verse_text: str):
    tokens = []
    for raw in str(verse_text or "").split():
        if raw == "*":
            tokens.append({"type": "skip"})
        elif raw == "_":
            tokens.append({"type": "extend"})
        else:
            hyphen = len(raw) > 1 and raw.endswith("-") and not raw.endswith("\\-")
            text = raw[:-1] if hyphen else raw
            text = text.replace("\\-", "-").replace("\\\\", "\\")
            tokens.append({"type": "text", "text": text, "hyphen": hyphen})
    return tokens


def _collect_melodic_notes(part):
    from music21 import note

    collected = []
    for element in part.recurse().notes:
        if isinstance(element, note.Rest):
            continue
        collected.append(element)
    return collected


def _apply_w_lines_to_part(part, w_lines):
    notes = _collect_melodic_notes(part)
    note_idx = 0

    for w_line in w_lines:
        verses = [verse.strip() for verse in str(w_line or "").split("|") if verse.strip()]
        if not verses:
            continue
        verse_tokens = [_tokenize_abc_w_verse(verse) for verse in verses]
        token_count = max(len(tokens) for tokens in verse_tokens)

        for token_pos in range(token_count):
            if note_idx >= len(notes):
                break
            target = notes[note_idx]
            advance = False

            for verse_num, tokens in enumerate(verse_tokens, start=1):
                if token_pos >= len(tokens):
                    continue
                token = tokens[token_pos]
                token_type = token.get("type")
                if token_type == "skip":
                    advance = True
                    continue
                if token_type == "extend":
                    if target.lyrics:
                        target.lyrics[-1].isMelisma = True
                    advance = True
                    continue
                text = token.get("text", "")
                if not text:
                    continue
                target.addLyric(text, lyricNumber=verse_num)
                if token.get("hyphen"):
                    target.lyrics[-1].syllabic = "begin"
                advance = True

            if advance:
                note_idx += 1


def _apply_block_lyrics_to_part(part, block_lines):
    notes = _collect_melodic_notes(part)
    if not notes or not block_lines:
        return

    words = []
    for line in block_lines:
        text = str(line or "").strip()
        if not text or (text.startswith("[") and text.endswith("]")):
            continue
        words.extend(text.split())

    note_idx = 0
    for word in words:
        if note_idx >= len(notes):
            break
        notes[note_idx].addLyric(word)
        note_idx += 1


def _apply_block_lyrics_to_score(score, block_lines):
    if not block_lines:
        return

    parts = list(score.parts) if score.parts else [score]
    for part in parts:
        if _collect_melodic_notes(part):
            _apply_block_lyrics_to_part(part, block_lines)
            return


def _apply_abc_lyrics_to_score(score, block_lines, voice_w_lines, voice_order):
    if not block_lines and not voice_w_lines:
        return

    parts = list(score.parts)
    if not parts:
        parts = [score]

    if voice_w_lines:
        if voice_order:
            for voice_idx, voice_id in enumerate(voice_order):
                w_lines = voice_w_lines.get(voice_id) or []
                if not w_lines or voice_idx >= len(parts):
                    continue
                _apply_w_lines_to_part(parts[voice_idx], w_lines)
        else:
            first_voice = next(iter(voice_w_lines))
            _apply_w_lines_to_part(parts[0], voice_w_lines.get(first_voice) or [])

    _apply_block_lyrics_to_score(score, block_lines)


def _finalize_score_for_musicxml(score):
    from music21 import note, stream

    prepared = score.makeNotation()
    for part in prepared.parts:
        part.makeRests(inPlace=True, fillGaps=True, timeRangeFromBarDuration=True)
        for measure in part.getElementsByClass(stream.Measure):
            notes_rests = list(measure.notesAndRests)
            expected = measure.barDuration.quarterLength
            if not expected:
                continue
            if not notes_rests:
                measure.insert(0, note.Rest(quarterLength=expected))
                continue
            filled = sum(n.duration.quarterLength for n in notes_rests)
            if filled + 0.001 < expected:
                measure.insert(filled, note.Rest(quarterLength=expected - filled))
    return prepared


def _write_prepared_score_to_musicxml(prepared) -> str:
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".musicxml", delete=False) as temp_file:
        temp_path = temp_file.name
    try:
        prepared.write("musicxml", fp=temp_path)
        with open(temp_path, "r", encoding="utf-8") as handle:
            return handle.read()
    finally:
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass


def _write_score_to_musicxml(score) -> str:
    prepared = _finalize_score_for_musicxml(score)
    return _write_prepared_score_to_musicxml(prepared)


async def convert_abc_to_musicxml(abc_text: str) -> str:
    def _convert():
        from music21 import converter

        cleaned = _sanitize_abc_for_musicxml(abc_text)
        block_lines, voice_w_lines, voice_order = _parse_abc_lyrics(abc_text)
        score = converter.parse(cleaned, format="abc")
        prepared = _finalize_score_for_musicxml(score)
        _apply_abc_lyrics_to_score(prepared, block_lines, voice_w_lines, voice_order)
        return _write_prepared_score_to_musicxml(prepared)

    return await asyncio.to_thread(_convert)


@app.post("/separate-stems")
async def separate_stems(
    request: Request,
    file: UploadFile | None = File(default=None),
    demucsModel: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        provider_cfg = await resolve_request_provider(
            "stems",
            request,
            verified,
            local_available=_stems_available(),
        )
        if is_cloud_stems_provider(provider_cfg):
            pass  # cloud BYO/host — no local Demucs required
        elif _stems_available():
            await require_resolver_feature("stems")
        else:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Stems provider required (Settings → Providers fal/Replicate, "
                    "host PROVIDER_STEMS_*, or a full home resolver with Demucs)"
                ),
            )
        track_resolver_usage('separate-stems')

        model_override = str(demucsModel or "").strip() or None
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
            model_override = str(payload.get("demucsModel") or payload.get("model") or demucsModel or "").strip() or None

        if not audio_bytes:
            return json_error(400, "No audio data", origin)

        if len(audio_bytes) > MAX_STREAM_BYTES:
            return json_error(413, "Media file too large", origin)

        body = await separate_stems_from_audio(
            audio_bytes,
            filename,
            source_key,
            request,
            provider_cfg=provider_cfg,
            model_override=model_override,
        )
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


@app.get("/generate-practice-track/backends")
async def generate_practice_track_backends(
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await get_practice_track_backends(
        request,
        authorization,
        maybe_require_auth=maybe_require_auth,
        cors_headers=cors_headers,
    )


@app.post("/render-midi")
async def render_midi(
    request: Request,
    midi: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    return await post_render_midi(
        request,
        midi=midi,
        authorization=authorization,
        maybe_require_auth=maybe_require_auth,
        cors_headers=cors_headers,
    )


@app.post("/generate-practice-track")
async def generate_practice_track(
    request: Request,
    timingPlan: str = Form(...),
    melody: UploadFile = File(...),
    chords: UploadFile | None = File(default=None),
    score: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    return await post_generate_practice_track(
        request,
        timing_plan=timingPlan,
        melody=melody,
        chords=chords,
        score=score,
        authorization=authorization,
        maybe_require_auth=maybe_require_auth,
        cors_headers=cors_headers,
        heavy_job_slot=heavy_job_slot,
    )


@app.get("/generate-practice-track/{job_id}")
async def generate_practice_track_status(
    job_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await get_practice_track_job(
        job_id,
        request,
        authorization,
        maybe_require_auth=maybe_require_auth,
        cors_headers=cors_headers,
    )


@app.get("/generate-practice-track/{job_id}/audio")
async def generate_practice_track_audio(
    job_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    return await get_practice_track_audio(
        job_id,
        request,
        authorization,
        maybe_require_auth=maybe_require_auth,
        cors_headers=cors_headers,
    )


@app.get("/midi-resources/{resource_path:path}")
async def get_midi_resource_file(
    resource_path: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        if not midi_resources_enabled():
            return json_error(404, "Local MIDI library is not available", origin)
        abs_path = resolve_midi_resource_file(resource_path)
        filename = os.path.basename(abs_path)
        return FileResponse(
            abs_path,
            media_type="audio/midi",
            filename=filename,
            headers=cors_headers(origin),
        )
    except FileNotFoundError:
        return json_error(404, "MIDI file not found", origin)
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/search-bandcamp")
async def search_bandcamp_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("bandcamp")
        if not bandcamp_enabled():
            return json_error(404, "Bandcamp is not available", origin)
        track_resolver_usage("search-bandcamp")
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_bandcamp(query, title=title, artist=artist, limit=limit)
        candidates = [build_bandcamp_candidate(match, title=title, artist=artist) for match in matches]
        return JSONResponse(
            {"ok": True, "candidates": candidates},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/search-internet-archive")
async def search_internet_archive_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("internetArchive")
        if not internet_archive_enabled():
            return json_error(404, "Internet Archive is not available", origin)
        track_resolver_usage("search-internet-archive")
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
        return JSONResponse(
            {"ok": True, "candidates": candidates},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/search-europeana")
async def search_europeana_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("europeana")
        if not europeana_enabled():
            return json_error(404, "Europeana is not available", origin)
        track_resolver_usage("search-europeana")
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_europeana(query, title=title, artist=artist, limit=limit)
        candidates = [build_europeana_candidate(match, title=title, artist=artist) for match in matches]
        return JSONResponse(
            {"ok": True, "candidates": candidates},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/search-loc-audio")
async def search_loc_audio_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        await require_resolver_feature("locAudio")
        if not loc_audio_enabled():
            return json_error(404, "Library of Congress audio is not available", origin)
        track_resolver_usage("search-loc-audio")
        payload = await request.json()
        title = str(payload.get("title") or payload.get("query") or "").strip()
        artist = str(payload.get("artist") or "").strip()
        query = str(payload.get("query") or "").strip() or " ".join(
            part for part in [title, artist] if part
        ).strip()
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = await search_loc_audio(query, title=title, artist=artist, limit=limit)
        candidates = [build_loc_audio_candidate(match, title=title, artist=artist) for match in matches]
        return JSONResponse(
            {"ok": True, "candidates": candidates},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/search-music-collection")
async def search_music_collection_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        track_resolver_usage("search-music-collection")
        payload = await request.json()
        query = str(payload.get("query") or "").strip()
        title = str(payload.get("title") or query or "").strip()
        artist = str(payload.get("artist") or "").strip()
        if query and not artist:
            inferred_title, inferred_artist = infer_title_artist_from_query(query)
            if inferred_artist:
                title = str(payload.get("title") or inferred_title or title).strip()
                artist = inferred_artist
        limit = int(payload.get("limit") or payload.get("maxResults") or 20)
        matches = search_music_collection(title, artist=artist, limit=limit)
        request_base = str(request.base_url).rstrip("/")
        candidates = [
            build_music_collection_candidate(match, request_base_url=request_base)
            for match in matches
        ]
        return JSONResponse(
            {"ok": True, "candidates": candidates},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/rebuild-music-collection-index")
async def rebuild_music_collection_index_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        track_resolver_usage("rebuild-music-collection-index")
        payload = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        extract_art = payload.get("extractArt", True) is not False
        resume = payload.get("resume", False) is True
        background = payload.get("background", True) is not False
        if background:
            result = rebuild_music_collection_index(
                extract_art=extract_art,
                resume=resume,
                background=True,
            )
            body = dict(result)
            body.update(music_collection_health_fields())
            return JSONResponse(body, headers=cors_headers(origin))

        index = rebuild_music_collection_index(extract_art=extract_art, resume=resume, background=False)
        body = {
            "ok": True,
            "count": int(index.get("count") or 0),
            "tokens": len(index.get("tokens") or {}),
            "indexPath": music_collection_index_path(),
            "root": music_collection_root(),
        }
        body.update(music_collection_health_fields())
        return JSONResponse(body, headers=cors_headers(origin))
    except FileNotFoundError as exc:
        return json_error(404, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection-stats")
async def music_collection_stats_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        from music_collection_indexer import BUILD_ERRORS_NAME, is_build_running

        metadata_dir = os.path.dirname(music_collection_stats_path())
        build_running = is_build_running(metadata_dir)
        if not music_collection_enabled() and not build_running:
            return json_error(404, "Music collection index not found", origin)
        track_resolver_usage("music-collection-stats")
        payload = load_music_collection_stats() or {}
        progress_path = os.path.join(metadata_dir, "build_progress.json")
        progress = None
        if os.path.isfile(progress_path):
            try:
                with open(progress_path, "r", encoding="utf-8") as handle:
                    progress = json.load(handle)
            except Exception:
                progress = None
        recent_errors = []
        errors_path = os.path.join(metadata_dir, BUILD_ERRORS_NAME)
        if os.path.isfile(errors_path):
            try:
                with open(errors_path, "r", encoding="utf-8") as handle:
                    lines = [line.strip() for line in handle if line.strip()]
                for line in lines[-10:]:
                    try:
                        recent_errors.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            except OSError:
                recent_errors = []
        body = {
            "ok": True,
            "stats": payload.get("stats") or {},
            "builtAt": payload.get("builtAt"),
            "count": payload.get("count"),
            "progress": progress,
            "buildRunning": build_running,
            "recentErrors": recent_errors,
            "statsPath": music_collection_stats_path(),
            "indexPath": music_collection_index_path(),
            "root": music_collection_root(),
        }
        body.update(music_collection_health_fields())
        return JSONResponse(body, headers=cors_headers(origin))
    except FileNotFoundError as exc:
        return json_error(404, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection-registry")
async def music_collection_registry_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        from music_collection_registry import load_music_collection_registry

        return JSONResponse(
            {"ok": True, "registry": load_music_collection_registry()},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/browse-music-collection")
async def browse_music_collection_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
    phase: str = "",
    genre: str = "",
    artist: str = "",
    collectionId: str = "",
    triageStatus: str = "",
    unplayedOnly: bool = False,
    query: str = "",
    limit: int = 50,
    offset: int = 0,
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        from music_collection_browse import browse_music_collection

        track_resolver_usage("browse-music-collection")
        body = browse_music_collection(
            phase=phase,
            genre=genre,
            artist=artist,
            collection_id=collectionId,
            triage_status=triageStatus,
            unplayed_only=unplayedOnly,
            query=query,
            limit=limit,
            offset=offset,
        )
        return JSONResponse({"ok": True, **body}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection-artists")
async def music_collection_artists_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
    phase: str = "",
    query: str = "",
    limit: int = 50,
    offset: int = 0,
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        from music_collection_browse import aggregate_artists

        track_resolver_usage("music-collection-artists")
        body = aggregate_artists(phase=phase, query=query, limit=limit, offset=offset)
        return JSONResponse({"ok": True, **body}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection-chunks")
async def music_collection_chunks_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
    phase: str = "",
    query: str = "",
    limit: int = 50,
    offset: int = 0,
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        from music_collection_browse import aggregate_chunks

        track_resolver_usage("music-collection-chunks")
        body = aggregate_chunks(phase=phase, query=query, limit=limit, offset=offset)
        return JSONResponse({"ok": True, **body}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection-duplicates")
async def music_collection_duplicates_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
    groupType: str = "songKey",
    phase: str = "",
    songKey: str = "",
    limit: int = 50,
    offset: int = 0,
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        from music_collection import load_music_collection_index
        from music_collection_analytics import build_duplicate_groups
        from music_collection_moves import filter_entries_for_phase

        track_resolver_usage("music-collection-duplicates")
        index = load_music_collection_index() or {}
        entries = filter_entries_for_phase(index.get("entries") or {}, phase)
        if songKey:
            groups = []
            matches = []
            for entry_id, entry in entries.items():
                if not isinstance(entry, dict):
                    continue
                if str(entry.get("songKey") or "") == songKey:
                    matches.append(entry_id)
            if len(matches) > 1:
                groups = build_duplicate_groups(
                    {eid: entries[eid] for eid in matches},
                    group_type=groupType,
                    limit=1,
                )
        else:
            all_groups = build_duplicate_groups(entries, group_type=groupType, limit=5000)
            start = max(int(offset or 0), 0)
            end = start + max(int(limit or 50), 1)
            groups = all_groups[start:end]
            return JSONResponse(
                {"ok": True, "groups": groups, "total": len(all_groups), "offset": start, "limit": limit},
                headers=cors_headers(origin),
            )
        return JSONResponse({"ok": True, "groups": groups, "total": len(groups), "offset": 0, "limit": limit}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/music-collection-triage/bulk")
async def music_collection_triage_bulk_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        from music_collection_curation import set_triage_bulk_scope

        track_resolver_usage("music-collection-triage-bulk")
        payload = await request.json()
        play_min = payload.get("playCountMin")
        play_max = payload.get("playCountMax")
        result = set_triage_bulk_scope(
            scope=str(payload.get("scope") or "").strip(),
            value=str(payload.get("value") or ""),
            phase=str(payload.get("phase") or "").strip(),
            status=str(payload.get("status") or "").strip().lower(),
            play_count_min=int(play_min) if play_min is not None else None,
            play_count_max=int(play_max) if play_max is not None else None,
            triage_unset_only=payload.get("triageUnsetOnly") is True,
            note=str(payload.get("note") or ""),
        )
        return JSONResponse({"ok": True, **result}, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.post("/music-collection-triage")
async def music_collection_triage_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        from music_collection_curation import set_triage

        track_resolver_usage("music-collection-triage")
        payload = await request.json()
        entry_id = str(payload.get("entryId") or payload.get("id") or "").strip()
        status = str(payload.get("status") or "").strip().lower()
        note = str(payload.get("note") or "")
        result = set_triage(entry_id, status, note=note)
        return JSONResponse({"ok": True, **result}, headers=cors_headers(origin))
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection-triage")
async def music_collection_triage_list_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
    status: str = "",
    limit: int = 500,
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        from music_collection_curation import list_triage

        items = list_triage(status=status or None, limit=limit)
        return JSONResponse({"ok": True, "items": items}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.post("/music-collection-move-plan")
async def music_collection_move_plan_endpoint(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        from music_collection_curation import save_move_plan
        from music_collection_moves import plan_duplicate_quarantine, plan_library_moves

        track_resolver_usage("music-collection-move-plan")
        payload = await request.json()
        plan_type = str(payload.get("type") or "library").strip().lower()
        phase = str(payload.get("phase") or "").strip()
        apply_moves = payload.get("apply") is True
        staging = payload.get("staging") is True
        if plan_type == "duplicates":
            body = plan_duplicate_quarantine(
                group_type=str(payload.get("groupType") or "songKey"),
                phase=phase,
                limit=int(payload.get("limit") or 200),
            )
            name = f"duplicate-quarantine-{phase or 'all'}"
        else:
            body = plan_library_moves(
                phase=phase,
                triage_only=payload.get("triageOnly") is not False,
                include_duplicates=payload.get("includeDuplicates") is True,
                limit=int(payload.get("limit") or 5000),
            )
            name = f"library-moves-{phase or 'all'}"
        saved = save_move_plan(name, body, status="draft")
        response = {"ok": True, "planId": saved.get("id"), "plan": body}
        if apply_moves:
            from music_collection_moves import apply_move_plan, mark_move_plan_applied

            applied = apply_move_plan(body, apply=True, staging=staging)
            mark_move_plan_applied(saved.get("id"))
            response["applied"] = applied
        return JSONResponse(response, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        return json_error(500, str(exc), origin)


@app.get("/music-collection/{resource_path:path}")
async def get_music_collection_file(
    resource_path: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        track_resolver_usage("music-collection")
        abs_path = resolve_music_collection_file(resource_path)
        filename = os.path.basename(abs_path)
        return FileResponse(
            abs_path,
            media_type=guess_audio_mime_type(abs_path),
            filename=filename,
            headers=cors_headers(origin),
        )
    except FileNotFoundError:
        return json_error(404, "Audio file not found", origin)
    except ValueError as exc:
        return json_error(400, str(exc), origin)
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)


@app.get("/music-collection-art/{entry_id}")
async def get_music_collection_art(
    entry_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await require_music_collection_access(authorization)
        if not music_collection_enabled():
            return json_error(404, "Music collection is not available", origin)
        abs_path = resolve_music_collection_art_file(entry_id)
        mime = guess_audio_mime_type(abs_path)
        if mime == "application/octet-stream":
            lower = abs_path.lower()
            if lower.endswith(".png"):
                mime = "image/png"
            elif lower.endswith(".webp"):
                mime = "image/webp"
            else:
                mime = "image/jpeg"
        return FileResponse(abs_path, media_type=mime, headers=cors_headers(origin))
    except FileNotFoundError:
        return json_error(404, "Album art not found", origin)
    except ValueError as exc:
        return json_error(400, str(exc), origin)
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

        music_xml, _diagnostics = await convert_midi_to_musicxml(midi_bytes, filename)
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


@app.post("/score2xml")
async def score2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('score2xml')
        import os
        import tempfile
        from musescore_fetch import _convert_score_file_to_musicxml

        if file is None:
            return json_error(400, "Missing score file upload", origin)

        data = await file.read()
        if not data:
            return json_error(400, "Score file is empty", origin)

        suffix = os.path.splitext(file.filename or "")[1].lower() or ".mscx"
        with tempfile.TemporaryDirectory() as temp_dir:
            in_path = os.path.join(temp_dir, "upload" + suffix)
            with open(in_path, "wb") as handle:
                handle.write(data)
            music_xml = _convert_score_file_to_musicxml(in_path, temp_dir, output_stem="score_import")

        return Response(
            content=music_xml,
            media_type="application/xml",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "Score conversion failed"
        return json_error(500, detail, origin)


@app.post("/midi2analyze")
async def midi2analyze(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('midi2analyze')

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

        result = await asyncio.to_thread(analyze_midi_for_import, midi_bytes, filename)
        return JSONResponse({"profile": result}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "MIDI analysis failed"
        return json_error(500, detail, origin)


def _parse_int_list_param(raw: str | None) -> list[int]:
    if not raw:
        return []
    values: list[int] = []
    for part in str(raw).split(","):
        part = part.strip()
        if not part:
            continue
        try:
            values.append(int(part))
        except ValueError:
            continue
    return values


def _parse_cleanup_options(request: Request) -> dict | None:
    import json

    raw = request.query_params.get("cleanup_options")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


@app.post("/midi2abc")
async def midi2abc(
    request: Request,
    file: UploadFile | None = File(default=None),
    mode: str | None = None,
    strategy: str = "auto",
    include_chords: bool | None = None,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('midi2abc')

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

        forced_mode = (mode or "").strip().lower() or None
        if forced_mode not in (None, "melody", "multi_voice"):
            forced_mode = None
        forced_strategy = (strategy or "auto").strip().lower() or "auto"
        include_chords_param = (request.query_params.get("include_chords") or "").strip().lower()
        forced_include_chords = None
        if include_chords_param in ("1", "true", "yes"):
            forced_include_chords = True
        elif include_chords_param in ("0", "false", "no"):
            forced_include_chords = False

        track_ids = _parse_int_list_param(request.query_params.get("track_ids"))
        drum_track_ids = _parse_int_list_param(request.query_params.get("drum_track_ids"))
        include_drums_param = (request.query_params.get("include_drums") or "").strip().lower()
        include_drums = include_drums_param in ("1", "true", "yes")

        quant_slots = request.query_params.get("quant_slots_per_beat")
        quant_slots_per_beat = int(quant_slots) if quant_slots and quant_slots.isdigit() else None
        note_length = request.query_params.get("note_length") or None

        tempo_param = request.query_params.get("tempo_bpm")
        tempo_bpm = float(tempo_param) if tempo_param else None
        time_signature = request.query_params.get("time_signature") or None
        estimated_key = request.query_params.get("estimated_key") or None
        cleanup_options = _parse_cleanup_options(request)

        max_voices_param = request.query_params.get("max_voices")
        max_voices = int(max_voices_param) if max_voices_param and max_voices_param.isdigit() else 0

        rhythm_detail = (request.query_params.get("rhythm_detail") or "standard").strip().lower()
        if rhythm_detail not in ("simple", "standard", "detailed"):
            rhythm_detail = "standard"
        quant_strength_param = request.query_params.get("quant_strength")
        try:
            quant_strength = float(quant_strength_param) if quant_strength_param else 0.7
        except ValueError:
            quant_strength = 0.7
        quant_strength = max(0.0, min(1.0, quant_strength))

        result = await asyncio.to_thread(
            import_midi_bytes,
            midi_bytes,
            filename,
            mode=forced_mode,
            strategy=forced_strategy,
            include_chords=forced_include_chords,
            track_ids=track_ids or None,
            drum_track_ids=drum_track_ids or None,
            include_drums=include_drums,
            quant_slots_per_beat=quant_slots_per_beat,
            note_length=note_length,
            cleanup_options=cleanup_options,
            tempo_bpm=tempo_bpm,
            time_signature=time_signature,
            estimated_key=estimated_key,
            max_voices=max_voices,
            rhythm_detail=rhythm_detail,
            quant_strength=quant_strength,
        )
        return JSONResponse(result, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "MIDI import failed"
        return json_error(500, detail, origin)


async def _run_transcribe_sheet_image(
    data: bytes,
    filename: str,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
    title_hints: list[str] | None = None,
) -> dict:
    def _cli_failure_message(stderr_text: str, stdout_text: str) -> str:
        import json
        import re

        ansi_re = re.compile(r"\x1b\[[0-9;]*m")
        structured_message = ""
        plain_message = ""
        for line in (stderr_text or "").splitlines():
            cleaned = ansi_re.sub("", line).strip()
            if not cleaned:
                continue
            if cleaned.startswith("{"):
                try:
                    event = json.loads(cleaned)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "error" and event.get("message"):
                    structured_message = str(event.get("message") or "").strip()
                continue
            # Prefer structured error events; fall back to the last plain stderr line
            # (skip traceback noise like "Traceback (most recent call last):").
            if cleaned.startswith("Traceback ") or cleaned.startswith("File ") or cleaned.startswith("  "):
                continue
            if cleaned.startswith("Creating model:") or cleaned.startswith("Model files already"):
                continue
            if cleaned.startswith("Connectivity check") or cleaned.startswith("/opt/vision-venv"):
                continue
            if "UserWarning:" in cleaned or "warnings.warn" in cleaned:
                continue
            plain_message = cleaned
        error_message = structured_message or plain_message
        if error_message:
            return error_message[:500]
        for line in reversed((stdout_text or "").splitlines()):
            cleaned = ansi_re.sub("", line).strip()
            if cleaned and not cleaned.startswith("{"):
                return cleaned[:500]
        return "sheet image transcription failed"

    def _run():
        import json
        import subprocess
        import tempfile
        import threading

        vision_python = os.getenv("VISION_VENV_PYTHON", "").strip()
        if vision_python and os.path.isfile(vision_python):
            with tempfile.TemporaryDirectory(prefix="sheet-image-cli-") as work_dir:
                image_path = os.path.join(work_dir, filename or "upload.png")
                with open(image_path, "wb") as handle:
                    handle.write(data)
                env = os.environ.copy()
                if on_progress:
                    env["SHEET_IMAGE_PROGRESS"] = "1"

                proc = subprocess.Popen(
                    [vision_python, "/app/sheet_image_transcribe.py", image_path, "--json"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    env=env,
                )

                stderr_chunks: list[str] = []

                def _read_stderr() -> None:
                    if proc.stderr is None:
                        return
                    for line in proc.stderr:
                        stderr_chunks.append(line)
                        cleaned = line.strip()
                        if not on_progress or not cleaned.startswith("{"):
                            continue
                        try:
                            event = json.loads(cleaned)
                        except json.JSONDecodeError:
                            continue
                        if event.get("type") == "progress":
                            on_progress(event)

                stderr_thread = threading.Thread(target=_read_stderr, daemon=True)
                stderr_thread.start()
                try:
                    # Do not call communicate() while a thread drains stderr — it races
                    # and can drop the final structured error JSON into an ignored buffer.
                    assert proc.stdout is not None
                    stdout = proc.stdout.read()
                    proc.wait(timeout=float(os.getenv("SHEET_IMAGE_TIMEOUT_SECONDS", "900")))
                except subprocess.TimeoutExpired:
                    proc.kill()
                    try:
                        if proc.stdout is not None:
                            proc.stdout.read()
                    except Exception:
                        pass
                    raise RuntimeError("sheet image transcription timeout")
                stderr_thread.join(timeout=5.0)
                stderr_text = "".join(stderr_chunks)
                if proc.returncode != 0:
                    raise RuntimeError(_cli_failure_message(stderr_text, stdout or ""))
                return json.loads(stdout)

        from sheet_image_transcribe import transcribe_sheet_image_sync

        return transcribe_sheet_image_sync(data, filename, on_progress=on_progress)

    async with heavy_job_slot():
        body = await asyncio.to_thread(_run)
    if title_hints:
        hint = str(title_hints[0] or "").strip()
        if hint:
            body["title"] = hint
    return body


async def stream_transcribe_sheet_image_events(data: bytes, filename: str):
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_progress(event: dict[str, Any]) -> None:
        # Progress callbacks run in a worker thread; schedule onto the event loop.
        loop.call_soon_threadsafe(queue.put_nowait, event)

    async def run() -> None:
        try:
            body = await _run_transcribe_sheet_image(data, filename, on_progress=on_progress)
            await queue.put({"type": "result", "body": body})
        except Exception as exc:
            await queue.put({
                "type": "error",
                "message": str(exc).strip()[:500] or "Sheet image transcription failed",
            })

    task = asyncio.create_task(run())
    try:
        while True:
            event = await queue.get()
            yield json.dumps(event, default=str) + "\n"
            if event.get("type") in {"result", "error"}:
                break
    finally:
        await task


@app.post("/format-bulk-import-lines")
async def format_bulk_import_lines(
    request: Request,
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage("format-bulk-import-lines")
        payload = await request.json()
        text = str(payload.get("text") or "")
        from bulk_list_format import normalize_bulk_text

        return JSONResponse(content={"lines": normalize_bulk_text(text)}, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "Bulk line formatting failed"
        return json_error(500, detail, origin)


@app.post("/extract-sheet-metadata")
async def extract_sheet_metadata(
    request: Request,
    file: UploadFile | None = File(default=None),
    composerHint: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("sheetImage", request, verified)
        track_resolver_usage("extract-sheet-metadata")

        if file is None:
            return json_error(400, "Missing image upload", origin)

        image_bytes = await file.read()
        filename = file.filename or "upload.png"
        if not image_bytes:
            return json_error(400, "Image file is empty", origin)
        if len(image_bytes) > MAX_SHEET_IMAGE_BYTES:
            return json_error(
                413,
                "Image file too large (limit is " + str(MAX_SHEET_IMAGE_BYTES) + " bytes)",
                origin,
            )

        composer_hint = str(composerHint or "").strip()
        provider_cfg = await resolve_request_provider(
            "ocr",
            request,
            verified,
            local_available=_ocr_local_available(),
        )

        from sheet_image_metadata import (
            apply_cloud_title_metadata,
            extract_sheet_metadata_sync,
            first_page_image_bytes,
            metadata_has_readable_title,
            public_sheet_metadata_body,
        )

        body = await asyncio.to_thread(
            extract_sheet_metadata_sync,
            image_bytes,
            filename,
            composer_hint,
        )
        if metadata_has_readable_title(body):
            return JSONResponse(content=public_sheet_metadata_body(body), headers=cors_headers(origin))

        if provider_cfg and provider_cfg.get("provider") != "local" and provider_cfg.get("apiUrl"):
            import base64
            import tempfile

            from provider_cloud import ocr_sheet_title_vision

            page_bytes = b""
            encoded_page = str(body.get("firstPageImageBase64") or "").strip()
            if encoded_page:
                page_bytes = base64.b64decode(encoded_page)
            if not page_bytes:
                with tempfile.TemporaryDirectory(prefix="sheet-metadata-cloud-") as work_dir:
                    page_bytes = first_page_image_bytes(image_bytes, filename, work_dir)
            cloud = await ocr_sheet_title_vision(page_bytes, "page-1.png", provider_cfg)
            body = apply_cloud_title_metadata(body, cloud, composer_hint=composer_hint)

        return JSONResponse(content=public_sheet_metadata_body(body), headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "Sheet metadata extraction failed"
        return json_error(500, detail, origin)


@app.post("/transcribe-sheet-image")
async def transcribe_sheet_image(
    request: Request,
    file: UploadFile | None = File(default=None),
    titleHints: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        verified = await maybe_require_auth(authorization)
        await require_resolver_feature("sheetImage", request, verified)
        track_resolver_usage("transcribe-sheet-image")

        if file is None:
            return json_error(400, "Missing image upload", origin)

        image_bytes = await file.read()
        filename = file.filename or "upload.png"
        if not image_bytes:
            return json_error(400, "Image file is empty", origin)
        if len(image_bytes) > MAX_SHEET_IMAGE_BYTES:
            return json_error(
                413,
                "Image file too large (limit is " + str(MAX_SHEET_IMAGE_BYTES) + " bytes)",
                origin,
            )

        provider_cfg = await resolve_request_provider(
            "ocr",
            request,
            verified,
            local_available=_ocr_local_available(),
        )
        if provider_cfg and provider_cfg.get("provider") != "local" and provider_cfg.get("apiUrl"):
            from provider_cloud import ocr_openai_vision

            body = await ocr_openai_vision(image_bytes, filename, provider_cfg)
            return JSONResponse(content=body, headers=cors_headers(origin))

        title_hint_list: list[str] | None = None
        if titleHints:
            try:
                parsed_hints = json.loads(titleHints)
                if isinstance(parsed_hints, list):
                    title_hint_list = [str(h).strip() for h in parsed_hints if str(h).strip()]
            except json.JSONDecodeError:
                title_hint_list = [titleHints.strip()] if titleHints.strip() else None

        accept = request.headers.get("accept", "")
        wants_stream = "application/x-ndjson" in accept
        if wants_stream:
            async def body():
                async for line in stream_transcribe_sheet_image_events(image_bytes, filename):
                    yield line.encode("utf-8")

            headers = cors_headers(origin)
            headers["Content-Type"] = "application/x-ndjson"
            return StreamingResponse(body(), media_type="application/x-ndjson", headers=headers)

        body = await _run_transcribe_sheet_image(image_bytes, filename, title_hints=title_hint_list)
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "Sheet image transcription failed"
        return json_error(500, detail, origin)


@app.post("/abc2xml")
async def abc2xml(
    request: Request,
    file: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        track_resolver_usage('abc2xml')

        if file is None:
            return json_error(400, "Missing ABC file upload", origin)

        abc_bytes = await file.read()
        if not abc_bytes:
            return json_error(400, "ABC notation is empty", origin)

        if len(abc_bytes) > MAX_ABC_IMPORT_BYTES:
            return json_error(
                413,
                "ABC notation is too large (limit is " + str(MAX_ABC_IMPORT_BYTES) + " bytes)",
                origin,
            )

        abc_text = abc_bytes.decode("utf-8", errors="replace").strip()
        if not abc_text:
            return json_error(400, "ABC notation is empty", origin)

        music_xml = await convert_abc_to_musicxml(abc_text)
        return Response(
            content=music_xml,
            media_type="application/xml",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return json_error(exc.status_code, str(exc.detail), origin)
    except Exception as exc:
        detail = str(exc).strip()[:500] or "ABC conversion failed"
        return json_error(500, detail, origin)


@app.get("/{full_path:path}")
async def serve_static_asset(full_path: str, request: Request):
    if not static_site_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    response = static_file_response(request.headers.get("origin"), full_path)
    if response:
        return response
    raise HTTPException(status_code=404, detail="Not found")
