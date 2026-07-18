"""Melody backend routing without running heavy models."""

from detect_melody import _resolve_backend


def test_auto_routes_piano_to_kong():
    assert _resolve_backend({"melodyBackend": "auto", "musicType": "piano"}) == "kong-auto"


def test_auto_routes_band_to_mt3():
    assert _resolve_backend({"melodyBackend": "auto", "musicType": "band"}) == "mt3-auto"


def test_explicit_kong_and_basic_pitch():
    assert _resolve_backend({"melodyBackend": "kong"}) == "kong"
    assert _resolve_backend({"melodyBackend": "basic-pitch"}) == "basic-pitch"
    assert _resolve_backend({"melodyBackend": "auto", "musicType": "vocal"}) == "auto"
