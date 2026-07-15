import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import server


class ResolverFeaturesTests(unittest.TestCase):
    def test_stems_require_proxy(self):
        with patch.object(server, "PROXY_ENABLED", True), patch.object(server, "STEMS_ENABLED", True):
            self.assertTrue(server.resolver_features()["stems"])
        with patch.object(server, "PROXY_ENABLED", False), patch.object(server, "STEMS_ENABLED", True):
            self.assertFalse(server.resolver_features()["stems"])

    def test_whisper_requires_binary_and_model(self):
        with patch.object(server, "WHISPER_ENABLED", True), patch.object(
            server, "WHISPER_CPP_PATH", "/bin/whisper"
        ), patch.object(server, "MODEL_PATH", "/models/model.bin"), patch.object(
            os.path, "isfile", return_value=True
        ):
            self.assertTrue(server.resolver_features()["whisper"])
        with patch.object(server, "WHISPER_ENABLED", False):
            self.assertFalse(server.resolver_features()["whisper"])

    def test_llm_reports_cached_availability(self):
        with patch.object(server, "LLM_ENABLED", True), patch.object(server, "_llm_available_cache", True):
            self.assertTrue(server.resolver_features()["llm"])
        with patch.object(server, "LLM_ENABLED", False):
            self.assertFalse(server.resolver_features()["llm"])

    def test_require_llm_refreshes_stale_cache(self):
        with patch.object(
            server, "_refresh_llm_health_if_stale", new_callable=AsyncMock, return_value=True
        ) as mock_refresh, patch.object(server, "LLM_ENABLED", True), patch.object(
            server, "_llm_available_cache", True
        ):
            asyncio.run(server.require_resolver_feature("llm"))
            mock_refresh.assert_awaited_once()

    def test_require_llm_still_503_when_unavailable(self):
        with patch.object(
            server, "_refresh_llm_health_if_stale", new_callable=AsyncMock, return_value=False
        ), patch.object(server, "LLM_ENABLED", True), patch.object(
            server, "_llm_available_cache", False
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(server.require_resolver_feature("llm"))
            self.assertEqual(ctx.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
