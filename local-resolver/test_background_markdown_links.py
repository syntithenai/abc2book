import unittest
from unittest.mock import AsyncMock, patch

from background_markdown_links import (
    collect_entities_from_sources,
    enrich_markdown_with_entity_links,
    enrich_background_markdown,
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
        ):
            enriched = await enrich_background_markdown(
                AsyncMock(),
                text,
                sources,
                tune_artist="Traditional",
            )

        self.assertIn("[Joan Baez](https://en.wikipedia.org/wiki/Joan_Baez)", enriched)
        self.assertIn("discogs.com", enriched)


if __name__ == "__main__":
    unittest.main()
