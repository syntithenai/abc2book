"""Linked-media cover variant generation via AceStep."""

from __future__ import annotations

from pathlib import Path

from music_generation.jobs import job_output_wav, job_source_wav, write_job_progress
from music_generation.providers import GenerationSpec, get_audio_generation_provider
from music_generation.task_catalog import resolve_preset


COVER_NEGATIVE_PROMPT = (
    "different melody, wrong tune, improvisation, shortened clip, loop, "
    "new composition, altered phrasing, missing sections"
)


def _probe_wav_duration_sec(path: Path) -> float:
    import soundfile as sf

    info = sf.info(str(path))
    return max(0.0, float(info.duration))


def _fit_cover_output_duration(source_path: Path, output_path: Path) -> list[str]:
    import numpy as np
    import soundfile as sf

    from music_generation.mix_tracks import fit_audio_to_duration, stretch_to_duration

    notes: list[str] = []
    target_duration = _probe_wav_duration_sec(source_path)
    if target_duration <= 0:
        return notes

    audio, sr = sf.read(str(output_path), always_2d=True)
    if audio.size == 0:
        return notes

    mono = np.mean(audio, axis=1).astype(np.float32)
    current_duration = len(mono) / float(sr)
    delta = abs(current_duration - target_duration)
    if delta <= 0.5:
        return notes

    if current_duration > 0 and target_duration / current_duration > 1.25:
        mono = stretch_to_duration(mono, sr, target_duration)
        notes.append(
            f"time-stretched cover {current_duration:.1f}s -> {target_duration:.1f}s"
        )

    mono, fit_notes = fit_audio_to_duration(mono, sr, target_duration)
    notes.extend(fit_notes)

    stereo = np.stack([mono, mono], axis=1)
    sf.write(str(output_path), stereo, sr)
    return notes


def _cover_style_prompt(style_prompt: str) -> str:
    prompt = str(style_prompt or "").strip()
    lowered = prompt.lower()
    if "preserv" in lowered and "melody" in lowered:
        return prompt
    return (
        "Faithful cover preserving the exact melody, phrasing, rhythm, and full length "
        "of the source recording. Change instrumentation and production style only: "
        + prompt
    )


def validate_linked_cover_request(raw: dict) -> dict:
    source_url = str(raw.get("sourceUrl") or "").strip()
    if not source_url:
        raise ValueError("Missing sourceUrl")
    style_prompt = str(raw.get("stylePrompt") or raw.get("backingPrompt") or "").strip()
    if not style_prompt:
        raise ValueError("Missing stylePrompt")
    task_id = str(raw.get("taskId") or "linked_cover").strip()
    preset_id = str(raw.get("presetId") or "fast").strip()
    preset = resolve_preset(task_id, preset_id)
    return {
        "taskId": task_id,
        "presetId": preset_id,
        "preset": preset,
        "sourceUrl": source_url,
        "sourceType": str(raw.get("sourceType") or "").strip(),
        "stylePrompt": style_prompt,
        "lyrics": str(raw.get("lyrics") or "").strip(),
        "language": str(raw.get("language") or "en").strip() or "en",
        "title": str(raw.get("title") or "").strip(),
    }


def run_linked_cover_job(
    job_id: str,
    request: dict,
    *,
    source_wav_path: Path | None = None,
) -> dict:
    plan = validate_linked_cover_request(request)
    preset = plan["preset"]
    spec = GenerationSpec.from_preset(preset)

    source_path = source_wav_path or job_source_wav(job_id)
    if not source_path.is_file():
        raise RuntimeError("Source audio not prepared for linked cover job")

    write_job_progress(job_id, {
        "stage": "generating",
        "progress": 20,
        "message": "Generating style cover",
        "taskId": plan["taskId"],
        "presetId": plan["presetId"],
    })

    provider = get_audio_generation_provider()
    output_path = job_output_wav(job_id, task_id=plan["taskId"])
    source_duration = _probe_wav_duration_sec(source_path)
    provider.generate_cover(
        _cover_style_prompt(plan["stylePrompt"]),
        source_path,
        output_path=output_path,
        spec=spec,
        lyrics=plan.get("lyrics") or "",
        language=plan.get("language") or "en",
        duration_sec=source_duration,
        negative_prompt=COVER_NEGATIVE_PROMPT,
    )

    duration_notes = _fit_cover_output_duration(source_path, output_path)
    if duration_notes:
        write_job_progress(job_id, {
            "stage": "generating",
            "progress": 90,
            "message": "; ".join(duration_notes),
            "taskId": plan["taskId"],
            "presetId": plan["presetId"],
        })

    result = {
        "stage": "complete",
        "progress": 100,
        "message": "Cover complete",
        "jobId": job_id,
        "taskId": plan["taskId"],
        "presetId": plan["presetId"],
        "outputFilename": output_path.name,
    }
    write_job_progress(job_id, result)
    return result
