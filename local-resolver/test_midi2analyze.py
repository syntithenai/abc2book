import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


class Midi2AnalyzeEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def _fixture_bytes(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    def test_midi2analyze_returns_profile_for_monophonic_fixture(self):
        with patch.object(server, "maybe_require_auth", new_callable=AsyncMock, return_value=None):
            response = self.client.post(
                "/midi2analyze",
                files={"file": ("monophonic_jig.mid", self._fixture_bytes("monophonic_jig.mid"), "audio/midi")},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        profile = body.get("profile") or {}
        self.assertTrue(profile.get("tracks"))
        self.assertGreaterEqual(len(profile["tracks"]), 1)
        self.assertIn("tempo_bpm", profile)
        self.assertIn("time_signature", profile)

    def test_midi2analyze_rejects_empty_upload(self):
        with patch.object(server, "maybe_require_auth", new_callable=AsyncMock, return_value=None):
            response = self.client.post(
                "/midi2analyze",
                files={"file": ("empty.mid", b"", "audio/midi")},
            )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
