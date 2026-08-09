import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

os.environ["SCORE_CONVERT_SECRET"] = "test-secret"

import server_score_convert  # noqa: E402


FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures", "midi")
HEADERS = {"X-Tunebook-Internal-Token": "test-secret"}


class ScoreConvertServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server_score_convert.app)

    def _fixture_bytes(self, name: str) -> bytes:
        with open(os.path.join(FIXTURES, name), "rb") as handle:
            return handle.read()

    def test_health_reports_musescore_probe(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("ok"))
        self.assertIn("musescoreCli", body)

    def test_rejects_missing_internal_token(self):
        response = self.client.post(
            "/midi2abc",
            files={"file": ("empty.mid", b"", "audio/midi")},
        )
        self.assertEqual(response.status_code, 401)

    def test_midi2abc_rejects_empty_upload(self):
        response = self.client.post(
            "/midi2abc",
            files={"file": ("empty.mid", b"", "audio/midi")},
            headers=HEADERS,
        )
        self.assertEqual(response.status_code, 400)

    @patch("server_score_convert.import_midi_bytes", return_value={"abc": "X:1", "strategy": "note_events", "confidence": 0.8})
    def test_midi2abc_returns_orchestrator_payload(self, mock_import):
        response = self.client.post(
            "/midi2abc",
            files={"file": ("monophonic_jig.mid", self._fixture_bytes("monophonic_jig.mid"), "audio/midi")},
            headers=HEADERS,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("abc"), "X:1")
        self.assertIn("durationMs", body)
        mock_import.assert_called_once()

    @patch(
        "server_score_convert.convert_score_file_to_musicxml",
        return_value='<?xml version="1.0"?><score-partwise></score-partwise>',
    )
    def test_score2xml_returns_musicxml(self, mock_convert):
        response = self.client.post(
            "/score2xml",
            files={"file": ("score.mscx", b"<musescore></musescore>", "application/octet-stream")},
            headers=HEADERS,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"score-partwise", response.content)
        mock_convert.assert_called_once()


if __name__ == "__main__":
    unittest.main()
