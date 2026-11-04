"""Central AI kill switch (AI_FEATURES_ENABLED) enforcement."""

import unittest
from unittest.mock import patch

from fastapi import HTTPException

import ai_features
import billing
import llm_runtime
import providers
import server
import server_light


AI_KEYS = (
    "llm",
    "whisper",
    "stems",
    "practiceAnalysis",
    "sheetImage",
    "sheetImageOcr",
    "sheetImageOmr",
    "sheetImageSplit",
    "practiceTrack",
    "tts",
)

DETERMINISTIC_KEYS = (
    "proxy",
    "playwright",
    "soundfonts",
    "youtubeAudio",
    "bandcamp",
    "internetArchive",
    "castPlayback",
)


class AiFeatureFlagTests(unittest.TestCase):
    def test_flag_defaults_true_for_development(self):
        with patch.dict("os.environ", {"AI_FEATURES_ENABLED": "false"}):
            self.assertFalse(ai_features._env_flag("AI_FEATURES_ENABLED", "true"))
        with patch.dict("os.environ", {"AI_FEATURES_ENABLED": "on"}):
            self.assertTrue(ai_features._env_flag("AI_FEATURES_ENABLED", "true"))
        with patch.dict("os.environ", {}, clear=True):
            self.assertTrue(ai_features._env_flag("AI_FEATURES_ENABLED", "true"))

    def test_off_switch_zeroes_ai_features_only(self):
        with patch.object(server, "AI_FEATURES_ENABLED", False), patch.object(
            server, "STEMS_ENABLED", True
        ), patch.object(server, "WHISPER_ENABLED", True), patch.object(
            server, "LLM_ENABLED", True
        ):
            features = server.resolver_features()
        self.assertFalse(features["ai"])
        for key in AI_KEYS:
            self.assertFalse(features[key], key)
        self.assertEqual(features["chordBackend"], "unavailable")
        # Deterministic capabilities keep their normal values.
        for key in DETERMINISTIC_KEYS:
            self.assertIn(key, features)

    def test_require_resolver_feature_rejects_byo_when_off(self):
        with patch.object(server, "AI_FEATURES_ENABLED", False):
            with self.assertRaises(HTTPException) as ctx:
                import asyncio

                asyncio.run(
                    server.require_resolver_feature("llm", request=object(), verified={"email": "a@b"})
                )
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertIn("ai_features_disabled", str(ctx.exception.detail))

    def test_light_features_report_ai_off(self):
        with patch.object(server_light, "AI_FEATURES_ENABLED", False):
            features = server_light.light_features()
        self.assertFalse(features["ai"])
        for key in ("llm", "whisper", "stems", "sheetImage", "sheetImageOcr"):
            self.assertFalse(features[key], key)
        self.assertTrue(features["proxy"])
        self.assertTrue(features["midiConvert"])


class ProviderGateTests(unittest.TestCase):
    def test_resolve_provider_returns_none_when_off(self):
        overlay = {
            "provider": "groq",
            "apiUrl": "https://api.groq.com/openai/v1",
            "apiKey": "k",
            "model": "m",
        }
        with patch.object(providers, "AI_FEATURES_ENABLED", False):
            for cap in providers.CAPABILITIES:
                self.assertIsNone(providers.resolve_provider(cap, overlay=overlay))

    def test_host_embedded_empty_when_off(self):
        with patch.dict(
            "os.environ",
            {
                "PROVIDER_LLM_BASE_URL": "https://api.example.com/v1",
                "PROVIDER_LLM_API_KEY": "k",
            },
        ), patch.object(providers, "AI_FEATURES_ENABLED", False):
            self.assertEqual(providers.host_embedded_providers(), {})

    def test_health_payload_reports_ai_disabled(self):
        with patch.object(providers, "AI_FEATURES_ENABLED", False):
            payload = providers.providers_health_payload(
                allow_embedded=True,
                local_backends={"llm": True, "whisper": True, "ocr": True, "stems": True},
            )
        self.assertFalse(payload["aiEnabled"])
        for cap in providers.CAPABILITIES:
            entry = payload["capabilities"][cap]
            self.assertFalse(entry["localAvailable"])
            self.assertFalse(entry["hostEmbeddedUsable"])
            self.assertIsNone(entry["active"])

    def test_llm_runtime_raises_when_off(self):
        with patch.object(llm_runtime, "AI_FEATURES_ENABLED", False):
            with self.assertRaises(RuntimeError):
                llm_runtime.get_active_llm_config()
            with self.assertRaises(RuntimeError):
                llm_runtime.materialize_llm_config(None)


class BillingPurchaseGateTests(unittest.TestCase):
    def test_purchases_enabled_defaults_true(self):
        with patch.dict("os.environ", {}, clear=True), patch.object(
            billing, "BILLING_ENABLED", True
        ):
            self.assertTrue(billing._purchases_enabled_from_env())

    def test_purchases_flag_parsing(self):
        for value in ("0", "false", "no", "off", "FALSE"):
            with patch.dict("os.environ", {"BILLING_PURCHASES_ENABLED": value}):
                self.assertFalse(billing._purchases_enabled_from_env(), value)
        with patch.dict("os.environ", {"BILLING_PURCHASES_ENABLED": "true"}):
            self.assertTrue(billing._purchases_enabled_from_env())

    def test_purchases_enabled_requires_billing(self):
        with patch.object(billing, "BILLING_ENABLED", False), patch.object(
            billing, "BILLING_PURCHASES_ENABLED", True
        ):
            self.assertFalse(billing.purchases_enabled())

    def test_health_fields_expose_purchases(self):
        with patch.object(billing, "BILLING_ENABLED", False):
            fields = billing.billing_health_fields(None)
        self.assertFalse(fields["billingEnabled"])
        self.assertFalse(fields["purchasesEnabled"])


if __name__ == "__main__":
    unittest.main()
