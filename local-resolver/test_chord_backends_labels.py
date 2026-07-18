"""Tests for BTC label normalization and madmom label collapse."""

from btc_chords.labels import normalize_btc_label
from madmom_chords import _normalize_madmom_label


def test_normalize_btc_label():
    assert normalize_btc_label("C") == "C:maj"
    assert normalize_btc_label("A:min") == "A:min"
    assert normalize_btc_label("N") == ""


def test_normalize_madmom_label():
    assert _normalize_madmom_label("C:maj") == "C:maj"
    assert _normalize_madmom_label("A:min") == "A:min"
    assert _normalize_madmom_label("G:sus4") == "G:maj"
    assert _normalize_madmom_label("N") == ""
