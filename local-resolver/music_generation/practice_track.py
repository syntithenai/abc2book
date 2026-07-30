"""Orchestrate practice-track generation: MIDI-guided AI backing + melody mix."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from midi_drum_guide import build_drum_guide_midi
from midi_render import midi_render_health, try_render_midi_to_wav
from midi_score_prepare import write_prepared_melody_stem
from music_generation.jobs import (
    ensure_job_dir,
    job_backing_wav,
    job_chords_wav,
    job_drums_mid,
    job_drums_wav,
    job_guide_wav,
    job_melody_rendered_wav,
    job_melody_wav,
    job_output_wav,
    job_score_mid,
    job_section_backing_wav,
    job_timing_plan_path,
    write_job_progress,
)
from music_generation.mix_tracks import (
    STRETCH_BPM_DRIFT_THRESHOLD,
    DURATION_STRETCH_THRESHOLD_SEC,
    fit_audio_to_duration,
    mix_practice_track,
    stitch_audio_sections,
    stretch_to_duration,
    tile_backing_loop,
)
from music_generation.providers import AudioCppProvider, GenerationSpec, get_audio_generation_provider
from music_generation.task_catalog import TASK_PRACTICE_TRACK, resolve_preset
from music_generation.timing_contract import (
    loop_duration_sec,
    section_generation_targets,
    validate_timing_plan,
)


def _detect_tempo_bpm(wav_path: Path) -> float:
    script = Path(__file__).resolve().parents[1] / "detect_timing.py"
    if not script.is_file():
        return 0.0
    try:
        proc = subprocess.run(
            [sys.executable, str(script), str(wav_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        body = json.loads(proc.stdout or "{}")
        return float(body.get("tempo") or 0)
    except (subprocess.CalledProcessError, json.JSONDecodeError, ValueError, OSError):
        return 0.0


def _maybe_conform_backing(
    backing_path: Path,
    target_duration_sec: float,
    target_bpm: float,
    *,
    bar_boundaries_sec: list[float] | None = None,
    allow_stretch: bool = True,
) -> dict:
    import soundfile as sf

    audio, sr = sf.read(str(backing_path), always_2d=False)
    if audio.ndim > 1:
        import numpy as np

        audio = np.mean(audio, axis=1)
    audio = audio.astype("float32")

    detected_bpm = _detect_tempo_bpm(backing_path)
    stretch_notes = []

    if allow_stretch and detected_bpm > 0 and target_bpm > 0:
        drift = abs(detected_bpm - target_bpm) / target_bpm
        if drift > STRETCH_BPM_DRIFT_THRESHOLD:
            rate = detected_bpm / target_bpm
            import librosa

            audio = librosa.effects.time_stretch(audio, rate=rate)
            stretch_notes.append(f"stretched backing BPM {detected_bpm:.1f} -> {target_bpm:.1f}")

    current_duration = len(audio) / float(sr)
    duration_delta = abs(current_duration - target_duration_sec)
    if allow_stretch and duration_delta > DURATION_STRETCH_THRESHOLD_SEC:
        audio = stretch_to_duration(audio, sr, target_duration_sec)
        stretch_notes.append(
            f"time-stretched length {current_duration:.2f}s -> {target_duration_sec:.2f}s"
        )
    else:
        audio, fit_notes = fit_audio_to_duration(
            audio,
            sr,
            target_duration_sec,
            bar_boundaries_sec=bar_boundaries_sec,
        )
        stretch_notes.extend(fit_notes)

    sf.write(str(backing_path), audio, sr)
    return {
        "detectedBpm": detected_bpm,
        "targetBpm": target_bpm,
        "stretchNotes": stretch_notes,
    }


def _resolve_melody_path(
    job_id: str,
    melody_path: Path,
    score_path: Path | None,
    *,
    lead_program: int = 40,
    use_style_melody_stem: bool = True,
) -> tuple[Path, dict]:
    info = {
        "melodySource": "client_wav",
        "midiRender": midi_render_health(),
        "styleMelodyStem": False,
    }
    if use_style_melody_stem and score_path and score_path.is_file():
        prepared_mid = job_melody_rendered_wav(job_id).with_suffix(".melody.mid")
        rendered = job_melody_rendered_wav(job_id)
        try:
            write_prepared_melody_stem(score_path, prepared_mid, lead_program=lead_program)
            if try_render_midi_to_wav(prepared_mid, rendered):
                info["melodySource"] = "fluidsynth_style_stem"
                info["styleMelodyStem"] = True
                info["leadMidiProgram"] = lead_program
                return rendered, info
        except (RuntimeError, OSError, ValueError):
            pass
    if score_path and score_path.is_file():
        rendered = job_melody_rendered_wav(job_id)
        if try_render_midi_to_wav(score_path, rendered):
            info["melodySource"] = "fluidsynth_score"
            return rendered, info
    return melody_path, info


def _build_guide_wav(job_id: str, melody_path: Path, chord_path: Path | None) -> Path | None:
    import numpy as np
    import soundfile as sf

    guide_path = job_guide_wav(job_id)
    melody, sr = sf.read(str(melody_path), always_2d=True)
    guide = np.mean(melody, axis=1).astype(np.float32)
    if chord_path and chord_path.is_file():
        chords, chord_sr = sf.read(str(chord_path), always_2d=True)
        if chord_sr != sr:
            import librosa

            chords = librosa.resample(
                np.mean(chords, axis=1).astype(np.float32),
                orig_sr=chord_sr,
                target_sr=sr,
            )
        else:
            chords = np.mean(chords, axis=1).astype(np.float32)
        length = min(len(guide), len(chords))
        guide = guide[:length] + chords[:length] * 0.6
    sf.write(str(guide_path), guide, sr)
    return guide_path if guide_path.is_file() else None


def _ensure_drum_guide(plan: dict, job_id: str) -> Path | None:
    if not plan.get("includeDrumGuide"):
        return None
    drum_config = plan.get("drumGuide")
    if not isinstance(drum_config, dict):
        return None
    midi_bytes = build_drum_guide_midi(drum_config)
    drum_mid = job_drums_mid(job_id)
    drum_mid.write_bytes(midi_bytes)
    drum_wav = job_drums_wav(job_id)
    if try_render_midi_to_wav(drum_mid, drum_wav):
        return drum_wav
    return None


def _generate_backing_loop(
    provider,
    prompt: str,
    negative_prompt: str,
    loop_duration_sec: float,
    target_duration_sec: float,
    output_path: Path,
    *,
    bar_boundaries_sec: list[float] | None = None,
    guide_audio_path: Path | None = None,
    spec=None,
) -> None:
    loop_path = output_path.with_suffix(".loop.wav")
    provider.generate_backing(
        prompt,
        loop_duration_sec,
        negative_prompt=negative_prompt,
        output_path=loop_path,
        guide_audio_path=guide_audio_path,
        spec=spec,
    )
    import soundfile as sf

    audio, sr = sf.read(str(loop_path), always_2d=False)
    if audio.ndim > 1:
        import numpy as np

        audio = np.mean(audio, axis=1).astype(np.float32)
    else:
        audio = audio.astype(np.float32)
    tiled, _notes = tile_backing_loop(
        audio,
        sr,
        target_duration_sec,
        bar_boundaries_sec=bar_boundaries_sec,
    )
    sf.write(str(output_path), tiled, sr)
    if loop_path.is_file() and loop_path != output_path:
        loop_path.unlink(missing_ok=True)


def _assemble_sectional_backing(
    job_id: str,
    plan: dict,
    provider,
    prompt: str,
    negative_prompt: str,
    *,
    guide_audio_path: Path | None = None,
    spec=None,
) -> None:
    targets = section_generation_targets(plan)
    if not targets:
        raise ValueError("No sectional targets")

    timing = plan["timing"]
    boundaries = timing.get("barBoundariesSec") or []
    loop_sec = loop_duration_sec(plan)
    section_paths: list[Path] = []
    section_durations: list[float] = []

    for index, target in enumerate(targets):
        section_path = job_section_backing_wav(job_id, index)
        section_duration = float(target["durationSec"])
        generate_duration = min(loop_sec, section_duration) if loop_sec > 0 else section_duration
        _generate_backing_loop(
            provider,
            prompt,
            negative_prompt,
            generate_duration,
            section_duration,
            section_path,
            bar_boundaries_sec=boundaries,
            guide_audio_path=guide_audio_path,
            spec=spec,
        )
        _maybe_conform_backing(
            section_path,
            section_duration,
            float(timing.get("tempoBpm") or 120),
            bar_boundaries_sec=boundaries,
            allow_stretch=True,
        )
        section_paths.append(section_path)
        section_durations.append(section_duration)

    repeat_schedule = timing.get("repeatSchedule") or []
    if repeat_schedule:
        by_label: dict[str, Path] = {}
        duration_by_label: dict[str, float] = {}
        for target, path in zip(targets, section_paths, strict=False):
            label = str(target.get("strainLabel") or "")
            if label:
                by_label[label] = path
                duration_by_label[label] = float(target["durationSec"])
        ordered_paths: list[Path] = []
        ordered_durations: list[float] = []
        for event in repeat_schedule:
            label = str(event.get("strainLabel") or "")
            play_count = max(1, int(event.get("playCount") or 1))
            path = by_label.get(label)
            if not path:
                continue
            duration = duration_by_label.get(label, 0.0)
            for _ in range(play_count):
                ordered_paths.append(path)
                ordered_durations.append(duration)
        if ordered_paths:
            section_paths = ordered_paths
            section_durations = ordered_durations

    import soundfile as sf

    probe, sr = sf.read(str(section_paths[0]), always_2d=False)
    if hasattr(probe, "shape") and len(probe.shape) > 1:
        import numpy as np

        _ = np.mean(probe, axis=1)
    stitch_audio_sections(
        section_paths,
        section_durations,
        job_backing_wav(job_id),
        sr=sr,
    )


def run_practice_track_job(
    job_id: str,
    timing_plan_raw: dict,
    melody_path: Path,
    *,
    chord_path: Path | None = None,
    score_path: Path | None = None,
) -> dict:
    plan = validate_timing_plan(timing_plan_raw)
    timing = plan["timing"]
    target_duration = float(timing["totalDurationSec"])
    target_bpm = float(timing.get("tempoBpm") or 120)
    boundaries = timing.get("barBoundariesSec") or []
    loop_sec = loop_duration_sec(plan)
    negative_prompt = plan.get("backingNegativePrompt") or ""

    write_job_progress(job_id, {"stage": "preparing", "progress": 5, "message": "Preparing MIDI guides"})

    lead_program = int(plan.get("leadMidiProgram") or 40)
    use_style_melody_stem = bool(plan.get("includeStyleMelodyStem", True))
    melody_path, melody_info = _resolve_melody_path(
        job_id,
        melody_path,
        score_path,
        lead_program=lead_program,
        use_style_melody_stem=use_style_melody_stem,
    )
    chord_file = None
    drum_path = _ensure_drum_guide(plan, job_id)

    write_job_progress(job_id, {"stage": "generating", "progress": 15, "message": "Generating AI backing"})

    preset_id = str(timing_plan_raw.get("presetId") or plan.get("presetId") or "fast")
    preset = resolve_preset(TASK_PRACTICE_TRACK, preset_id)
    spec = GenerationSpec.from_preset(preset)
    provider = get_audio_generation_provider()
    backing_path = job_backing_wav(job_id)
    section_targets = section_generation_targets(plan)
    use_sections = len(section_targets) > 1 and target_duration > 24.0
    guide_for_ai = None

    if use_sections:
        _assemble_sectional_backing(
            job_id,
            plan,
            provider,
            plan["backingPrompt"],
            negative_prompt,
            guide_audio_path=guide_for_ai,
            spec=spec,
        )
    else:
        _generate_backing_loop(
            provider,
            plan["backingPrompt"],
            negative_prompt,
            loop_sec,
            target_duration,
            backing_path,
            bar_boundaries_sec=boundaries,
            guide_audio_path=guide_for_ai,
            spec=spec,
        )

    write_job_progress(job_id, {"stage": "validating", "progress": 60, "message": "Validating timing"})
    validation = _maybe_conform_backing(
        backing_path,
        target_duration,
        target_bpm,
        bar_boundaries_sec=boundaries,
        allow_stretch=True,
    )
    validation.update(melody_info)
    validation["loopDurationSec"] = loop_sec
    validation["sectional"] = use_sections
    validation["renderStyle"] = plan.get("renderStyle")
    validation["guideMode"] = plan.get("guideMode")
    validation["guideAudioConditioning"] = bool(guide_for_ai)
    if isinstance(provider, AudioCppProvider) and guide_for_ai:
        validation["guideConditioningField"] = AudioCppProvider.GUIDE_AUDIO_REQUEST_FIELDS[0]
    else:
        validation["guideConditioningField"] = None
    validation["hybridFallback"] = not bool(guide_for_ai)

    include_style_melody_stem = bool(plan.get("includeStyleMelodyStem", True))
    use_melody_in_mix = (
        include_style_melody_stem
        and melody_info.get("melodySource") == "fluidsynth_style_stem"
    )
    validation["melodyGuideOnly"] = not use_melody_in_mix
    validation["styleMelodyStem"] = use_melody_in_mix

    write_job_progress(job_id, {"stage": "mixing", "progress": 80, "message": "Mixing practice track"})
    output_path = job_output_wav(job_id)
    mix_info = mix_practice_track(
        melody_path if use_melody_in_mix else None,
        backing_path,
        output_path,
        include_notation_stem=use_melody_in_mix,
        backing_gain_db=float(plan.get("backingGainDb") or -18.0),
        arrangement_gain_db=float(plan.get("arrangementGainDb") or -14.0),
        chord_path=None,
        drum_path=drum_path,
        target_duration_sec=target_duration,
        duck_backing=use_melody_in_mix,
        highpass_backing=False,
    )

    result = {
        "stage": "complete",
        "progress": 100,
        "message": "Complete",
        "taskId": TASK_PRACTICE_TRACK,
        "presetId": preset_id,
        "validation": validation,
        "mix": mix_info,
        "provider": provider.health(),
        "audioPath": str(output_path),
        "stems": {
            "melody": use_melody_in_mix,
            "styleMelodyStem": use_melody_in_mix,
            "melodySource": melody_info.get("melodySource"),
            "arrangement": True,
            "chords": False,
            "drumGuide": bool(drum_path),
            "guideWav": False,
            "scoreMid": bool(score_path and score_path.is_file()),
        },
    }
    write_job_progress(job_id, result)
    return result


def save_job_inputs(
    job_id: str,
    timing_plan_raw: dict,
    melody_bytes: bytes,
    chord_bytes: bytes | None = None,
    score_bytes: bytes | None = None,
) -> None:
    ensure_job_dir(job_id)
    job_timing_plan_path(job_id).write_text(
        json.dumps(timing_plan_raw),
        encoding="utf-8",
    )
    job_melody_wav(job_id).write_bytes(melody_bytes)
    if chord_bytes:
        job_chords_wav(job_id).write_bytes(chord_bytes)
    if score_bytes:
        job_score_mid(job_id).write_bytes(score_bytes)
