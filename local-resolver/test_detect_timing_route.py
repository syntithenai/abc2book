"""Unit tests for detect-timing empty response shape (matches server.empty_timing_response)."""


def empty_timing_response():
    return {
        "beatTimes": [],
        "downbeatTimes": [],
        "tempo": 0,
        "meter": "",
        "beatsPerBar": 0,
        "meterChanges": [],
        "detectedKey": "",
        "detectedMeter": "",
        "duration": 0,
        "backend": "none",
    }


def test_empty_timing_response_shape():
    body = empty_timing_response()
    assert body["tempo"] == 0
    assert body["backend"] == "none"
    assert body["detectedKey"] == ""
    assert isinstance(body["beatTimes"], list)
    assert isinstance(body["meterChanges"], list)
