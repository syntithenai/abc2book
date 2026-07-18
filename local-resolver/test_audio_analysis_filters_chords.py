"""Chord analysis uses harmonic Demucs mixes (bass + other)."""

from audio_analysis_filters import (
    ANALYSIS_FILTER_PRESETS,
    _weights_for_task,
    resolve_demucs_model,
    resolve_melody_voicing,
)


def test_vocal_chord_mix_drops_drums_and_vocals():
    weights = _weights_for_task({"musicType": "vocal"}, "chords")
    assert weights["drums"] == 0.0
    assert weights["bass"] == 1.0
    assert weights["other"] == 1.0
    assert weights["vocals"] == 0.0


def test_instrumental_chord_mix_excludes_vocals():
    weights = _weights_for_task({"musicType": "instrumental"}, "chords")
    assert weights["vocals"] == 0.0
    assert weights["bass"] == 1.0
    assert weights["other"] == 1.0


def test_piano_preset_prefers_piano_stem():
    weights = _weights_for_task({"musicType": "piano"}, "melody")
    assert weights.get("piano", 0) == 1.0
    assert weights.get("vocals", 0) == 0.0


def test_resolve_demucs_model_piano_forces_6s():
    assert resolve_demucs_model({"musicType": "piano"}) == "htdemucs_6s"
    assert resolve_demucs_model({"musicType": "vocal", "demucsModel": "htdemucs"}) == "htdemucs"


def test_resolve_melody_voicing_defaults():
    assert resolve_melody_voicing({"musicType": "piano"}) == "full"
    assert resolve_melody_voicing({"musicType": "vocal"}) == "melody-line"
    assert resolve_melody_voicing({"musicType": "piano", "melodyVoicing": "melody-line"}) == "melody-line"


def test_presets_cover_all_tasks():
    for music_type, presets in ANALYSIS_FILTER_PRESETS.items():
        for task in ("melody", "chords", "lyrics"):
            assert task in presets


def test_stem_cache_id_rejected_when_missing():
    from audio_analysis_filters import _resolve_stem_cache_dir

    cache_dir, cache_id = _resolve_stem_cache_dir({"stemCacheId": "not-a-real-id"})
    assert cache_dir is None
