"""Unit tests for cloud stems provider helpers."""

import asyncio
import os
import tempfile
import unittest
from unittest import mock

import providers
import provider_stems_cloud as stems_cloud


class StemsProviderNormalizeTests(unittest.TestCase):
    def test_fal_default_url(self):
        cfg = providers.normalize_provider_set({
            "provider": "fal",
            "apiKey": "fal_x",
            "model": "fal-ai/demucs",
        })
        self.assertEqual(cfg["apiUrl"], "https://fal.run")
        self.assertTrue(providers.is_cloud_stems_provider(cfg))

    def test_local_not_cloud(self):
        cfg = providers.normalize_provider_set({"provider": "local", "model": "htdemucs"})
        self.assertFalse(providers.is_cloud_stems_provider(cfg))

    def test_host_stems_env(self):
        with mock.patch.dict(os.environ, {
            "PROVIDER_STEMS_PROVIDER": "fal",
            "PROVIDER_STEMS_API_KEY": "fal_host",
            "PROVIDER_STEMS_MODEL": "fal-ai/demucs",
        }, clear=False):
            host = providers.host_embedded_providers()
            self.assertIn("stems", host)
            self.assertEqual(host["stems"]["provider"], "fal")
            self.assertEqual(host["stems"]["model"], "fal-ai/demucs")


class StemsCloudDetectTests(unittest.TestCase):
    def test_detect_fal(self):
        self.assertEqual(
            stems_cloud.detect_stems_backend({"provider": "fal", "apiKey": "x"}),
            "fal",
        )
        self.assertEqual(
            stems_cloud.detect_stems_backend({
                "provider": "custom",
                "apiKey": "x",
                "model": "fal-ai/demucs",
            }),
            "fal",
        )

    def test_detect_replicate(self):
        self.assertEqual(
            stems_cloud.detect_stems_backend({
                "provider": "replicate",
                "apiKey": "r8",
                "model": "cjwbw/demucs",
            }),
            "replicate",
        )

    def test_cloud_stems_model_name(self):
        self.assertEqual(
            stems_cloud.cloud_stems_model_name({"model": "htdemucs_6s"}),
            "htdemucs_6s",
        )
        self.assertEqual(
            stems_cloud.cloud_stems_model_name({"model": "cjwbw/demucs"}),
            "htdemucs",
        )
        self.assertEqual(
            stems_cloud.cloud_stems_model_name({"model": "fal-ai/demucs"}),
            "htdemucs_6s",
        )


class StemsCloudSeparateTests(unittest.TestCase):
    def test_fal_separate_writes_stems(self):
        async def fake_fal(*args, **kwargs):
            output_dir = args[3]
            os.makedirs(output_dir, exist_ok=True)
            paths = {}
            for stem in ("drums", "bass", "other", "vocals", "guitar", "piano"):
                path = os.path.join(output_dir, stem + ".wav")
                with open(path, "wb") as handle:
                    handle.write(b"RIFF")
                paths[stem] = path
            return {
                "paths": paths,
                "samplerate": 44100,
                "duration": 1.0,
                "backend": "provider:fal",
                "model": "htdemucs_6s",
                "stems": list(paths.keys()),
            }

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(stems_cloud, "_fal_separate", side_effect=fake_fal):
                result = asyncio.run(
                    stems_cloud.separate_stems_cloud(
                        b"audio",
                        "a.wav",
                        {"provider": "fal", "apiKey": "k", "model": "fal-ai/demucs"},
                        tmp,
                    )
                )
            self.assertEqual(result["backend"], "provider:fal")
            self.assertTrue(os.path.isfile(os.path.join(tmp, "vocals.wav")))


if __name__ == "__main__":
    unittest.main()
