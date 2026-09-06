"""Shared asyncio subprocess helpers with reliable cleanup on timeout/cancel."""

import asyncio
import contextvars
import os
import signal
from contextlib import asynccontextmanager

SUBPROCESS_KILL_GRACE_SECONDS = float(os.getenv("SUBPROCESS_KILL_GRACE_SECONDS", "5"))
MAX_CONCURRENT_HEAVY_JOBS = max(
    1,
    int(os.getenv("MAX_CONCURRENT_HEAVY_JOBS", os.getenv("MAX_CONCURRENT_ML_JOBS", "1"))),
)
HEAVY_JOB_QUEUE_TIMEOUT_SECONDS = float(os.getenv("HEAVY_JOB_QUEUE_TIMEOUT_SECONDS", "120"))

_heavy_job_semaphore = None
_heavy_job_depth = contextvars.ContextVar("heavy_job_depth", default=0)
_heavy_jobs_active = 0
_heavy_jobs_waiting = 0
_heavy_jobs_lock = None


class ClientDisconnected(Exception):
    pass


class HeavyJobQueueFull(Exception):
    """Raised when the heavy-job wait queue times out."""

    def __init__(self, message="Heavy job queue busy; try again shortly"):
        super().__init__(message)


def _get_heavy_job_semaphore():
    global _heavy_job_semaphore
    if _heavy_job_semaphore is None:
        _heavy_job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_HEAVY_JOBS)
    return _heavy_job_semaphore


def _get_heavy_jobs_lock():
    global _heavy_jobs_lock
    if _heavy_jobs_lock is None:
        _heavy_jobs_lock = asyncio.Lock()
    return _heavy_jobs_lock


def heavy_jobs_status():
    return {
        "max": MAX_CONCURRENT_HEAVY_JOBS,
        "active": int(_heavy_jobs_active),
        "waiting": int(_heavy_jobs_waiting),
        "queueTimeoutSeconds": HEAVY_JOB_QUEUE_TIMEOUT_SECONDS,
    }


@asynccontextmanager
async def heavy_job_slot(timeout_seconds=None):
    """Limit concurrent CPU/GPU-heavy subprocess work.

    Re-entrant: nested calls from the same task (e.g. analyze-media internals)
    share the outer slot instead of deadlocking on the semaphore.

    Waits up to HEAVY_JOB_QUEUE_TIMEOUT_SECONDS for a slot, then raises
    HeavyJobQueueFull (map to HTTP 503).
    """
    from music_generation.resource_coordinator import (
        AudioGenerationInProgress,
        check_not_blocked_by_audio_generation,
    )

    global _heavy_jobs_active, _heavy_jobs_waiting
    depth = _heavy_job_depth.get()
    if depth > 0:
        yield
        return

    try:
        check_not_blocked_by_audio_generation()
    except AudioGenerationInProgress as exc:
        raise HeavyJobQueueFull(str(exc)) from exc

    # Stop Qwen / free Comfy before taking a heavy slot (outer acquire only).
    try:
        from gpu_prep import ensure_gpu_headroom

        await ensure_gpu_headroom()
    except Exception as exc:
        raise HeavyJobQueueFull(f"GPU prep failed: {exc}") from exc

    wait_s = HEAVY_JOB_QUEUE_TIMEOUT_SECONDS if timeout_seconds is None else float(timeout_seconds)
    sem = _get_heavy_job_semaphore()
    lock = _get_heavy_jobs_lock()
    async with lock:
        _heavy_jobs_waiting += 1
    acquired = False
    try:
        try:
            await asyncio.wait_for(sem.acquire(), timeout=wait_s)
            acquired = True
        except asyncio.TimeoutError as exc:
            raise HeavyJobQueueFull(
                "Heavy job queue busy (max "
                + str(MAX_CONCURRENT_HEAVY_JOBS)
                + " concurrent); try again shortly"
            ) from exc
        async with lock:
            _heavy_jobs_waiting -= 1
            _heavy_jobs_active += 1
        token = _heavy_job_depth.set(depth + 1)
        try:
            yield
        finally:
            _heavy_job_depth.reset(token)
            async with lock:
                _heavy_jobs_active = max(0, _heavy_jobs_active - 1)
            if acquired:
                sem.release()
    except HeavyJobQueueFull:
        async with lock:
            _heavy_jobs_waiting = max(0, _heavy_jobs_waiting - 1)
        raise
    except Exception:
        if not acquired:
            async with lock:
                _heavy_jobs_waiting = max(0, _heavy_jobs_waiting - 1)
        raise


async def terminate_subprocess_tree(proc, grace_seconds=None):
    if proc is None or proc.returncode is not None:
        return

    grace = SUBPROCESS_KILL_GRACE_SECONDS if grace_seconds is None else grace_seconds

    async def wait_proc():
        return await proc.wait()

    if proc.pid:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            try:
                proc.terminate()
            except ProcessLookupError:
                return
    else:
        proc.terminate()

    try:
        await asyncio.wait_for(wait_proc(), timeout=grace)
        return
    except (asyncio.TimeoutError, asyncio.CancelledError):
        pass

    if proc.pid:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            try:
                proc.kill()
            except ProcessLookupError:
                return
    else:
        proc.kill()

    try:
        await asyncio.wait_for(wait_proc(), timeout=grace)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        pass


async def run_subprocess_with_disconnect(command, env=None, request=None, start_new_session=True):
    kwargs = {
        "stdout": asyncio.subprocess.PIPE,
        "stderr": asyncio.subprocess.PIPE,
    }
    if env is not None:
        kwargs["env"] = env
    if start_new_session:
        kwargs["start_new_session"] = True

    proc = await asyncio.create_subprocess_exec(*command, **kwargs)
    communicate_task = asyncio.create_task(proc.communicate())
    needs_kill = False
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
            if request is not None and await request.is_disconnected():
                needs_kill = True
                raise ClientDisconnected()
    except asyncio.CancelledError:
        needs_kill = True
        raise
    finally:
        if not communicate_task.done():
            communicate_task.cancel()
            needs_kill = True
        if needs_kill and proc.returncode is None:
            await terminate_subprocess_tree(proc)
