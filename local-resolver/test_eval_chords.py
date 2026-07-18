"""Tests for chord eval scoring helpers."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "scripts"))

from eval_chords import parse_lab, score_against_lab  # noqa: E402


def test_parse_example_lab():
    path = os.path.join(os.path.dirname(__file__), "test_fixtures", "chords", "example.lab")
    segments = parse_lab(path)
    assert len(segments) == 5
    assert segments[0]["label"] == "C:maj"


def test_score_perfect_match():
    segments = [
        {"start": 0.0, "end": 2.0, "label": "C:maj"},
        {"start": 2.0, "end": 4.0, "label": "G:maj"},
    ]
    scores = score_against_lab(segments, segments, sample_hz=5.0)
    assert scores["rootAccuracy"] == 1.0
    assert scores["majMinAccuracy"] == 1.0


def test_score_root_mismatch():
    reference = [{"start": 0.0, "end": 2.0, "label": "C:maj"}]
    estimated = [{"start": 0.0, "end": 2.0, "label": "G:maj"}]
    scores = score_against_lab(estimated, reference, sample_hz=5.0)
    assert scores["rootAccuracy"] == 0.0
