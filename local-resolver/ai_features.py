"""Central kill switch for every model/ML-backed Tunebook feature.

Set AI_FEATURES_ENABLED=false to disable LLM, speech, vision, audio-ML and
generative-audio features. Deterministic helpers (MusicBrainz/Wikipedia lookups,
MIDI/score conversion, browser DSP, local parsing) are unaffected.
"""

import os


def _env_flag(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() not in {"0", "false", "no", "off"}


# Default true so existing deployments/tests keep their behaviour; shipped
# deployments set AI_FEATURES_ENABLED=false explicitly.
AI_FEATURES_ENABLED = _env_flag("AI_FEATURES_ENABLED", "true")

# Feature names accepted by require_resolver_feature() and advertised in /health.
AI_FEATURES = frozenset(
    {
        "llm",
        "whisper",
        "ocr",
        "stems",
        "tts",
        "sheetImage",
        "sheetImageOcr",
        "sheetImageOmr",
        "sheetImageSplit",
        "practiceAnalysis",
        "practiceTrack",
    }
)


def ai_enabled() -> bool:
    return bool(AI_FEATURES_ENABLED)


def ai_gate(value) -> bool:
    """Return value only when the central AI switch is on."""
    return bool(AI_FEATURES_ENABLED and value)
