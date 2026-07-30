import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from cast_playback import CastQueueItem
from cast_transcode_session import TranscodeSettings
from snapcast_playback import get_snapcast_manager
from snapcast_routes import register_snapcast_routes


class SnapcastRoutesTests(unittest.TestCase):
    def setUp(self):
        manager = get_snapcast_manager()
        manager._sessions.clear()
        manager._active_session_id = None
        self.app = FastAPI()

        async def noop_auth(_authorization):
            return None

        def cors_headers(_origin):
            return {}

        async def resolve_audio(**_kwargs):
            return b"audio", "track.mp3", None

        register_snapcast_routes(
            self.app,
            maybe_require_auth=noop_auth,
            cors_headers=cors_headers,
            resolve_linked_media_audio_bytes=resolve_audio,
            resolve_ytdlp_proxy_from_request=lambda _request: None,
            snapcast_server_host="snapserver",
        )
        self.client = TestClient(self.app)
        self.feature_patch = mock.patch("snapcast_routes.snapcast_feature_enabled", return_value=True)
        self.feature_patch.start()

    def tearDown(self):
        self.feature_patch.stop()

    def test_plugin_pause_stops_playback_flag(self):
        manager = get_snapcast_manager()
        with mock.patch.object(manager, "_start_ffmpeg"):
            session = manager.create_session(
                source="https://example.com/a.mp3",
                input_path="/tmp/fake.mp3",
                duration=30.0,
                settings=TranscodeSettings(),
                input_is_temp=False,
            )
        session._proc = mock.Mock()
        session._proc.poll.return_value = None
        session.is_playing = True
        response = self.client.post("/snapcast-playback/plugin", json={"action": "pause"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json().get("ok"))
        self.assertFalse(manager.get_session(session.session_id).is_playing)

    def test_plugin_next_advances_queue(self):
        manager = get_snapcast_manager()
        queue = [
            CastQueueItem(source="https://example.com/a.mp3", source_type="audio", duration=30.0),
            CastQueueItem(source="https://example.com/b.mp3", source_type="audio", duration=40.0),
        ]
        with mock.patch.object(manager, "_start_ffmpeg"):
            session = manager.create_session(
                source="https://example.com/a.mp3",
                input_path="/tmp/fake.mp3",
                duration=30.0,
                settings=TranscodeSettings(),
                input_is_temp=False,
                queue=queue,
            )
        advanced = mock.Mock()
        advanced.to_status.return_value = {"sessionId": session.session_id, "queueIndex": 1}
        with mock.patch(
            "snapcast_routes.advance_snapcast_session_queue",
            new=mock.AsyncMock(return_value=advanced),
        ):
            response = self.client.post("/snapcast-playback/plugin", json={"action": "next"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("ok"))
        self.assertIn("status", body)

    def test_prefetch_warms_cache_for_queue_items(self):
        manager = get_snapcast_manager()
        queue = [
            CastQueueItem(source="https://example.com/a.mp3", source_type="audio", duration=30.0),
            CastQueueItem(source="https://example.com/b.mp3", source_type="audio", duration=40.0),
            CastQueueItem(source="https://example.com/c.mp3", source_type="audio", duration=50.0),
        ]
        with mock.patch.object(manager, "_start_ffmpeg"):
            session = manager.create_session(
                source="https://example.com/a.mp3",
                input_path="/tmp/fake.mp3",
                duration=30.0,
                settings=TranscodeSettings(),
                input_is_temp=False,
                queue=queue,
            )
        resolve_mock = mock.AsyncMock(return_value=("/tmp/cached.mp3", "b.mp3", False))
        with mock.patch("snapcast_routes.resolve_session_input_path", new=resolve_mock):
            response = self.client.post(
                f"/snapcast-playback/session/{session.session_id}/prefetch",
                json={"count": 2},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("prefetched"), 2)
        self.assertEqual(resolve_mock.await_count, 2)


if __name__ == "__main__":
    unittest.main()
