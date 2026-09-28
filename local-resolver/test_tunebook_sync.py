import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

import tunebook_sync
from tunebook_sync import compact_tunebook, register_tunebook_sync_routes


async def _no_auth(_authorization):
    return None


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("TUNEBOOK_SYNC_PATH", str(tmp_path / "tunebook_sync.json"))
    app = FastAPI()
    register_tunebook_sync_routes(app, maybe_require_auth=_no_auth, cors_headers=lambda origin: {})
    return TestClient(app)


def test_compact_tunebook_keeps_playable_fields():
    tunes = compact_tunebook({
        "b": {"id": "b", "name": "Zebra", "books": ["EuroSession"], "tags": "a, b",
              "links": [{"link": "data:audio/mp3;base64,xx"}, {"link": "https://youtu.be/x", "title": "t", "extra": 1}],
              "voices": {"1": {"notes": ["abc"]}}},
        "a": {"id": "a", "name": "alpha", "artists": ["Someone"]},
        "bad": {"name": "no id"},
    })
    assert [t["name"] for t in tunes] == ["alpha", "Zebra"]
    zebra = tunes[1]
    assert zebra["books"] == ["eurosession"]
    assert zebra["tags"] == ["a", "b"]
    assert zebra["links"] == [{"link": "https://youtu.be/x", "title": "t"}]
    assert tunes[0]["composer"] == "Someone"


def test_post_then_get(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    assert client.get("/snapcast-playback/tunebook").status_code == 404
    res = client.post("/snapcast-playback/tunebook", json={"source": "test", "tunes": [
        {"id": "1", "name": "Blackbird", "books": ["songs"], "tags": ["Charlotte Setlist"],
         "links": [{"link": "https://youtu.be/a"}]},
    ]})
    assert res.status_code == 200
    assert res.json()["tags"] == {"charlotte setlist": 1}
    assert os.path.isfile(tmp_path / "tunebook_sync.json")

    summary = client.get("/snapcast-playback/tunebook?summary=1").json()
    assert summary["count"] == 1 and "tunes" not in summary and summary["books"] == {"songs": 1}
    full = client.get("/snapcast-playback/tunebook").json()
    assert full["tunes"][0]["name"] == "Blackbird"


def test_post_requires_tunes(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    assert client.post("/snapcast-playback/tunebook", json={}).status_code == 400
