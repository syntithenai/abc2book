"""Render ABC/MIDI sources to audio bytes for remote playback (Cast / Snapcast)."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import HTTPException

from midi_render import midi_render_health, render_midi_to_wav


def remote_playback_render_enabled() -> bool:
    health = midi_render_health()
    return bool(health.get("fluidsynth") and health.get("sf2Ready"))


def remote_playback_render_health() -> dict:
    health = midi_render_health()
    health["enabled"] = remote_playback_render_enabled()
    return health


def _is_midi_bytes(data: bytes) -> bool:
    return len(data) >= 4 and data[:4] == b"MThd"


def render_midi_bytes_to_audio_bytes(midi_bytes: bytes) -> tuple[bytes, str]:
    if not remote_playback_render_enabled():
        raise HTTPException(status_code=503, detail="MIDI render is not available (fluidsynth/SF2)")
    if not midi_bytes:
        raise HTTPException(status_code=400, detail="Empty MIDI payload")
    if not _is_midi_bytes(midi_bytes):
        raise HTTPException(status_code=400, detail="Invalid MIDI data (missing MThd header)")
    with tempfile.TemporaryDirectory(prefix="remote-playback-") as work_dir:
        midi_path = Path(work_dir) / "input.mid"
        wav_path = Path(work_dir) / "render.wav"
        midi_path.write_bytes(midi_bytes)
        try:
            render_midi_to_wav(midi_path, wav_path)
        except (RuntimeError, FileNotFoundError, OSError) as exc:
            detail = str(exc).strip() or "MIDI render failed"
            raise HTTPException(status_code=502, detail=detail) from exc
        if not wav_path.is_file():
            raise HTTPException(status_code=502, detail="MIDI render produced no output")
        return wav_path.read_bytes(), "render.wav"
