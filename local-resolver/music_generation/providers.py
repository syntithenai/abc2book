"""Audio generation providers for practice-track backing."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from pathlib import Path

import numpy as np
import soundfile as sf


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
    ) -> Path:
        raise NotImplementedError


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
    ) -> Path:
        duration = max(0.5, float(duration_sec))
        sr = self.sample_rate
        samples = int(round(duration * sr))
        t = np.arange(samples, dtype=np.float64) / sr

        # Soft bodhrán-like pulse + brushed noise bed
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


class AudioCppProvider(AudioGenerationProvider):
    """HTTP client for audio.cpp /v1/tasks/run (Stable Audio 3)."""

    # Spike (Phase 2c): field names tried for guide-audio conditioning, in order.
    GUIDE_AUDIO_REQUEST_FIELDS = (
        "init_audio",
        "audio",
        "conditioning_audio",
        "cover_audio",
    )

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

    def _encode_guide_audio(self, guide_audio_path: str | Path | None) -> str | None:
        if not guide_audio_path:
            return None
        path = Path(guide_audio_path)
        if not path.is_file():
            return None
        import base64

        return base64.b64encode(path.read_bytes()).decode("ascii")

    def generate_backing(
        self,
        prompt: str,
        duration_sec: float,
        negative_prompt: str = "",
        output_path: str | Path | None = None,
        guide_audio_path: str | Path | None = None,
    ) -> Path:
        duration = max(0.5, float(duration_sec))
        out = Path(output_path) if output_path else Path("/tmp/audio-cpp-backing.wav")
        out.parent.mkdir(parents=True, exist_ok=True)

        request_body: dict = {
            "text": prompt,
            "duration_seconds": duration,
            "language": "en",
        }
        options: dict = {}
        if negative_prompt:
            options["negative_prompt"] = negative_prompt

        guide_b64 = self._encode_guide_audio(guide_audio_path)
        conditioning_field: str | None = None
        if guide_b64:
            for field in self.GUIDE_AUDIO_REQUEST_FIELDS:
                request_body[field] = guide_b64
                conditioning_field = field
                break

        if options:
            request_body["options"] = options

        payload = {
            "model": self.model_id,
            "request": request_body,
        }
        try:
            result = self._request_json("POST", "/v1/tasks/run", payload)
        except RuntimeError:
            if guide_b64 and conditioning_field:
                request_body.pop(conditioning_field, None)
                payload = {"model": self.model_id, "request": request_body}
                result = self._request_json("POST", "/v1/tasks/run", payload)
            else:
                raise

        audio_path = result.get("audio_path") or result.get("output_path")
        if audio_path and Path(audio_path).is_file():
            raw = Path(audio_path).read_bytes()
            out.write_bytes(raw)
            return out

        audio_b64 = result.get("audio") or result.get("audio_base64")
        if isinstance(audio_b64, str) and audio_b64:
            import base64

            out.write_bytes(base64.b64decode(audio_b64))
            return out

        raise RuntimeError(
            "audio.cpp response missing audio output; check API version and AUDIO_CPP_URL"
        )


def get_audio_generation_provider() -> AudioGenerationProvider:
    name = (os.getenv("PRACTICE_TRACK_PROVIDER") or "mock").strip().lower()
    if name in ("audio_cpp", "audiocpp", "audio.cpp"):
        return AudioCppProvider()
    if name == "mock":
        return MockAudioGenerationProvider()
    raise ValueError(f"Unknown PRACTICE_TRACK_PROVIDER: {name}")
