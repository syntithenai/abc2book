import os
import unittest
from unittest import mock

from snapcast_routes import build_snapcast_health_payload


class SnapcastHealthTests(unittest.TestCase):
    def test_build_snapcast_health_https_caddy_path(self):
        request = mock.Mock()
        request.headers = {
            "host": "local-resolver:8787",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "peppertrees.example.com",
        }
        request.url = mock.Mock(scheme="http")

        async def run():
            with mock.patch("snapcast_routes.snapcast_enabled", return_value=True):
                with mock.patch("snapcast_routes.snapcast_public_url", return_value=None):
                    with mock.patch("snapcast_routes.probe_snapserver_http", new=mock.AsyncMock(return_value=True)):
                        with mock.patch("snapcast_routes.get_snapcast_manager") as manager_mock:
                            manager_mock.return_value.tcp_client_count.return_value = 1
                            manager_mock.return_value.health_fields.return_value = {}
                            payload = await build_snapcast_health_payload(
                                request,
                                server_host="snapserver",
                            )
            self.assertEqual(payload["controlUrl"], "https://peppertrees.example.com/snapcast")
            self.assertEqual(payload["controlUrlLan"], "http://peppertrees.example.com:1780")
            self.assertTrue(payload["pcmLinked"])

        import asyncio
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
