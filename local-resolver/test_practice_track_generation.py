import os
import tempfile
import unittest
from pathlib import Path

from music_generation.mix_tracks import mix_practice_track
from music_generation.practice_track import save_job_inputs
from music_generation.providers import MockAudioGenerationProvider
from music_generation.timing_contract import validate_timing_plan
from music_generation.jobs import job_melody_wav, job_timing_plan_path


class TimingContractTests(unittest.TestCase):
    def test_validate_timing_plan(self):
        plan = validate_timing_plan({
            "title": "Test",
            "backingPrompt": "120 BPM reel backing",
            "timing": {
                "tempoBpm": 120,
                "meter": "4/4",
                "totalDurationSec": 32.0,
                "barBoundariesSec": [0, 2, 4, 32],
                "source": "abcjs",
            },
        })
        self.assertEqual(plan["timing"]["totalDurationSec"], 32.0)

    def test_mock_provider_and_mix(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            provider = MockAudioGenerationProvider()
            backing = provider.generate_backing("120 BPM reel", 2.0, output_path=tmp_path / "backing.wav")

            import numpy as np
            import soundfile as sf

            melody = np.zeros(int(44100 * 2), dtype=np.float32)
            sf.write(str(tmp_path / "melody.wav"), melody, 44100)

            out = tmp_path / "mix.wav"
            info = mix_practice_track(
                tmp_path / "melody.wav",
                backing,
                out,
                backing_gain_db=-9,
                target_duration_sec=2.0,
            )
            self.assertTrue(out.is_file())
            self.assertAlmostEqual(info["durationSec"], 2.0, places=1)

    def test_save_job_inputs_creates_cache_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PRACTICE_TRACK_CACHE_DIR"] = tmp
            job_id = "a" * 32
            save_job_inputs(job_id, {"timing": {"totalDurationSec": 1}}, b"RIFF")
            self.assertTrue(job_timing_plan_path(job_id).is_file())
            self.assertTrue(job_melody_wav(job_id).is_file())


if __name__ == "__main__":
    unittest.main()
