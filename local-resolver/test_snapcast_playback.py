import unittest
from unittest.mock import Mock, patch
import tempfile
import os
import time

from snapcast_playback import SnapcastPlaybackManager, SnapcastSession
from cast_transcode_session import TranscodeSettings, SAMPLE_RATE, CHANNELS


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


    def test_pause_and_resume_stops_ffmpeg(self):
        manager = SnapcastPlaybackManager()
        with patch.object(manager, 'ensure_started'), patch.object(manager, '_start_ffmpeg') as start_mock:
            session = manager.create_session(
                source='https://example.com/a.mp3',
                input_path='/tmp/fake.mp3',
                duration=60.0,
                settings=TranscodeSettings(start_seconds=10.0),
                input_is_temp=False,
            )
            session.current_time = 25.0
            session._proc = Mock()
            session._proc.poll.return_value = None
        with patch.object(manager, '_halt_ffmpeg') as halt_mock, patch.object(manager, '_start_ffmpeg') as resume_mock:
            self.assertTrue(manager.set_playing(session.session_id, False))
            halt_mock.assert_called_once()
            self.assertFalse(manager.get_session(session.session_id).is_playing)
            self.assertTrue(manager.set_playing(session.session_id, True))
            resume_mock.assert_called_once()
            resumed = manager.get_session(session.session_id)
            self.assertEqual(resumed.settings.start_seconds, 25.0)

    def test_writer_updates_position_from_bytes(self):
        manager = SnapcastPlaybackManager()
        fd, path = tempfile.mkstemp(suffix='.wav')
        os.close(fd)
        os.system(
            'ffmpeg -hide_banner -loglevel error -y -f lavfi -i anullsrc=r=48000:cl=stereo -t 0.2 '
            + path + ' 2>/dev/null'
        )
        with patch.object(manager._tcp_hub, 'broadcast'):
            session = manager.create_session(
                source='test',
                input_path=path,
                duration=1.0,
                settings=TranscodeSettings(),
                input_is_temp=True,
            )
            deadline = time.time() + 3.0
            while time.time() < deadline and session.bytes_written == 0:
                time.sleep(0.05)
            self.assertGreater(session.bytes_written, 0)
            bytes_per_second = SAMPLE_RATE * CHANNELS * 2
            self.assertGreater(session.current_time, 0)
            self.assertLessEqual(session.current_time, session.bytes_written / bytes_per_second + 0.05)
        manager.delete_session(session.session_id)


if __name__ == '__main__':
    unittest.main()
