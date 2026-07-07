import unittest
from unittest.mock import AsyncMock, patch

from tune_background_research import (
    _build_llm_prompt,
    _lyrics_search_phrases,
    build_research_queries,
    generate_supplemental_queries,
    parse_llm_json_array,
    research_tune_background,
    summarize_with_llm,
)


class TuneBackgroundResearchTests(unittest.IsolatedAsyncioTestCase):
    def test_build_research_queries_requires_title(self):
        with self.assertRaises(ValueError):
            build_research_queries("", "Artist")

    def test_build_research_queries_includes_title_and_artist(self):
        queries = build_research_queries("Wild Rover", "Dubliners")
        self.assertGreaterEqual(len(queries), 5)
        self.assertTrue(any("Wild Rover" in query for query in queries))
        self.assertTrue(any("Dubliners" in query for query in queries))
        self.assertTrue(any("youtube.com" in query for query in queries))

    def test_build_research_queries_uses_lyrics_for_disambiguation(self):
        lyrics = "Get you a copper kettle\nAnd a copper coil"
        queries = build_research_queries("Copper Kettle", "", lyrics)
        self.assertTrue(any("Get you a copper kettle" in query for query in queries))

    def test_lyrics_search_phrases_skips_section_headers(self):
        phrases = _lyrics_search_phrases("[Verse 1]\nGet you a copper kettle\nFill it full of corn")
        self.assertEqual(phrases[0], "Get you a copper kettle")

    def test_build_llm_prompt_includes_lyrics_and_about_section(self):
        prompt = _build_llm_prompt(
            "Copper Kettle",
            "",
            [{"title": "Example", "url": "https://example.com", "snippet": "A folk song.", "source": "wikipedia"}],
            "Get you a copper kettle",
        )
        self.assertIn("Get you a copper kettle", prompt)
        self.assertIn("What the song is about", prompt)

    def test_parse_llm_json_array_reads_queries(self):
        queries = parse_llm_json_array('["Wild Rover history", "Wild Rover covers"]')
        self.assertEqual(queries, ["Wild Rover history", "Wild Rover covers"])

    async def test_research_tune_background_requires_title(self):
        with self.assertRaises(ValueError):
            await research_tune_background("", "Artist")

    async def test_research_tune_background_combines_sources_and_llm(self):
        wiki_sources = [{
            "title": "Wild Rover",
            "url": "https://en.wikipedia.org/wiki/Wild_Rover",
            "snippet": "A folk song.",
            "source": "wikipedia",
        }]
        search_hits = [{
            "title": "Wild Rover history",
            "url": "https://example.com/wild-rover",
            "snippet": "Recorded widely.",
            "source": "duckduckgo",
        }]

        with patch(
            "tune_background_research.fetch_wikipedia",
            new=AsyncMock(return_value=wiki_sources),
        ), patch(
            "tune_background_research.fetch_musicbrainz",
            new=AsyncMock(return_value=[]),
        ), patch(
            "tune_background_research.search_web",
            new=AsyncMock(return_value=search_hits),
        ), patch(
            "tune_background_research.generate_supplemental_queries",
            new=AsyncMock(return_value=[]),
        ), patch(
            "tune_background_research.summarize_with_llm",
            new=AsyncMock(return_value="A classic folk song with many recordings."),
        ), patch(
            "background_markdown_links.search_youtube_links_for_tune",
            new=AsyncMock(return_value=[]),
        ):
            result = await research_tune_background("Wild Rover", "Dubliners")

        self.assertEqual(result["text"], "A classic folk song with many recordings.")
        self.assertGreaterEqual(len(result["sources"]), 2)
        self.assertEqual(result["title"], "Wild Rover")
        self.assertEqual(result["artist"], "Dubliners")
        self.assertIn("timing", result)
        self.assertGreater(result["timing"]["totalMs"], 0)

    async def test_summarize_with_llm_reads_chat_completion(self):
        mock_response = unittest.mock.MagicMock()
        mock_response.raise_for_status = unittest.mock.MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Summary paragraph."}}],
        }
        client = AsyncMock()
        client.post = AsyncMock(return_value=mock_response)

        text = await summarize_with_llm(client, "Wild Rover", "Dubliners", [{
            "title": "Example",
            "url": "https://example.com",
            "snippet": "snippet",
            "source": "wikipedia",
        }])

        self.assertEqual(text, "Summary paragraph.")
        client.post.assert_awaited()

    async def test_generate_supplemental_queries_reads_json_array(self):
        mock_response = unittest.mock.MagicMock()
        mock_response.raise_for_status = unittest.mock.MagicMock()
        mock_response.json.return_value = {
            "choices": [{
                "message": {
                    "content": '["Copper Kettle first recording", "Copper Kettle youtube"]',
                },
            }],
        }
        client = AsyncMock()
        client.post = AsyncMock(return_value=mock_response)

        queries = await generate_supplemental_queries(
            client,
            "Copper Kettle",
            "",
            [{"title": "TuneArch", "snippet": "Traditional air", "source": "duckduckgo"}],
        )

        self.assertEqual(len(queries), 2)
        self.assertIn("Copper Kettle first recording", queries)
        client.post.assert_awaited()


if __name__ == "__main__":
    unittest.main()
