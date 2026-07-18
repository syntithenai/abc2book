import json
import os
import sys
import tempfile

STEM_KEYS = ("drums", "bass", "other", "vocals", "guitar", "piano")
CORE_STEM_KEYS = ("drums", "bass", "other", "vocals")

ANALYSIS_FILTER_PRESETS = {
    "vocal": {
        "melody": {"vocals": 1.0, "drums": 0.0, "bass": 0.0, "other": 0.0},
        # Vocals off for chords — lyrical pitch distracts ACR; lyrics still use vocals.
        "chords": {"vocals": 0.0, "drums": 0.0, "bass": 1.0, "other": 1.0},
        "lyrics": {"vocals": 1.0, "drums": 0.0, "bass": 0.0, "other": 0.0},
    },
    "instrumental": {
        "melody": {"vocals": 0.0, "drums": 0.0, "bass": 0.85, "other": 1.0},
        "chords": {"vocals": 0.0, "drums": 0.0, "bass": 1.0, "other": 1.0},
        "lyrics": {"vocals": 0.0, "drums": 0.0, "bass": 0.5, "other": 1.0},
    },
    "piano": {
        "melody": {"vocals": 0.0, "drums": 0.0, "bass": 0.0, "other": 0.0, "piano": 1.0, "guitar": 0.0},
        "chords": {"vocals": 0.0, "drums": 0.0, "bass": 1.0, "other": 0.5, "piano": 1.0, "guitar": 0.0},
        "lyrics": {"vocals": 0.0, "drums": 0.0, "bass": 0.0, "other": 0.0, "piano": 1.0},
    },
}

STEM_CACHE_DIR = os.getenv("STEM_CACHE_DIR", "/tmp/stem-cache")


def resolve_demucs_model(processing=None):
    """Pick Demucs model: piano → htdemucs_6s; else processing/env default."""
    processing = processing or {}
    music_type = str(processing.get("musicType") or "vocal").lower()
    if music_type == "piano":
        return "htdemucs_6s"
    requested = str(processing.get("demucsModel") or "").strip()
    if requested in ("htdemucs", "htdemucs_6s", "htdemucs_ft"):
        return requested
    return os.getenv("MELODY_DEMUCS_MODEL", "htdemucs").strip() or "htdemucs"


def resolve_melody_voicing(processing=None):
    processing = processing or {}
    explicit = str(processing.get("melodyVoicing") or "").strip().lower()
    if explicit in ("full", "melody-line", "melody_line", "melodyline"):
        return "full" if explicit == "full" else "melody-line"
    if str(processing.get("musicType") or "").lower() == "piano":
        return "full"
    return "melody-line"


def _weights_for_task(processing, task):
    music_type = str((processing or {}).get("musicType", "vocal")).lower()
    presets = ANALYSIS_FILTER_PRESETS.get(music_type, ANALYSIS_FILTER_PRESETS["vocal"])
    weights = dict(presets.get(task, presets["melody"]))

    custom = (processing or {}).get("analysisAudioFilters")
    if isinstance(custom, dict) and isinstance(custom.get(task), dict):
        for key in STEM_KEYS:
            if key in custom[task]:
                weights[key] = float(custom[task][key])
    # Fall back piano/guitar weight into "other" when 6s stems are absent.
    if float(weights.get("piano", 0) or 0) > 0 or float(weights.get("guitar", 0) or 0) > 0:
        weights.setdefault("other", float(weights.get("other", 0) or 0))
    return weights


def _should_apply_filters(processing):
    if not isinstance(processing, dict):
        return True
    if processing.get("applyAudioFilters") is False:
        return False
    music_type = str(processing.get("musicType", "vocal")).lower()
    return music_type in ("vocal", "instrumental", "piano")


def _mix_stems(stem_paths, weights, output_path, samplerate):
    import librosa
    import numpy as np
    import soundfile as sf

    mixed = None
    sr = int(samplerate)
    for stem in STEM_KEYS:
        weight = float(weights.get(stem, 0.0) or 0.0)
        if weight <= 0.0:
            continue
        path = stem_paths.get(stem)
        if not path or not os.path.exists(path):
            # Map piano/guitar onto other when only 4-stem Demucs is available.
            if stem in ("piano", "guitar") and stem_paths.get("other") and os.path.exists(stem_paths["other"]):
                path = stem_paths["other"]
            else:
                continue
        audio, _file_sr = librosa.load(path, sr=sr, mono=True)
        chunk = audio * weight
        mixed = chunk if mixed is None else mixed + chunk
    if mixed is None:
        return False
    peak = float(np.max(np.abs(mixed))) if mixed.size else 0.0
    if peak > 1.0:
        mixed = mixed / peak
    sf.write(output_path, mixed, sr)
    return True


