import unittest
from unittest.mock import AsyncMock, patch

from bandcamp import (
    bandcamp_enabled,
    build_bandcamp_candidate,
    is_bandcamp_url,
    repair_bandcamp_url,
    search_bandcamp,
)


class BandcampUtilsTest(unittest.TestCase):
    def test_is_bandcamp_url(self):
        self.assertTrue(is_bandcamp_url("https://artist.bandcamp.com/track/foo"))
        self.assertTrue(is_bandcamp_url("https://bandcamp.com/track/foo"))
        self.assertFalse(is_bandcamp_url("https://youtube.com/watch?v=abc"))
        self.assertTrue(is_bandcamp_url("http://artist.bandcamp.com/track/foo"))

    def test_repair_doubled_bandcamp_url(self):
        broken = (
            "https://simplegifts.bandcamp.comhttps://simplegifts.bandcamp.com"
            "/album/down-by-the-sally-gardens"
        )
        fixed = repair_bandcamp_url(broken)
        self.assertEqual(
            fixed,
            "https://simplegifts.bandcamp.com/album/down-by-the-sally-gardens",
        )
        self.assertTrue(is_bandcamp_url(broken))

    def test_build_bandcamp_candidate(self):
        candidate = build_bandcamp_candidate({
            "title": "The Sally Gardens",
            "artist": "Altan",
            "url": "https://altan.bandcamp.com/track/the-sally-gardens",
            "image": "https://f4.bcbits.com/img/a123.jpg",
            "matchScore": 80,
        })
        self.assertEqual(candidate["source"], "bandcamp")
        self.assertEqual(candidate["title"], "The Sally Gardens")
        self.assertEqual(candidate["artist"], "Altan")
        self.assertEqual(candidate["link"], "https://altan.bandcamp.com/track/the-sally-gardens")
        self.assertEqual(candidate["matchScore"], 80)

    def test_bandcamp_enabled_defaults_true(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertTrue(bandcamp_enabled())


class BandcampSearchTest(unittest.IsolatedAsyncioTestCase):
    async def test_search_bandcamp_parses_results(self):
        payload = {
            "results": [
                {
                    "type": "t",
                    "name": "The Sally Gardens",
                    "band_name": "Altan",
                    "url": (
                        "https://altan.bandcamp.comhttps://altan.bandcamp.com"
                        "/track/the-sally-gardens"
                    ),
                    "img": "https://f4.bcbits.com/img/a123.jpg",
                },
                {
                    "type": "a",
                    "name": "Album only",
                    "url": "https://altan.bandcamp.com/album/harvest-storm",
                },
            ]
        }
        mock_response = AsyncMock()
        mock_response.raise_for_status = lambda: None
        mock_response.json = lambda: payload
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("bandcamp.httpx.AsyncClient", return_value=mock_client):
            matches = await search_bandcamp("Sally Gardens", title="Sally Gardens", artist="Altan", limit=5)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["title"], "The Sally Gardens")
        self.assertEqual(matches[0]["artist"], "Altan")
        self.assertEqual(
            matches[0]["url"],
            "https://altan.bandcamp.com/track/the-sally-gardens",
        )

    async def test_search_bandcamp_empty_query(self):
        matches = await search_bandcamp("", title="", artist="")
        self.assertEqual(matches, [])


if __name__ == "__main__":
    unittest.main()
