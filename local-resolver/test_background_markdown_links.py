import unittest
from unittest.mock import AsyncMock, patch

from background_markdown_links import (
    artists_mentioned_in_text,
    build_youtube_search_queries,
    collect_entities_from_sources,
    enrich_markdown_with_entity_links,
    enrich_background_markdown,
    insert_youtube_links_section,
    search_youtube_links_for_tune,
)


class BackgroundMarkdownLinksTests(unittest.IsolatedAsyncioTestCase):
    def test_collect_entities_from_musicbrainz_source(self):
        artists, albums = collect_entities_from_sources([
            {
                "title": "Copper Kettle",
                "url": "https://musicbrainz.org/recording/abc",
                "snippet": (
                    "Artists: Joan Baez, Chet Atkins. "
                    "Releases: Joan Baez/5; This Is Chet Atkins. "
                    "First release: 1970"
                ),
                "source": "musicbrainz",
            },
        ], tune_artist="Traditional")

        self.assertIn("Joan Baez", artists)
        self.assertNotIn("Traditional", artists)
        self.assertIn("Joan Baez/5", albums)
        self.assertIn("This Is Chet Atkins", albums)

    def test_enrich_markdown_links_artists_and_albums(self):
        text = (
            "Joan Baez recorded Copper Kettle on the album Joan Baez/5. "
            "Chet Atkins also recorded it on This Is Chet Atkins."
        )
        enriched = enrich_markdown_with_entity_links(
            text,
            {
                "Joan Baez": "https://en.wikipedia.org/wiki/Joan_Baez",
                "Chet Atkins": "https://en.wikipedia.org/wiki/Chet_Atkins",
            },
            {
                "Joan Baez/5": "https://www.discogs.com/search/?q=Joan+Baez%2F5&type=release",
                "This Is Chet Atkins": "https://www.discogs.com/master/12345",
            },
        )
        self.assertIn("[Joan Baez](https://en.wikipedia.org/wiki/Joan_Baez)", enriched)
        self.assertIn("[Chet Atkins](https://en.wikipedia.org/wiki/Chet_Atkins)", enriched)
        self.assertIn("[Joan Baez/5](https://www.discogs.com/search/?q=Joan+Baez%2F5&type=release)", enriched)
        self.assertIn("[This Is Chet Atkins](https://www.discogs.com/master/12345)", enriched)

    def test_enrich_markdown_skips_existing_links(self):
        text = "See [Joan Baez](https://example.com) and Joan Baez live."
        enriched = enrich_markdown_with_entity_links(
            text,
            {"Joan Baez": "https://en.wikipedia.org/wiki/Joan_Baez"},
            {},
        )
        self.assertIn("[Joan Baez](https://example.com)", enriched)
        self.assertIn("[Joan Baez](https://en.wikipedia.org/wiki/Joan_Baez) live.", enriched)

    async def test_enrich_background_markdown_resolves_wikipedia(self):
        sources = [{
            "title": "Copper Kettle",
            "url": "https://musicbrainz.org/recording/abc",
            "snippet": "Artists: Joan Baez. Releases: Joan Baez/5.",
            "source": "musicbrainz",
        }]
        text = "Joan Baez recorded Copper Kettle on Joan Baez/5."

        with patch(
            "background_markdown_links._resolve_wikipedia_url",
            new=AsyncMock(return_value="https://en.wikipedia.org/wiki/Joan_Baez"),
        ), patch(
            "background_markdown_links.search_youtube_links_for_tune",
            new=AsyncMock(return_value=[]),
        ):
            enriched = await enrich_background_markdown(
                AsyncMock(),
                text,
                sources,
                tune_artist="Traditional",
                tune_title="Copper Kettle",
            )

        self.assertIn("[Joan Baez](https://en.wikipedia.org/wiki/Joan_Baez)", enriched)
        self.assertIn("discogs.com", enriched)

    def test_artists_mentioned_in_text_finds_known_artists(self):
        text = (
            "Joan Baez recorded Copper Kettle. "
            "Chet Atkins also played it. "
            "Another performer is not listed."
        )
        mentioned = artists_mentioned_in_text(
            text,
            ["Joan Baez", "Chet Atkins", "Bob Dylan"],
        )
        self.assertEqual(mentioned, ["Joan Baez", "Chet Atkins"])

    def test_build_youtube_search_queries_artist_then_title(self):
        queries = build_youtube_search_queries(
            "Copper Kettle",
            ["Joan Baez", "Chet Atkins"],
        )
        self.assertEqual(
            queries,
            [
                "Copper Kettle Joan Baez",
                "Copper Kettle Chet Atkins",
                "Copper Kettle",
            ],
        )

    def test_build_youtube_search_queries_title_only_when_no_artists(self):
        self.assertEqual(
            build_youtube_search_queries("Copper Kettle", []),
            ["Copper Kettle"],
        )

    async def test_search_youtube_links_for_tune_runs_queries(self):
        async def fake_search(query, max_results=2):
            mapping = {
                "Copper Kettle Joan Baez": [{
                    "title": "Joan Baez - Copper Kettle",
                    "url": "https://www.youtube.com/watch?v=abcdefghijk",
                }],
                "Copper Kettle": [{
                    "title": "Copper Kettle traditional",
                    "url": "https://www.youtube.com/watch?v=lmnopqrstuv",
                }],
            }
            return mapping.get(query, [])

        with patch(
            "background_markdown_links.search_youtube_videos",
            new=AsyncMock(side_effect=fake_search),
        ):
            links = await search_youtube_links_for_tune(
                "Copper Kettle",
                "Joan Baez recorded this song.",
                ["Joan Baez", "Bob Dylan"],
            )

        self.assertEqual(
            [link["url"] for link in links],
            [
                "https://www.youtube.com/watch?v=abcdefghijk",
                "https://www.youtube.com/watch?v=lmnopqrstuv",
            ],
        )

    def test_insert_youtube_links_after_labels_and_releases(self):
        text = (
            "## Overview\n\n"
            "A folk song.\n\n"
            "## Record labels and releases\n\n"
            "Released on Vanguard.\n\n"
            "## Historical anecdotes\n\n"
            "Often sung at festivals.\n"
        )
        links = [
            {"title": "Joan Baez - Copper Kettle", "url": "https://www.youtube.com/watch?v=abcdefghijk"},
            {"title": "Live cover", "url": "https://www.youtube.com/watch?v=lmnopqrstuv"},
        ]
        enriched = insert_youtube_links_section(text, links)
        labels_pos = enriched.index("## Record labels and releases")
        youtube_pos = enriched.index("## YouTube")
        history_pos = enriched.index("## Historical anecdotes")
        self.assertLess(labels_pos, youtube_pos)
        self.assertLess(youtube_pos, history_pos)
        self.assertIn(
            "- [Joan Baez - Copper Kettle](https://www.youtube.com/watch?v=abcdefghijk)",
            enriched,
        )
        self.assertIn("- [Live cover](https://www.youtube.com/watch?v=lmnopqrstuv)", enriched)

    def test_insert_youtube_links_appends_when_no_labels_section(self):
        text = "## Overview\n\nA folk song.\n"
        links = [{"title": "Live", "url": "https://www.youtube.com/watch?v=abcdefghijk"}]
        enriched = insert_youtube_links_section(text, links)
        self.assertTrue(enriched.rstrip().endswith(
            "- [Live](https://www.youtube.com/watch?v=abcdefghijk)"
        ))

    def test_insert_youtube_links_before_references(self):
        text = (
            "## Overview\n\n"
            "A folk song.\n\n"
            "## References\n\n"
            "- [Example](https://example.com)\n"
        )
        links = [{"title": "Live", "url": "https://www.youtube.com/watch?v=abcdefghijk"}]
        enriched = insert_youtube_links_section(text, links)
        youtube_pos = enriched.index("## YouTube")
        references_pos = enriched.index("## References")
        self.assertLess(youtube_pos, references_pos)

    async def test_enrich_background_markdown_searches_youtube(self):
        sources = [{
            "title": "Copper Kettle",
            "url": "https://musicbrainz.org/recording/abc",
            "snippet": "Artists: Joan Baez. Releases: Joan Baez/5.",
            "source": "musicbrainz",
        }]
        text = (
            "## Record labels and releases\n\n"
            "Joan Baez recorded Copper Kettle on Joan Baez/5.\n\n"
            "## Historical anecdotes\n\n"
            "A festival favorite.\n"
        )

        with patch(
            "background_markdown_links._resolve_wikipedia_url",
            new=AsyncMock(return_value="https://en.wikipedia.org/wiki/Joan_Baez"),
        ), patch(
            "background_markdown_links.search_youtube_links_for_tune",
            new=AsyncMock(return_value=[{
                "title": "Joan Baez - Copper Kettle",
                "url": "https://www.youtube.com/watch?v=abcdefghijk",
            }]),
        ) as search_mock:
            enriched = await enrich_background_markdown(
                AsyncMock(),
                text,
                sources,
                tune_artist="Traditional",
                tune_title="Copper Kettle",
            )

        search_mock.assert_awaited()
        args = search_mock.await_args.args
        self.assertEqual(args[0], "Copper Kettle")
        self.assertIn("Joan Baez", args[1])
        self.assertIn("Joan Baez", args[2])
        self.assertIn("[Joan Baez](https://en.wikipedia.org/wiki/Joan_Baez)", enriched)
        self.assertIn("## YouTube", enriched)
        self.assertIn(
            "- [Joan Baez - Copper Kettle](https://www.youtube.com/watch?v=abcdefghijk)",
            enriched,
        )
        self.assertLess(enriched.index("## YouTube"), enriched.index("## Historical anecdotes"))


if __name__ == "__main__":
    unittest.main()
