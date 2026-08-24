"""Tests for request-scoped scrape proxy helpers."""

import asyncio
import unittest

import httpx

from scrape_proxy import (
    get_scrape_proxy,
    make_scrape_http_client,
    use_scrape_proxy,
)


class ScrapeProxyTests(unittest.TestCase):
    def test_use_scrape_proxy_sets_and_clears(self):
        self.assertEqual(get_scrape_proxy(), "")
        with use_scrape_proxy("http://user:pass@proxy.example:8080"):
            self.assertEqual(get_scrape_proxy(), "http://user:pass@proxy.example:8080")
        self.assertEqual(get_scrape_proxy(), "")

    def test_make_scrape_http_client_includes_proxy_mounts(self):
        async def run():
            with use_scrape_proxy("http://proxy.example:8080"):
                async with make_scrape_http_client(5.0) as client:
                    self.assertIsInstance(client, httpx.AsyncClient)
                    self.assertTrue(client._mounts)

            async with make_scrape_http_client(5.0) as client:
                self.assertEqual(client._mounts, {})

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
