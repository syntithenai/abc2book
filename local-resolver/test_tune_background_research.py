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
    rank_sources_for_prompt,
    research_tune_background,
    sources_rich_enough_to_skip_supplemental,
    summarize_with_llm,
)


class TuneBackgroundResearchTests(unittest.IsolatedAsyncioTestCase):
    def test_build_research_queries_requires_title(self):
        with self.assertRaises(ValueError):
            build_research_queries("", "Artist")

    def test_build_research_queries_includes_title_and_artist(self):
        queries = build_research_queries("Wild Rover", "Dubliners")
        self.assertEqual(len(queries), 5)
        self.assertTrue(any("Wild Rover" in query for query in queries))
        self.assertTrue(any("Dubliners" in query for query in queries))
        self.assertTrue(any("song history origin recording" in query for query in queries))
        self.assertTrue(any("covers performers recordings" in query for query in queries))
        self.assertTrue(any("site:thesession.org" in query for query in queries))
        self.assertTrue(any("site:discogs.com" in query for query in queries))
        self.assertFalse(any("youtube.com" in query for query in queries))
        self.assertFalse(any(query.endswith("wikipedia") or " wikipedia" in query for query in queries))

    def test_build_research_queries_uses_lyrics_for_disambiguation(self):
        lyrics = "Get you a copper kettle\nAnd a copper coil\nFill it full of corn"
        queries = build_research_queries("Copper Kettle", "", lyrics)
        self.assertEqual(len(queries), 6)
        self.assertTrue(any("Get you a copper kettle" in query for query in queries))
        self.assertEqual(sum(1 for query in queries if "song lyrics" in query), 1)
        self.assertFalse(any("Fill it full of corn" in query for query in queries))

    def test_build_research_queries_lyric_with_artist_uses_one_query(self):
        lyrics = "Get you a copper kettle\nAnd a copper coil"
        queries = build_research_queries("Copper Kettle", "Joan Baez", lyrics)
        self.assertEqual(len(queries), 6)
        lyric_queries = [query for query in queries if "Get you a copper kettle" in query]
        self.assertEqual(len(lyric_queries), 1)
        self.assertIn('"Joan Baez"', lyric_queries[0])
        self.assertNotIn("song lyrics", lyric_queries[0])

    def test_lyrics_search_phrases_defaults_to_one(self):
        phrases = _lyrics_search_phrases(
            "[Verse 1]\nGet you a copper kettle\nFill it full of corn"
        )
        self.assertEqual(phrases, ["Get you a copper kettle"])

    def test_lyrics_search_phrases_skips_section_headers(self):
        phrases = _lyrics_search_phrases(
            "[Verse 1]\nGet you a copper kettle\nFill it full of corn",
            max_phrases=2,
        )
        self.assertEqual(phrases[0], "Get you a copper kettle")

    def test_rank_sources_for_prompt_prefers_wikipedia_and_long_snippets(self):
        ranked = rank_sources_for_prompt(
            [
                {
                    "title": "Blog",
                    "url": "https://example.com/blog",
                    "snippet": "short",
                    "source": "duckduckgo",
                },
                {
                    "title": "Discogs",
                    "url": "https://www.discogs.com/release/1",
                    "snippet": "A" * 40,
                    "source": "duckduckgo",
                },
                {
                    "title": "Wiki",
                    "url": "https://en.wikipedia.org/wiki/Wild_Rover",
                    "snippet": "B" * 20,
                    "source": "wikipedia",
                },
            ]
        )
        self.assertEqual(ranked[0]["title"], "Wiki")
        self.assertEqual(ranked[1]["title"], "Discogs")
        self.assertEqual(ranked[2]["title"], "Blog")

    def test_sources_rich_enough_to_skip_supplemental(self):
        thin = [
            {
                "title": f"Source {idx}",
                "url": f"https://example.com/{idx}",
                "snippet": "short",
                "source": "duckduckgo",
            }
            for idx in range(12)
        ]
        self.assertFalse(sources_rich_enough_to_skip_supplemental(thin))

        rich = thin[:-1] + [
            {
                "title": "Wild Rover",
                "url": "https://en.wikipedia.org/wiki/Wild_Rover",
                "snippet": "A traditional Irish folk song recorded by many artists over decades of performance history.",
                "source": "wikipedia",
            }
        ]
        self.assertTrue(sources_rich_enough_to_skip_supplemental(rich))
        self.assertFalse(sources_rich_enough_to_skip_supplemental(rich[:5]))

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

    async def test_research_tune_background_skips_supplemental_when_rich(self):
        wiki_sources = [{
            "title": "Wild Rover",
            "url": "https://en.wikipedia.org/wiki/Wild_Rover",
            "snippet": "A traditional Irish folk song recorded by many artists over decades of performance.",
            "source": "wikipedia",
        }]
        search_hits = [
            {
                "title": f"Hit {idx}",
                "url": f"https://example.com/hit-{idx}",
                "snippet": f"Snippet {idx} with enough detail for counting.",
                "source": "duckduckgo",
            }
            for idx in range(12)
        ]
        supplemental = AsyncMock(return_value=["should not run"])

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
            new=supplemental,
        ), patch(
            "tune_background_research.summarize_with_llm",
            new=AsyncMock(return_value="A classic folk song."),
        ), patch(
            "tune_background_research.critique_and_fact_check",
            new=AsyncMock(
                return_value=(
                    "A classic folk song.\n\n"
                    "## References\n\n"
                    "- [Wild Rover](https://en.wikipedia.org/wiki/Wild_Rover)\n"
                )
            ),
        ), patch(
            "background_markdown_links.search_youtube_links_for_tune",
            new=AsyncMock(return_value=[]),
        ):
            result = await research_tune_background("Wild Rover", "Dubliners")

        supplemental.assert_not_awaited()
        self.assertIn("A classic folk song.", result["text"])
        self.assertEqual(result["sources"][0]["source"], "wikipedia")

    async def test_generate_supplemental_queries_reads_json_array(self):
        mock_response = unittest.mock.MagicMock()
        mock_response.raise_for_status = unittest.mock.MagicMock()
        mock_response.json.return_value = {
            "choices": [{
                "message": {
                    "content": (
                        '["Copper Kettle first recording", '
                        '"\\"Copper Kettle\\" song history origin recording", '
                        '"Copper Kettle youtube"]'
                    ),
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
            already_run_queries=['"Copper Kettle" song history origin recording'],
        )

        self.assertEqual(queries, ["Copper Kettle first recording", "Copper Kettle youtube"])
        client.post.assert_awaited()
        user_prompt = client.post.await_args.kwargs["json"]["messages"][1]["content"]
        self.assertIn("gap-filling", user_prompt)
        self.assertIn("Queries already run", user_prompt)


if __name__ == "__main__":
    unittest.main()
