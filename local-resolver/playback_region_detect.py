import asyncio
import os
import re
import wave

import numpy as np

INTRO_SCAN_SECONDS = 300
OUTRO_SCAN_SECONDS = 180
INTRO_CLUSTER_GAP_SECONDS = 4.0
SPEECH_BOUNDARY_GAP_SECONDS = 2.5
BOUNDARY_PADDING_SECONDS = 0.3
INTRO_MAX_SPEECH_SECONDS = 120.0
OUTRO_ZONE_SECONDS = 150.0
ENERGY_WINDOW_SECONDS = 1.0
ENERGY_LOOKAHEAD_SECONDS = 12.0
ENERGY_RISE_RATIO = 1.8
ENERGY_BASELINE_SECONDS = 3.0

PLAYBACK_SCAN_WHISPER_OPTIONS = {
    "whisperPrompt": (
        "Spoken introduction and outro commentary before and after music. "
        "YouTube host talking about the tune."
    ),
    "whisperLanguage": "en",
    "whisperBestOf": 1,
    "whisperBeamSize": 1,
}


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _round_time(seconds):
    return round(max(0.0, seconds), 1)


def _clean_segment_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _usable_segments(segments):
    rows = []
    for segment in segments or []:
        text = _clean_segment_text(segment.get("text", ""))
        if not text:
            continue
        start = _safe_float(segment.get("start", 0.0))
        end = _safe_float(segment.get("end", start))
        if end < start:
            end = start
        rows.append({
            "start": start,
            "end": end,
            "text": text,
        })
    rows.sort(key=lambda row: row["start"])
    return rows


def _build_runs(segments, max_gap):
    if not segments:
        return []
    runs = [[segments[0]]]
    for segment in segments[1:]:
        previous = runs[-1][-1]
        gap = segment["start"] - previous["end"]
        if gap <= max_gap:
            runs[-1].append(segment)
        else:
            runs.append([segment])
    return runs


def _gap_after_run(run, segments):
    if not run:
        return None
    last_end = run[-1]["end"]
    for segment in segments:
        if segment["start"] >= last_end - 0.05:
            gap = segment["start"] - last_end
            if gap > 0.05:
                return gap
    return None


def _read_wav_mono(path):
    with wave.open(path, "rb") as handle:
        sample_rate = handle.getframerate()
        sample_width = handle.getsampwidth()
        channels = handle.getnchannels()
        frame_count = handle.getnframes()
        raw = handle.readframes(frame_count)
    if sample_width == 2:
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    elif sample_width == 1:
        samples = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise ValueError("Unsupported WAV sample width: " + str(sample_width))
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, sample_rate


def _rms_energy(samples, sample_rate, start_seconds, end_seconds):
    if sample_rate <= 0 or len(samples) == 0:
        return 0.0
    start_index = max(0, int(start_seconds * sample_rate))
    end_index = min(len(samples), int(end_seconds * sample_rate))
    if end_index <= start_index:
        return 0.0
    chunk = samples[start_index:end_index]
    if chunk.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(chunk))))


def find_energy_rise_after(samples, sample_rate, after_seconds):
    if sample_rate <= 0 or len(samples) == 0:
        return False
    baseline_start = max(0.0, after_seconds - ENERGY_BASELINE_SECONDS)
    baseline_end = max(baseline_start, after_seconds - 0.2)
    baseline = _rms_energy(samples, sample_rate, baseline_start, baseline_end)
    if baseline <= 1e-5:
        baseline = _rms_energy(samples, sample_rate, 0.0, min(3.0, after_seconds))
    if baseline <= 1e-5:
        return False

    window = ENERGY_WINDOW_SECONDS
    lookahead = ENERGY_LOOKAHEAD_SECONDS
    steps = max(1, int(lookahead / window))
    for step in range(steps):
        window_start = after_seconds + (step * window)
        window_end = window_start + window
        current = _rms_energy(samples, sample_rate, window_start, window_end)
        if current >= baseline * ENERGY_RISE_RATIO:
            return True
    return False


