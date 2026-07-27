"""HTTP handlers for practice-track generation."""

from __future__ import annotations

import asyncio
import json
import os

from fastapi import File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from music_generation.jobs import (
    create_job_id,
    job_melody_wav,
    job_output_wav,
    read_job_progress,
    write_job_progress,
)
from music_generation.practice_track import run_practice_track_job, save_job_inputs
from music_generation.providers import get_audio_generation_provider

_practice_track_tasks: dict[str, asyncio.Task] = {}


def practice_track_feature_enabled() -> bool:
    return os.getenv("PRACTICE_TRACK_ENABLED", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def practice_track_health() -> dict:
    if not practice_track_feature_enabled():
        return {"ok": False, "enabled": False, "message": "Practice track generation disabled"}
    try:
        provider = get_audio_generation_provider()
        health = provider.health()
        health["enabled"] = True
        return health
    except Exception as exc:
        return {"ok": False, "enabled": True, "message": str(exc)}


async def get_practice_track_backends(
    request: Request,
    authorization: str | None,
    *,
    maybe_require_auth,
    cors_headers,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        body = {
            "ok": True,
            "provider": practice_track_health(),
        }
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


async def post_generate_practice_track(
    request: Request,
    timing_plan: str = Form(...),
    melody: UploadFile = File(...),
    authorization: str | None = Header(default=None),
    *,
    maybe_require_auth,
    cors_headers,
    heavy_job_slot,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        if not practice_track_feature_enabled():
            raise HTTPException(status_code=503, detail="Practice track generation disabled")

        try:
            timing_plan_raw = json.loads(timing_plan)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid timingPlan JSON") from exc

        if timing_plan_raw.get("timing", {}).get("source") == "bar-estimate":
            if not timing_plan_raw.get("acknowledgeBarEstimate"):
                raise HTTPException(
                    status_code=400,
                    detail="Timing estimated from bars; set acknowledgeBarEstimate to proceed",
                )

        melody_bytes = await melody.read()
        if not melody_bytes:
            raise HTTPException(status_code=400, detail="Missing melody WAV")

        job_id = create_job_id()
        save_job_inputs(job_id, timing_plan_raw, melody_bytes)
        write_job_progress(job_id, {
            "stage": "queued",
            "progress": 0,
            "message": "Queued",
            "jobId": job_id,
        })

        async def run_job():
            try:
                async with heavy_job_slot():
                    await asyncio.to_thread(
                        run_practice_track_job,
                        job_id,
                        timing_plan_raw,
                        job_melody_wav(job_id),
                    )
            except Exception as exc:
                write_job_progress(job_id, {
                    "stage": "error",
                    "progress": 0,
                    "message": str(exc)[:500],
                    "jobId": job_id,
                })
            finally:
                _practice_track_tasks.pop(job_id, None)

        _practice_track_tasks[job_id] = asyncio.create_task(run_job())

        return JSONResponse(
            content={"jobId": job_id, "status": "pending"},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


async def get_practice_track_job(
    job_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    *,
    maybe_require_auth,
    cors_headers,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        progress = read_job_progress(job_id)
        if not progress:
            raise HTTPException(status_code=404, detail="Job not found")

        body = dict(progress)
        body["jobId"] = job_id
        if body.get("stage") == "complete" and job_output_wav(job_id).is_file():
            base = str(request.base_url).rstrip("/")
            body["audioUrl"] = base + "/generate-practice-track/" + job_id + "/audio"

        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


async def get_practice_track_audio(
    job_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    *,
    maybe_require_auth,
    cors_headers,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        wav_path = job_output_wav(job_id)
        if not wav_path.is_file():
            raise HTTPException(status_code=404, detail="Audio not ready")
        return FileResponse(
            wav_path,
            media_type="audio/wav",
            filename="practice-track.wav",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )
