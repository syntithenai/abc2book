"""Tests for request-scoped LLM BYO / host provider binding."""

import unittest
from unittest import mock

import llm_runtime


class LlmRuntimeTests(unittest.TestCase):
    def test_cloud_overlay_wins(self):
        cfg = {
            "provider": "groq",
            "apiUrl": "https://api.groq.com/openai/v1",
            "apiKey": "gsk_test",
            "model": "llama-3.1-8b-instant",
            "source": "user",
        }
        with llm_runtime.use_llm_provider(cfg):
            active = llm_runtime.get_active_llm_config()
            self.assertEqual(active["apiUrl"], "https://api.groq.com/openai/v1")
            self.assertEqual(active["apiKey"], "gsk_test")
            self.assertEqual(llm_runtime.llm_model(), "llama-3.1-8b-instant")
            self.assertTrue(
                llm_runtime.llm_chat_url().endswith("/chat/completions")
            )

    def test_local_falls_back_to_research_env(self):
        with mock.patch.object(
            llm_runtime,
            "research_env_llm_config",
            return_value={
                "provider": "local",
                "apiUrl": "http://llm.local/v1",
                "apiKey": "lm-studio",
                "model": "gemma",
                "source": "env",
            },
        ):
            with llm_runtime.use_llm_provider({"provider": "local"}):
                active = llm_runtime.get_active_llm_config()
                self.assertEqual(active["apiUrl"], "http://llm.local/v1")

    def test_materialize_prefers_cloud(self):
        out = llm_runtime.materialize_llm_config({
            "provider": "openai",
            "apiUrl": "https://api.openai.com/v1",
            "apiKey": "sk",
            "model": "gpt-4o-mini",
            "source": "host",
        })
        self.assertEqual(out["source"], "host")
        self.assertEqual(out["apiKey"], "sk")

    def test_enrich_disables_thinking_for_local(self):
        with mock.patch.object(
            llm_runtime,
            "get_active_llm_config",
            return_value={
                "provider": "local",
                "apiUrl": "http://llm.local/v1",
                "apiKey": "lm-studio",
                "model": "gemma",
                "source": "env",
            },
        ):
            body = llm_runtime.enrich_chat_completion_payload({
                "model": "gemma",
                "messages": [{"role": "user", "content": "hi"}],
                "max_tokens": 64,
            })
            self.assertEqual(
                body["chat_template_kwargs"],
                {"enable_thinking": False},
            )

    def test_enrich_skips_thinking_flag_for_cloud(self):
        cloud = {
            "provider": "groq",
            "apiUrl": "https://api.groq.com/openai/v1",
            "apiKey": "gsk",
            "model": "llama",
            "source": "user",
        }
        body = llm_runtime.enrich_chat_completion_payload({
            "model": "llama",
            "messages": [{"role": "user", "content": "hi"}],
        }, cloud)
        self.assertNotIn("chat_template_kwargs", body)


if __name__ == "__main__":
    unittest.main()
