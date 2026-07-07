import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server


class LyricsWordToolEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(server.app)

    def test_dictionary_endpoint_returns_lookup_results(self):
        with patch.object(server, "lookup_dictionary", new=AsyncMock(return_value=[{"word": "courage"}] )) as mock_lookup:
            response = self.client.post("/lyrics-dictionary", json={"term": "courage"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{"word": "courage"}])
        mock_lookup.assert_awaited_once_with("courage")

    def test_thesaurus_endpoint_accepts_query_key(self):
        with patch.object(
            server,
            "lookup_thesaurus",
            new=AsyncMock(return_value={"synonyms": [{"word": "glad"}], "antonyms": [], "related": []}),
        ) as mock_lookup:
            response = self.client.post("/lyrics-thesaurus", json={"query": "happy"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["synonyms"][0]["word"], "glad")
        mock_lookup.assert_awaited_once_with("happy")

    def test_reverse_dictionary_endpoint_rejects_missing_term(self):
        response = self.client.post("/lyrics-reverse-dictionary", json={})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Missing search term", response.json().get("error", ""))

    def test_phrase_endpoint_accepts_phrase_key(self):
        with patch.object(
            server,
            "lookup_phrase_ideas",
            new=AsyncMock(return_value={"leftContext": [], "rightContext": [], "related": [{"word": "starlight"}], "spelling": [{"word": "moonlight"}] }),
        ) as mock_lookup:
            response = self.client.post("/lyrics-phrases", json={"phrase": "under the stars"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["related"][0]["word"], "starlight")
        self.assertEqual(response.json()["spelling"][0]["word"], "moonlight")
        mock_lookup.assert_awaited_once_with("under the stars")

    def test_alliteration_endpoint_returns_related_adjectives(self):
        with patch.object(
            server,
            "lookup_alliteration",
            new=AsyncMock(return_value={"alliterative": [{"word": "silvery"}], "related": [{"word": "soft"}] }),
        ) as mock_lookup:
            response = self.client.post("/lyrics-alliteration", json={"term": "stars"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["alliterative"][0]["word"], "silvery")
        self.assertEqual(response.json()["related"][0]["word"], "soft")
        mock_lookup.assert_awaited_once_with("stars")


if __name__ == "__main__":
    unittest.main()
