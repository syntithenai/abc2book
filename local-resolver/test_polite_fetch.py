"""Tests for polite_fetch challenge detection and retry helpers."""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock

import httpx

from polite_fetch import (
    FetchResult,
    detect_challenge_html,
    polite_get,
)


class PoliteFetchTests(unittest.TestCase):
    def test_detect_challenge_cloudflare(self):
        html = "<html><body>Just a moment... cf-browser-verification</body></html>"
        self.assertEqual(detect_challenge_html(html, 200), "challenge_html")

    def test_detect_empty(self):
        self.assertEqual(detect_challenge_html("", 200), "empty")

    def test_detect_http_status(self):
        self.assertEqual(detect_challenge_html("nope", 403), "http_status")

    def test_normal_page_not_challenge(self):
        html = "<html><body>" + ("verse line\n" * 200) + "</body></html>"
        self.assertEqual(detect_challenge_html(html, 200), "none")

    def test_polite_get_success(self):
        async def run():
            response = MagicMock()
            response.status_code = 200
            response.text = "<html><body>Hello lyrics</body></html>"
            response.url = "https://example.com/song"
            response.headers = {}
            client = AsyncMock()
            client.get = AsyncMock(return_value=response)
            result = await polite_get(client, "https://example.com/song")
            self.assertIsInstance(result, FetchResult)
            self.assertEqual(result.blocked_reason, "none")
            self.assertIn("Hello", result.text)

        asyncio.run(run())

    def test_polite_get_retries_429(self):
        async def run():
            bad = MagicMock()
            bad.status_code = 429
            bad.text = "slow down"
            bad.url = "https://example.com/song"
            bad.headers = {}
            good = MagicMock()
            good.status_code = 200
            good.text = "<html><body>ok content here</body></html>"
            good.url = "https://example.com/song"
            good.headers = {}
            client = AsyncMock()
            client.get = AsyncMock(side_effect=[bad, good])
            result = await polite_get(client, "https://example.com/a")
            self.assertEqual(result.status, 200)
            self.assertEqual(client.get.await_count, 2)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
