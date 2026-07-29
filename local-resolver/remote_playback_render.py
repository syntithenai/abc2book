"""Render ABC/MIDI sources to audio bytes for remote playback (Cast / Snapcast)."""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import HTTPException

from midi_render import midi_render_health, try_render_midi_to_wav


def remote_playback_render_enabled() -> bool:
    health = midi_render_health()
    return bool(health.get("fluidsynth") and health.get("sf2Ready"))


def remote_playback_render_health() -> dict:
    health = midi_render_health()
    health["enabled"] = remote_playback_render_enabled()
    return health


def render_midi_bytes_to_audio_bytes(midi_bytes: bytes) -> tuple[bytes, str]:
    if not remote_playback_render_enabled():
        raise HTTPException(status_code=503, detail="MIDI render is not available (fluidsynth/SF2)")
    if not midi_bytes:
        raise HTTPException(status_code=400, detail="Empty MIDI payload")
    with tempfile.TemporaryDirectory(prefix="remote-playback-") as work_dir:
        midi_path = Path(work_dir) / "input.mid"
        wav_path = Path(work_dir) / "render.wav"
        midi_path.write_bytes(midi_bytes)
        rendered = try_render_midi_to_wav(midi_path, wav_path)
        if rendered is None or not wav_path.is_file():
            raise HTTPException(status_code=502, detail="MIDI render failed")
        return wav_path.read_bytes(), "render.wav"
