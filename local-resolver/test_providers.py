"""Unit tests for provider resolution."""

import os
import unittest
from unittest import mock

import providers


class ProviderNormalizeTests(unittest.TestCase):
    def test_local(self):
        cfg = providers.normalize_provider_set({"provider": "local"})
        self.assertEqual(cfg["provider"], "local")

    def test_openai_compat(self):
        cfg = providers.normalize_provider_set({
            "provider": "groq",
            "apiUrl": "https://api.groq.com/openai/v1/",
            "apiKey": "gsk_x",
            "model": "llama-3.1-8b-instant",
        })
        self.assertEqual(cfg["apiUrl"], "https://api.groq.com/openai/v1")
        self.assertEqual(cfg["apiKey"], "gsk_x")


class ProviderResolveTests(unittest.TestCase):
    def test_overlay_wins(self):
        resolved = providers.resolve_provider(
            "llm",
            overlay={"provider": "openai", "apiUrl": "https://api.openai.com/v1", "apiKey": "sk", "model": "gpt-4o-mini"},
            allow_embedded=True,
            local_available=True,
        )
        self.assertEqual(resolved["source"], "user")
        self.assertEqual(resolved["provider"], "openai")

    def test_local_overlay(self):
        resolved = providers.resolve_provider(
            "whisper",
            overlay={"provider": "local"},
            allow_embedded=False,
            local_available=True,
        )
        self.assertEqual(resolved["provider"], "local")

    def test_embedded_then_local(self):
        with mock.patch.dict(os.environ, {
            "PROVIDER_LLM_PROVIDER": "groq",
            "PROVIDER_LLM_BASE_URL": "https://api.groq.com/openai/v1",
            "PROVIDER_LLM_API_KEY": "gsk",
            "PROVIDER_LLM_MODEL": "llama",
        }, clear=False):
            resolved = providers.resolve_provider(
                "llm",
                overlay=None,
                allow_embedded=True,
                local_available=True,
            )
            self.assertEqual(resolved["source"], "host")
            self.assertEqual(resolved["provider"], "groq")

    def test_fallback_local(self):
        with mock.patch.object(providers, "host_embedded_providers", return_value={}):
            resolved = providers.resolve_provider(
                "ocr",
                overlay=None,
                allow_embedded=False,
                local_available=True,
            )
            self.assertEqual(resolved["source"], "local")


if __name__ == "__main__":
    unittest.main()
