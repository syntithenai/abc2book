import unittest

from recording_artists import discover_recording_artists, is_generic_artist


class RecordingArtistsTests(unittest.IsolatedAsyncioTestCase):
    def test_is_generic_artist_matches_traditional_values(self):
        self.assertTrue(is_generic_artist(""))
        self.assertTrue(is_generic_artist("Traditional"))
        self.assertTrue(is_generic_artist("trad."))
        self.assertFalse(is_generic_artist("Joan Baez"))

    async def test_discover_recording_artists_reads_musicbrainz(self):
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "recordings": [
                        {
                            "artist-credit": [
                                {"name": "Joan Baez"},
                                {"name": "Traditional"},
                            ],
                        },
                        {
                            "artist-credit": [{"name": "Chet Atkins"}],
                        },
                    ],
                }

        class FakeClient:
            async def get(self, url, params=None, headers=None):
                if "musicbrainz.org" in url:
                    return FakeResponse()
                raise AssertionError("unexpected url " + url)

        artists = await discover_recording_artists(FakeClient(), "Copper Kettle", max_artists=5)
        self.assertIn("Joan Baez", artists)
        self.assertIn("Chet Atkins", artists)
        self.assertNotIn("Traditional", artists)


if __name__ == "__main__":
    unittest.main()
