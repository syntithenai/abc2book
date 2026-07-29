import unittest

from cast_playback import CastPlaybackManager, parse_queue_items


class CastPlaybackManagerTests(unittest.TestCase):
    def test_parse_queue_items(self):
        items = parse_queue_items({
            "queue": [
                {"source": "https://example.com/a.mp3", "title": "A"},
                {"sourceUrl": "https://example.com/b.mp3", "sourceType": "audio"},
            ],
        })
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0].source, "https://example.com/a.mp3")
        self.assertEqual(items[1].source_type, "audio")

    def test_plugin_state_empty(self):
        manager = CastPlaybackManager()
        state = manager.plugin_state()
        self.assertFalse(state["canPlay"])

    def test_status_includes_playlist_ready(self):
        from cast_transcode_session import TranscodeSettings
        session = __import__("cast_playback", fromlist=["CastSession"]).CastSession(
            session_id="test",
            source="https://example.com/a.mp3",
            settings=TranscodeSettings(),
            output_dir="/tmp",
            duration=60,
        )
        status = session.to_status()
        self.assertIn("playlistReady", status)
        self.assertFalse(status["playlistReady"])


if __name__ == "__main__":
    unittest.main()
