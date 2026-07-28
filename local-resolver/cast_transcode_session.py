"""Shared ffmpeg transcode helpers for Cast HLS and Snapcast PCM output."""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any


SAMPLE_RATE = 48000
CHANNELS = 2
PCM_FORMAT = "s16le"


@dataclass
class TranscodeSettings:
    pitch_semitones: float = 0.0
    fine_tune_cents: float = 0.0
    tempo: float = 1.0
    start_seconds: float = 0.0


def rubberband_available() -> bool:
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-filters"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return "rubberband" in (proc.stdout or "") + (proc.stderr or "")
    except Exception:
        return False


def build_audio_filter_chain(settings: TranscodeSettings) -> str | None:
    filters: list[str] = []
    tempo = settings.tempo if settings.tempo and settings.tempo > 0 else 1.0
    pitch = settings.pitch_semitones + (settings.fine_tune_cents / 100.0)
    if abs(pitch) < 0.001 and abs(tempo - 1.0) < 0.001:
        return None
    if rubberband_available():
        rb_args = []
        if abs(pitch) >= 0.001:
            rb_args.append(f"pitch={pitch}")
        if abs(tempo - 1.0) >= 0.001:
            rb_args.append(f"tempo={tempo}")
        if rb_args:
            filters.append("rubberband=" + ":".join(rb_args))
    else:
        if abs(tempo - 1.0) >= 0.001:
            remaining = tempo
            while remaining > 2.0:
                filters.append("atempo=2.0")
                remaining /= 2.0
            while remaining < 0.5:
                filters.append("atempo=0.5")
                remaining /= 0.5
            if abs(remaining - 1.0) >= 0.001:
                filters.append(f"atempo={remaining:.6f}")
        if abs(pitch) >= 0.001:
            rate_factor = 2 ** (pitch / 12.0)
            filters.append(f"asetrate={int(SAMPLE_RATE * rate_factor)}")
            filters.append(f"aresample={SAMPLE_RATE}")
    return ",".join(filters) if filters else None


def build_ffmpeg_pcm_command(
    input_path: str,
    settings: TranscodeSettings,
    *,
    output_target: str,
) -> list[str]:
    """Build ffmpeg command writing raw PCM to a file path or pipe (output_target)."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
    ]
    if settings.start_seconds > 0:
        cmd.extend(["-ss", f"{settings.start_seconds:.3f}"])
    cmd.extend(["-i", input_path, "-vn"])
    af = build_audio_filter_chain(settings)
    if af:
        cmd.extend(["-af", af])
    cmd.extend(
        [
            "-ac",
            str(CHANNELS),
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            PCM_FORMAT,
            output_target,
        ]
    )
    return cmd


def build_ffmpeg_hls_command(
    input_path: str,
    settings: TranscodeSettings,
    *,
    output_dir: str,
    segment_seconds: float = 2.0,
) -> list[str]:
    """Build ffmpeg command writing HLS segments (Chromecast Phase 3)."""
    os.makedirs(output_dir, exist_ok=True)
    playlist = os.path.join(output_dir, "playlist.m3u8")
    segment_pattern = os.path.join(output_dir, "seg%04d.ts")
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
    ]
    if settings.start_seconds > 0:
        cmd.extend(["-ss", f"{settings.start_seconds:.3f}"])
    cmd.extend(["-i", input_path, "-vn"])
    af = build_audio_filter_chain(settings)
    if af:
        cmd.extend(["-af", af])
    cmd.extend(
        [
            "-ac",
            "2",
            "-ar",
            "44100",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-f",
            "hls",
            "-hls_time",
            str(segment_seconds),
            "-hls_list_size",
            "0",
            "-hls_segment_filename",
            segment_pattern,
            playlist,
        ]
    )
    return cmd


def parse_transcode_settings(body: dict[str, Any]) -> TranscodeSettings:
    return TranscodeSettings(
        pitch_semitones=float(body.get("pitch") or body.get("pitchSemitones") or 0),
        fine_tune_cents=float(body.get("fineTune") or body.get("fineTuneCents") or 0),
        tempo=float(body.get("tempo") or 1.0) or 1.0,
        start_seconds=float(body.get("startSeconds") or 0),
    )


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None
