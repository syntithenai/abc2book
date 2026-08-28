"""Orchestrate practice-track generation: MIDI-guided AI backing + melody mix."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from dataclasses import replace

from midi_drum_guide import build_drum_guide_midi
from midi_render import midi_render_health, try_render_midi_to_wav
from midi_score_prepare import (
    write_prepared_melody_stem,
    write_style_guide_midi,
)
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
    CHUNK_STITCH_FADE_MS,
    fit_audio_to_duration,
    mix_practice_track,
    stitch_audio_sections,
    stretch_to_duration,
    tile_backing_loop,
    trim_trailing_silence,
)
from music_generation.guide_harmony import (
    chords_per_bar_from_plan,
    guide_harmony_source,
    write_chord_chart_guide_midi,
    write_harmony_only_midi,
)
from music_generation.providers import AudioCppProvider, GenerationSpec, get_audio_generation_provider
from music_generation.task_catalog import (
    STABLE_AUDIO_MAX_CHUNK_SEC,
    TASK_PRACTICE_TRACK,
    resolve_preset,
)
from music_generation.fidelity_validation import validate_guide_wav, validate_practice_track_fidelity
from music_generation.timing_contract import (
    effective_target_duration_sec,
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
    bpm_drift_threshold: float | None = None,
    duration_stretch_threshold_sec: float | None = None,
) -> dict:
    import soundfile as sf

    audio, sr = sf.read(str(backing_path), always_2d=False)
    if audio.ndim > 1:
        import numpy as np

        audio = np.mean(audio, axis=1)
    audio = audio.astype("float32")

    detected_bpm = _detect_tempo_bpm(backing_path)
    stretch_notes = []
    drift_limit = (
        float(bpm_drift_threshold)
        if bpm_drift_threshold is not None
        else STRETCH_BPM_DRIFT_THRESHOLD
    )
    duration_limit = (
        float(duration_stretch_threshold_sec)
        if duration_stretch_threshold_sec is not None
        else DURATION_STRETCH_THRESHOLD_SEC
    )

    if allow_stretch and detected_bpm > 0 and target_bpm > 0:
        drift = abs(detected_bpm - target_bpm) / target_bpm
        if drift > drift_limit:
            rate = detected_bpm / target_bpm
            import librosa

            audio = librosa.effects.time_stretch(audio, rate=rate)
            stretch_notes.append(f"stretched backing BPM {detected_bpm:.1f} -> {target_bpm:.1f}")

    current_duration = len(audio) / float(sr)
    duration_delta = abs(current_duration - target_duration_sec)
    if allow_stretch and duration_delta > duration_limit:
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


def _render_full_score_guide_wav(
    job_id: str,
    score_path: Path,
    target_duration_sec: float,
    *,
    bar_boundaries_sec: list[float] | None = None,
    lead_program: int = 40,
    accompaniment_program: int = 24,
    render_style: str = "trad_session",
    timing_plan: dict | None = None,
) -> tuple[Path | None, dict]:
    """Render melody + harmony guide WAV for init-audio conditioning.

    Uses chord-chart harmony when chordsPerBar is present (default); falls back
    to abcjs score.mid accompaniment only when no chart is available.
    """
    import numpy as np
    import soundfile as sf

    plan = timing_plan or {}
    timing = plan.get("timing") or {}
    meter = str(timing.get("meter") or (plan.get("musical") or {}).get("meter") or "4/4")
    tempo_bpm = float(timing.get("tempoBpm") or (plan.get("musical") or {}).get("tempoBpm") or 120)
    boundaries = bar_boundaries_sec or timing.get("barBoundariesSec") or []
    bar_count = max(0, len(boundaries) - 1)
    chords_per_bar = chords_per_bar_from_plan(plan)
    harmony_source = guide_harmony_source(plan)

    style = str(render_style or "trad_session").lower()
    chamber = style in ("classical", "chamber")
    melody_gain = 1.0
    chord_gain = 0.8

    styled_mid = job_melody_rendered_wav(job_id).with_name("score-guide-style.mid")
    rendered = job_melody_rendered_wav(job_id).with_name("score-guide-render.wav")
    info: dict = {
        "guideSource": "score_mid_full",
        "guideHarmonySource": harmony_source,
        "leadMidiProgram": lead_program,
        "accompanimentMidiProgram": accompaniment_program,
        "renderStyle": style,
        "chordsPerBarCount": len([c for c in chords_per_bar if c]),
    }

    use_chord_chart = harmony_source == "chord_chart" and chords_per_bar and bar_count > 0
    try:
        if use_chord_chart:
            write_chord_chart_guide_midi(
                score_path,
                styled_mid,
                chords_per_bar,
                bar_count=bar_count,
                meter=meter,
                tempo_bpm=tempo_bpm,
                render_style=style,
                lead_program=lead_program,
                accompaniment_program=accompaniment_program,
            )
            info["guideSource"] = "chord_chart_arranged"
        else:
            write_style_guide_midi(
                score_path,
                styled_mid,
                lead_program=lead_program,
                accompaniment_program=accompaniment_program,
                sustain_accompaniment=chamber,
                accompaniment_pad_velocity=80 if chamber else 72,
            )
            info["guideSource"] = "score_mid_abcjs"
            info["sustainAccompaniment"] = chamber
        render_source = styled_mid
    except (RuntimeError, OSError, ValueError):
        render_source = score_path
        info["guideSource"] = "score_mid_unstyled"

    # Prefer separate melody/harmony stems so mix gains are real (not metadata-only).
    mixed_stems = False
    if use_chord_chart and info.get("guideSource") == "chord_chart_arranged":
        try:
            melody_mid = rendered.with_name("score-guide-melody.mid")
            harmony_mid = rendered.with_name("score-guide-harmony.mid")
            melody_wav = rendered.with_name("score-guide-melody.wav")
            harmony_wav = rendered.with_name("score-guide-harmony.wav")
            write_prepared_melody_stem(score_path, melody_mid, lead_program=lead_program)
            write_harmony_only_midi(
                harmony_mid,
                chords_per_bar,
                bar_count=bar_count,
                meter=meter,
                tempo_bpm=tempo_bpm,
                render_style=style,
                accompaniment_program=accompaniment_program,
            )
            if try_render_midi_to_wav(melody_mid, melody_wav) and try_render_midi_to_wav(harmony_mid, harmony_wav):
                mel, mel_sr = sf.read(str(melody_wav), always_2d=False)
                har, har_sr = sf.read(str(harmony_wav), always_2d=False)
                if hasattr(mel, "ndim") and mel.ndim > 1:
                    mel = np.mean(mel, axis=1).astype(np.float32)
                else:
                    mel = mel.astype(np.float32)
                if hasattr(har, "ndim") and har.ndim > 1:
                    har = np.mean(har, axis=1).astype(np.float32)
                else:
                    har = har.astype(np.float32)
                if har_sr != mel_sr:
                    import librosa

                    har = librosa.resample(har, orig_sr=har_sr, target_sr=mel_sr)
                length = max(len(mel), len(har))
                if len(mel) < length:
                    mel = np.pad(mel, (0, length - len(mel)))
                if len(har) < length:
                    har = np.pad(har, (0, length - len(har)))
                audio = (mel * melody_gain) + (har * chord_gain)
                sr = mel_sr
                mixed_stems = True
                info["guideStemMix"] = True
                sf.write(str(rendered), audio, sr)
        except (RuntimeError, OSError, ValueError, ImportError):
            mixed_stems = False

    if not mixed_stems:
        if not try_render_midi_to_wav(render_source, rendered):
            return None, {"guideSource": "score_render_failed"}
        audio, sr = sf.read(str(rendered), always_2d=False)
        if hasattr(audio, "ndim") and audio.ndim > 1:
            audio = np.mean(audio, axis=1).astype(np.float32)
        else:
            audio = audio.astype("float32")

    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak > 0.95:
        audio = audio * (0.92 / peak)
    info["guideMelodyGain"] = melody_gain
    info["guideChordGain"] = chord_gain
    info["guideStemMix"] = mixed_stems

    if len(audio) / float(sr) < target_duration_sec * 0.95:
        fitted, fit_notes = tile_backing_loop(
            audio,
            sr,
            target_duration_sec,
            bar_boundaries_sec=bar_boundaries_sec,
        )
    else:
        fitted, fit_notes = fit_audio_to_duration(
            audio,
            sr,
            target_duration_sec,
            bar_boundaries_sec=bar_boundaries_sec,
        )
    guide_path = job_guide_wav(job_id)
    sf.write(str(guide_path), fitted, sr)
    info["guideFitNotes"] = fit_notes
    info["guideDurationSec"] = target_duration_sec

    guide_quality = validate_guide_wav(
        guide_path,
        meter=meter,
        render_style=style,
        harmony_source=harmony_source,
    )
    info["guideQuality"] = guide_quality
    return guide_path if guide_path.is_file() else None, info


def _slice_guide_wav(
    guide_path: Path,
    start_sec: float,
    duration_sec: float,
    output_path: Path,
) -> Path | None:
    import soundfile as sf

    if not guide_path.is_file() or duration_sec <= 0:
        return None
    audio, sr = sf.read(str(guide_path), always_2d=False)
    if hasattr(audio, "ndim") and audio.ndim > 1:
        import numpy as np

        audio = np.mean(audio, axis=1).astype(np.float32)
    else:
        audio = audio.astype("float32")
    start_sample = max(0, int(round(start_sec * sr)))
    end_sample = min(len(audio), start_sample + int(round(duration_sec * sr)))
    if end_sample <= start_sample:
        return None
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), audio[start_sample:end_sample], sr)
    return output_path if output_path.is_file() else None


def _build_guide_wav(
    job_id: str,
    score_path: Path | None,
    melody_path: Path,
    chord_path: Path | None,
    target_duration_sec: float,
    *,
    bar_boundaries_sec: list[float] | None = None,
    drum_path: Path | None = None,
    include_chord_layer: bool = False,
    lead_program: int = 40,
    accompaniment_program: int = 24,
    render_style: str = "trad_session",
    timing_plan: dict | None = None,
) -> tuple[Path | None, dict]:
    """Build a conditioning guide for audio.cpp (not mixed into the final track)."""
    import numpy as np
    import soundfile as sf

    guide_info: dict = {"guideSource": "melody_wav"}
    base_path: Path | None = None

    if score_path and score_path.is_file():
        base_path, guide_info = _render_full_score_guide_wav(
            job_id,
            score_path,
            target_duration_sec,
            bar_boundaries_sec=bar_boundaries_sec,
            lead_program=lead_program,
            accompaniment_program=accompaniment_program,
            render_style=render_style,
            timing_plan=timing_plan,
        )
    elif melody_path and melody_path.is_file():
        guide_path = job_guide_wav(job_id)
        melody, sr = sf.read(str(melody_path), always_2d=True)
        fitted, fit_notes = fit_audio_to_duration(
            np.mean(melody, axis=1).astype(np.float32),
            sr,
            target_duration_sec,
            bar_boundaries_sec=bar_boundaries_sec,
        )
        sf.write(str(guide_path), fitted, sr)
        base_path = guide_path if guide_path.is_file() else None
        guide_info = {"guideSource": "melody_wav", "guideFitNotes": fit_notes}

    if not base_path or not base_path.is_file():
        return None, guide_info

    # Full score.mid already contains chord tracks. Never mix a shorter client
    # chord WAV on top — that previously truncated an ~88s guide to ~18s and
    # AceStep/Stable Audio only heard a fragment of the tune.
    score_guide = str(guide_info.get("guideSource") or "").startswith(("score_mid", "chord_chart"))
    if include_chord_layer and chord_path and chord_path.is_file() and not score_guide:
        guide, sr = sf.read(str(base_path), always_2d=False)
        if guide.ndim > 1:
            guide = np.mean(guide, axis=1).astype(np.float32)
        else:
            guide = guide.astype(np.float32)
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
        if len(chords) < len(guide):
            chords, chord_notes = tile_backing_loop(
                chords,
                sr,
                len(guide) / float(sr),
                bar_boundaries_sec=bar_boundaries_sec,
            )
            guide_info["chordLayerTileNotes"] = chord_notes
        length = min(len(guide), len(chords))
        mixed = guide[:length].copy()
        mixed += chords[:length] * 0.35
        peak = float(np.max(np.abs(mixed))) if length else 0.0
        if peak > 0.95:
            mixed = mixed * (0.9 / peak)
        if len(guide) > length:
            mixed = np.concatenate([mixed, guide[length:]])
        sf.write(str(base_path), mixed, sr)
        guide_info["chordLayerBoost"] = True
    elif include_chord_layer and score_guide:
        guide_info["chordLayerSkipped"] = "score_mid_already_has_chords"

    # Verify guide length matches target — refuse silent/truncated guides.
    try:
        final, final_sr = sf.read(str(base_path), always_2d=False)
        final_dur = len(final) / float(final_sr)
        if final_dur < target_duration_sec * 0.85:
            # Prefer the full score render over a truncated mix.
            rendered = job_melody_rendered_wav(job_id).with_name("score-guide-render.wav")
            if rendered.is_file():
                audio, sr = sf.read(str(rendered), always_2d=False)
                if hasattr(audio, "ndim") and audio.ndim > 1:
                    audio = np.mean(audio, axis=1).astype(np.float32)
                else:
                    audio = audio.astype("float32")
                fitted, fit_notes = fit_audio_to_duration(
                    audio,
                    sr,
                    target_duration_sec,
                    bar_boundaries_sec=bar_boundaries_sec,
                )
                sf.write(str(base_path), fitted, sr)
                guide_info["guideRepairedFromScoreRender"] = True
                guide_info["guideRepairNotes"] = fit_notes
                guide_info["guideDurationSec"] = target_duration_sec
    except Exception:
        pass

    if drum_path and drum_path.is_file():
        guide, sr = sf.read(str(base_path), always_2d=False)
        if guide.ndim > 1:
            guide = np.mean(guide, axis=1).astype(np.float32)
        else:
            guide = guide.astype(np.float32)
        drums, drum_sr = sf.read(str(drum_path), always_2d=True)
        if drum_sr != sr:
            import librosa

            drums = librosa.resample(
                np.mean(drums, axis=1).astype(np.float32),
                orig_sr=drum_sr,
                target_sr=sr,
            )
        else:
            drums = np.mean(drums, axis=1).astype(np.float32)
        length = min(len(guide), len(drums))
        guide = guide[:length].copy()
        guide[:length] = guide[:length] + drums[:length] * 0.35
        peak = float(np.max(np.abs(guide))) if len(guide) else 0.0
        if peak > 0.95:
            guide = guide * (0.9 / peak)
        sf.write(str(base_path), guide, sr)
        guide_info["drumLayerBoost"] = True

    return base_path, guide_info


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


def _generate_guided_segment(
    provider,
    prompt: str,
    negative_prompt: str,
    duration_sec: float,
    output_path: Path,
    *,
    guide_audio_path: Path | None = None,
    spec=None,
    use_cover: bool = False,
    tempo_bpm: float | None = None,
    meter: str | None = None,
) -> None:
    """Generate one segment locked to guide audio (no freeform loop inventing)."""
    duration = max(0.5, float(duration_sec))
    if use_cover and guide_audio_path and hasattr(provider, "generate_cover"):
        provider.generate_cover(
            prompt,
            guide_audio_path,
            output_path=output_path,
            spec=spec,
            duration_sec=duration,
            negative_prompt=negative_prompt,
            tempo_bpm=tempo_bpm,
            meter=meter,
        )
        return
    provider.generate_backing(
        prompt,
        duration,
        negative_prompt=negative_prompt,
        output_path=output_path,
        guide_audio_path=guide_audio_path,
        spec=spec,
    )


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
    use_cover: bool = False,
    strict_guide: bool = False,
    tempo_bpm: float | None = None,
    meter: str | None = None,
) -> None:
    # Strict MIDI lock: generate the full target against the guide. Short-loop
    # tiling invents new melody/chords on each repeat and must not be used.
    if strict_guide and guide_audio_path:
        _generate_guided_segment(
            provider,
            prompt,
            negative_prompt,
            target_duration_sec,
            output_path,
            guide_audio_path=guide_audio_path,
            spec=spec,
            use_cover=use_cover,
            tempo_bpm=tempo_bpm,
            meter=meter,
        )
        return

    loop_path = output_path.with_suffix(".loop.wav")
    _generate_guided_segment(
        provider,
        prompt,
        negative_prompt,
        loop_duration_sec,
        loop_path,
        guide_audio_path=guide_audio_path,
        spec=spec,
        use_cover=use_cover,
        tempo_bpm=tempo_bpm,
        meter=meter,
    )
    import soundfile as sf
    import numpy as np

    audio, sr = sf.read(str(loop_path), always_2d=False)
    if audio.ndim > 1:
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


CHUNK_OVERLAP_BARS = 2
CHUNK_TAIL_CHECK_SEC = 4.0
CHUNK_RMS_COLLAPSE_RATIO = 0.55


def _bar_overlap_sec(bar_boundaries_sec: list[float], around_sec: float, bars: int = CHUNK_OVERLAP_BARS) -> float:
    """Seconds spanning `bars` bars ending at/near around_sec."""
    boundaries = [float(b) for b in (bar_boundaries_sec or []) if float(b) >= 0]
    if len(boundaries) < 2:
        return max(1.5, float(bars) * 1.8)
    # Find boundary index at or before around_sec.
    end_idx = 0
    for i, boundary in enumerate(boundaries):
        if boundary <= around_sec + 0.05:
            end_idx = i
    start_idx = max(0, end_idx - max(1, int(bars)))
    span = float(boundaries[end_idx] - boundaries[start_idx])
    return max(1.0, span)


def _wav_rms(path: Path, *, start_sec: float = 0.0, duration_sec: float | None = None) -> float | None:
    try:
        import numpy as np
        import soundfile as sf
    except ImportError:
        return None
    if not path or not path.is_file():
        return None
    try:
        audio, sr = sf.read(str(path), always_2d=False)
        if hasattr(audio, "ndim") and audio.ndim > 1:
            audio = np.mean(audio, axis=1)
        audio = audio.astype(np.float32)
        start = max(0, int(round(start_sec * sr)))
        if duration_sec is not None:
            end = min(len(audio), start + max(1, int(round(duration_sec * sr))))
        else:
            end = len(audio)
        if end <= start:
            return None
        segment = audio[start:end]
        return float(np.sqrt(np.mean(np.square(segment))))
    except Exception:
        return None


def _chunk_tail_collapsed(
    section_path: Path,
    guide_slice_path: Path | None,
    *,
    tail_sec: float = CHUNK_TAIL_CHECK_SEC,
) -> tuple[bool, dict]:
    """True when generated chunk tail is much quieter than the matching guide tail."""
    info: dict = {}
    if not section_path.is_file():
        return False, info
    try:
        import soundfile as sf

        audio, sr = sf.read(str(section_path), always_2d=False)
        dur = len(audio) / float(sr) if hasattr(audio, "__len__") else 0.0
    except Exception:
        return False, info
    if dur < tail_sec * 1.5:
        return False, info
    out_tail = _wav_rms(section_path, start_sec=max(0.0, dur - tail_sec), duration_sec=tail_sec)
    info["outputTailRms"] = out_tail
    if out_tail is None:
        return False, info
    guide_tail = None
    if guide_slice_path and guide_slice_path.is_file():
        try:
            import soundfile as sf

            g_audio, g_sr = sf.read(str(guide_slice_path), always_2d=False)
            g_dur = len(g_audio) / float(g_sr)
            guide_tail = _wav_rms(
                guide_slice_path,
                start_sec=max(0.0, g_dur - tail_sec),
                duration_sec=tail_sec,
            )
        except Exception:
            guide_tail = None
    info["guideTailRms"] = guide_tail
    if guide_tail is not None and guide_tail > 1e-4:
        ratio = out_tail / guide_tail
        info["tailRmsRatio"] = ratio
        return ratio < CHUNK_RMS_COLLAPSE_RATIO, info
    # No guide: treat near-silence as collapse.
    collapsed = out_tail < 0.01
    info["tailNearSilence"] = collapsed
    return collapsed, info


def _duration_chunk_targets(
    total_duration_sec: float,
    bar_boundaries_sec: list[float],
    *,
    max_chunk_sec: float = STABLE_AUDIO_MAX_CHUNK_SEC,
) -> list[dict]:
    """Split a long tune into ~max_chunk_sec windows on bar boundaries."""
    total = float(total_duration_sec)
    max_chunk = max(8.0, float(max_chunk_sec))
    if total <= max_chunk + 1.0:
        return [{
            "id": "full",
            "strainLabel": "",
            "durationSec": total,
            "startTimeSec": 0.0,
            "endTimeSec": total,
            "overlapSec": 0.0,
        }]

    boundaries = [float(b) for b in (bar_boundaries_sec or []) if float(b) >= 0]
    if len(boundaries) < 2:
        boundaries = [0.0, total]

    chunks: list[dict] = []
    start = 0.0
    index = 0
    while start < total - 0.05:
        target_end = min(total, start + max_chunk)
        # Snap to the nearest bar boundary at or after target_end when possible.
        end = target_end
        for boundary in boundaries:
            if boundary > start + 2.0 and boundary <= target_end + 1.5:
                end = min(total, boundary)
        if end <= start + 1.0:
            end = min(total, start + max_chunk)
        overlap = 0.0
        if index > 0:
            overlap = _bar_overlap_sec(boundaries, start, CHUNK_OVERLAP_BARS)
            overlap = min(overlap, max(0.0, start - 0.5))
        chunks.append({
            "id": f"chunk-{index}",
            "strainLabel": "",
            "durationSec": max(0.5, end - start),
            "startTimeSec": start,
            "endTimeSec": end,
            "overlapSec": overlap,
        })
        start = end
        index += 1
    # Merge a tiny trailing remainder into the previous chunk.
    if len(chunks) >= 2 and chunks[-1]["durationSec"] < 4.0:
        prev = chunks[-2]
        last = chunks.pop()
        prev["endTimeSec"] = last["endTimeSec"]
        prev["durationSec"] = prev["endTimeSec"] - prev["startTimeSec"]
    return chunks


def _synthetic_half_sections(
    target_duration_sec: float,
    bar_boundaries_sec: list[float],
) -> list[dict]:
    """Split a long single-section tune at a mid bar for sectional generation."""
    total = float(target_duration_sec)
    boundaries = [float(b) for b in (bar_boundaries_sec or []) if float(b) >= 0]
    mid = total / 2.0
    split = mid
    if len(boundaries) >= 3:
        # Nearest interior bar boundary to midpoint.
        candidates = [b for b in boundaries[1:-1]]
        if candidates:
            split = min(candidates, key=lambda b: abs(b - mid))
    if split < 8.0 or total - split < 8.0:
        return []
    return [
        {
            "id": "half-a",
            "strainLabel": "A",
            "durationSec": split,
            "startTimeSec": 0.0,
            "endTimeSec": split,
        },
        {
            "id": "half-b",
            "strainLabel": "B",
            "durationSec": total - split,
            "startTimeSec": split,
            "endTimeSec": total,
        },
    ]


def _assemble_chunked_backing(
    job_id: str,
    plan: dict,
    provider,
    prompt: str,
    negative_prompt: str,
    *,
    target_duration_sec: float,
    guide_audio_path: Path | None = None,
    spec=None,
    use_cover: bool = False,
    strict_guide: bool = False,
) -> dict:
    """Generate long Stable Audio jobs as overlapping guide-locked chunks."""
    timing = plan["timing"]
    boundaries = timing.get("barBoundariesSec") or []
    chunks = _duration_chunk_targets(target_duration_sec, boundaries)
    section_paths: list[Path] = []
    section_durations: list[float] = []
    tempo = float(timing.get("tempoBpm") or 120)
    meter = str(timing.get("meter") or "")
    overlap_used = 0.0
    chunk_meta: list[dict] = []

    for index, chunk in enumerate(chunks):
        section_path = job_section_backing_wav(job_id, index)
        duration = float(chunk["durationSec"])
        start_sec = float(chunk["startTimeSec"])
        overlap = float(chunk.get("overlapSec") or 0.0)
        gen_start = max(0.0, start_sec - overlap)
        gen_duration = max(0.5, (start_sec + duration) - gen_start)
        if overlap > overlap_used:
            overlap_used = overlap

        section_guide = guide_audio_path
        if guide_audio_path and guide_audio_path.is_file():
            sliced = section_path.with_suffix(".guide.wav")
            section_guide = _slice_guide_wav(
                guide_audio_path,
                gen_start,
                gen_duration,
                sliced,
            ) or guide_audio_path

        _generate_guided_segment(
            provider,
            prompt,
            negative_prompt,
            gen_duration,
            section_path,
            guide_audio_path=section_guide,
            spec=spec,
            use_cover=use_cover,
            tempo_bpm=tempo,
            meter=meter,
        )
        # Prefer pad/trim over BPM smear on per-chunk restyles.
        _maybe_conform_backing(
            section_path,
            gen_duration,
            tempo,
            bar_boundaries_sec=boundaries,
            allow_stretch=True,
            bpm_drift_threshold=0.15,
            duration_stretch_threshold_sec=2.5,
        )

        meta = {
            "id": chunk.get("id"),
            "startTimeSec": start_sec,
            "durationSec": duration,
            "overlapSec": overlap,
            "genStartSec": gen_start,
            "genDurationSec": gen_duration,
            "regenerated": False,
        }
        collapsed, rms_info = _chunk_tail_collapsed(section_path, section_guide)
        meta.update(rms_info)
        if collapsed and spec is not None and not use_cover:
            # One retry at stronger guide lock.
            low_noise = max(0.12, float(getattr(spec, "init_noise_level", 0.22)) - 0.08)
            retry_spec = replace(spec, init_noise_level=low_noise)
            _generate_guided_segment(
                provider,
                prompt,
                negative_prompt,
                gen_duration,
                section_path,
                guide_audio_path=section_guide,
                spec=retry_spec,
                use_cover=use_cover,
                tempo_bpm=tempo,
                meter=meter,
            )
            _maybe_conform_backing(
                section_path,
                gen_duration,
                tempo,
                bar_boundaries_sec=boundaries,
                allow_stretch=True,
                bpm_drift_threshold=0.15,
                duration_stretch_threshold_sec=2.5,
            )
            meta["regenerated"] = True
            meta["retryInitNoiseLevel"] = low_noise
            _, rms_info2 = _chunk_tail_collapsed(section_path, section_guide)
            meta.update({f"retry_{k}": v for k, v in rms_info2.items()})

        chunk_meta.append(meta)
        section_paths.append(section_path)
        section_durations.append(duration)

    import soundfile as sf

    probe, sr = sf.read(str(section_paths[0]), always_2d=False)
    stitch_info = stitch_audio_sections(
        section_paths,
        section_durations,
        job_backing_wav(job_id),
        sr=sr,
        fade_ms=CHUNK_STITCH_FADE_MS,
        overlap_sec=overlap_used,
    )
    return {
        "chunkCount": len(chunks),
        "overlapSec": overlap_used,
        "fadeMs": CHUNK_STITCH_FADE_MS,
        "chunks": chunk_meta,
        "stitch": stitch_info,
    }


def _assemble_sectional_backing(
    job_id: str,
    plan: dict,
    provider,
    prompt: str,
    negative_prompt: str,
    *,
    guide_audio_path: Path | None = None,
    spec=None,
    use_cover: bool = False,
    strict_guide: bool = False,
) -> dict:
    targets = section_generation_targets(plan)
    if not targets:
        raise ValueError("No sectional targets")

    timing = plan["timing"]
    boundaries = timing.get("barBoundariesSec") or []
    loop_sec = loop_duration_sec(plan)
    section_paths: list[Path] = []
    section_durations: list[float] = []
    section_meta: list[dict] = []

    for index, target in enumerate(targets):
        section_path = job_section_backing_wav(job_id, index)
        section_duration = float(target["durationSec"])
        # With a MIDI guide, always generate the full section from its guide slice.
        # Short loop+tile invents new notes and breaks chord lock.
        generate_duration = (
            section_duration
            if (strict_guide and guide_audio_path)
            else (min(loop_sec, section_duration) if loop_sec > 0 else section_duration)
        )
        section_guide = guide_audio_path
        start_sec = float(target.get("startTimeSec") or 0.0)
        if guide_audio_path and guide_audio_path.is_file():
            sliced = section_path.with_suffix(".guide.wav")
            section_guide = _slice_guide_wav(
                guide_audio_path,
                start_sec,
                generate_duration if strict_guide else section_duration,
                sliced,
            ) or guide_audio_path
        _generate_backing_loop(
            provider,
            prompt,
            negative_prompt,
            generate_duration,
            section_duration,
            section_path,
            bar_boundaries_sec=boundaries,
            guide_audio_path=section_guide,
            spec=spec,
            use_cover=use_cover,
            strict_guide=strict_guide,
            tempo_bpm=float(timing.get("tempoBpm") or 120),
            meter=str(timing.get("meter") or ""),
        )
        _maybe_conform_backing(
            section_path,
            section_duration,
            float(timing.get("tempoBpm") or 120),
            bar_boundaries_sec=boundaries,
            allow_stretch=True,
            bpm_drift_threshold=0.15 if strict_guide else STRETCH_BPM_DRIFT_THRESHOLD,
            duration_stretch_threshold_sec=2.5 if strict_guide else DURATION_STRETCH_THRESHOLD_SEC,
        )
        section_paths.append(section_path)
        section_durations.append(section_duration)
        section_meta.append({
            "id": target.get("id") or f"section-{index}",
            "startTimeSec": start_sec,
            "durationSec": section_duration,
            "strainLabel": target.get("strainLabel"),
        })

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
    stitch_info = stitch_audio_sections(
        section_paths,
        section_durations,
        job_backing_wav(job_id),
        sr=sr,
        fade_ms=CHUNK_STITCH_FADE_MS,
    )
    return {
        "chunkCount": len(section_meta),
        "overlapSec": 0.0,
        "fadeMs": CHUNK_STITCH_FADE_MS,
        "chunks": section_meta,
        "stitch": stitch_info,
        "sectional": True,
    }


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
    target_duration = effective_target_duration_sec(plan)
    target_bpm = float(timing.get("tempoBpm") or 120)
    boundaries = timing.get("barBoundariesSec") or []
    loop_sec = loop_duration_sec(plan)
    negative_prompt = plan.get("backingNegativePrompt") or ""

    write_job_progress(job_id, {"stage": "preparing", "progress": 5, "message": "Preparing MIDI guides"})

    lead_program = int(plan.get("leadMidiProgram") or 40)
    accompaniment_program = int(plan.get("accompanimentMidiProgram") or 24)
    render_style = str(plan.get("renderStyle") or "trad_session")
    # Style melody stem is rendered for AI guide conditioning; it is not mixed
    # into the final track unless includeStyleMelodyStem is explicitly true.
    use_style_melody_stem = bool(plan.get("includeStyleMelodyStem", False)) or bool(
        plan.get("guideAudioConditioning", True)
    )
    melody_path, melody_info = _resolve_melody_path(
        job_id,
        melody_path,
        score_path,
        lead_program=lead_program,
        use_style_melody_stem=use_style_melody_stem,
    )
    drum_path = _ensure_drum_guide(plan, job_id)

    write_job_progress(job_id, {"stage": "generating", "progress": 15, "message": "Generating AI backing"})

    preset_id = str(timing_plan_raw.get("presetId") or plan.get("presetId") or "ace_fidelity")
    preset = resolve_preset(TASK_PRACTICE_TRACK, preset_id)
    init_noise = float(plan.get("initNoiseLevel") or preset.get("initNoiseLevel") or 0.18)
    spec = GenerationSpec.from_preset(preset, init_noise_level=init_noise)
    provider = get_audio_generation_provider()
    backing_path = job_backing_wav(job_id)
    section_targets = section_generation_targets(plan)
    render_style_l = str(render_style or "").lower()
    chamber = render_style_l in ("classical", "chamber")
    strict_guide = bool(plan.get("guideAudioConditioning", True))
    # Long chamber tunes without multi-strain sections: split at mid bar so we
    # prefer musical halves over arbitrary ~28s Stable Audio cuts.
    if (
        len(section_targets) <= 1
        and target_duration > 24.0
        and chamber
        and strict_guide
    ):
        synthetic = _synthetic_half_sections(target_duration, boundaries)
        if len(synthetic) > 1:
            section_targets = synthetic
    use_sections = len(section_targets) > 1 and target_duration > 24.0

    # AceStep cover is optional; Stable Audio is the default restyle path.
    guide_engine = str(plan.get("guideEngine") or "").strip().lower()
    if not guide_engine:
        guide_engine = "ace_step" if spec.family == "ace_step" else "stable_audio"
    use_cover = guide_engine == "ace_step" or spec.family == "ace_step"
    # Long Stable Audio one-shots OOM/timeout on Vulkan — chunk them.
    use_sa_chunks = (
        not use_cover
        and strict_guide
        and target_duration > STABLE_AUDIO_MAX_CHUNK_SEC + 1.0
        and not use_sections
    )
    guide_info: dict = {}
    chunk_assembly: dict = {}

    guide_for_ai = None
    if strict_guide:
        guide_for_ai, guide_info = _build_guide_wav(
            job_id,
            score_path,
            melody_path,
            chord_path,
            target_duration,
            bar_boundaries_sec=boundaries,
            drum_path=drum_path if plan.get("includeDrumGuide") else None,
            include_chord_layer=bool(plan.get("includeChordLayer")),
            lead_program=lead_program,
            accompaniment_program=accompaniment_program,
            render_style=render_style,
            timing_plan=plan,
        )

    if use_sections:
        # Inject synthetic sections into a shallow plan copy for assembly.
        section_plan = plan
        if section_targets and not (plan.get("timing") or {}).get("sections"):
            section_plan = dict(plan)
            timing_copy = dict(timing)
            timing_copy["sections"] = section_targets
            section_plan["timing"] = timing_copy
        elif section_targets and len(section_generation_targets(plan)) <= 1:
            section_plan = dict(plan)
            timing_copy = dict(timing)
            timing_copy["sections"] = section_targets
            section_plan["timing"] = timing_copy
        chunk_assembly = _assemble_sectional_backing(
            job_id,
            section_plan,
            provider,
            plan["backingPrompt"],
            negative_prompt,
            guide_audio_path=guide_for_ai,
            spec=spec,
            use_cover=use_cover,
            strict_guide=strict_guide,
        ) or {}
    elif use_sa_chunks:
        write_job_progress(
            job_id,
            {
                "stage": "generating",
                "progress": 20,
                "message": f"Generating in ~{int(STABLE_AUDIO_MAX_CHUNK_SEC)}s chunks (avoids timeout)",
            },
        )
        chunk_assembly = _assemble_chunked_backing(
            job_id,
            plan,
            provider,
            plan["backingPrompt"],
            negative_prompt,
            target_duration_sec=target_duration,
            guide_audio_path=guide_for_ai,
            spec=spec,
            use_cover=use_cover,
            strict_guide=strict_guide,
        ) or {}
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
            use_cover=use_cover,
            strict_guide=strict_guide,
            tempo_bpm=target_bpm,
            meter=str(timing.get("meter") or ""),
        )

    write_job_progress(job_id, {"stage": "validating", "progress": 60, "message": "Validating timing"})
    # Soften BPM stretch when guide-locked (avoid smearing pads at seams).
    soft_lock = bool(strict_guide and guide_for_ai)
    validation = _maybe_conform_backing(
        backing_path,
        target_duration,
        target_bpm,
        bar_boundaries_sec=boundaries,
        allow_stretch=True,
        bpm_drift_threshold=0.12 if soft_lock else STRETCH_BPM_DRIFT_THRESHOLD,
        duration_stretch_threshold_sec=2.0 if soft_lock else DURATION_STRETCH_THRESHOLD_SEC,
    )
    validation.update(melody_info)
    validation.update(guide_info)
    validation["guideHarmonySource"] = guide_info.get("guideHarmonySource")
    validation["guideQuality"] = guide_info.get("guideQuality")
    validation["guideSource"] = guide_info.get("guideSource")
    validation["sectional"] = use_sections
    validation["chunked"] = use_sa_chunks
    validation["chunkAssembly"] = chunk_assembly or None
    validation["syntheticSections"] = bool(
        use_sections and section_targets and len(section_generation_targets(plan)) <= 1
    )
    validation["targetDurationSec"] = target_duration
    validation["onePassDurationSec"] = float(timing["totalDurationSec"])
    validation["renderStyle"] = plan.get("renderStyle")
    validation["accompanimentMidiProgram"] = accompaniment_program
    validation["guideMode"] = plan.get("guideMode")
    validation["guideAudioConditioning"] = bool(guide_for_ai)
    validation["initNoiseLevel"] = init_noise
    validation["guideEngine"] = "ace_step" if use_cover else "stable_audio"
    validation["strictGuide"] = bool(strict_guide and guide_for_ai)
    if isinstance(provider, AudioCppProvider) and guide_for_ai and not use_cover:
        validation["guideConditioningField"] = AudioCppProvider.GUIDE_AUDIO_REQUEST_FIELDS[0]
    elif use_cover:
        validation["guideConditioningField"] = "cover_audio"
    else:
        validation["guideConditioningField"] = None
    validation["hybridFallback"] = not bool(guide_for_ai)

    # Final mix is AI arrangement only by default — MIDI FluidSynth / drum kits
    # stay in the guide path so they don't muddy the practice track.
    include_style_melody_stem = bool(plan.get("includeStyleMelodyStem", False))
    use_melody_in_mix = (
        include_style_melody_stem
        and melody_info.get("melodySource") == "fluidsynth_style_stem"
    )
    mix_drum_guide = bool(plan.get("mixDrumGuide", False))
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
        arrangement_gain_db=float(plan.get("arrangementGainDb") if plan.get("arrangementGainDb") is not None else 0.0),
        chord_path=None,
        drum_path=drum_path if mix_drum_guide else None,
        target_duration_sec=target_duration,
        duck_backing=use_melody_in_mix,
        highpass_backing=False,
    )

    fidelity = validate_practice_track_fidelity(
        output_path,
        guide_path=guide_for_ai,
        target_bpm=target_bpm,
        bar_boundaries_sec=boundaries,
        chunk_starts_sec=[
            float(c.get("startTimeSec") or 0)
            for c in (chunk_assembly.get("chunks") or [])
        ] if chunk_assembly else None,
    )
    validation["fidelity"] = fidelity
    if fidelity.get("midtrackContinuity"):
        validation["midtrackContinuity"] = fidelity["midtrackContinuity"]

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
            "drumGuide": bool(mix_drum_guide and drum_path),
            "guideWav": bool(guide_for_ai),
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
