import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import lyrics_word_tools
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


class LyricsWordEncyclopediaHelpersTests(unittest.TestCase):
    def test_encyclopedia_entry_includes_matching_image(self):
        summary = {
            "type": "standard",
            "title": "Acacia melanoxylon",
            "description": "Species of legume",
            "extract": (
                "Acacia melanoxylon, commonly known as the Australian blackwood, "
                "is an Acacia species native to south-eastern Australia."
            ),
            "thumbnail": {
                "source": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Acacia_melanoxylon.jpg/330px-Acacia_melanoxylon.jpg",
                "width": 330,
                "height": 219,
            },
            "content_urls": {
                "desktop": {"page": "https://en.wikipedia.org/wiki/Acacia_melanoxylon"},
            },
        }

        entry = lyrics_word_tools._encyclopedia_entry_from_summary(summary, "Acacia melanoxylon")

        self.assertIsNotNone(entry)
        self.assertEqual(entry["source"], "wikipedia")
        self.assertIn("Australian blackwood", entry["meanings"][0]["definitions"][0]["definition"])
        self.assertIn("Acacia_melanoxylon.jpg", entry["image"]["url"])

    def test_encyclopedia_entry_rejects_weak_title_match(self):
        summary = {
            "type": "standard",
            "title": "Blackwood (disambiguation)",
            "description": "Topics called Blackwood",
            "extract": "Blackwood may refer to several places, people, and plants around the world.",
            "thumbnail": {
                "source": "https://example.com/image.jpg",
                "width": 330,
                "height": 219,
            },
            "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Blackwood"}},
        }

        entry = lyrics_word_tools._encyclopedia_entry_from_summary(summary, "Acacia melanoxylon")

        self.assertIsNone(entry)

    def test_encyclopedia_entry_rejects_tiny_images(self):
        summary = {
            "type": "standard",
            "title": "Acacia melanoxylon",
            "description": "Species of legume",
            "extract": (
                "Acacia melanoxylon, commonly known as the Australian blackwood, "
                "is an Acacia species native to south-eastern Australia."
            ),
            "thumbnail": {
                "source": "https://example.com/tiny.jpg",
                "width": 40,
                "height": 40,
            },
            "content_urls": {
                "desktop": {"page": "https://en.wikipedia.org/wiki/Acacia_melanoxylon"},
            },
        }

        entry = lyrics_word_tools._encyclopedia_entry_from_summary(summary, "Acacia melanoxylon")

        self.assertIsNotNone(entry)
        self.assertNotIn("image", entry)


if __name__ == "__main__":
    unittest.main()
