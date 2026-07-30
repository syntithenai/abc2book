"""Audio generation providers for practice-track backing and linked covers."""

from __future__ import annotations

import base64
import json
import os
import shutil
import uuid
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import numpy as np
import soundfile as sf

from music_generation.resource_coordinator import touch_audio_generation_activity


def audio_cpp_shares_local_filesystem(base_url: str | None = None) -> bool:
    """True when audio.cpp can read resolver-local absolute file paths."""
    url = (base_url or os.getenv("AUDIO_CPP_URL") or "").strip().lower()
    if not url:
        return False
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    return host in {"127.0.0.1", "localhost", "::1"}


def stage_audio_path_for_audio_cpp(
    source_path: str | Path,
    *,
    base_url: str | None = None,
    prefix: str = "cover",
) -> str:
    """Copy or reference a WAV path that audio.cpp can open via its `audio` request field."""
    path = Path(source_path)
    if not path.is_file():
        raise RuntimeError("Missing source audio file for audio.cpp")

    input_dir = (os.getenv("AUDIO_CPP_INPUT_DIR") or "").strip()
    api_prefix = (os.getenv("AUDIO_CPP_INPUT_API_PATH") or input_dir or "").strip()

    if input_dir:
        dest_dir = Path(input_dir)
        dest_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{prefix}-{uuid.uuid4().hex}.wav"
        dest = dest_dir / filename
        shutil.copy2(path, dest)
        if api_prefix and api_prefix != input_dir:
            return str(Path(api_prefix) / filename)
        return str(dest.resolve())

    if audio_cpp_shares_local_filesystem(base_url):
        return str(path.resolve())

    raise RuntimeError(
        "Cover generation needs AUDIO_CPP_INPUT_DIR pointing at a directory shared with "
        "audio.cpp (set AUDIO_CPP_INPUT_API_PATH to the host path when the resolver runs "
        "in Docker and audio.cpp runs on the host)."
    )


@dataclass
class GenerationSpec:
    model_id: str
    family: str = "stable_audio"
    task_route: str = "gen"
    num_inference_steps: int = 8
    guidance_scale: float = 1.0
    negative_prompt: str = ""
    load_options: dict[str, Any] = field(default_factory=dict)
    session_options: dict[str, Any] = field(default_factory=dict)
    audio_cover_strength: float = 1.0
    cover_noise_strength: float = 0.0

    @classmethod
    def from_preset(cls, preset: dict[str, Any]) -> GenerationSpec:
        return cls(
            model_id=str(preset.get("modelId") or preset.get("model_id") or ""),
            family=str(preset.get("family") or "stable_audio"),
            task_route=str(preset.get("taskRoute") or preset.get("task_route") or "gen"),
            num_inference_steps=int(preset.get("numInferenceSteps") or 8),
            guidance_scale=float(preset.get("guidanceScale") or 1.0),
            load_options=dict(preset.get("loadOptions") or {}),
            session_options=dict(preset.get("sessionOptions") or {}),
            audio_cover_strength=float(preset.get("audioCoverStrength") or 1.0),
            cover_noise_strength=float(preset.get("coverNoiseStrength") or 0.0),
        )


class AudioGenerationProvider(ABC):
    @abstractmethod
    def health(self) -> dict:
        raise NotImplementedError

    @abstractmethod
    def generate_backing(
        self,
        prompt: str,
        duration_sec: float,
        negative_prompt: str = "",
        output_path: str | Path | None = None,
        guide_audio_path: str | Path | None = None,
        *,
        spec: GenerationSpec | None = None,
    ) -> Path:
        raise NotImplementedError

    def generate_cover(
        self,
        prompt: str,
        source_audio_path: str | Path,
        output_path: str | Path | None = None,
        *,
        spec: GenerationSpec | None = None,
        lyrics: str = "",
        language: str = "en",
        duration_sec: float | None = None,
        negative_prompt: str = "",
    ) -> Path:
        raise NotImplementedError("Cover generation not supported by this provider")


