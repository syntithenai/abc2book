import unittest
from unittest.mock import AsyncMock, patch

from tune_background_research import (
    _build_llm_prompt,
    _existing_background_prompt_block,
    _lyrics_search_phrases,
    build_research_queries,
    critique_and_fact_check,
    ensure_references_section,
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

    def test_build_llm_prompt_includes_existing_background(self):
        prompt = _build_llm_prompt(
            "Wild Rover",
            "Dubliners",
            [{"title": "Example", "url": "https://example.com", "snippet": "A folk song.", "source": "wikipedia"}],
            "",
            "First published in Dublin in 1800.",
        )
        self.assertIn("EXISTING BACKGROUND INFO", prompt)
        self.assertIn("First published in Dublin in 1800.", prompt)
        self.assertIn("preserve these facts", prompt.lower())

    def test_existing_background_prompt_block_empty(self):
        self.assertEqual(_existing_background_prompt_block(""), "")
        self.assertEqual(_existing_background_prompt_block("   "), "")

    def test_ensure_references_section_appends_when_missing(self):
        text = ensure_references_section(
            "## Overview\n\nA folk song.[1]\n",
            [
                {
                    "title": "Wild Rover",
                    "url": "https://en.wikipedia.org/wiki/Wild_Rover",
                    "snippet": "A folk song.",
                    "source": "wikipedia",
                },
                {
                    "title": "Other",
                    "url": "https://example.com/other",
                    "snippet": "Other.",
                    "source": "web",
                },
            ],
        )
        self.assertIn("## References", text)
        self.assertIn("https://en.wikipedia.org/wiki/Wild_Rover", text)

    def test_ensure_references_section_keeps_existing(self):
        draft = "## Overview\n\nA folk song.\n\n## References\n\n- [A](https://example.com/a)\n"
        text = ensure_references_section(
            draft,
            [{"title": "B", "url": "https://example.com/b", "snippet": "", "source": "web"}],
        )
        self.assertEqual(text.count("## References"), 1)
        self.assertIn("https://example.com/a", text)
        self.assertNotIn("https://example.com/b", text)

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
            "tune_background_research.critique_and_fact_check",
            new=AsyncMock(
                return_value=(
                    "A classic folk song with many recordings.\n\n"
                    "## References\n\n"
                    "- [Wild Rover](https://en.wikipedia.org/wiki/Wild_Rover)\n"
                )
            ),
        ), patch(
            "background_markdown_links.search_youtube_links_for_tune",
            new=AsyncMock(return_value=[]),
        ):
            result = await research_tune_background(
                "Wild Rover",
                "Dubliners",
                existing_background="Known as a drinking song.",
            )

        self.assertIn("A classic folk song with many recordings.", result["text"])
        self.assertIn("## References", result["text"])
        self.assertGreaterEqual(len(result["sources"]), 2)
        self.assertEqual(result["title"], "Wild Rover")
        self.assertEqual(result["artist"], "Dubliners")
        self.assertIn("timing", result)
        self.assertGreater(result["timing"]["totalMs"], 0)

    async def test_critique_and_fact_check_reads_chat_completion(self):
        mock_response = unittest.mock.MagicMock()
        mock_response.raise_for_status = unittest.mock.MagicMock()
        mock_response.json.return_value = {
            "choices": [{
                "message": {
                    "content": (
                        "Revised article.[1]\n\n"
                        "## References\n\n"
                        "- [Example](https://example.com)\n"
                    ),
                },
            }],
        }
        client = AsyncMock()
        client.post = AsyncMock(return_value=mock_response)

        text = await critique_and_fact_check(
            client,
            "Wild Rover",
            "Dubliners",
            "Draft with a dubious claim.",
            [{
                "title": "Example",
                "url": "https://example.com",
                "snippet": "snippet",
                "source": "wikipedia",
            }],
            "Existing fact to preserve.",
        )

        self.assertIn("Revised article", text)
        self.assertIn("## References", text)
        client.post.assert_awaited()
        user_prompt = client.post.await_args.kwargs["json"]["messages"][1]["content"]
        self.assertIn("Existing fact to preserve.", user_prompt)
        self.assertIn("Draft with a dubious claim.", user_prompt)

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
        }], existing_background="Keep this fact.")

        self.assertEqual(text, "Summary paragraph.")
        client.post.assert_awaited()
        user_prompt = client.post.await_args.kwargs["json"]["messages"][1]["content"]
        self.assertIn("Keep this fact.", user_prompt)

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
