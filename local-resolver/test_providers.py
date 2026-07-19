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

    def test_ocr_prefers_local_over_embedded(self):
        """Home PaddleOCR should win over host PROVIDER_OCR_* unless user overlays cloud."""
        with mock.patch.dict(os.environ, {
            "PROVIDER_OCR_PROVIDER": "groq",
            "PROVIDER_OCR_BASE_URL": "https://api.groq.com/openai/v1",
            "PROVIDER_OCR_API_KEY": "gsk",
            "PROVIDER_OCR_MODEL": "meta-llama/llama-4-scout-17b-16e-instruct",
        }, clear=False):
            resolved = providers.resolve_provider(
                "ocr",
                overlay=None,
                allow_embedded=True,
                local_available=True,
            )
            self.assertEqual(resolved["source"], "local")
            self.assertEqual(resolved["provider"], "local")

    def test_ocr_embedded_when_local_unavailable(self):
        with mock.patch.dict(os.environ, {
            "PROVIDER_OCR_PROVIDER": "groq",
            "PROVIDER_OCR_BASE_URL": "https://api.groq.com/openai/v1",
            "PROVIDER_OCR_API_KEY": "gsk",
            "PROVIDER_OCR_MODEL": "qwen/qwen3.6-27b",
        }, clear=False):
            resolved = providers.resolve_provider(
                "ocr",
                overlay=None,
                allow_embedded=True,
                local_available=False,
            )
            self.assertEqual(resolved["source"], "host")
            self.assertEqual(resolved["provider"], "groq")

    def test_ocr_user_overlay_still_wins_over_local(self):
        resolved = providers.resolve_provider(
            "ocr",
            overlay={
                "provider": "groq",
                "apiUrl": "https://api.groq.com/openai/v1",
                "apiKey": "gsk",
                "model": "qwen/qwen3.6-27b",
            },
            allow_embedded=True,
            local_available=True,
        )
        self.assertEqual(resolved["source"], "user")
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
