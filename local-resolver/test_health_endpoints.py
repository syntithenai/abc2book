import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server


class HealthEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def test_health_is_lightweight(self):
        with patch.object(server, "resolver_features") as mock_features, patch.object(
            server, "_refresh_llm_health_if_stale", new_callable=AsyncMock
        ) as mock_refresh:
            response = self.client.get("/health")
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertTrue(body.get("ok"))
            self.assertIn("staticSite", body)
            self.assertNotIn("features", body)
            mock_features.assert_not_called()
            mock_refresh.assert_not_called()

    def test_health_ready_includes_features(self):
        with patch.object(server, "resolver_features", return_value={"proxy": True}), patch.object(
            server, "_refresh_llm_health_if_stale", new_callable=AsyncMock, return_value=True
        ):
            response = self.client.get("/health/ready")
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertTrue(body.get("ok"))
            self.assertEqual(body.get("features", {}).get("proxy"), True)


if __name__ == "__main__":
    unittest.main()
