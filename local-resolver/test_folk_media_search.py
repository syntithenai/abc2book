import unittest
from unittest.mock import AsyncMock, patch

from internet_archive import (
    build_archive_search_query,
    build_internet_archive_candidate,
    extract_archive_identifier,
    internet_archive_enabled,
    is_archive_org_direct_download_url,
    is_archive_org_url,
    pick_best_audio_file,
    search_internet_archive,
)
from europeana import build_europeana_candidate, europeana_enabled, search_europeana
from loc_audio import build_loc_audio_candidate, is_loc_gov_url, loc_audio_enabled, search_loc_audio


class InternetArchiveUtilsTest(unittest.TestCase):
    def test_is_archive_org_url(self):
        self.assertTrue(is_archive_org_url("https://archive.org/details/foo"))
        self.assertTrue(is_archive_org_url("https://archive.org/download/foo/bar.mp3"))
        self.assertFalse(is_archive_org_url("https://youtube.com/watch?v=abc"))

    def test_is_archive_org_direct_download_url(self):
        self.assertTrue(is_archive_org_direct_download_url("https://archive.org/download/foo/bar.mp3"))
        self.assertFalse(is_archive_org_direct_download_url("https://archive.org/details/foo"))

    def test_extract_archive_identifier(self):
        self.assertEqual(extract_archive_identifier("https://archive.org/details/foo"), "foo")
        self.assertEqual(extract_archive_identifier("https://archive.org/download/foo/bar.mp3"), "foo")

    def test_build_archive_search_query_uses_distinctive_title_words(self):
        query = build_archive_search_query(
            "After The Battle Of Aughrim",
            title="After The Battle Of Aughrim",
        )
        self.assertIn("title:battle", query)
        self.assertIn("title:aughrim", query)
        self.assertNotIn('title:"After The Battle Of Aughrim"', query)

    def test_pick_best_audio_file_prefers_mp3(self):
        files = [
            {"name": "foo_meta.xml", "format": "Metadata"},
            {"name": "foo_vbr.mp3", "format": "VBR MP3", "size": "1000"},
            {"name": "foo.flac", "format": "Flac", "size": "5000"},
        ]
        best = pick_best_audio_file(files)
        self.assertEqual(best["name"], "foo_vbr.mp3")

    def test_build_internet_archive_candidate(self):
        candidate = build_internet_archive_candidate({
            "identifier": "foo",
            "title": "Sally Gardens",
            "creator": "Altan",
            "link": "https://archive.org/details/foo",
            "matchScore": 80,
        })
        self.assertEqual(candidate["source"], "internet-archive")
        self.assertEqual(candidate["artist"], "Altan")


class EuropeanaUtilsTest(unittest.TestCase):
    def test_europeana_enabled_requires_api_key(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(europeana_enabled())
        with patch.dict("os.environ", {"EUROPEANA_API_KEY": "test-key"}, clear=True):
            self.assertTrue(europeana_enabled())

    def test_build_europeana_candidate(self):
        candidate = build_europeana_candidate({
            "title": "Sally Gardens",
            "artist": "Altan",
            "link": "https://example.com/audio.mp3",
            "matchScore": 70,
        })
        self.assertEqual(candidate["source"], "europeana")


class LocAudioUtilsTest(unittest.TestCase):
    def test_is_loc_gov_url(self):
        self.assertTrue(is_loc_gov_url("https://www.loc.gov/item/123/"))
        self.assertFalse(is_loc_gov_url("https://archive.org/details/foo"))

    def test_build_loc_audio_candidate(self):
        candidate = build_loc_audio_candidate({
            "title": "Field recording",
            "link": "https://www.loc.gov/item/123/",
            "matchScore": 60,
        })
        self.assertEqual(candidate["source"], "loc")


class FolkMediaSearchTest(unittest.IsolatedAsyncioTestCase):
    async def test_search_internet_archive_parses_results(self):
        payload = {
            "response": {
                "docs": [
                    {
                        "identifier": "foo",
                        "title": "Sally Gardens",
                        "creator": ["Altan"],
                    }
                ]
            }
        }
        mock_response = AsyncMock()
        mock_response.raise_for_status = lambda: None
        mock_response.json = lambda: payload
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("internet_archive.httpx.AsyncClient", return_value=mock_client):
            matches = await search_internet_archive("Sally Gardens", title="Sally Gardens", artist="Altan", limit=5)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["title"], "Sally Gardens")

    async def test_search_europeana_parses_results(self):
        payload = {
            "items": [
                {
                    "title": ["Sally Gardens"],
                    "dcCreator": ["Altan"],
                    "edmIsShownBy": ["https://example.com/audio.mp3"],
                    "id": "/123/abc",
                }
            ]
        }
        mock_response = AsyncMock()
        mock_response.raise_for_status = lambda: None
        mock_response.json = lambda: payload
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch.dict("os.environ", {"EUROPEANA_API_KEY": "test-key"}, clear=True):
            with patch("europeana.httpx.AsyncClient", return_value=mock_client):
                matches = await search_europeana("Sally Gardens", title="Sally Gardens", artist="Altan", limit=5)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["link"], "https://example.com/audio.mp3")

    async def test_search_loc_audio_parses_results(self):
        payload = {
            "results": [
                {
                    "title": "Irish fiddle tune",
                    "url": "https://www.loc.gov/item/123/",
                }
            ]
        }

        with patch("loc_audio._polite_get_json", AsyncMock(return_value=payload)):
            matches = await search_loc_audio("irish fiddle", title="irish fiddle", limit=5)

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["title"], "Irish fiddle tune")


if __name__ == "__main__":
    unittest.main()
