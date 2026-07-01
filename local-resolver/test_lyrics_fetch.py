import unittest
from unittest.mock import AsyncMock, patch

from lyrics_fetch import (
    extract_azlyrics,
    extract_genius,
    finalize_lyrics_lines,
    genius_song_candidates,
    parse_plain_lyrics_text,
    score_title_artist_match,
    search_lyrics,
    search_lyrics_with_candidates,
    slugify_lyrics_path,
    strip_genius_chrome,
)
from recording_artists import is_generic_artist


class LyricsFetchTests(unittest.TestCase):
    def test_slugify_lyrics_path(self):
        self.assertEqual(slugify_lyrics_path("The Beatles"), "thebeatles")
        self.assertEqual(slugify_lyrics_path("Yesterday!"), "yesterday")

    def test_score_title_artist_match_prefers_exact(self):
        score = score_title_artist_match("Yesterday", "The Beatles", "Yesterday", "The Beatles")
        self.assertGreater(score, 100)

    def test_parse_plain_lyrics_text_splits_stanzas(self):
        stanzas, lines, text = parse_plain_lyrics_text("Line one\nLine two\n\nChorus line")
        self.assertEqual(stanzas, [["Line one", "Line two"], ["Chorus line"]])
        self.assertEqual(lines, ["Line one", "Line two", "", "Chorus line"])
        self.assertEqual(text, "Line one\nLine two\n\nChorus line")

    def test_finalize_lyrics_lines_filters_noise(self):
        _, lines, text = finalize_lyrics_lines(
            [
                "Yesterday",
                "All my troubles seemed so far away",
                "",
                "Submit Corrections",
                "Thanks to Tony for correcting these lyrics",
            ]
        )
        self.assertEqual(lines, ["Yesterday", "All my troubles seemed so far away"])
        self.assertEqual(text, "Yesterday\nAll my troubles seemed so far away")

    def test_extract_azlyrics(self):
        html_text = """
        <div>
        <!-- Usage of azlyrics.com content by any third-party lyrics provider is prohibited -->
        Yesterday all my troubles seemed so far away.<br>
        Oh, I believe in yesterday.<br>
        <br>
        Suddenly, I'm not half the man I used to be.<br>
        </div>
        """
        extracted = extract_azlyrics(html_text)
        self.assertIn("Yesterday all my troubles", extracted)
        self.assertIn("Suddenly", extracted)

    def test_extract_genius_handles_nested_divs(self):
        html_text = (
            '<div data-lyrics-container="true" class="x">'
            "[Verse 1]<br>"
            'Line one<a href="/a"><span>Line two</span></a><br>'
            '<div data-exclude-from-selection="true">You might also like</div>'
            "Line three<br>"
            "</div>"
        )
        extracted = extract_genius(html_text)
        self.assertIn("Line one", extracted)
        self.assertIn("Line three", extracted)

    def test_strip_genius_chrome_removes_header_with_read_more(self):
        text = (
            "33 ContributorsAmazing Grace Lyrics"
            "Some description about the song. Read More [Verse 1]\n"
            "Amazing Grace, how sweet the sound"
        )
        cleaned = strip_genius_chrome(text)
        self.assertTrue(cleaned.startswith("[Verse 1]"))
        self.assertNotIn("Contributors", cleaned)
        self.assertNotIn("description", cleaned)

    def test_strip_genius_chrome_removes_header_without_description(self):
        text = "10 ContributorsScarborough Fair Lyrics[Both]\nAre you going to Scarborough Fair?"
        cleaned = strip_genius_chrome(text)
        self.assertTrue(cleaned.startswith("[Both]"))

    def test_strip_genius_chrome_removes_embed_footer(self):
        text = "[Verse 1]\nLast line of the song5Embed"
        cleaned = strip_genius_chrome(text)
        self.assertTrue(cleaned.endswith("Last line of the song"))

    def test_genius_song_candidates_filters_bad_matches(self):
        payload = {
            "response": {
                "sections": [
                    {
                        "hits": [
                            {
                                "type": "song",
                                "result": {
                                    "title": "Yesterday",
                                    "primary_artist_names": "The Beatles",
                                    "url": "https://genius.com/The-beatles-yesterday-lyrics",
                                },
                            },
                            {
                                "type": "song",
                                "result": {
                                    "title": "Unrelated",
                                    "primary_artist_names": "Someone Else",
                                    "url": "https://genius.com/Someone-unrelated-lyrics",
                                },
                            },
                        ]
                    }
                ]
            }
        }
        candidates = genius_song_candidates(payload, "Yesterday", "The Beatles")
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["url"], "https://genius.com/The-beatles-yesterday-lyrics")

    def test_is_generic_artist_treats_traditional_as_generic(self):
        self.assertTrue(is_generic_artist("Traditional"))
        self.assertFalse(is_generic_artist("Joan Baez"))

    def test_search_lyrics_with_candidates_returns_multiple_results(self):
        async def run():
            with patch("lyrics_fetch.discover_recording_artists", new=AsyncMock(return_value=["Joan Baez"])), patch(
                "lyrics_fetch._search_lyrics_for_artist",
                new=AsyncMock(side_effect=[
                    {
                        "text": "Get you a copper kettle",
                        "lines": ["Get you a copper kettle"],
                        "stanzas": [["Get you a copper kettle"]],
                        "source": "genius.com",
                        "sourceUrl": "https://genius.com/joan-baez",
                        "title": "Copper Kettle",
                        "artist": "Joan Baez",
                    },
                    {
                        "text": "Title search version",
                        "lines": ["Title search version"],
                        "stanzas": [["Title search version"]],
                        "source": "lyrics.com",
                        "sourceUrl": "https://lyrics.com/title",
                        "title": "Copper Kettle",
                        "artist": "",
                    },
                ]),
            ):
                result = await search_lyrics_with_candidates("Copper Kettle")

            self.assertTrue(result["multiple"])
            self.assertEqual(len(result["candidates"]), 2)
            self.assertFalse(result["candidates"][0]["titleOnly"])
            self.assertTrue(result["candidates"][1]["titleOnly"])

        import asyncio
        asyncio.run(run())

    def test_search_lyrics_emits_progress(self):
        async def run():
            progress = []

            async def on_progress(stage, message, value):
                progress.append({
                    "stage": stage,
                    "message": message,
                    "progress": value,
                })

            with patch("lyrics_fetch._search_lyrics_for_artist", new=AsyncMock(return_value={
                "text": "Yesterday\nAll my troubles seemed so far away",
                "lines": ["Yesterday", "All my troubles seemed so far away"],
                "stanzas": [["Yesterday", "All my troubles seemed so far away"]],
                "source": "lyrics.ovh",
                "sourceUrl": "https://api.lyrics.ovh/v1/The%20Beatles/Yesterday",
                "title": "Yesterday",
                "artist": "The Beatles",
            })):
                result = await search_lyrics("Yesterday", "The Beatles", on_progress=on_progress)

            self.assertEqual(result["source"], "lyrics.ovh")
            self.assertIn("Yesterday", result["text"])
            self.assertTrue(any(item["stage"] == "search" for item in progress))
            self.assertEqual(progress[-1]["stage"], "done")
            self.assertEqual(progress[-1]["progress"], 1.0)

        import asyncio
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
