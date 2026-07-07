"""Shared asyncio subprocess helpers with reliable cleanup on timeout/cancel."""

import asyncio
import contextvars
import os
import signal
from contextlib import asynccontextmanager

SUBPROCESS_KILL_GRACE_SECONDS = float(os.getenv("SUBPROCESS_KILL_GRACE_SECONDS", "5"))
MAX_CONCURRENT_HEAVY_JOBS = max(
    1,
    int(os.getenv("MAX_CONCURRENT_HEAVY_JOBS", os.getenv("MAX_CONCURRENT_ML_JOBS", "2"))),
)

_heavy_job_semaphore = None
_heavy_job_depth = contextvars.ContextVar("heavy_job_depth", default=0)


class ClientDisconnected(Exception):
    pass


def _get_heavy_job_semaphore():
    global _heavy_job_semaphore
    if _heavy_job_semaphore is None:
        _heavy_job_semaphore = asyncio.Semaphore(MAX_CONCURRENT_HEAVY_JOBS)
    return _heavy_job_semaphore


@asynccontextmanager
async def heavy_job_slot():
    """Limit concurrent CPU/GPU-heavy subprocess work.

    Re-entrant: nested calls from the same task (e.g. analyze-media internals)
    share the outer slot instead of deadlocking on the semaphore.
    """
    depth = _heavy_job_depth.get()
    if depth > 0:
        yield
        return
    async with _get_heavy_job_semaphore():
        token = _heavy_job_depth.set(depth + 1)
        try:
            yield
        finally:
            _heavy_job_depth.reset(token)


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
