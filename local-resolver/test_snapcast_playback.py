import unittest
from unittest.mock import patch

from snapcast_playback import SnapcastPlaybackManager, SnapcastSession
from cast_transcode_session import TranscodeSettings


class SnapcastPlaybackManagerTests(unittest.TestCase):
    def test_create_and_delete_session(self):
        manager = SnapcastPlaybackManager()
        with patch.object(manager, '_start_ffmpeg'):
            session = manager.create_session(
                source='https://example.com/a.mp3',
                input_path='/tmp/fake.mp3',
                duration=120.0,
                settings=TranscodeSettings(),
                input_is_temp=False,
            )
        self.assertTrue(session.session_id)
        self.assertEqual(session.stream_name, 'TuneBook')
        status = session.to_status()
        self.assertEqual(status['source'], 'https://example.com/a.mp3')
        self.assertTrue(manager.delete_session(session.session_id))
        self.assertIsNone(manager.get_session(session.session_id))

    def test_plugin_state_idle_without_session(self):
        manager = SnapcastPlaybackManager()
        state = manager.plugin_state()
        self.assertFalse(state['canPlay'])
        self.assertFalse(state['isPlaying'])

    def test_seek_restarts_session(self):
        manager = SnapcastPlaybackManager()
        with patch.object(manager, 'ensure_started'), patch.object(manager, '_start_ffmpeg'):
            session = manager.create_session(
                source='https://example.com/a.mp3',
                input_path='/tmp/fake.mp3',
                duration=60.0,
                settings=TranscodeSettings(start_seconds=0),
                input_is_temp=False,
            )
        with patch.object(manager, '_start_ffmpeg'):
            updated = manager.seek_session(session.session_id, 15.0)
        self.assertIsNotNone(updated)
        self.assertEqual(updated.settings.start_seconds, 15.0)


if __name__ == '__main__':
    unittest.main()
