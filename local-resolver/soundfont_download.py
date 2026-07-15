"""One-time background download of the MusyngKite midi-js soundfont bank.

Files land under ``{SOUNDFONT_DIR}/MusyngKite/`` so the resolver can serve
``/midi-js-soundfonts/MusyngKite/...`` from a Docker volume without committing
~1GB to git. Downloads are idempotent: completed instruments are skipped.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from typing import Any

import httpx

DEFAULT_SOUNDFONT_DIR = os.getenv("SOUNDFONT_DIR", "/soundfonts")
SOUNDFONT_DOWNLOAD_ENABLED = os.getenv("SOUNDFONT_DOWNLOAD_ENABLED", "true").strip().lower() not in {
    "0",
    "false",
    "no",
}
SOUNDFONT_SOURCE_BASE = os.getenv(
    "SOUNDFONT_SOURCE_BASE",
    "https://paulrosen.github.io/midi-js-soundfonts/MusyngKite",
).rstrip("/")
SOUNDFONT_DOWNLOAD_CONCURRENCY = max(1, int(os.getenv("SOUNDFONT_DOWNLOAD_CONCURRENCY", "6")))
SOUNDFONT_BANK_NAME = "MusyngKite"
COMPLETE_MARKER = ".complete"

# Chromatic note names used by midi-js-soundfonts / abcjs (88 keys A0–C8).
NOTE_NAMES = (
    "A0", "Bb0", "B0",
    "C1", "Db1", "D1", "Eb1", "E1", "F1", "Gb1", "G1", "Ab1", "A1", "Bb1", "B1",
    "C2", "Db2", "D2", "Eb2", "E2", "F2", "Gb2", "G2", "Ab2", "A2", "Bb2", "B2",
    "C3", "Db3", "D3", "Eb3", "E3", "F3", "Gb3", "G3", "Ab3", "A3", "Bb3", "B3",
    "C4", "Db4", "D4", "Eb4", "E4", "F4", "Gb4", "G4", "Ab4", "A4", "Bb4", "B4",
    "C5", "Db5", "D5", "Eb5", "E5", "F5", "Gb5", "G5", "Ab5", "A5", "Bb5", "B5",
    "C6", "Db6", "D6", "Eb6", "E6", "F6", "Gb6", "G6", "Ab6", "A6", "Bb6", "B6",
    "C7", "Db7", "D7", "Eb7", "E7", "F7", "Gb7", "G7", "Ab7", "A7", "Bb7", "B7",
    "C8",
)

_state_lock = asyncio.Lock()
_download_task: asyncio.Task | None = None
_status: dict[str, Any] = {
    "enabled": SOUNDFONT_DOWNLOAD_ENABLED,
    "ready": False,
    "running": False,
    "error": None,
    "downloaded": 0,
    "total": 0,
    "bank": SOUNDFONT_BANK_NAME,
}


def soundfont_dir() -> str:
    return os.path.abspath(os.getenv("SOUNDFONT_DIR", DEFAULT_SOUNDFONT_DIR) or DEFAULT_SOUNDFONT_DIR)


def bank_dir() -> str:
    return os.path.join(soundfont_dir(), SOUNDFONT_BANK_NAME)


def bank_complete_marker() -> str:
    return os.path.join(bank_dir(), COMPLETE_MARKER)


def instrument_complete_marker(instrument: str) -> str:
    return os.path.join(bank_dir(), f"{instrument}-mp3", COMPLETE_MARKER)


def is_bank_complete() -> bool:
    return os.path.isfile(bank_complete_marker())


def is_instrument_complete(instrument: str) -> bool:
    marker = instrument_complete_marker(instrument)
    if os.path.isfile(marker):
        return True
    note_dir = os.path.join(bank_dir(), f"{instrument}-mp3")
    js_path = os.path.join(bank_dir(), f"{instrument}-mp3.js")
    if not os.path.isfile(js_path) or not os.path.isdir(note_dir):
        return False
    present = 0
    for name in NOTE_NAMES:
        if os.path.isfile(os.path.join(note_dir, f"{name}.mp3")):
            present += 1
    if present >= len(NOTE_NAMES):
        try:
            with open(marker, "w", encoding="utf-8") as handle:
                handle.write("ok\n")
        except OSError:
            pass
        return True
    return False


def count_completed_instruments(names: list[str]) -> int:
    return sum(1 for name in names if is_instrument_complete(name))


def soundfonts_serving_available() -> bool:
    """True when overlay serving can resolve MusyngKite assets (volume and/or download)."""
    if not SOUNDFONT_DOWNLOAD_ENABLED and not os.path.isdir(bank_dir()):
        return False
    return True


def get_soundfont_status() -> dict[str, Any]:
    ready = is_bank_complete()
    status = dict(_status)
    status["enabled"] = SOUNDFONT_DOWNLOAD_ENABLED
    status["ready"] = ready
    status["dir"] = soundfont_dir()
    status["bankDir"] = bank_dir()
    if ready and not status.get("total"):
        status["downloaded"] = status.get("downloaded") or 128
        status["total"] = status.get("total") or 128
    return status


def resolve_musyngkite_file(relative_under_bank: str, static_root: str | None = None) -> str | None:
    """Resolve a path under MusyngKite: prefer embedded selection/abcjs, then volume.

    ``relative_under_bank`` is e.g. ``acoustic_grand_piano-mp3/A4.mp3`` or ``flute-mp3.js``.
    """
    rel = (relative_under_bank or "").lstrip("/").replace("\\", "/")
    if not rel or ".." in rel.split("/"):
        return None

    if static_root:
        root = os.path.abspath(static_root)
        # Embedded curated selection
        selection = os.path.normpath(os.path.join(root, "midi-js-soundfonts", "selection", SOUNDFONT_BANK_NAME, rel))
        if selection.startswith(root + os.sep) and os.path.isfile(selection):
            return selection
        # Piano also ships under abcjs/
        if rel.startswith("acoustic_grand_piano-mp3/") or rel == "acoustic_grand_piano-mp3.js":
            abcjs_rel = rel
            abcjs_path = os.path.normpath(os.path.join(root, "midi-js-soundfonts", "abcjs", abcjs_rel))
            if abcjs_path.startswith(root + os.sep) and os.path.isfile(abcjs_path):
                return abcjs_path

    volume_path = os.path.normpath(os.path.join(bank_dir(), rel))
    bank_prefix = bank_dir() + os.sep
    if volume_path == bank_dir() or not volume_path.startswith(bank_prefix):
        return None
    if os.path.isfile(volume_path):
        return volume_path
    return None


async def _download_file(client: httpx.AsyncClient, url: str, dest_path: str, sem: asyncio.Semaphore) -> None:
    async with sem:
        if os.path.isfile(dest_path) and os.path.getsize(dest_path) > 0:
            return
        parent = os.path.dirname(dest_path)
        os.makedirs(parent, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix=".sf-", dir=parent)
        os.close(fd)
        try:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                with open(tmp_path, "wb") as handle:
                    async for chunk in response.aiter_bytes(64 * 1024):
                        handle.write(chunk)
            os.replace(tmp_path, dest_path)
        except Exception:
            try:
                if os.path.isfile(tmp_path):
                    os.remove(tmp_path)
            except OSError:
                pass
            raise


async def _download_instrument(
    client: httpx.AsyncClient,
    instrument: str,
    sem: asyncio.Semaphore,
) -> None:
    if is_instrument_complete(instrument):
        return
    base = SOUNDFONT_SOURCE_BASE
    js_url = f"{base}/{instrument}-mp3.js"
    js_dest = os.path.join(bank_dir(), f"{instrument}-mp3.js")
    await _download_file(client, js_url, js_dest, sem)

    note_dir = os.path.join(bank_dir(), f"{instrument}-mp3")
    os.makedirs(note_dir, exist_ok=True)
    note_tasks = [
        _download_file(
            client,
            f"{base}/{instrument}-mp3/{note}.mp3",
            os.path.join(note_dir, f"{note}.mp3"),
            sem,
        )
        for note in NOTE_NAMES
    ]
    results = await asyncio.gather(*note_tasks, return_exceptions=True)
    errors = [err for err in results if isinstance(err, Exception)]
    if errors:
        raise errors[0]
    marker = instrument_complete_marker(instrument)
    with open(marker, "w", encoding="utf-8") as handle:
        handle.write("ok\n")


async def _run_download() -> None:
    global _status
    if is_bank_complete():
        async with _state_lock:
            _status.update({"ready": True, "running": False, "error": None})
        return

    os.makedirs(bank_dir(), exist_ok=True)
    async with _state_lock:
        _status.update({"running": True, "error": None, "ready": False})

    started = time.time()
    try:
        timeout = httpx.Timeout(120.0, connect=30.0)
        limits = httpx.Limits(max_connections=SOUNDFONT_DOWNLOAD_CONCURRENCY + 2)
        async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=True) as client:
            names_path = os.path.join(bank_dir(), "names.json")
            await _download_file(client, f"{SOUNDFONT_SOURCE_BASE}/names.json", names_path, asyncio.Semaphore(1))
            with open(names_path, encoding="utf-8") as handle:
                names = json.load(handle)
            if not isinstance(names, list) or not names:
                raise RuntimeError("MusyngKite names.json is empty or invalid")
            names = [str(n).strip() for n in names if str(n).strip()]

            async with _state_lock:
                _status["total"] = len(names)
                _status["downloaded"] = count_completed_instruments(names)

            sem = asyncio.Semaphore(SOUNDFONT_DOWNLOAD_CONCURRENCY)

            async def download_one(instrument):
                await _download_instrument(client, instrument, sem)
                async with _state_lock:
                    _status["downloaded"] = count_completed_instruments(names)

            await asyncio.gather(*(download_one(name) for name in names))

        with open(bank_complete_marker(), "w", encoding="utf-8") as handle:
            handle.write(json.dumps({"ok": True, "instruments": len(names), "source": SOUNDFONT_SOURCE_BASE}) + "\n")

        elapsed = time.time() - started
        print(f"MusyngKite soundfonts ready ({len(names)} instruments) in {elapsed:.0f}s at {bank_dir()}")
        async with _state_lock:
            _status.update({
                "ready": True,
                "running": False,
                "error": None,
                "downloaded": len(names),
                "total": len(names),
            })
    except Exception as exc:
        message = str(exc).strip()[:500] or "soundfont download failed"
        print(f"WARNING: MusyngKite download failed: {message}")
        async with _state_lock:
            _status.update({"running": False, "error": message, "ready": is_bank_complete()})


def start_soundfont_download_background() -> asyncio.Task | None:
    """Schedule the one-time download if enabled and not already complete."""
    global _download_task
    if not SOUNDFONT_DOWNLOAD_ENABLED:
        _status["enabled"] = False
        _status["ready"] = is_bank_complete()
        return None
    if is_bank_complete():
        _status["ready"] = True
        _status["running"] = False
        print(f"MusyngKite soundfonts already complete at {bank_dir()}")
        return None
    if _download_task and not _download_task.done():
        return _download_task
    _download_task = asyncio.create_task(_run_download())
    print(f"MusyngKite soundfont download started → {bank_dir()}")
    return _download_task
