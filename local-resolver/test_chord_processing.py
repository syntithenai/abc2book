"""Unit tests for chord label collapse and post-processing."""

from chord_processing import (
    collapse_chord_label,
    estimate_key_from_chord_segments,
    post_process_chords,
    _merge_short_segments,
)


def test_collapse_colon_min_and_maj():
    assert collapse_chord_label("C:min") == "C:min"
    assert collapse_chord_label("C:maj") == "C:maj"
    assert collapse_chord_label("A") == "A:maj"
    assert collapse_chord_label("N") == ""
    assert collapse_chord_label("G:min7") == "G:min7"
    assert collapse_chord_label("D:7") == "D:7"


def test_estimate_key_from_c_g_am_segments():
    segments = [
        {"start": 0.0, "end": 2.0, "label": "C:maj"},
        {"start": 2.0, "end": 4.0, "label": "G:maj"},
        {"start": 4.0, "end": 6.0, "label": "A:min"},
        {"start": 6.0, "end": 8.0, "label": "C:maj"},
    ]
    key = estimate_key_from_chord_segments(segments)
    assert key in ("C", "Am")


def test_estimate_key_empty_when_no_chords():
    assert estimate_key_from_chord_segments([]) == ""
    assert estimate_key_from_chord_segments([{"start": 0, "end": 1, "label": "N"}]) == ""


def test_collapse_exotic_quality_to_maj_or_min():
    assert collapse_chord_label("E:sus4") == "E:maj"
    assert collapse_chord_label("F#:dim") == "F#:maj"


def test_post_process_uses_shared_beat_times():
    segments = [
        {"start": 0.0, "end": 2.0, "label": "C:maj"},
        {"start": 2.0, "end": 4.0, "label": "G:maj"},
    ]
    beat_times = [0.0, 1.0, 2.0, 3.0, 4.0]
    processed = post_process_chords(
        segments,
        key_text="",
        constrain_to_key=False,
        beat_times=beat_times,
        min_duration=0.35,
        median_window=1,
        change_penalty=False,
    )
    assert processed
    labels = [row["label"] for row in processed]
    assert "C:maj" in labels
    assert "G:maj" in labels
    assert processed[0]["start"] == 0.0


def test_key_constrain_keeps_minor_quality():
    segments = [{"start": 0.0, "end": 2.0, "label": "C#:min"}]
    processed = post_process_chords(
        segments,
        key_text="C major",
        constrain_to_key=True,
        beat_times=None,
    )
    assert len(processed) == 1
    assert processed[0]["label"].endswith(":min")


def test_key_constrain_allows_secondary_dominant():
    segments = [{"start": 0.0, "end": 2.0, "label": "G:7"}]
    processed = post_process_chords(
        segments,
        key_text="C",
        constrain_to_key=True,
        beat_times=None,
    )
    assert processed[0]["label"].startswith("G")


def test_short_merge_keeps_longer_label():
    segments = [
        {"start": 0.0, "end": 1.0, "label": "C:maj"},
        {"start": 1.0, "end": 1.1, "label": "F:maj"},
    ]
    merged = _merge_short_segments(segments, min_duration=0.35)
    assert len(merged) == 1
    assert merged[0]["label"] == "C:maj"
    assert merged[0]["end"] == 1.1


def test_half_bar_change_grid():
    segments = [
        {"start": 0.0, "end": 0.5, "label": "C:maj"},
        {"start": 0.5, "end": 1.0, "label": "G:maj"},
        {"start": 1.0, "end": 1.5, "label": "C:maj"},
        {"start": 1.5, "end": 2.0, "label": "G:maj"},
    ]
    beat_times = [0.0, 0.5, 1.0, 1.5, 2.0]
    processed = post_process_chords(
        segments,
        key_text="",
        constrain_to_key=False,
        beat_times=beat_times,
        min_duration=0.01,
        median_window=1,
        change_grid="half-bar",
        beats_per_bar=4,
        change_penalty=False,
    )
    assert processed
    assert len(processed) <= 2
