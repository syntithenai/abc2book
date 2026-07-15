import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "llm"))

from openai_proxy import (  # noqa: E402
    BackendPool,
    apply_upstream_auth,
    bases_from_env,
    create_proxy_app,
    format_completion_for_log,
    format_messages_for_log,
    join_backend_url,
    normalize_base_url,
    split_base_urls,
)


class OpenAiProxyHelpersTests(unittest.TestCase):
    def test_normalize_and_split_base_urls(self):
        self.assertEqual(normalize_base_url(" http://a/v1/ "), "http://a/v1")
        self.assertEqual(
            split_base_urls("http://a, http://b/,http://a"),
            ["http://a", "http://b"],
        )

    def test_join_backend_url_avoids_double_v1(self):
        self.assertEqual(
            join_backend_url("http://127.0.0.1:12341", "v1/models"),
            "http://127.0.0.1:12341/v1/models",
        )
        self.assertEqual(
            join_backend_url("https://api.openai.com/v1", "/v1/chat/completions"),
            "https://api.openai.com/v1/chat/completions",
        )

    def test_apply_upstream_auth_replaces_inbound_bearer(self):
        headers = apply_upstream_auth(
            {"Authorization": "Bearer inbound", "Content-Type": "application/json"},
            "sk-external",
        )
        self.assertEqual(headers["Authorization"], "Bearer sk-external")
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(
            apply_upstream_auth({"Authorization": "Bearer inbound"}, None)["Authorization"],
            "Bearer inbound",
        )

    def test_format_completion_includes_reasoning(self):
        body = (
            b'{"model":"google/gemma-4-31b-qat","choices":[{"message":{'
            b'"role":"assistant","reasoning_content":"thinking about pong",'
            b'"content":"pong"}}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}'
        )
        formatted = format_completion_for_log(body)
        self.assertIn("reasoning:", formatted)
        self.assertIn("thinking about pong", formatted)
        self.assertIn("content:", formatted)
        self.assertIn("pong", formatted)

    def test_format_messages_for_log(self):
        text = format_messages_for_log(
            [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}],
            limit=100,
        )
        self.assertIn("user:", text)
        self.assertIn("hello", text)

    def test_bases_from_env_prefers_external(self):
        with patch.dict(
            os.environ,
            {
                "LLM_EXTERNAL_BASE_URL": "http://external:8000/v1",
                "LLM_PRIMARY_BASE_URL": "http://127.0.0.1:12341",
                "LLM_FALLBACK_BASE_URL": "http://127.0.0.1:1234",
            },
            clear=False,
        ):
            self.assertEqual(bases_from_env(), ["http://external:8000/v1"])

    def test_bases_from_env_primary_then_fallback(self):
        env = {
            "LLM_EXTERNAL_BASE_URL": "",
            "LLM_BACKEND_BASE_URLS": "",
            "LLM_PRIMARY_BASE_URL": "http://127.0.0.1:12341",
            "LLM_FALLBACK_BASE_URL": "http://127.0.0.1:1234",
        }
        with patch.dict(os.environ, env, clear=False):
            # Ensure empty external wins over a previously exported value.
            os.environ["LLM_EXTERNAL_BASE_URL"] = ""
            self.assertEqual(
                bases_from_env(),
                ["http://127.0.0.1:12341", "http://127.0.0.1:1234"],
            )


class BackendPoolTests(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_prefers_first_healthy(self):
        pool = BackendPool(
            ["http://primary", "http://fallback"],
            health_ttl_seconds=60,
        )
        client = AsyncMock()

        async def probe_side_effect(_client, base):
            return base.endswith("fallback")

        with patch.object(pool, "probe", side_effect=probe_side_effect):
            preferred = await pool.refresh_preferred(client, force=True)
        self.assertEqual(preferred, "http://fallback")

    async def test_order_for_request_keeps_preferred_first(self):
        pool = BackendPool(["http://a", "http://b", "http://c"])
        self.assertEqual(
            pool.order_for_request("http://b"),
            ["http://b", "http://a", "http://c"],
        )


class ProxyAppFailoverTests(unittest.TestCase):
    def test_falls_back_when_primary_connection_fails(self):
        def handler(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            if url.startswith("http://primary"):
                raise httpx.ConnectError("primary down", request=request)
            if url.endswith("/v1/models") or url.endswith("/models"):
                return httpx.Response(
                    200,
                    json={"data": [{"id": "google/gemma-4-31b-qat"}]},
                    request=request,
                )
            return httpx.Response(404, json={"error": "missing"}, request=request)

        transport = httpx.MockTransport(handler)

        class FakeAsyncClient(httpx.AsyncClient):
            def __init__(self, *args, **kwargs):
                kwargs["transport"] = transport
                super().__init__(*args, **kwargs)

        with patch("openai_proxy.httpx.AsyncClient", FakeAsyncClient):
            app = create_proxy_app(
                ["http://primary", "http://fallback"],
                service_name="test-gateway",
                health_ttl_seconds=0.1,
            )
            with TestClient(app) as client:
                response = client.get("/v1/models")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["id"], "google/gemma-4-31b-qat")


if __name__ == "__main__":
    unittest.main()