def detect_start_from_intro_segments(segments, samples=None, sample_rate=16000):
    usable = _usable_segments(segments)
    if not usable:
        return 0.0, 0.0, "none"

    intro_segments = [
        segment for segment in usable
        if segment["start"] <= INTRO_SCAN_SECONDS
    ]
    if not intro_segments:
        return 0.0, 0.0, "none"

    runs = _build_runs(intro_segments, INTRO_CLUSTER_GAP_SECONDS)
    intro_run = []
    if runs and runs[0] and runs[0][0]["start"] <= 30.0:
        intro_run = runs[0]

    if not intro_run:
        return 0.0, 0.0, "none"

    last_intro_end = intro_run[-1]["end"]
    gap = _gap_after_run(intro_run, intro_segments)
    has_boundary_gap = gap is not None and gap >= SPEECH_BOUNDARY_GAP_SECONDS
    has_energy_rise = False
    if samples is not None and sample_rate > 0:
        has_energy_rise = find_energy_rise_after(samples, sample_rate, last_intro_end)

    if not has_boundary_gap and not has_energy_rise:
        return 0.0, 0.0, "none"

    confidence = 0.55
    method = "gap"
    if has_boundary_gap:
        confidence += 0.2
    if has_energy_rise:
        confidence += 0.15
        method = "gap+energy" if has_boundary_gap else "energy"

    start_at = _round_time(last_intro_end + BOUNDARY_PADDING_SECONDS)
    return start_at, min(0.95, confidence), method


def detect_end_from_outro_segments(segments, duration, tail_offset_seconds):
    usable = _usable_segments(segments)
    if not usable or duration <= 0:
        return 0.0, 0.0, "none"

    absolute_segments = [
        {
            "start": tail_offset_seconds + segment["start"],
            "end": tail_offset_seconds + segment["end"],
            "text": segment["text"],
        }
        for segment in usable
    ]
    absolute_segments.sort(key=lambda row: row["start"])

    outro_zone_start = max(0.0, duration - OUTRO_ZONE_SECONDS)
    tail_segments = [
        segment for segment in absolute_segments
        if segment["end"] >= outro_zone_start
    ]
    if not tail_segments:
        return 0.0, 0.0, "none"

    runs = _build_runs(tail_segments, INTRO_CLUSTER_GAP_SECONDS)
    if not runs:
        return 0.0, 0.0, "none"

    outro_run = runs[-1]
    if not outro_run:
        return 0.0, 0.0, "none"

    prior_segments = [
        segment for segment in absolute_segments
        if segment["end"] < outro_run[0]["start"] - 0.05
    ]
    gap = None
    if prior_segments:
        gap = outro_run[0]["start"] - prior_segments[-1]["end"]
        if gap < SPEECH_BOUNDARY_GAP_SECONDS:
            return 0.0, 0.0, "none"
    elif outro_run[0]["start"] < outro_zone_start or outro_run[-1]["end"] < duration - 30.0:
        return 0.0, 0.0, "none"

    end_at = _round_time(outro_run[0]["start"] - BOUNDARY_PADDING_SECONDS)
    if end_at <= 0 or end_at >= duration:
        return 0.0, 0.0, "none"

    confidence = min(0.9, 0.6 + min(0.25, (gap or 3.0) / 10.0))
    return end_at, confidence, "gap"