class MockAudioGenerationProvider(AudioGenerationProvider):
    """Synthetic rhythm-section bed for dev/CI without GPU."""

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    def health(self) -> dict:
        return {
            "ok": True,
            "provider": "mock",
            "message": "Synthetic backing (no audio.cpp required)",
        }

    def generate_backing(
        self,
        prompt: str,
        duration_sec: float,
        negative_prompt: str = "",
        output_path: str | Path | None = None,
        guide_audio_path: str | Path | None = None,
        *,
        spec: GenerationSpec | None = None,
    ) -> Path:
        duration = max(0.5, float(duration_sec))
        sr = self.sample_rate
        samples = int(round(duration * sr))
        t = np.arange(samples, dtype=np.float64) / sr

        bpm = 120.0
        if "bpm" in prompt.lower():
            for token in prompt.replace(",", " ").split():
                if token.lower().endswith("bpm"):
                    try:
                        bpm = float(token.lower().replace("bpm", ""))
                    except ValueError:
                        pass
        beat_period = 60.0 / max(40.0, bpm)
        phase = (t % beat_period) / beat_period
        kick = np.exp(-phase * 18.0) * 0.35
        noise = np.random.default_rng(42).normal(0, 0.04, samples)
        bed = kick + noise
        bed = bed / max(0.001, np.max(np.abs(bed))) * 0.25

        out = Path(output_path) if output_path else Path("/tmp/mock-backing.wav")
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), bed.astype(np.float32), sr)
        return out

    def generate_cover(
        self,
        prompt: str,
        source_audio_path: str | Path,
        output_path: str | Path | None = None,
        *,
        spec: GenerationSpec | None = None,
        lyrics: str = "",
        language: str = "en",
        duration_sec: float | None = None,
        negative_prompt: str = "",
    ) -> Path:
        source = Path(source_audio_path)
        audio, sr = sf.read(str(source), always_2d=False)
        if audio.ndim > 1:
            audio = np.mean(audio, axis=1)
        out = Path(output_path) if output_path else Path("/tmp/mock-cover.wav")
        out.parent.mkdir(parents=True, exist_ok=True)
        tinted = audio.astype(np.float32) * 0.85
        sf.write(str(out), tinted, sr)
        return out


