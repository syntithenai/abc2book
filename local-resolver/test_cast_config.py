import os
import unittest
from unittest import mock

from cast_config import cast_public_url
from cast_routes import build_cast_public_base, build_cast_health_payload


class CastConfigTests(unittest.TestCase):
    def test_cast_public_url_from_env(self):
        with mock.patch.dict(os.environ, {"CAST_PUBLIC_URL": "https://example.com"}, clear=False):
            self.assertEqual(cast_public_url(), "https://example.com")

    def test_build_cast_public_base_uses_request_host(self):
        request = mock.Mock()
        request.headers = {"host": "peppertrees.example.com"}
        request.url = mock.Mock(scheme="https")
        with mock.patch.dict(os.environ, {"CAST_PUBLIC_URL": ""}, clear=False):
            self.assertEqual(
                build_cast_public_base(request),
                "https://peppertrees.example.com",
            )

    def test_build_cast_health_payload_includes_public_base(self):
        request = mock.Mock()
        request.headers = {"host": "localhost:8787"}
        request.url = mock.Mock(scheme="http")

        async def run():
            with mock.patch("cast_routes.cast_feature_enabled", return_value=True):
                with mock.patch("cast_routes.get_cast_manager") as manager_mock:
                    manager_mock.return_value.health_fields.return_value = {"sessions": 0}
                    payload = await build_cast_health_payload(request)
            self.assertTrue(payload["enabled"])
            self.assertEqual(payload["publicBase"], "http://localhost:8787")

        import asyncio
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