def detect_playback_region(intro_segments, outro_segments, duration, tail_offset_seconds, samples=None, sample_rate=16000):
    start_at, start_confidence, start_method = detect_start_from_intro_segments(
        intro_segments,
        samples=samples,
        sample_rate=sample_rate,
    )
    end_at, end_confidence, end_method = detect_end_from_outro_segments(
        outro_segments,
        duration,
        tail_offset_seconds,
    )

    confidence = 0.0
    if start_at > 0:
        confidence = max(confidence, start_confidence)
    if end_at > 0:
        confidence = max(confidence, end_confidence)

    methods = []
    if start_at > 0:
        methods.append("start:" + start_method)
    if end_at > 0:
        methods.append("end:" + end_method)
    method = "+".join(methods) if methods else "none"

    return {
        "startAt": start_at,
        "endAt": end_at,
        "duration": _round_time(duration),
        "confidence": round(confidence, 2),
        "method": method,
    }


async def _emit_progress(on_progress, stage, message, progress):
    if callable(on_progress):
        await on_progress(stage, message, progress)


async def probe_audio_duration_seconds(path):
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _stderr = await proc.communicate()
    if proc.returncode != 0:
        return 0.0
    try:
        return max(0.0, float(stdout.decode("utf-8", errors="ignore").strip()))
    except Exception:
        return 0.0


async def trim_audio_to_wav(input_wav_path, output_wav_path, start_seconds=0.0, duration_seconds=None):
    cmd = [
        "ffmpeg",
        "-y",
    ]
    if start_seconds > 0:
        cmd.extend(["-ss", str(start_seconds)])
    cmd.extend(["-i", input_wav_path])
    if duration_seconds is not None and duration_seconds > 0:
        cmd.extend(["-t", str(duration_seconds)])
    cmd.extend([
        "-ar",
        "16000",
        "-ac",
        "1",
        output_wav_path,
    ])
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await proc.communicate()
    if proc.returncode != 0 or not os.path.exists(output_wav_path):
        detail = stderr.decode("utf-8", errors="ignore").strip()[:500]
        raise RuntimeError(detail or "Audio trim failed")


async def detect_playback_region_from_wav(
    wav_path,
    request,
    transcribe_fn,
    on_progress=None,
):
    await _emit_progress(on_progress, "convert", "Analyzing audio duration...", 0.15)
    duration = await probe_audio_duration_seconds(wav_path)
    if duration <= 0:
        samples, sample_rate = _read_wav_mono(wav_path)
        duration = len(samples) / float(sample_rate or 16000)

    samples = None
    sample_rate = 16000
    try:
        samples, sample_rate = _read_wav_mono(wav_path)
    except Exception:
        samples = None

    intro_wav_path = wav_path + ".intro.wav"
    outro_wav_path = wav_path + ".outro.wav"
    tail_offset = max(0.0, duration - OUTRO_SCAN_SECONDS)

    try:
        await _emit_progress(on_progress, "transcribe_intro", "Transcribing intro...", 0.2)
        await trim_audio_to_wav(
            wav_path,
            intro_wav_path,
            start_seconds=0.0,
            duration_seconds=min(duration, INTRO_SCAN_SECONDS),
        )
        intro_transcription = await transcribe_fn(intro_wav_path, request)
        intro_segments = intro_transcription.get("segments") or []

        await _emit_progress(on_progress, "transcribe_outro", "Transcribing outro...", 0.55)
        await trim_audio_to_wav(
            wav_path,
            outro_wav_path,
            start_seconds=tail_offset,
            duration_seconds=min(OUTRO_SCAN_SECONDS, duration),
        )
        outro_transcription = await transcribe_fn(outro_wav_path, request)
        outro_segments = outro_transcription.get("segments") or []

        await _emit_progress(on_progress, "analyze", "Detecting playback boundaries...", 0.9)
        result = detect_playback_region(
            intro_segments,
            outro_segments,
            duration,
            tail_offset,
            samples=samples,
            sample_rate=sample_rate,
        )
        result["backend"] = intro_transcription.get("backend") or outro_transcription.get("backend") or ""
        await _emit_progress(on_progress, "done", "Scan complete", 1.0)
        return result
    finally:
        for path in (intro_wav_path, outro_wav_path):
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass
            json_path = path + ".json"
            try:
                os.unlink(json_path)
            except FileNotFoundError:
                pass
