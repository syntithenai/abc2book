import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server


class HelpQueryEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def test_help_query_returns_help_answer_payload(self):
        with patch.object(server, "require_resolver_feature", return_value=None), patch.object(
            server, "track_resolver_usage"
        ), patch.object(
            server, "maybe_require_auth", new_callable=AsyncMock, return_value=None
        ), patch.object(
            server, "parse_help_intent_llm",
            new_callable=AsyncMock,
            return_value={
                "helpAnswer": "Open the import wizard.",
                "helpLinks": ["/help#import-from-media"],
                "confidence": 0.93,
                "parseMethod": "llm",
            },
        ):
            response = self.client.post(
                "/help-query",
                json={"question": "how do I import from media?"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["question"], "how do I import from media?")
        self.assertEqual(body["answer"], "Open the import wizard.")
        self.assertEqual(body["links"], ["/help#import-from-media"])
        self.assertEqual(body["parseMethod"], "llm")

    def test_help_query_requires_question(self):
        with patch.object(server, "require_resolver_feature", return_value=None), patch.object(
            server, "track_resolver_usage"
        ), patch.object(
            server, "maybe_require_auth", new_callable=AsyncMock, return_value=None
        ):
            response = self.client.post("/help-query", json={})

        self.assertEqual(response.status_code, 400)
        self.assertIn("Missing help question", response.json().get("error", ""))


if __name__ == "__main__":
    unittest.main()
