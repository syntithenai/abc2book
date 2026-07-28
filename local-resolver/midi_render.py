"""Render MIDI scores to WAV via FluidSynth + SF2."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

DEFAULT_SF2_DIR = os.getenv("SF2_DIR", "/soundfonts")
DEFAULT_SF2_NAME = "FluidR3_GM.sf2"
DEFAULT_SF2_URL = os.getenv(
    "SF2_DOWNLOAD_URL",
    "https://github.com/fluidsynth/fluid-soundfont/raw/master/FluidR3_GM.sf2",
)
SYSTEM_SF2_CANDIDATES = (
    "/usr/share/sounds/sf2/FluidR3_GM.sf2",
    "/usr/share/soundfonts/FluidR3_GM.sf2",
)
DEFAULT_SAMPLE_RATE = int(os.getenv("MIDI_RENDER_SAMPLE_RATE", "44100"))


def sf2_path() -> Path:
    return Path(os.getenv("SF2_PATH", os.path.join(DEFAULT_SF2_DIR, DEFAULT_SF2_NAME)))


def fluidsynth_available() -> bool:
    return shutil.which("fluidsynth") is not None


def ensure_sf2(download: bool = True) -> Path | None:
    explicit = os.getenv("SF2_PATH")
    if explicit and Path(explicit).is_file():
        return Path(explicit)
    for candidate in SYSTEM_SF2_CANDIDATES:
        if Path(candidate).is_file():
            return Path(candidate)
    path = sf2_path()
    if path.is_file():
        return path
    if not download:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(DEFAULT_SF2_URL, str(path))
    except OSError:
        return None
    return path if path.is_file() else None


def midi_render_health() -> dict:
    sf2 = ensure_sf2(download=False)
    return {
        "fluidsynth": fluidsynth_available(),
        "sf2Ready": bool(sf2 and sf2.is_file()),
        "sf2Path": str(sf2) if sf2 else None,
        "sampleRate": DEFAULT_SAMPLE_RATE,
    }


def render_midi_to_wav(
    midi_path: Path,
    output_path: Path,
    *,
    sample_rate: int | None = None,
    gain: float = 0.5,
) -> Path:
    if not fluidsynth_available():
        raise RuntimeError("fluidsynth is not installed")
    sf2 = ensure_sf2()
    if not sf2:
        raise RuntimeError("SF2 soundfont is not available")

    midi_path = Path(midi_path)
    output_path = Path(output_path)
    if not midi_path.is_file():
        raise FileNotFoundError(str(midi_path))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.is_file():
        output_path.unlink()

    sr = int(sample_rate or DEFAULT_SAMPLE_RATE)
    cmd = [
        "fluidsynth",
        "-ni",
        "-F",
        str(output_path),
        "-r",
        str(sr),
        "-g",
        str(gain),
        str(sf2),
        str(midi_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[:500]
        raise RuntimeError(f"fluidsynth failed: {detail or proc.returncode}")
    if not output_path.is_file():
        raise RuntimeError("fluidsynth produced no output WAV")
    return output_path


def render_midi_bytes_to_wav(
    midi_bytes: bytes,
    output_path: Path,
    *,
    work_dir: Path | None = None,
    **kwargs,
) -> Path:
    directory = work_dir or output_path.parent
    directory.mkdir(parents=True, exist_ok=True)
    midi_path = directory / "input.mid"
    midi_path.write_bytes(midi_bytes)
    return render_midi_to_wav(midi_path, output_path, **kwargs)


def try_render_midi_to_wav(
    midi_path: Path,
    output_path: Path,
    **kwargs,
) -> Path | None:
    try:
        return render_midi_to_wav(midi_path, output_path, **kwargs)
    except (RuntimeError, FileNotFoundError, OSError):
        return None
