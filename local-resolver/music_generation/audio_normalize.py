"""Normalize arbitrary audio bytes to WAV for generation pipelines."""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

FFMPEG_TIMEOUT_SECONDS = float(os.getenv("FFMPEG_TIMEOUT_SECONDS", "120"))


def is_wav_audio(audio_bytes: bytes, filename: str = "") -> bool:
    if not audio_bytes or len(audio_bytes) < 12:
        return False
    if audio_bytes[:4] != b"RIFF" or audio_bytes[8:12] != b"WAVE":
        return False
    if filename and not str(filename).lower().endswith(".wav"):
        return False
    return True


async def normalize_audio_bytes_to_wav(audio_bytes: bytes, filename: str = "source.bin") -> bytes:
    """Convert MP3/other audio to 44.1 kHz stereo WAV. Passes through valid WAV unchanged."""
    if not audio_bytes:
        raise ValueError("Missing audio bytes")
    if is_wav_audio(audio_bytes, filename):
        return audio_bytes

    suffix = os.path.splitext(filename or "")[1] or ".bin"
    inp_path = None
    out_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_in:
            temp_in.write(audio_bytes)
            inp_path = temp_in.name
        out_path = inp_path + ".normalized.wav"
        cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            inp_path,
            "-ar",
            "44100",
            "-ac",
            "2",
            out_path,
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=FFMPEG_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise RuntimeError("Audio conversion timed out") from exc
        if proc.returncode != 0 or not os.path.exists(out_path):
            detail = stderr.decode("utf-8", errors="ignore").strip()[:500]
            raise RuntimeError(detail or "Audio conversion failed")
        return Path(out_path).read_bytes()
    finally:
        for path in (inp_path, out_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass
