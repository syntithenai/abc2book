import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

os.environ.setdefault("REQUIRE_AUTH", "false")

import server_light  # noqa: E402


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")


class ScoreConvertProxyTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server_light.app)

    def _fixture_bytes(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    @patch("server_light.proxy_midi2abc", new_callable=AsyncMock)
    def test_midi2abc_proxies_and_returns_json(self, mock_proxy):
        mock_proxy.return_value = (
            {"abc": "X:1", "strategy": "note_events", "confidence": 0.9},
            {"file_bytes": 100, "response_bytes": 50, "strategy": "note_events"},
        )
        response = self.client.post(
            "/midi2abc",
            files={"file": ("monophonic_jig.mid", self._fixture_bytes("monophonic_jig.mid"), "audio/midi")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("abc"), "X:1")
        mock_proxy.assert_awaited_once()

    @patch("server_light.proxy_score2xml", new_callable=AsyncMock)
    def test_score2xml_proxies_musicxml(self, mock_proxy):
        mock_proxy.return_value = (
            '<?xml version="1.0"?><score-partwise></score-partwise>',
            {"file_bytes": 10, "response_bytes": 40},
        )
        response = self.client.post(
            "/score2xml",
            files={"file": ("score.mscx", b"<musescore></musescore>", "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"score-partwise", response.content)
        mock_proxy.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
