"""Tests for chord backend selection helpers (no heavy models required)."""

import detect_chords


def test_backend_chain_auto():
    assert detect_chords._backend_chain("auto") == ["btc", "madmom", "autochord"]


def test_backend_chain_explicit():
    assert detect_chords._backend_chain("btc") == ["btc"]
    assert detect_chords._backend_chain("madmom") == ["madmom"]
    assert detect_chords._backend_chain("autochord") == ["autochord"]


def test_tempo_from_beats():
    tempo = detect_chords._tempo_from_beats([0.0, 0.5, 1.0, 1.5])
    assert abs(tempo - 120.0) < 0.1
