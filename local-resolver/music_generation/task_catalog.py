"""Task and quality-preset catalog for audio generation."""

from __future__ import annotations

import os
from copy import deepcopy
from typing import Any

TASK_PRACTICE_TRACK = "practice_track"
TASK_LINKED_COVER = "linked_cover"

DEFAULT_PRESET_BY_TASK = {
    # Balanced (Medium) is the listening-quality default; Fast for quick drafts.
    TASK_PRACTICE_TRACK: "balanced",
    TASK_LINKED_COVER: "balanced",
}

# Max seconds per Stable Audio request — longer one-shots OOM/timeout on Vulkan.
STABLE_AUDIO_MAX_CHUNK_SEC = float(os.getenv("PRACTICE_TRACK_SA_MAX_CHUNK_SEC") or 28.0)

PRESET_SPECS: dict[str, dict[str, dict[str, Any]]] = {
    TASK_PRACTICE_TRACK: {
        "fast": {
            "id": "fast",
            "label": "Fast",
            "description": "Stable Audio 3 Small — quick draft while iterating guide recipes",
            "modelId": "stable-audio-3-small-music",
            "family": "stable_audio",
            "taskRoute": "gen",
            "numInferenceSteps": 8,
            "guidanceScale": 1.0,
            "initNoiseLevel": 0.35,
            "costTier": 1,
        },
        "balanced": {
            "id": "balanced",
            "label": "Balanced",
            "description": "Stable Audio 3 Medium — recommended for listening quality, auto-chunked",
            "modelId": "stable-audio-3-medium",
            "family": "stable_audio",
            "taskRoute": "gen",
            "numInferenceSteps": 8,
            "guidanceScale": 1.0,
            "initNoiseLevel": 0.35,
            "costTier": 2,
        },
        "high": {
            "id": "high",
            "label": "High",
            "description": "Stable Audio 3 Medium — more steps, auto-chunked (avoids timeouts)",
            "modelId": "stable-audio-3-medium",
            "family": "stable_audio",
            "taskRoute": "gen",
            "numInferenceSteps": 12,
            "guidanceScale": 1.0,
            "initNoiseLevel": 0.32,
            "costTier": 3,
        },
        "ace_fidelity": {
            "id": "ace_fidelity",
            "label": "AceStep cover (experimental)",
            "description": "Preserves MIDI timbre — often organ/GM on hymns; prefer Fast for style changes",
            "modelId": "ace-step-cover",
            "family": "ace_step",
            "taskRoute": "cover",
            "numInferenceSteps": 12,
            "guidanceScale": 1.0,
            "audioCoverStrength": 0.55,
            "coverNoiseStrength": 0.25,
            "loadOptions": {"ace_step.dit_model_path": "acestep-v15-turbo"},
            "sessionOptions": {"ace_step.mem_saver": "true"},
            "costTier": 3,
        },
    },
    TASK_LINKED_COVER: {
        "fast": {
            "id": "fast",
            "label": "Fast",
            "description": "AceStep turbo — quick style cover with strong source fidelity",
            "modelId": "ace-step-cover",
            "family": "ace_step",
            "taskRoute": "cover",
            "numInferenceSteps": 8,
            "guidanceScale": 1.0,
            "audioCoverStrength": 1.0,
            "coverNoiseStrength": 0.0,
            "loadOptions": {"ace_step.dit_model_path": "acestep-v15-turbo"},
            "sessionOptions": {"ace_step.mem_saver": "true"},
            "costTier": 2,
        },
        "balanced": {
            "id": "balanced",
            "label": "Balanced",
            "description": "AceStep turbo — stronger melody and structure conditioning",
            "modelId": "ace-step-cover",
            "family": "ace_step",
            "taskRoute": "cover",
            "numInferenceSteps": 12,
            "guidanceScale": 1.0,
            "audioCoverStrength": 1.0,
            "coverNoiseStrength": 0.0,
            "loadOptions": {"ace_step.dit_model_path": "acestep-v15-turbo"},
            "sessionOptions": {"ace_step.mem_saver": "true"},
            "costTier": 3,
        },
        "high": {
            "id": "high",
            "label": "High",
            "description": "AceStep base — higher quality with faithful cover conditioning",
            "modelId": "ace-step-cover",
            "family": "ace_step",
            "taskRoute": "cover",
            "numInferenceSteps": 50,
            "guidanceScale": 2.0,
            "audioCoverStrength": 1.0,
            "coverNoiseStrength": 0.0,
            "loadOptions": {"ace_step.dit_model_path": "acestep-v15-base"},
            "sessionOptions": {"ace_step.mem_saver": "true"},
            "costTier": 4,
        },
    },
}

TASK_LABELS = {
    TASK_PRACTICE_TRACK: "Practice track",
    TASK_LINKED_COVER: "Linked cover variant",
}


def list_tasks() -> list[str]:
    return [TASK_PRACTICE_TRACK, TASK_LINKED_COVER]


def resolve_preset(task_id: str, preset_id: str | None) -> dict[str, Any]:
    task = (task_id or "").strip()
    presets = PRESET_SPECS.get(task)
    if not presets:
        raise ValueError(f"Unknown taskId: {task_id}")
    key = (preset_id or "").strip() or DEFAULT_PRESET_BY_TASK.get(task, "fast")
    spec = presets.get(key)
    if not spec:
        raise ValueError(f"Unknown presetId {preset_id!r} for task {task_id!r}")
    return deepcopy(spec)


def coordination_required() -> bool:
    return os.getenv("AUDIO_GEN_COORDINATION_REQUIRED", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def preset_model_available(
    preset: dict[str, Any],
    *,
    sidecar_ok: bool,
    available_model_ids: list[str] | None = None,
) -> bool:
    if not sidecar_ok:
        return False
    if available_model_ids is None:
        return True
    model_id = str(preset.get("modelId") or "")
    return model_id in set(available_model_ids)


def ensure_preset_model_available(
    task_id: str,
    preset_id: str,
    available_model_ids: list[str] | None,
) -> None:
    """Raise ValueError when the sidecar does not expose the preset's model."""
    if not available_model_ids:
        return
    preset = resolve_preset(task_id, preset_id)
    model_id = str(preset.get("modelId") or "")
    if model_id in set(available_model_ids):
        return
    label = str(preset.get("label") or preset_id)
    raise ValueError(
        f"Preset {label} requires model {model_id}, which is not installed on the "
        "audio generation sidecar. Choose Fast or add the model to audio.cpp."
    )


def backends_payload(
    *,
    sidecar_ok: bool,
    midi_render: dict | None = None,
    available_model_ids: list[str] | None = None,
) -> dict:
    tasks = []
    for task_id in list_tasks():
        presets = []
        for preset in PRESET_SPECS[task_id].values():
            presets.append({
                "id": preset["id"],
                "label": preset["label"],
                "description": preset["description"],
                "modelId": preset["modelId"],
                "costTier": preset.get("costTier", 1),
                "available": preset_model_available(
                    preset,
                    sidecar_ok=sidecar_ok,
                    available_model_ids=available_model_ids,
                ),
                "default": preset["id"] == DEFAULT_PRESET_BY_TASK.get(task_id),
            })
        tasks.append({
            "taskId": task_id,
            "label": TASK_LABELS.get(task_id, task_id),
            "defaultPresetId": DEFAULT_PRESET_BY_TASK.get(task_id, "fast"),
            "presets": presets,
        })
    return {
        "ok": sidecar_ok,
        "coordinationRequired": coordination_required(),
        "tasks": tasks,
        "midiRender": midi_render or {},
    }