def _stem_paths_from_dir(stem_dir):
    paths = {}
    if not stem_dir or not os.path.isdir(stem_dir):
        return paths
    for stem in STEM_KEYS:
        candidate = os.path.join(stem_dir, stem + ".wav")
        if os.path.exists(candidate):
            paths[stem] = candidate
    return paths


def _load_stem_cache_metadata(cache_dir):
    meta_path = os.path.join(cache_dir, "metadata.json")
    if not os.path.exists(meta_path):
        return {}
    try:
        with open(meta_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _stems_are_ready(cache_dir):
    paths = _stem_paths_from_dir(cache_dir)
    return all(stem in paths for stem in CORE_STEM_KEYS)


def _resolve_stem_cache_dir(processing):
    cache_id = str((processing or {}).get("stemCacheId") or "").strip().lower()
    if not cache_id or len(cache_id) != 32:
        return None, ""
    if any(ch not in "0123456789abcdef" for ch in cache_id):
        return None, ""
    cache_dir = os.path.join(STEM_CACHE_DIR, cache_id)
    if _stems_are_ready(cache_dir):
        return cache_dir, cache_id
    return None, cache_id


def _write_stem_cache_metadata(cache_dir, result):
    meta = {
        "samplerate": int(result.get("samplerate") or 44100),
        "duration": float(result.get("duration") or 0),
        "backend": result.get("backend") or "",
        "model": result.get("model") or "",
    }
    try:
        os.makedirs(cache_dir, exist_ok=True)
        with open(os.path.join(cache_dir, "metadata.json"), "w", encoding="utf-8") as handle:
            json.dump(meta, handle)
    except Exception:
        pass


def _mix_task_paths(wav_path, stem_paths, samplerate, processing, mix_dir, stem_cache_id="", stem_model="", from_stem_cache=False, warnings=None):
    filtered_paths = []
    paths = {
        "timing": wav_path,
        "stem_dir": mix_dir,
        "stem_cache_id": stem_cache_id or "",
        "from_stem_cache": bool(from_stem_cache),
        "stem_model": stem_model or "",
        "warnings": list(warnings or []),
    }
    for task in ("lyrics", "chords", "melody"):
        out_path = os.path.join(mix_dir, task + "-mix.wav")
        weights = _weights_for_task(processing, task)
        if _mix_stems(stem_paths, weights, out_path, samplerate):
            paths[task] = out_path
            filtered_paths.append(out_path)
        else:
            paths[task] = wav_path
    paths["filtered_paths"] = filtered_paths
    return paths


def prepare_analysis_audio_paths(wav_path, processing):
    """
    Separate once with Demucs (or reuse STEM_CACHE) and return per-task filtered WAV paths.
    Falls back to the original wav when separation fails.
    """
    warnings = []
    demucs_model = resolve_demucs_model(processing)

    if not _should_apply_filters(processing):
        warnings.append("filters_disabled")
        return {
            "timing": wav_path,
            "lyrics": wav_path,
            "chords": wav_path,
            "melody": wav_path,
            "stem_dir": None,
            "filtered_paths": [],
            "stem_cache_id": "",
            "from_stem_cache": False,
            "stem_model": demucs_model,
            "warnings": warnings,
        }

    require_precreated = bool((processing or {}).get("requirePrecreatedStems"))
    cached_dir, requested_id = _resolve_stem_cache_dir(processing)

    if require_precreated and not cached_dir:
        return {
            "timing": wav_path,
            "lyrics": wav_path,
            "chords": wav_path,
            "melody": wav_path,
            "stem_dir": None,
            "filtered_paths": [],
            "stem_cache_id": requested_id or "",
            "from_stem_cache": False,
            "stem_model": demucs_model,
            "warnings": warnings + ["precreated_stems_missing"],
            "error": "precreated stems required but stemCacheId missing or incomplete",
        }

    mix_dir = tempfile.mkdtemp(prefix="analysis-mixes-")

    try:
        if cached_dir:
            meta = _load_stem_cache_metadata(cached_dir)
            cached_model = str(meta.get("model") or "").strip()
            needs_piano = demucs_model == "htdemucs_6s"
            has_piano = bool(_stem_paths_from_dir(cached_dir).get("piano"))
            if cached_model and cached_model != demucs_model and needs_piano and not has_piano:
                warnings.append("stem_model_mismatch")
                cached_dir = None
            elif cached_model and cached_model != demucs_model:
                warnings.append("stem_model_mismatch_using_cache")

        if cached_dir:
            stem_paths = _stem_paths_from_dir(cached_dir)
            meta = _load_stem_cache_metadata(cached_dir)
            samplerate = int(meta.get("samplerate") or 44100)
            return _mix_task_paths(
                wav_path,
                stem_paths,
                samplerate,
                processing,
                mix_dir,
                stem_cache_id=requested_id or os.path.basename(cached_dir),
                stem_model=str(meta.get("model") or demucs_model),
                from_stem_cache=True,
                warnings=warnings,
            )

        if not requested_id:
            warnings.append("stems_separated_inline")

        from stem_separation import separate_stems_to_dir

        cache_id = requested_id
        if cache_id:
            stem_dir = os.path.join(STEM_CACHE_DIR, cache_id)
            os.makedirs(stem_dir, exist_ok=True)
        else:
            try:
                os.makedirs(STEM_CACHE_DIR, exist_ok=True)
            except Exception:
                pass
            stem_dir = tempfile.mkdtemp(
                prefix="analysis-stems-",
                dir=STEM_CACHE_DIR if os.path.isdir(STEM_CACHE_DIR) else None,
            )

        # Temporarily pin env so nested helpers see the same model.
        previous = os.environ.get("MELODY_DEMUCS_MODEL")
        os.environ["MELODY_DEMUCS_MODEL"] = demucs_model
        try:
            result = separate_stems_to_dir(wav_path, stem_dir, model_name=demucs_model)
        finally:
            if previous is None:
                os.environ.pop("MELODY_DEMUCS_MODEL", None)
            else:
                os.environ["MELODY_DEMUCS_MODEL"] = previous

        stem_paths = result.get("paths") or _stem_paths_from_dir(stem_dir)
        samplerate = int(result.get("samplerate") or 44100)
        _write_stem_cache_metadata(stem_dir, result)
        resolved_id = cache_id or os.path.basename(stem_dir.rstrip(os.sep))
        paths = _mix_task_paths(
            wav_path,
            stem_paths,
            samplerate,
            processing,
            mix_dir,
            stem_cache_id=resolved_id if len(resolved_id) == 32 else "",
            stem_model=str(result.get("model") or demucs_model),
            from_stem_cache=False,
            warnings=warnings,
        )
        paths["stem_source_dir"] = stem_dir
        return paths
    except Exception as exc:
        try:
            cleanup_analysis_audio_paths({"stem_dir": mix_dir})
        except Exception:
            pass
        return {
            "timing": wav_path,
            "lyrics": wav_path,
            "chords": wav_path,
            "melody": wav_path,
            "stem_dir": None,
            "filtered_paths": [],
            "stem_cache_id": requested_id or "",
            "from_stem_cache": False,
            "stem_model": demucs_model,
            "warnings": warnings + ["stem_separation_failed"],
            "error": str(exc),
        }


def cleanup_analysis_audio_paths(paths):
    """Remove temporary mix WAVs only — never delete STEM_CACHE stem wavs."""
    if not paths:
        return
    stem_dir = paths.get("stem_dir")
    if not stem_dir or not os.path.isdir(stem_dir):
        return
    # Do not delete directories that look like STEM_CACHE entries (contain drums.wav etc.).
    if _stems_are_ready(stem_dir):
        return
    for name in os.listdir(stem_dir):
        try:
            os.unlink(os.path.join(stem_dir, name))
        except FileNotFoundError:
            pass
    try:
        os.rmdir(stem_dir)
    except OSError:
        pass


def main():
    """CLI entry point: runs in the autochord venv (librosa + demucs available).

    Usage: audio_analysis_filters.py <wav_path> [processing_json]
    Prints the per-task filtered WAV paths as JSON on stdout.
    """
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing wav_path"}))
        return 1

    wav_path = sys.argv[1]
    processing = {}
    if len(sys.argv) > 2 and sys.argv[2]:
        try:
            parsed = json.loads(sys.argv[2])
            if isinstance(parsed, dict):
                processing = parsed
        except Exception:
            processing = {}

    result = prepare_analysis_audio_paths(wav_path, processing)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