class AudioCppProvider(AudioGenerationProvider):
    """HTTP client for audio.cpp /v1/tasks/run (Stable Audio 3, AceStep)."""

    GUIDE_AUDIO_REQUEST_FIELDS = ("audio",)

    def __init__(
        self,
        base_url: str | None = None,
        model_id: str | None = None,
        timeout_sec: float = 600.0,
    ):
        self.base_url = (base_url or os.getenv("AUDIO_CPP_URL") or "http://127.0.0.1:8788").rstrip("/")
        self.model_id = (
            model_id
            or os.getenv("AUDIO_CPP_MODEL_ID")
            or "stable-audio-3-small-music"
        )
        self.timeout_sec = timeout_sec

    def _resolve_spec(self, spec: GenerationSpec | None) -> GenerationSpec:
        if spec is not None:
            return spec
        return GenerationSpec(model_id=self.model_id)

    def _request_json(self, method: str, path: str, payload: dict | None = None) -> dict:
        url = self.base_url + path
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"audio.cpp HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"audio.cpp unreachable at {self.base_url}: {exc}") from exc

    def health(self) -> dict:
        for path in ("/health", "/"):
            try:
                self._request_json("GET", path)
                return {"ok": True, "provider": "audio_cpp", "url": self.base_url}
            except Exception:
                continue
        return {
            "ok": False,
            "provider": "audio_cpp",
            "url": self.base_url,
            "message": "Sidecar not reachable",
        }

    def _write_result_audio(self, result: dict, out: Path) -> Path:
        audio_path = result.get("audio_path") or result.get("output_path")
        if audio_path and Path(audio_path).is_file():
            out.write_bytes(Path(audio_path).read_bytes())
            return out

        audio_b64 = result.get("audio") or result.get("audio_base64")
        if isinstance(audio_b64, str) and audio_b64:
            out.write_bytes(base64.b64decode(audio_b64))
            return out

        raise RuntimeError(
            "audio.cpp response missing audio output; check API version and AUDIO_CPP_URL"
        )

    def _run_task(self, spec: GenerationSpec, request_body: dict) -> dict:
        touch_audio_generation_activity()
        payload: dict[str, Any] = {
            "model": spec.model_id,
            "request": request_body,
        }
        if spec.load_options:
            payload["load_options"] = spec.load_options
        if spec.session_options:
            payload["session_options"] = spec.session_options
        return self._request_json("POST", "/v1/tasks/run", payload)

    def generate_backing(
        self,
        prompt: str,
        duration_sec: float,
        negative_prompt: str = "",
        output_path: str | Path | None = None,
        guide_audio_path: str | Path | None = None,
        *,
        spec: GenerationSpec | None = None,
    ) -> Path:
        resolved = self._resolve_spec(spec)
        duration = max(0.5, float(duration_sec))
        out = Path(output_path) if output_path else Path("/tmp/audio-cpp-backing.wav")
        out.parent.mkdir(parents=True, exist_ok=True)

        request_body: dict = {
            "text": prompt,
            "duration_seconds": duration,
            "language": "en",
            "task_route": resolved.task_route,
            "num_inference_steps": resolved.num_inference_steps,
            "guidance_scale": resolved.guidance_scale,
        }
        neg = negative_prompt or resolved.negative_prompt
        options: dict = {}
        if neg:
            options["negative_prompt"] = neg

        guide_path = self._stage_guide_audio_path(guide_audio_path)
        if guide_path:
            request_body["audio"] = guide_path
            options["audio_input_kind"] = "init_audio"

        if options:
            request_body["options"] = options

        result = self._run_task(resolved, request_body)
        return self._write_result_audio(result, out)

    def _stage_guide_audio_path(self, guide_audio_path: str | Path | None) -> str | None:
        if not guide_audio_path:
            return None
        path = Path(guide_audio_path)
        if not path.is_file():
            return None
        return stage_audio_path_for_audio_cpp(path, base_url=self.base_url, prefix="guide")

    def generate_cover(
        self,
        prompt: str,
        source_audio_path: str | Path,
        output_path: str | Path | None = None,
        *,
        spec: GenerationSpec | None = None,
        lyrics: str = "",
        language: str = "en",
        duration_sec: float | None = None,
        negative_prompt: str = "",
    ) -> Path:
        resolved = self._resolve_spec(spec)
        out = Path(output_path) if output_path else Path("/tmp/audio-cpp-cover.wav")
        out.parent.mkdir(parents=True, exist_ok=True)

        staged_audio = stage_audio_path_for_audio_cpp(
            source_audio_path,
            base_url=self.base_url,
            prefix="cover",
        )

        duration = duration_sec
        if duration is None or duration <= 0:
            try:
                duration = float(sf.info(str(source_audio_path)).duration)
            except Exception:
                duration = 0.0
        duration = max(0.5, float(duration))

        options: dict[str, Any] = {
            "audio_cover_strength": resolved.audio_cover_strength,
            "cover_noise_strength": resolved.cover_noise_strength,
        }
        neg = (negative_prompt or "").strip()
        if neg:
            options["negative_prompt"] = neg

        request_body: dict = {
            "text": prompt,
            "language": language,
            "task_route": resolved.task_route or "cover",
            "audio": staged_audio,
            "duration_seconds": duration,
            "num_inference_steps": resolved.num_inference_steps,
            "guidance_scale": resolved.guidance_scale,
            "options": options,
        }
        if lyrics:
            request_body["lyrics"] = lyrics

        result = self._run_task(resolved, request_body)
        return self._write_result_audio(result, out)


def get_audio_generation_provider() -> AudioGenerationProvider:
    name = (os.getenv("PRACTICE_TRACK_PROVIDER") or "mock").strip().lower()
    if name in ("audio_cpp", "audiocpp", "audio.cpp"):
        return AudioCppProvider()
    if name == "mock":
        return MockAudioGenerationProvider()
    raise ValueError(f"Unknown PRACTICE_TRACK_PROVIDER: {name}")
