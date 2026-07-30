import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from music_generation.linked_cover import (
    _cover_style_prompt,
    validate_linked_cover_request,
)
from music_generation.resource_coordinator import (
    AudioGenerationInProgress,
    audio_generation_exclusive,
    audio_generation_idle_status,
    check_not_blocked_by_audio_generation,
    touch_audio_generation_activity,
)
from music_generation.task_catalog import (
    TASK_LINKED_COVER,
    TASK_PRACTICE_TRACK,
    backends_payload,
    resolve_preset,
)
from music_generation.audio_normalize import is_wav_audio
from music_generation.providers import (
    audio_cpp_shares_local_filesystem,
    stage_audio_path_for_audio_cpp,
)


class TaskCatalogTests(unittest.TestCase):
    def test_resolve_practice_track_presets(self):
        fast = resolve_preset(TASK_PRACTICE_TRACK, "fast")
        self.assertEqual(fast["modelId"], "stable-audio-3-small-music")
        self.assertEqual(fast["family"], "stable_audio")

    def test_resolve_linked_cover_presets(self):
        balanced = resolve_preset(TASK_LINKED_COVER, "balanced")
        self.assertEqual(balanced["modelId"], "ace-step-cover")
        self.assertEqual(balanced["audioCoverStrength"], 1.0)
        high = resolve_preset(TASK_LINKED_COVER, "high")
        self.assertEqual(high["taskRoute"], "cover")
        self.assertLessEqual(high["guidanceScale"], 2.0)

    def test_backends_payload_includes_both_tasks(self):
        body = backends_payload(sidecar_ok=True, midi_render={"ok": True})
        task_ids = [task["taskId"] for task in body["tasks"]]
        self.assertIn(TASK_PRACTICE_TRACK, task_ids)
        self.assertIn(TASK_LINKED_COVER, task_ids)


class LinkedCoverValidationTests(unittest.TestCase):
    def test_is_wav_audio_detects_wav_header(self):
        wav_header = b"RIFF\x00\x00\x00\x00WAVEfmt "
        self.assertTrue(is_wav_audio(wav_header, "source.wav"))
        self.assertFalse(is_wav_audio(b"ID3\x03", "source.mp3"))

    def test_requires_source_and_style(self):
        with self.assertRaises(ValueError):
            validate_linked_cover_request({"stylePrompt": "jazz trio"})
        with self.assertRaises(ValueError):
            validate_linked_cover_request({"sourceUrl": "https://example.com/audio.mp3"})

    def test_valid_request(self):
        plan = validate_linked_cover_request({
            "sourceUrl": "https://example.com/audio.mp3",
            "stylePrompt": "upbeat jazz trio",
            "presetId": "balanced",
        })
        self.assertEqual(plan["presetId"], "balanced")
        self.assertEqual(plan["stylePrompt"], "upbeat jazz trio")

    def test_cover_style_prompt_adds_fidelity_prefix(self):
        wrapped = _cover_style_prompt("upbeat jazz trio")
        self.assertIn("melody", wrapped.lower())
        self.assertIn("upbeat jazz trio", wrapped)


class AudioCppStagingTests(unittest.TestCase):
    def test_audio_cpp_local_filesystem_detection(self):
        self.assertTrue(audio_cpp_shares_local_filesystem("http://127.0.0.1:8788"))
        self.assertFalse(audio_cpp_shares_local_filesystem("http://host.docker.internal:8788"))

    def test_stage_audio_uses_shared_input_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source.wav"
            source.write_bytes(b"RIFF\x00\x00\x00\x00WAVE")
            with mock.patch.dict(os.environ, {
                "AUDIO_CPP_INPUT_DIR": tmp,
                "AUDIO_CPP_INPUT_API_PATH": "/host/incoming",
            }, clear=False):
                staged = stage_audio_path_for_audio_cpp(
                    source,
                    base_url="http://host.docker.internal:8788",
                )
            self.assertTrue(staged.startswith("/host/incoming/cover-"))
            self.assertTrue((Path(tmp) / staged.split("/")[-1]).is_file())


class ResourceCoordinatorTests(unittest.IsolatedAsyncioTestCase):
    async def test_exclusive_lock_blocks_check(self):
        async with audio_generation_exclusive():
            with self.assertRaises(AudioGenerationInProgress):
                check_not_blocked_by_audio_generation()

    def test_idle_status_tracks_activity(self):
        touch_audio_generation_activity()
        status = audio_generation_idle_status()
        self.assertIsNotNone(status["lastActivityAt"])
        self.assertFalse(status["active"])


if __name__ == "__main__":
    unittest.main()
