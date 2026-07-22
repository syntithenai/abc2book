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

    def test_replicate_retries_with_latest_version_on_model_404(self):
        async def fake_upload(*args, **kwargs):
            return "https://example.com/audio.wav"

        model_calls = {"count": 0}

        async def fake_get(url, **kwargs):
            self.assertIn("/models/cjwbw/demucs", url)
            return mock.Mock(
                status_code=200,
                json=lambda: {"latest_version": {"id": "version-hash-abc"}},
            )

        async def fake_post(url, **kwargs):
            if url.endswith("/models/cjwbw/demucs/predictions"):
                return mock.Mock(status_code=404, text='{"detail":"not found"}')
            if url.endswith("/predictions"):
                body = kwargs.get("json") or {}
                self.assertEqual(body.get("version"), "version-hash-abc")
                return mock.Mock(
                    status_code=201,
                    json=lambda: {
                        "id": "pred-1",
                        "status": "succeeded",
                        "urls": {"get": "https://api.replicate.com/v1/predictions/pred-1"},
                        "output": {
                            "drums": "https://example.com/drums.wav",
                            "bass": "https://example.com/bass.wav",
                            "other": "https://example.com/other.wav",
                            "vocals": "https://example.com/vocals.wav",
                        },
                    },
                )
            raise AssertionError("unexpected POST " + url)

        async def fake_download(client, url, dest):
            with open(dest, "wb") as handle:
                handle.write(b"RIFF")

        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(stems_cloud, "_replicate_upload_or_data_uri", side_effect=fake_upload), \
                 mock.patch.object(stems_cloud.httpx.AsyncClient, "get", side_effect=fake_get), \
                 mock.patch.object(stems_cloud.httpx.AsyncClient, "post", side_effect=fake_post), \
                 mock.patch.object(stems_cloud, "_download_file", side_effect=fake_download):
                result = asyncio.run(
                    stems_cloud.separate_stems_cloud(
                        b"audio",
                        "a.wav",
                        {"provider": "replicate", "apiKey": "r8_test", "model": "cjwbw/demucs"},
                        tmp,
                    )
                )
            self.assertEqual(result["backend"], "provider:replicate")
            self.assertTrue(os.path.isfile(os.path.join(tmp, "vocals.wav")))


if __name__ == "__main__":
    unittest.main()
