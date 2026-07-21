import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


class Midi2AbcEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def _fixture_bytes(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    def test_midi2abc_returns_abc_for_monophonic_fixture(self):
        with patch.object(server, "maybe_require_auth", new_callable=AsyncMock, return_value=None):
            response = self.client.post(
                "/midi2abc",
                files={"file": ("monophonic_jig.mid", self._fixture_bytes("monophonic_jig.mid"), "audio/midi")},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn(body.get("strategy"), ("note_events", "musicxml", "musescore"))
        self.assertTrue(body.get("abc") or body.get("musicXml"))
        self.assertGreater(float(body.get("confidence", 0) or 0), 0)

    def test_midi2abc_rejects_empty_upload(self):
        with patch.object(server, "maybe_require_auth", new_callable=AsyncMock, return_value=None):
            response = self.client.post(
                "/midi2abc",
                files={"file": ("empty.mid", b"", "audio/midi")},
            )
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
