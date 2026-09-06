"""Stop Qwen and free Comfy models before TuneBook heavy GPU/CPU ML work."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

log = logging.getLogger("gpu_prep")

GPU_PREP_ENABLED = os.getenv("GPU_PREP_ENABLED", "1").lower() not in {"0", "false", "no"}
QWEN_STOP_URL = (
    os.getenv("QWEN_STOP_URL")
    or os.getenv("GPU_QWEN_STOP_URL")
    or "http://host.docker.internal:8081/admin/stop"
).rstrip("/")
QWEN_API_KEY = (
    os.getenv("QWEN_API_KEY")
    or os.getenv("RESEARCH_LLM_API_KEY")
    or ""
).strip()
COMFY_FREE_URL = (
    os.getenv("COMFY_FREE_URL")
    or os.getenv("GPU_COMFY_FREE_URL")
    or "http://host.docker.internal:8188/free"
)
QWEN_STOP_CMD = (os.getenv("QWEN_STOP_CMD") or "").strip()
QWEN_STOP_SCRIPT = (os.getenv("QWEN_STOP_SCRIPT") or "").strip()
GPU_PREP_TIMEOUT_SECONDS = float(os.getenv("GPU_PREP_TIMEOUT_SECONDS", "90"))
GPU_PREP_REQUIRE_QWEN_STOP = os.getenv("GPU_PREP_REQUIRE_QWEN_STOP", "0").lower() in {
    "1",
    "true",
    "yes",
}

_prep_lock: asyncio.Lock | None = None
_last_prep_monotonic = 0.0
_PREP_COOLDOWN_SECONDS = float(os.getenv("GPU_PREP_COOLDOWN_SECONDS", "15"))


def _get_prep_lock() -> asyncio.Lock:
    global _prep_lock
    if _prep_lock is None:
        _prep_lock = asyncio.Lock()
    return _prep_lock


def _http_json(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout_s: float = 30.0,
) -> Any:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req_headers = dict(headers or {})
    if body is not None:
        req_headers.setdefault("Content-Type", "application/json")
    req = Request(url, data=data, method=method, headers=req_headers)
    with urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read()
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return raw.decode("utf-8", errors="replace")


async def _run_cmd(cmd: str) -> None:
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=GPU_PREP_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.communicate()
        raise TimeoutError(f"GPU prep command timed out: {cmd}") from exc
    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(err or f"command exited {proc.returncode}")


async def stop_qwen() -> str:
    """Stop host Qwen. Returns a short status string."""
    if QWEN_STOP_CMD:
        await _run_cmd(QWEN_STOP_CMD)
        return "cmd"
    if QWEN_STOP_SCRIPT:
        await _run_cmd(QWEN_STOP_SCRIPT)
        return "script"

    urls = [QWEN_STOP_URL]
    # Host-network / local resolver fallbacks.
    for alt in (
        "http://127.0.0.1:8081/admin/stop",
        "http://host.docker.internal:8081/admin/stop",
    ):
        if alt.rstrip("/") not in {u.rstrip("/") for u in urls}:
            urls.append(alt)

    headers = {}
    if QWEN_API_KEY:
        headers["Authorization"] = f"Bearer {QWEN_API_KEY}"

    last_exc: Exception | None = None
    for url in urls:
        try:
            await asyncio.to_thread(
                _http_json,
                "POST",
                url,
                {"full": False},
                headers,
                GPU_PREP_TIMEOUT_SECONDS,
            )
            return f"http:{url}"
        except HTTPError as exc:
            last_exc = exc
            if exc.code in {401, 403}:
                raise RuntimeError(f"Qwen stop unauthorized at {url}: {exc.code}") from exc
        except URLError as exc:
            last_exc = exc
            reason = str(getattr(exc, "reason", exc))
            if "Connection refused" in reason or "Errno 111" in reason:
                return "already_down"
        except Exception as exc:
            last_exc = exc
    if last_exc is not None:
        raise RuntimeError(f"Qwen stop failed: {last_exc}") from last_exc
    return "noop"


async def free_comfy() -> str:
    """Best-effort ComfyUI POST /free."""
    urls = [COMFY_FREE_URL]
    for alt in (
        "http://127.0.0.1:8188/free",
        "http://host.docker.internal:8188/free",
    ):
        if alt.rstrip("/") not in {u.rstrip("/") for u in urls}:
            urls.append(alt)

    for url in urls:
        try:
            await asyncio.to_thread(
                _http_json,
                "POST",
                url,
                {"unload_models": True, "free_memory": True},
                None,
                min(30.0, GPU_PREP_TIMEOUT_SECONDS),
            )
            return f"http:{url}"
        except URLError as exc:
            reason = str(getattr(exc, "reason", exc))
            if "Connection refused" in reason or "Errno 111" in reason:
                continue
        except Exception:
            continue
    return "comfy_unreachable"


async def ensure_gpu_headroom(*, force: bool = False) -> dict[str, str]:
    """Stop Qwen and free Comfy before heavy TuneBook work.

    Skipped when GPU_PREP_ENABLED=0 (cloud/light). Cooldown avoids repeated
    stops when nested heavy slots re-enter via separate tasks.
    """
    global _last_prep_monotonic
    if not GPU_PREP_ENABLED:
        return {"skipped": "disabled"}

    import time

    async with _get_prep_lock():
        now = time.monotonic()
        if (
            not force
            and _last_prep_monotonic
            and (now - _last_prep_monotonic) < _PREP_COOLDOWN_SECONDS
        ):
            return {"skipped": "cooldown"}

        status: dict[str, str] = {}
        try:
            status["qwen"] = await stop_qwen()
        except Exception as exc:
            log.warning("gpu prep: qwen stop failed: %s", exc)
            status["qwen"] = f"error:{exc}"
            if GPU_PREP_REQUIRE_QWEN_STOP:
                raise

        try:
            status["comfy"] = await free_comfy()
        except Exception as exc:
            log.warning("gpu prep: comfy free failed: %s", exc)
            status["comfy"] = f"error:{exc}"

        _last_prep_monotonic = time.monotonic()
        return status
