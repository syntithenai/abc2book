"""Cloud stem separation via fal.ai Demucs or Replicate Demucs.

Returns the same shape as stem_separation.separate_stems_to_dir:
  { paths, samplerate, duration, backend, model, stems }
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx

# Keep stem name tables here so the light gateway can import this module
# without pulling Demucs / numpy (stem_separation.py).
DEMUCS_MODEL_STEMS = {
    "htdemucs": ("drums", "bass", "other", "vocals"),
    "htdemucs_6s": ("drums", "bass", "other", "vocals", "guitar", "piano"),
}


def demucs_stems_for_model(model_name=None):
    name = model_name or os.getenv("MELODY_DEMUCS_MODEL", "htdemucs")
    return DEMUCS_MODEL_STEMS.get(name, DEMUCS_MODEL_STEMS["htdemucs"])

FAL_QUEUE_BASE = "https://queue.fal.run"
FAL_DEMUCS_PATH = "fal-ai/demucs"
REPLICATE_API = "https://api.replicate.com/v1"

# fal Demucs model enum → local stem tuple key
FAL_MODEL_STEMS = {
    "htdemucs": DEMUCS_MODEL_STEMS["htdemucs"],
    "htdemucs_ft": DEMUCS_MODEL_STEMS["htdemucs"],
    "htdemucs_6s": DEMUCS_MODEL_STEMS["htdemucs_6s"],
    "hdemucs_mmi": DEMUCS_MODEL_STEMS["htdemucs"],
    "mdx": DEMUCS_MODEL_STEMS["htdemucs"],
    "mdx_extra": DEMUCS_MODEL_STEMS["htdemucs"],
    "mdx_q": DEMUCS_MODEL_STEMS["htdemucs"],
    "mdx_extra_q": DEMUCS_MODEL_STEMS["htdemucs"],
}


def _strip(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _guess_content_type(filename: str) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".mp3"):
        return "audio/mpeg"
    if lower.endswith(".flac"):
        return "audio/flac"
    if lower.endswith(".ogg"):
        return "audio/ogg"
    if lower.endswith(".m4a"):
        return "audio/mp4"
    return "audio/wav"


def _fal_auth_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": "Key " + api_key}


def _replicate_auth_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
        "Prefer": "wait",
    }


def detect_stems_backend(provider_cfg: dict | None) -> str:
    """Return 'fal', 'replicate', or ''."""
    if not provider_cfg:
        return ""
    provider = _strip(provider_cfg.get("provider")).lower()
    api_url = _strip(provider_cfg.get("apiUrl")).lower()
    if provider == "fal" or "fal.ai" in api_url or "fal.run" in api_url:
        return "fal"
    if provider == "replicate" or "replicate.com" in api_url:
        return "replicate"
    # Custom with key: prefer fal if model looks like fal Demucs or a Demucs variant
    model = _strip(provider_cfg.get("model")).lower()
    if model.startswith("fal-ai/") or model in FAL_MODEL_STEMS or model.startswith("htdemucs"):
        return "fal"
    if "/" in model:
        return "replicate"
    return "fal" if provider_cfg.get("apiKey") else ""


async def _download_file(client: httpx.AsyncClient, url: str, dest_path: str) -> None:
    resp = await client.get(url, follow_redirects=True)
    if resp.status_code >= 400:
        raise RuntimeError(f"Failed to download stem ({resp.status_code})")
    with open(dest_path, "wb") as handle:
        handle.write(resp.content)


async def _fal_upload_audio(
    client: httpx.AsyncClient,
    api_key: str,
    audio_bytes: bytes,
    filename: str,
) -> str:
    """Upload bytes to fal storage; returns a public audio URL."""
    content_type = _guess_content_type(filename)
    # Direct upload endpoint used by fal clients
    resp = await client.post(
        "https://fal.media/files/upload",
        headers={
            **_fal_auth_headers(api_key),
            "Content-Type": content_type,
            "X-Fal-File-Name": os.path.basename(filename or "audio.wav"),
        },
        content=audio_bytes,
    )
    if resp.status_code >= 400:
        # Fallback: initiate + PUT flow
        init = await client.post(
            "https://rest.alpha.fal.ai/storage/upload/initiate",
            headers={
                **_fal_auth_headers(api_key),
                "Content-Type": "application/json",
            },
            json={
                "file_name": os.path.basename(filename or "audio.wav"),
                "content_type": content_type,
            },
        )
        if init.status_code >= 400:
            detail = (resp.text or init.text or "")[:400]
            raise RuntimeError(f"fal upload failed ({resp.status_code}/{init.status_code}): {detail}")
        payload = init.json()
        upload_url = payload.get("upload_url") or payload.get("uploadUrl")
        file_url = payload.get("file_url") or payload.get("fileUrl") or payload.get("url")
        if not upload_url or not file_url:
            raise RuntimeError("fal upload initiate missing upload_url")
        put = await client.put(
            upload_url,
            content=audio_bytes,
            headers={"Content-Type": content_type},
        )
        if put.status_code >= 400:
            raise RuntimeError(f"fal storage PUT failed ({put.status_code})")
        return str(file_url)

    payload = resp.json() if resp.content else {}
    url = payload.get("access_url") or payload.get("url") or payload.get("file_url")
    if not url:
        # Some responses return the URL as plain text
        text = (resp.text or "").strip()
        if text.startswith("http"):
            return text
        raise RuntimeError("fal upload did not return a file URL")
    return str(url)


async def _fal_separate(
    audio_bytes: bytes,
    filename: str,
    provider_cfg: dict,
    output_dir: str,
    timeout: float = 900.0,
) -> dict[str, Any]:
    api_key = _strip(provider_cfg.get("apiKey"))
    if not api_key:
        raise ValueError("Missing fal API key")
    model_name = _strip(provider_cfg.get("model")) or "htdemucs"
    # UI stores the fal endpoint id; Demucs variant is an API enum on that endpoint.
    if model_name in ("fal-ai/demucs", "fal-ai/demucs/"):
        model_name = "htdemucs_6s"
    if model_name.startswith("fal-ai/"):
        model_name = "htdemucs_6s"
    if model_name not in FAL_MODEL_STEMS:
        model_name = "htdemucs"
    allowed = list(FAL_MODEL_STEMS.get(model_name, DEMUCS_MODEL_STEMS["htdemucs"]))

    os.makedirs(output_dir, exist_ok=True)
    async with httpx.AsyncClient(timeout=timeout) as client:
        audio_url = await _fal_upload_audio(client, api_key, audio_bytes, filename)
        submit = await client.post(
            f"{FAL_QUEUE_BASE}/{FAL_DEMUCS_PATH}",
            headers={
                **_fal_auth_headers(api_key),
                "Content-Type": "application/json",
            },
            json={
                "audio_url": audio_url,
                "model": model_name,
                "output_format": "wav",
            },
        )
        if submit.status_code >= 400:
            raise RuntimeError(f"fal demucs submit failed ({submit.status_code}): {(submit.text or '')[:400]}")
        job = submit.json()
        request_id = job.get("request_id") or job.get("requestId")
        status_url = job.get("status_url") or job.get("statusUrl")
        response_url = job.get("response_url") or job.get("responseUrl")
        if not request_id and not status_url:
            # Synchronous-style response already complete
            result = job.get("response") or job
        else:
            if not status_url:
                status_url = f"{FAL_QUEUE_BASE}/{FAL_DEMUCS_PATH}/requests/{request_id}/status"
            if not response_url:
                response_url = f"{FAL_QUEUE_BASE}/{FAL_DEMUCS_PATH}/requests/{request_id}"
            deadline = time.time() + timeout
            result = None
            while time.time() < deadline:
                st = await client.get(status_url, headers=_fal_auth_headers(api_key))
                if st.status_code >= 400:
                    raise RuntimeError(f"fal status failed ({st.status_code})")
                body = st.json()
                status = _strip(body.get("status")).upper()
                if status in ("COMPLETED", "OK", "SUCCESS"):
                    resp = await client.get(response_url, headers=_fal_auth_headers(api_key))
                    if resp.status_code >= 400:
                        raise RuntimeError(f"fal result failed ({resp.status_code})")
                    result = resp.json()
                    break
                if status in ("FAILED", "ERROR", "CANCELLED"):
                    raise RuntimeError("fal demucs job failed: " + str(body.get("error") or status)[:300])
                await asyncio.sleep(2.0)
            if result is None:
                raise RuntimeError("fal demucs timed out")

    # fal returns keys like vocals, drums, bass, other (URL or {url: ...})
    payload = result.get("response") if isinstance(result.get("response"), dict) else result
    if not isinstance(payload, dict):
        raise RuntimeError("fal demucs returned unexpected payload")

    paths: dict[str, str] = {}
    duration = 0.0
    samplerate = 44100
    async with httpx.AsyncClient(timeout=timeout) as client:
        for stem in allowed:
            raw = payload.get(stem)
            url = ""
            if isinstance(raw, str):
                url = raw
            elif isinstance(raw, dict):
                url = _strip(raw.get("url") or raw.get("file_url") or raw.get("audio_url"))
            if not url:
                continue
            dest = os.path.join(output_dir, stem + ".wav")
            await _download_file(client, url, dest)
            paths[stem] = dest
            try:
                import soundfile as sf

                info = sf.info(dest)
                duration = max(duration, float(info.duration or 0))
                if info.samplerate:
                    samplerate = int(info.samplerate)
            except Exception:
                pass

    if not paths:
        raise RuntimeError("fal demucs returned no stem files")

    return {
        "paths": paths,
        "samplerate": samplerate,
        "duration": duration,
        "backend": "provider:fal",
        "model": model_name,
        "stems": list(paths.keys()),
    }


async def _replicate_upload_or_data_uri(
    client: httpx.AsyncClient,
    api_key: str,
    audio_bytes: bytes,
    filename: str,
) -> str:
    """Prefer Replicate files API; fall back to data URI for small files."""
    content_type = _guess_content_type(filename)
    # Replicate Files API (newer)
    try:
        resp = await client.post(
            f"{REPLICATE_API}/files",
            headers={"Authorization": "Bearer " + api_key},
            files={"content": (os.path.basename(filename or "audio.wav"), audio_bytes, content_type)},
        )
        if resp.status_code < 400:
            payload = resp.json()
            url = payload.get("urls", {}).get("get") or payload.get("url")
            if url:
                return str(url)
    except Exception:
        pass

    import base64

    if len(audio_bytes) > 4_000_000:
        raise RuntimeError("Audio too large for Replicate data-URI fallback; use fal.ai or a smaller clip")
    b64 = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:{content_type};base64,{b64}"


async def _replicate_separate(
    audio_bytes: bytes,
    filename: str,
    provider_cfg: dict,
    output_dir: str,
    timeout: float = 900.0,
) -> dict[str, Any]:
    api_key = _strip(provider_cfg.get("apiKey"))
    if not api_key:
        raise ValueError("Missing Replicate API token")
    model_ref = _strip(provider_cfg.get("model")) or "cjwbw/demucs"
    # Accept owner/name or owner/name:version
    version = None
    model_path = model_ref
    if ":" in model_ref and not model_ref.startswith("http"):
        model_path, version = model_ref.split(":", 1)

    os.makedirs(output_dir, exist_ok=True)
    async with httpx.AsyncClient(timeout=timeout) as client:
        audio_uri = await _replicate_upload_or_data_uri(client, api_key, audio_bytes, filename)
        create_body: dict[str, Any] = {
            "input": {
                "audio": audio_uri,
            },
        }
        if version:
            create_url = f"{REPLICATE_API}/predictions"
            create_body["version"] = version
        else:
            # Prefer model endpoint when no version pinned
            create_url = f"{REPLICATE_API}/models/{model_path}/predictions"

        create = await client.post(
            create_url,
            headers=_replicate_auth_headers(api_key),
            json=create_body,
        )
        if create.status_code >= 400 and not version:
            # Older style: require version — try cjwbw/demucs latest via models API
            raise RuntimeError(
                f"Replicate prediction failed ({create.status_code}): {(create.text or '')[:400]}"
            )
        if create.status_code >= 400:
            raise RuntimeError(
                f"Replicate prediction failed ({create.status_code}): {(create.text or '')[:400]}"
            )
        prediction = create.json()
        get_url = prediction.get("urls", {}).get("get") or (
            f"{REPLICATE_API}/predictions/{prediction.get('id')}"
        )
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = _strip(prediction.get("status")).lower()
            if status == "succeeded":
                break
            if status in ("failed", "canceled"):
                err = prediction.get("error") or status
                raise RuntimeError(f"Replicate demucs failed: {err}"[:400])
            await asyncio.sleep(2.0)
            poll = await client.get(get_url, headers={"Authorization": "Bearer " + api_key})
            if poll.status_code >= 400:
                raise RuntimeError(f"Replicate poll failed ({poll.status_code})")
            prediction = poll.json()
        else:
            raise RuntimeError("Replicate demucs timed out")

        output = prediction.get("output")
        # cjwbw/demucs often returns a dict of stem name → url, or a list
        stem_urls: dict[str, str] = {}
        if isinstance(output, dict):
            for key, val in output.items():
                name = _strip(key).lower()
                if isinstance(val, str) and val.startswith("http"):
                    stem_urls[name] = val
                elif isinstance(val, dict):
                    u = _strip(val.get("url") or val.get("file"))
                    if u:
                        stem_urls[name] = u
        elif isinstance(output, list):
            # Sometimes ordered drums,bass,other,vocals
            names = list(DEMUCS_MODEL_STEMS["htdemucs"])
            for idx, val in enumerate(output):
                if idx >= len(names):
                    break
                if isinstance(val, str) and val.startswith("http"):
                    stem_urls[names[idx]] = val

        if not stem_urls:
            raise RuntimeError("Replicate demucs returned no stem URLs")

        # Map aliases
        alias = {"voice": "vocals", "vocal": "vocals", "no_vocals": "other"}
        normalized: dict[str, str] = {}
        for name, url in stem_urls.items():
            normalized[alias.get(name, name)] = url

        allowed = list(demucs_stems_for_model("htdemucs"))
        paths: dict[str, str] = {}
        duration = 0.0
        samplerate = 44100
        for stem in allowed:
            url = normalized.get(stem)
            if not url:
                continue
            dest = os.path.join(output_dir, stem + ".wav")
            await _download_file(client, url, dest)
            paths[stem] = dest
            try:
                import soundfile as sf

                info = sf.info(dest)
                duration = max(duration, float(info.duration or 0))
                if info.samplerate:
                    samplerate = int(info.samplerate)
            except Exception:
                pass

        if not paths:
            raise RuntimeError("Replicate demucs produced no downloadable stems")

        return {
            "paths": paths,
            "samplerate": samplerate,
            "duration": duration,
            "backend": "provider:replicate",
            "model": model_ref,
            "stems": list(paths.keys()),
        }


async def separate_stems_cloud(
    audio_bytes: bytes,
    filename: str,
    provider_cfg: dict,
    output_dir: str,
    timeout: float = 900.0,
) -> dict[str, Any]:
    """Run cloud Demucs and write stem WAVs into output_dir."""
    backend = detect_stems_backend(provider_cfg)
    if backend == "replicate":
        return await _replicate_separate(audio_bytes, filename, provider_cfg, output_dir, timeout=timeout)
    if backend == "fal":
        return await _fal_separate(audio_bytes, filename, provider_cfg, output_dir, timeout=timeout)
    raise ValueError("Unsupported stems provider (use fal or replicate)")


def cloud_stems_model_name(provider_cfg: dict | None) -> str:
    if not provider_cfg:
        return "htdemucs"
    model = _strip(provider_cfg.get("model"))
    if not model:
        return "htdemucs"
    if model in ("fal-ai/demucs",) or model.startswith("fal-ai/"):
        return "htdemucs_6s"
    # Replicate model refs are not Demucs model names for cache stem lists
    if "/" in model:
        return "htdemucs"
    if model in FAL_MODEL_STEMS or model in DEMUCS_MODEL_STEMS:
        return model
    return "htdemucs"
