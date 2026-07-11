import unittest
from unittest.mock import AsyncMock, patch

from lyrics_fetch import (
    build_letras_url,
    extract_azlyrics,
    extract_genius,
    extract_letras,
    extract_lyrics_from_html,
    extract_lyricsmode,
    extract_metrolyrics,
    extract_musixmatch,
    extract_songlyrics,
    finalize_lyrics_lines,
    genius_song_candidates,
    parse_plain_lyrics_text,
    score_title_artist_match,
    search_lyrics,
    search_lyrics_with_candidates,
    slugify_hyphen_path,
    slugify_lyrics_path,
    strip_genius_chrome,
    strip_lrc_tags,
)
from recording_artists import is_generic_artist


class LyricsFetchTests(unittest.TestCase):
    def test_slugify_lyrics_path(self):
        self.assertEqual(slugify_lyrics_path("The Beatles"), "thebeatles")
        self.assertEqual(slugify_lyrics_path("Yesterday!"), "yesterday")

    def test_slugify_hyphen_path_and_letras_url(self):
        self.assertEqual(slugify_hyphen_path("The Beatles"), "the-beatles")
        self.assertEqual(
            build_letras_url("The Beatles", "Yesterday"),
            "https://www.letras.mus.br/the-beatles/yesterday/",
        )

    def test_strip_lrc_tags(self):
        text = "[00:12.34] Line one\n[01:02.00] Line two"
        cleaned = strip_lrc_tags(text)
        self.assertIn("Line one", cleaned)
        self.assertIn("Line two", cleaned)
        self.assertNotIn("[00:12.34]", cleaned)
        self.assertNotIn("[01:02.00]", cleaned)

    def test_fetch_lrclib_uses_plain_lyrics(self):
        async def run():
            from lyrics_fetch import fetch_lrclib

            class FakeResponse:
                status_code = 200

                def raise_for_status(self):
                    return None

                def json(self):
                    return [
                        {
                            "trackName": "Yesterday",
                            "artistName": "The Beatles",
                            "plainLyrics": "Yesterday\nAll my troubles seemed so far away",
                            "instrumental": False,
                        }
                    ]

            client = AsyncMock()
            client.get = AsyncMock(return_value=FakeResponse())
            result = await fetch_lrclib(client, "The Beatles", "Yesterday")
            self.assertEqual(result["source"], "lrclib.net")
            self.assertIn("Yesterday", result["text"])
            headers = client.get.await_args.kwargs.get("headers") or {}
            self.assertIn("ABC2BookResolver/1.0", headers.get("User-Agent", ""))

        import asyncio
        asyncio.run(run())

    def test_search_lyrics_returns_manual_candidates_when_empty(self):
        async def run():
            with patch(
                "lyrics_fetch._search_lyrics_for_artist",
                new=AsyncMock(
                    return_value=(
                        None,
                        [
                            {
                                "url": "https://example.com/song",
                                "title": "Yesterday",
                                "artist": "The Beatles",
                                "source": "example.com",
                                "host": "example.com",
                                "reason": "challenge",
                                "contentType": "lyrics",
                            }
                        ],
                    )
                ),
            ):
                result = await search_lyrics("Yesterday", "The Beatles")
            self.assertTrue(result["empty"])
            self.assertFalse(result["found"])
            self.assertEqual(len(result["manualCandidates"]), 1)

        import asyncio
        asyncio.run(run())

    def test_extract_songlyrics(self):
        html_text = (
            '<p id="songLyricsDiv" class="songLyricsV14">'
            "Yesterday all my troubles<br>"
            "Seemed so far away<br>"
            "</p>"
        )
        extracted = extract_songlyrics(html_text)
        self.assertIn("Yesterday all my troubles", extracted)
        self.assertIn("Seemed so far away", extracted)

    def test_extract_metrolyrics(self):
        html_text = (
            '<div id="lyrics-body-text" class="js-lyric-text">'
            "<p>Line one</p><p>Line two</p>"
            "</div>"
        )
        extracted = extract_metrolyrics(html_text)
        self.assertIn("Line one", extracted)
        self.assertIn("Line two", extracted)

    def test_extract_musixmatch(self):
        html_text = (
            '<span class="lyrics__content__ok">'
            "First verse line<br>"
            "Second verse line<br>"
            "</span>"
        )
        extracted = extract_musixmatch(html_text)
        self.assertIn("First verse line", extracted)
        self.assertIn("Second verse line", extracted)

    def test_extract_letras(self):
        html_text = (
            '<div class="lyric-original">'
            "<p>Ontem todas as minhas<br>preocupações</p>"
            "</div>"
        )
        extracted = extract_letras(html_text)
        self.assertIn("Ontem todas as minhas", extracted)
        self.assertIn("preocupações", extracted)

    def test_extract_lyricsmode(self):
        html_text = (
            '<p id="lyrics_text" class="ui-annotatable">'
            "Hello darkness my old friend<br>"
            "I've come to talk with you again<br>"
            "</p>"
        )
        extracted = extract_lyricsmode(html_text)
        self.assertIn("Hello darkness", extracted)
        self.assertIn("talk with you again", extracted)

    def test_extract_lyrics_from_html_dispatches_new_hosts(self):
        letras_html = '<div class="cnt-letra"><p>Letras body<br></p></div>'
        self.assertIn(
            "Letras body",
            extract_lyrics_from_html(letras_html, "https://www.letras.mus.br/a/b/"),
        )
        # Prefer songlyrics-specific markup over a bare lyrics.com-only path.
        songlyrics_html = '<p id="songLyricsDiv">Songlyrics body<br></p>'
        self.assertIn(
            "Songlyrics body",
            extract_lyrics_from_html(songlyrics_html, "https://www.songlyrics.com/a/b/"),
        )
        metro_html = '<div id="lyrics-body-text"><p>Metro body</p></div>'
        self.assertIn(
            "Metro body",
            extract_lyrics_from_html(metro_html, "https://www.metrolyrics.com/a.html"),
        )

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
                    (
                        {
                            "text": "Get you a copper kettle",
                            "lines": ["Get you a copper kettle"],
                            "stanzas": [["Get you a copper kettle"]],
                            "source": "genius.com",
                            "sourceUrl": "https://genius.com/joan-baez",
                            "title": "Copper Kettle",
                            "artist": "Joan Baez",
                        },
                        [],
                    ),
                    (
                        {
                            "text": "Title search version",
                            "lines": ["Title search version"],
                            "stanzas": [["Title search version"]],
                            "source": "lyrics.com",
                            "sourceUrl": "https://lyrics.com/title",
                            "title": "Copper Kettle",
                            "artist": "",
                        },
                        [],
                    ),
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

            with patch("lyrics_fetch._search_lyrics_for_artist", new=AsyncMock(return_value=(
                {
                    "text": "Yesterday\nAll my troubles seemed so far away",
                    "lines": ["Yesterday", "All my troubles seemed so far away"],
                    "stanzas": [["Yesterday", "All my troubles seemed so far away"]],
                    "source": "lyrics.ovh",
                    "sourceUrl": "https://api.lyrics.ovh/v1/The%20Beatles/Yesterday",
                    "title": "Yesterday",
                    "artist": "The Beatles",
                },
                [],
            ))):
                result = await search_lyrics("Yesterday", "The Beatles", on_progress=on_progress)

            self.assertEqual(result["source"], "lyrics.ovh")
            self.assertIn("Yesterday", result["text"])
            self.assertTrue(any(item["stage"] == "apis" for item in progress))
            self.assertEqual(progress[-1]["stage"], "done")
            self.assertEqual(progress[-1]["progress"], 1.0)

        import asyncio
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
