import json
import os
import sys
import tempfile

STEM_KEYS = ("drums", "bass", "other", "vocals")

ANALYSIS_FILTER_PRESETS = {
    "vocal": {
        "melody": {"vocals": 1.0, "drums": 0.0, "bass": 0.0, "other": 0.0},
        "chords": {"vocals": 0.15, "drums": 0.0, "bass": 1.0, "other": 1.0},
        "lyrics": {"vocals": 1.0, "drums": 0.0, "bass": 0.0, "other": 0.0},
    },
    "instrumental": {
        "melody": {"vocals": 0.0, "drums": 0.0, "bass": 0.85, "other": 1.0},
        "chords": {"vocals": 0.0, "drums": 0.0, "bass": 1.0, "other": 1.0},
        "lyrics": {"vocals": 0.0, "drums": 0.0, "bass": 0.5, "other": 1.0},
    },
}


def _weights_for_task(processing, task):
    music_type = str((processing or {}).get("musicType", "vocal")).lower()
    presets = ANALYSIS_FILTER_PRESETS.get(music_type, ANALYSIS_FILTER_PRESETS["vocal"])
    weights = dict(presets.get(task, presets["melody"]))

    custom = (processing or {}).get("analysisAudioFilters")
    if isinstance(custom, dict) and isinstance(custom.get(task), dict):
        for key in STEM_KEYS:
            if key in custom[task]:
                weights[key] = float(custom[task][key])
    return weights


def _should_apply_filters(processing):
    if not isinstance(processing, dict):
        return True
    if processing.get("applyAudioFilters") is False:
        return False
    music_type = str(processing.get("musicType", "vocal")).lower()
    return music_type in ("vocal", "instrumental")


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
            continue
        audio, file_sr = librosa.load(path, sr=sr, mono=True)
        chunk = audio * weight
        mixed = chunk if mixed is None else mixed + chunk
    if mixed is None:
        return False
    peak = float(np.max(np.abs(mixed))) if mixed.size else 0.0
    if peak > 1.0:
        mixed = mixed / peak
    sf.write(output_path, mixed, sr)
    return True


def prepare_analysis_audio_paths(wav_path, processing):
    """
    Separate once with Demucs and return per-task filtered WAV paths.
    Falls back to the original wav when separation fails.
    """
    if not _should_apply_filters(processing):
        return {
            "timing": wav_path,
            "lyrics": wav_path,
            "chords": wav_path,
            "melody": wav_path,
            "stem_dir": None,
            "filtered_paths": [],
        }

    try:
        from stem_separation import separate_stems_to_dir

        stem_dir = tempfile.mkdtemp(prefix="analysis-stems-")
        result = separate_stems_to_dir(wav_path, stem_dir)
        stem_paths = result.get("paths") or {}
        samplerate = int(result.get("samplerate") or 44100)
        filtered_paths = []
        paths = {"timing": wav_path, "stem_dir": stem_dir}

        for task in ("lyrics", "chords", "melody"):
            out_path = os.path.join(stem_dir, task + "-mix.wav")
            weights = _weights_for_task(processing, task)
            if _mix_stems(stem_paths, weights, out_path, samplerate):
                paths[task] = out_path
                filtered_paths.append(out_path)
            else:
                paths[task] = wav_path

        return {
            **paths,
            "filtered_paths": filtered_paths,
        }
    except Exception:
        return {
            "timing": wav_path,
            "lyrics": wav_path,
            "chords": wav_path,
            "melody": wav_path,
            "stem_dir": None,
            "filtered_paths": [],
        }


def cleanup_analysis_audio_paths(paths):
    if not paths:
        return
    stem_dir = paths.get("stem_dir")
    if stem_dir and os.path.isdir(stem_dir):
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
