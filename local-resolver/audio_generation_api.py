"""HTTP handlers for unified audio generation (practice tracks + linked covers)."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from midi_render import midi_render_health, render_midi_bytes_to_wav, try_render_midi_to_wav
from music_generation.jobs import (
    create_job_id,
    job_chords_wav,
    job_melody_wav,
    job_output_wav,
    job_request_path,
    job_score_mid,
    job_source_wav,
    read_job_progress,
    write_job_progress,
)
from music_generation.linked_cover import run_linked_cover_job, validate_linked_cover_request
from music_generation.audio_normalize import normalize_audio_bytes_to_wav
from music_generation.practice_track import run_practice_track_job, save_job_inputs
from music_generation.providers import get_audio_generation_provider
from music_generation.resource_coordinator import audio_generation_exclusive
from music_generation.task_catalog import (
    TASK_LINKED_COVER,
    TASK_PRACTICE_TRACK,
    backends_payload,
    ensure_preset_model_available,
)

_audio_generation_tasks: dict[str, asyncio.Task] = {}


def audio_generation_feature_enabled() -> bool:
    return os.getenv("PRACTICE_TRACK_ENABLED", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _provider_health() -> dict:
    if not audio_generation_feature_enabled():
        return {"ok": False, "enabled": False, "message": "Audio generation disabled"}
    try:
        provider = get_audio_generation_provider()
        health = provider.health()
        health["enabled"] = True
        health["midiRender"] = midi_render_health()
        return health
    except Exception as exc:
        return {"ok": False, "enabled": True, "message": str(exc)}


def practice_track_health() -> dict:
    return _provider_health()


def require_audio_generation_provider_ready() -> dict:
    """Raise HTTP 503 with a clear message when the configured provider is down."""
    health = _provider_health()
    if health.get("ok"):
        return health
    provider = str(health.get("provider") or "audio generation")
    detail = str(health.get("message") or "not available").strip()
    if provider in ("audio_cpp", "audiocpp", "audio.cpp"):
        raise HTTPException(
            status_code=503,
            detail=(
                "audio.cpp sidecar is not available"
                + (f" ({detail})" if detail else "")
                + ". Start abc2book-audio-cpp (systemctl --user start abc2book-audio-cpp) "
                "or set PRACTICE_TRACK_PROVIDER=mock for synthetic covers."
            ),
        )
    raise HTTPException(
        status_code=503,
        detail=f"Audio generation provider '{provider}' is not available"
        + (f": {detail}" if detail else ""),
    )


async def get_audio_generation_backends(
    request: Request,
    authorization: str | None,
    *,
    maybe_require_auth,
    cors_headers,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        health = _provider_health()
        model_ids = health.get("availableModelIds")
        body = backends_payload(
            sidecar_ok=bool(health.get("ok")),
            midi_render=health.get("midiRender") or {},
            available_model_ids=model_ids if isinstance(model_ids, list) else None,
        )
        body["provider"] = health
        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


get_practice_track_backends = get_audio_generation_backends


async def post_render_midi(
    request: Request,
    midi: UploadFile = File(...),
    authorization: str | None = Header(default=None),
    *,
    maybe_require_auth,
    cors_headers,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        midi_bytes = await midi.read()
        if not midi_bytes:
            raise HTTPException(status_code=400, detail="Missing MIDI file")

        job_id = create_job_id()
        score_path = job_score_mid(job_id)
        score_path.write_bytes(midi_bytes)
        output_path = job_output_wav(job_id)
        rendered = try_render_midi_to_wav(score_path, output_path)
        if not rendered:
            try:
                render_midi_bytes_to_wav(midi_bytes, output_path, work_dir=score_path.parent)
            except (RuntimeError, OSError) as exc:
                raise HTTPException(status_code=503, detail=str(exc)) from exc

        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename="midi-render.wav",
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


def _audio_url(request: Request, job_id: str) -> str:
    base = str(request.base_url).rstrip("/")
    return base + "/generate-audio/" + job_id + "/audio"


async def _enqueue_job(job_id: str, task_id: str, runner, on_finished=None):
    write_job_progress(job_id, {
        "stage": "queued",
        "progress": 0,
        "message": "Queued",
        "jobId": job_id,
        "taskId": task_id,
    })

    async def run_job():
        success = False
        try:
            async with audio_generation_exclusive():
                await asyncio.to_thread(runner)
            progress = read_job_progress(job_id) or {}
            success = progress.get("stage") == "complete"
        except Exception as exc:
            write_job_progress(job_id, {
                "stage": "error",
                "progress": 0,
                "message": str(exc)[:500],
                "jobId": job_id,
                "taskId": task_id,
            })
        finally:
            _audio_generation_tasks.pop(job_id, None)
            if on_finished:
                try:
                    on_finished(success, task_id)
                except Exception:
                    pass

    _audio_generation_tasks[job_id] = asyncio.create_task(run_job())


async def post_generate_audio(
    request: Request,
    task_id: str = Form("practice_track"),
    preset_id: str = Form("fast"),
    timing_plan: str | None = Form(default=None),
    request_json: str | None = Form(default=None),
    melody: UploadFile | None = File(default=None),
    chords: UploadFile | None = File(default=None),
    score: UploadFile | None = File(default=None),
    source: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
    *,
    maybe_require_auth,
    cors_headers,
    resolve_linked_media_audio_bytes=None,
    trim_audio_bytes=None,
    on_job_finished=None,
):
    origin = request.headers.get("origin")
    try:
        await maybe_require_auth(authorization)
        if not audio_generation_feature_enabled():
            raise HTTPException(status_code=503, detail="Audio generation disabled")
        health = require_audio_generation_provider_ready()
        model_ids = health.get("availableModelIds")
        if not isinstance(model_ids, list):
            model_ids = None

        task = (task_id or TASK_PRACTICE_TRACK).strip()
        preset = (preset_id or "fast").strip()
        try:
            ensure_preset_model_available(task, preset, model_ids)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        job_id = create_job_id()

        if task == TASK_PRACTICE_TRACK:
            if not timing_plan:
                raise HTTPException(status_code=400, detail="Missing timingPlan")
            try:
                timing_plan_raw = json.loads(timing_plan)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid timingPlan JSON") from exc

            timing_plan_raw["presetId"] = preset
            if timing_plan_raw.get("timing", {}).get("source") == "bar-estimate":
                if not timing_plan_raw.get("acknowledgeBarEstimate"):
                    raise HTTPException(
                        status_code=400,
                        detail="Timing estimated from bars; set acknowledgeBarEstimate to proceed",
                    )

            if melody is None:
                raise HTTPException(status_code=400, detail="Missing melody WAV")
            melody_bytes = await melody.read()
            if not melody_bytes:
                raise HTTPException(status_code=400, detail="Missing melody WAV")

            chord_bytes = None
            if chords is not None:
                chord_bytes = await chords.read()
                if not chord_bytes:
                    chord_bytes = None

            score_bytes = None
            if score is not None:
                score_bytes = await score.read()
                if not score_bytes:
                    score_bytes = None

            save_job_inputs(job_id, timing_plan_raw, melody_bytes, chord_bytes, score_bytes)

            def runner():
                chord_path = job_chords_wav(job_id) if chord_bytes else None
                score_path = job_score_mid(job_id) if score_bytes else None
                run_practice_track_job(
                    job_id,
                    timing_plan_raw,
                    job_melody_wav(job_id),
                    chord_path=chord_path,
                    score_path=score_path,
                )

            await _enqueue_job(job_id, TASK_PRACTICE_TRACK, runner, on_finished=on_job_finished)

        elif task == TASK_LINKED_COVER:
            if not request_json:
                raise HTTPException(status_code=400, detail="Missing request JSON for linked cover")
            try:
                cover_request = json.loads(request_json)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid request JSON") from exc

            cover_request["taskId"] = TASK_LINKED_COVER
            cover_request["presetId"] = preset
            try:
                validate_linked_cover_request(cover_request)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

            write_job_progress(job_id, {
                "stage": "resolving",
                "progress": 5,
                "message": "Preparing source audio",
                "jobId": job_id,
                "taskId": TASK_LINKED_COVER,
            })

            start_at = float(cover_request.get("startAt") or 0)
            end_at = float(cover_request.get("endAt") or 0)

            if source is not None:
                audio_bytes = await source.read()
                if not audio_bytes:
                    raise HTTPException(status_code=400, detail="Missing source audio")
                filename = source.filename or "source.wav"
            else:
                if resolve_linked_media_audio_bytes is None:
                    raise HTTPException(status_code=503, detail="Linked media resolution unavailable")
                audio_bytes, filename, _content_type = await resolve_linked_media_audio_bytes(
                    cover_request["sourceUrl"],
                    cover_request.get("sourceType") or "",
                )

            if trim_audio_bytes and (start_at > 0 or end_at > 0):
                audio_bytes, filename = await trim_audio_bytes(
                    audio_bytes,
                    filename,
                    start_at,
                    end_at,
                )

            try:
                audio_bytes = await normalize_audio_bytes_to_wav(audio_bytes, filename)
            except (RuntimeError, OSError, ValueError) as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc

            job_request_path(job_id).write_text(json.dumps(cover_request), encoding="utf-8")
            job_source_wav(job_id).write_bytes(audio_bytes)

            def runner():
                run_linked_cover_job(
                    job_id,
                    cover_request,
                    source_wav_path=job_source_wav(job_id),
                )

            await _enqueue_job(job_id, TASK_LINKED_COVER, runner, on_finished=on_job_finished)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown taskId: {task}")

        return JSONResponse(
            content={"jobId": job_id, "status": "pending", "taskId": task},
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)[:500] or "Audio generation failed"},
            headers=cors_headers(origin),
        )


post_generate_practice_track = post_generate_audio


async def get_audio_generation_job(
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
        task_id = str(body.get("taskId") or TASK_PRACTICE_TRACK)
        if body.get("stage") == "complete":
            wav_path = job_output_wav(job_id, task_id=task_id)
            if wav_path.is_file():
                body["audioUrl"] = _audio_url(request, job_id)

        return JSONResponse(content=body, headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


get_practice_track_job = get_audio_generation_job


async def get_audio_generation_audio(
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
        progress = read_job_progress(job_id) or {}
        task_id = str(progress.get("taskId") or TASK_PRACTICE_TRACK)
        wav_path = job_output_wav(job_id, task_id=task_id)
        if not wav_path.is_file():
            raise HTTPException(status_code=404, detail="Audio not ready")
        filename = "linked-cover.wav" if task_id == TASK_LINKED_COVER else "practice-track.wav"
        return FileResponse(
            wav_path,
            media_type="audio/wav",
            filename=filename,
            headers=cors_headers(origin),
        )
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )


get_practice_track_audio = get_audio_generation_audio


async def get_audio_cpp_idle_status(
    request: Request,
    authorization: str | None = Header(default=None),
    *,
    maybe_require_auth,
    cors_headers,
):
    from music_generation.resource_coordinator import audio_generation_idle_status

    origin = request.headers.get("origin")
    skip_auth = os.getenv("AUDIO_GEN_IDLE_STATUS_SKIP_AUTH", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    try:
        if not skip_auth:
            await maybe_require_auth(authorization)
        return JSONResponse(content=audio_generation_idle_status(), headers=cors_headers(origin))
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": str(exc.detail)},
            headers=cors_headers(origin),
        )
