import os
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from music_generation.mix_tracks import (
    fit_audio_to_duration,
    mix_practice_track,
    tile_backing_loop,
)
from music_generation.practice_track import save_job_inputs
from music_generation.providers import MockAudioGenerationProvider
from music_generation.timing_contract import loop_duration_sec, validate_timing_plan
from music_generation.jobs import job_chords_wav, job_melody_wav, job_timing_plan_path


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
                "sections": [{
                    "strainLabel": "A",
                    "durationSec": 16.0,
                    "startTimeSec": 0,
                    "endTimeSec": 16,
                }],
                "repeatSchedule": [{"strainLabel": "A", "playCount": 2}],
            },
        })
        self.assertEqual(plan["timing"]["totalDurationSec"], 32.0)
        self.assertEqual(plan["backingGainDb"], -16.0)
        self.assertEqual(len(plan["timing"]["sections"]), 1)

    def test_loop_duration_sec(self):
        plan = validate_timing_plan({
            "backingPrompt": "percussion",
            "timing": {
                "tempoBpm": 120,
                "meter": "4/4",
                "totalDurationSec": 64.0,
                "barBoundariesSec": [float(i * 2) for i in range(33)],
            },
        })
        self.assertEqual(loop_duration_sec(plan), 32.0)

    def test_mock_provider_and_mix(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            provider = MockAudioGenerationProvider()
            backing = provider.generate_backing("120 BPM reel", 2.0, output_path=tmp_path / "backing.wav")

            melody = np.zeros(int(44100 * 2), dtype=np.float32)
            sf.write(str(tmp_path / "melody.wav"), melody, 44100)

            out = tmp_path / "mix.wav"
            info = mix_practice_track(
                tmp_path / "melody.wav",
                backing,
                out,
                include_notation_stem=True,
                backing_gain_db=-16,
                target_duration_sec=2.0,
            )
            self.assertTrue(out.is_file())
            self.assertAlmostEqual(info["durationSec"], 2.0, places=1)

    def test_arrangement_only_mix(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sr = 44100
            melody = np.ones(int(sr * 2), dtype=np.float32)
            backing = np.ones(int(sr * 2), dtype=np.float32) * 0.5
            sf.write(str(tmp_path / "melody.wav"), melody, sr)
            sf.write(str(tmp_path / "backing.wav"), backing, sr)
            out = tmp_path / "mix.wav"
            info = mix_practice_track(
                tmp_path / "melody.wav",
                tmp_path / "backing.wav",
                out,
                include_notation_stem=False,
                arrangement_gain_db=0.0,
            )
            self.assertTrue(out.is_file())
            self.assertFalse(info["includeNotationStem"])
            self.assertEqual(info["melodySamples"], 0)
            data, _ = sf.read(str(out))
            self.assertAlmostEqual(float(np.max(np.abs(data))), 0.5, places=1)

    def test_mix_with_chord_layer(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sr = 44100
            melody = np.zeros(int(sr * 2), dtype=np.float32)
            backing = np.ones(int(sr * 2), dtype=np.float32) * 0.1
            chords = np.ones(int(sr * 2), dtype=np.float32) * 0.2
            sf.write(str(tmp_path / "melody.wav"), melody, sr)
            sf.write(str(tmp_path / "backing.wav"), backing, sr)
            sf.write(str(tmp_path / "chords.wav"), chords, sr)
            out = tmp_path / "mix.wav"
            info = mix_practice_track(
                tmp_path / "melody.wav",
                tmp_path / "backing.wav",
                out,
                include_notation_stem=True,
                chord_path=tmp_path / "chords.wav",
            )
            self.assertTrue(info["chordLayer"])

    def test_tile_backing_loop(self):
        sr = 44100
        audio = np.ones(int(sr * 2), dtype=np.float32)
        tiled, notes = tile_backing_loop(audio, sr, 6.0)
        self.assertEqual(len(tiled), int(round(6.0 * sr)))
        self.assertTrue(notes)

    def test_fit_audio_to_duration_trim(self):
        sr = 44100
        audio = np.ones(int(sr * 3), dtype=np.float32)
        fitted, notes = fit_audio_to_duration(audio, sr, 2.0)
        self.assertEqual(len(fitted), int(round(2.0 * sr)))
        self.assertTrue(notes)

    def test_save_job_inputs_creates_cache_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["PRACTICE_TRACK_CACHE_DIR"] = tmp
            job_id = "a" * 32
            save_job_inputs(job_id, {"timing": {"totalDurationSec": 1}}, b"RIFF", b"CHORD")
            self.assertTrue(job_timing_plan_path(job_id).is_file())
            self.assertTrue(job_melody_wav(job_id).is_file())
            self.assertTrue(job_chords_wav(job_id).is_file())


if __name__ == "__main__":
    unittest.main()
