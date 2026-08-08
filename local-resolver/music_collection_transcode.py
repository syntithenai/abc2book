"""Transcode browser-incompatible music collection audio to MP3 for playback."""

from __future__ import annotations

import asyncio
import hashlib
import os
import shutil

from music_collection import guess_audio_mime_type, music_collection_metadata_dir

MUSIC_COLLECTION_TRANSCODE_DIR_NAME = os.getenv(
    "MUSIC_COLLECTION_TRANSCODE_DIR_NAME",
    "music_collection_transcode",
).strip()

# Extensions browsers typically cannot decode in <audio> (Chrome/Firefox on Linux/macOS).
BROWSER_TRANSCODE_EXTENSIONS = frozenset({
    ".wma",
})

TRANSCODE_OUTPUT_MIME = "audio/mpeg"
TRANSCODE_OUTPUT_EXT = ".mp3"


def music_collection_transcode_dir() -> str:
    return os.path.join(music_collection_metadata_dir(), MUSIC_COLLECTION_TRANSCODE_DIR_NAME)


def needs_browser_transcode(abs_path: str) -> bool:
    return os.path.splitext(abs_path)[1].lower() in BROWSER_TRANSCODE_EXTENSIONS


def _cache_key(abs_path: str) -> str:
    try:
        stat = os.stat(abs_path)
        payload = f"{abs_path}\0{stat.st_mtime_ns}\0{stat.st_size}"
    except OSError:
        payload = abs_path
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def transcode_cache_path(abs_path: str) -> str:
    return os.path.join(music_collection_transcode_dir(), _cache_key(abs_path) + TRANSCODE_OUTPUT_EXT)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


async def transcode_to_mp3(
    abs_path: str,
    output_path: str,
    *,
    timeout_seconds: float = 120.0,
) -> None:
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg is not available")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    root, ext = os.path.splitext(output_path)
    tmp_path = root + ".part" + ext
    if os.path.exists(tmp_path):
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        abs_path,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-q:a",
        "4",
        tmp_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )
    try:
        _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise RuntimeError("Audio transcode timeout") from exc

    if proc.returncode != 0 or not os.path.isfile(tmp_path):
        detail = (stderr or b"").decode("utf-8", errors="ignore").strip()[:500]
        raise RuntimeError(detail or "Audio transcode failed")

    os.replace(tmp_path, output_path)


async def resolve_playable_audio_path(
    abs_path: str,
    *,
    playable: bool = False,
    timeout_seconds: float = 120.0,
) -> tuple[str, str]:
    """Return (path_to_serve, mime_type). Transcodes when playable=True and needed."""
    if not playable or not needs_browser_transcode(abs_path):
        return abs_path, guess_audio_mime_type(abs_path)

    cached = transcode_cache_path(abs_path)
    if os.path.isfile(cached):
        try:
            if os.path.getmtime(cached) >= os.path.getmtime(abs_path):
                return cached, TRANSCODE_OUTPUT_MIME
        except OSError:
            pass

    await transcode_to_mp3(abs_path, cached, timeout_seconds=timeout_seconds)
    return cached, TRANSCODE_OUTPUT_MIME
