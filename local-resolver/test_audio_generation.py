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
    ensure_preset_model_available,
    resolve_preset,
)
from music_generation.audio_normalize import is_wav_audio
from music_generation.providers import (
    GenerationSpec,
    audio_cpp_shares_local_filesystem,
    stage_audio_path_for_audio_cpp,
)


from music_generation.timing_contract import (
    effective_target_duration_sec,
    validate_timing_plan,
)


class GenerationSpecTests(unittest.TestCase):
    def test_from_preset_includes_init_noise_level(self):
        preset = resolve_preset(TASK_PRACTICE_TRACK, "fast")
        spec = GenerationSpec.from_preset(preset)
        self.assertAlmostEqual(spec.init_noise_level, 0.35)

    def test_from_preset_override_init_noise(self):
        preset = resolve_preset(TASK_PRACTICE_TRACK, "fast")
        spec = GenerationSpec.from_preset(preset, init_noise_level=0.30)
        self.assertAlmostEqual(spec.init_noise_level, 0.30)


class TimingContractTests(unittest.TestCase):
    def test_validate_timing_plan_guide_fields(self):
        plan = validate_timing_plan({
            "backingPrompt": "100 BPM trad session",
            "backingNegativePrompt": "piano",
            "timing": {
                "totalDurationSec": 32.0,
                "tempoBpm": 100,
                "barBoundariesSec": [0.0, 2.0, 4.0],
            },
            "initNoiseLevel": 0.45,
            "guideEngine": "ace_step",
        })
        self.assertAlmostEqual(plan["initNoiseLevel"], 0.45)
        self.assertEqual(plan["guideEngine"], "ace_step")
        self.assertTrue(plan["guideAudioConditioning"])

    def test_effective_target_duration_expands_aabb_repeats(self):
        plan = validate_timing_plan({
            "backingPrompt": "120 BPM reel",
            "timing": {
                "totalDurationSec": 32.0,
                "tempoBpm": 120,
                "barBoundariesSec": [0, 16, 32],
                "sections": [
                    {"strainLabel": "A", "durationSec": 16.0, "startTimeSec": 0, "endTimeSec": 16},
                    {"strainLabel": "B", "durationSec": 16.0, "startTimeSec": 16, "endTimeSec": 32},
                ],
                "repeatSchedule": [
                    {"strainLabel": "A", "playCount": 1},
                    {"strainLabel": "A", "playCount": 1},
                    {"strainLabel": "B", "playCount": 1},
                    {"strainLabel": "B", "playCount": 1},
                ],
            },
        })
        self.assertAlmostEqual(effective_target_duration_sec(plan), 64.0)

class TaskCatalogTests(unittest.TestCase):
    def test_resolve_practice_track_presets(self):
        fast = resolve_preset(TASK_PRACTICE_TRACK, "fast")
        self.assertEqual(fast["modelId"], "stable-audio-3-small-music")
        self.assertEqual(fast["family"], "stable_audio")
        self.assertAlmostEqual(fast["initNoiseLevel"], 0.35)

    def test_default_practice_track_preset_is_balanced(self):
        from music_generation.task_catalog import DEFAULT_PRESET_BY_TASK
        self.assertEqual(DEFAULT_PRESET_BY_TASK[TASK_PRACTICE_TRACK], "balanced")

    def test_resolve_ace_fidelity_preset(self):
        ace = resolve_preset(TASK_PRACTICE_TRACK, "ace_fidelity")
        self.assertEqual(ace["modelId"], "ace-step-cover")
        self.assertEqual(ace["family"], "ace_step")
        self.assertEqual(ace["taskRoute"], "cover")
        self.assertLess(ace["audioCoverStrength"], 1.0)

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

    def test_backends_payload_marks_presets_unavailable_without_model(self):
        installed = ["stable-audio-3-small-music", "ace-step-cover"]
        body = backends_payload(
            sidecar_ok=True,
            midi_render={"ok": True},
            available_model_ids=installed,
        )
        practice = next(task for task in body["tasks"] if task["taskId"] == TASK_PRACTICE_TRACK)
        by_id = {preset["id"]: preset for preset in practice["presets"]}
        self.assertTrue(by_id["fast"]["available"])
        self.assertFalse(by_id["balanced"]["available"])
        self.assertFalse(by_id["high"]["available"])

    def test_ensure_preset_model_available_rejects_missing_model(self):
        installed = ["stable-audio-3-small-music"]
        ensure_preset_model_available(TASK_PRACTICE_TRACK, "fast", installed)
        with self.assertRaises(ValueError) as ctx:
            ensure_preset_model_available(TASK_PRACTICE_TRACK, "balanced", installed)
        self.assertIn("stable-audio-3-medium", str(ctx.exception))


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
        with mock.patch(
            "gpu_prep.ensure_gpu_headroom",
            new_callable=mock.AsyncMock,
        ) as mock_prep:
            mock_prep.return_value = {"skipped": "test"}
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
