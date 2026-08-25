import json
import unittest
from html import escape
from unittest.mock import AsyncMock

from chords_fetch import (
    apply_section_label_translations,
    azchords_candidates,
    brave_chord_candidates_from_results,
    build_direct_candidates,
    build_brave_chord_query,
    classify_chord_host,
    collect_section_labels,
    extract_azchords_sheet,
    extract_chord_sheet_meta,
    extract_chordie_sheet,
    extract_chordsbase_sheet,
    extract_cifraclub_sheet,
    extract_echords_sheet,
    extract_sheet_from_html,
    extract_ultimate_guitar_sheet,
    extract_worshiptogether_sheet,
    fetch_chords_url,
    finalize_sheet_lines,
    has_usable_chord_lines,
    is_chord_sheet_line,
    is_scrapable_chord_host,
    parse_duckduckgo_result_urls,
    parse_llm_json_mapping,
    score_title_artist_match,
    TAB_LINE_RE,
    token_is_chord,
    search_duckduckgo_site_candidates,
    section_labels_need_translation,
    slugify,
    strip_azchords_chord_dictionary_preamble,
    translate_cifraclub_section_labels,
    ultimate_guitar_search_candidates_from_html,
)


class ChordsFetchTests(unittest.TestCase):
    def test_score_title_artist_match_prefers_exact(self):
        score = score_title_artist_match("Amazing Grace", "John Newton", "Amazing Grace", "John Newton")
        self.assertGreater(score, 100)

    def test_parse_duckduckgo_result_urls_extracts_uddg_target(self):
        html_text = """
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.azchords.com%2Fj%2Fjohnnewton-tabs-47762%2Famazinggrace-tabs-895397.html&amp;rut=abc">
          Amazing Grace Chords
        </a>
        """
        urls = parse_duckduckgo_result_urls(html_text)
        self.assertEqual(
            urls,
            ["https://www.azchords.com/j/johnnewton-tabs-47762/amazinggrace-tabs-895397.html"],
        )

    def test_azchords_candidates_prefers_matching_artist(self):
        html_text = """
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.azchords.com%2Fv%2Fvarious-tabs-35554%2Famazinggrace-tabs-295369.html&amp;rut=1">Various</a>
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.azchords.com%2Fj%2Fjohnnewton-tabs-47762%2Famazinggrace-tabs-895397.html&amp;rut=2">John Newton</a>
        """
        candidates = azchords_candidates(html_text, "Amazing Grace", "John Newton")
        self.assertEqual(candidates[0]["artist"], "johnnewton")

    def test_build_brave_chord_query_includes_ultimate_guitar(self):
        query = build_brave_chord_query("Who's That Girl", "Eurythmics")
        self.assertIn("tabs.ultimate-guitar.com", query)

    def test_search_duckduckgo_site_candidates_prefers_matching_artist(self):
        import asyncio

        html_text = """
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.azchords.com%2Fe%2Feurythmics-tabs-5089%2Fwhosthatgirl-tabs-395399.html&amp;rut=1">Eurythmics</a>
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.azchords.com%2Fh%2Fhilaryduff-tabs-1811%2Fwhosthatgirl-tabs-470701.html&amp;rut=2">Hilary Duff</a>
        """

        async def run():
            response = unittest.mock.MagicMock()
            response.text = html_text
            response.status_code = 200
            response.url = "https://html.duckduckgo.com/html/"
            response.headers = {}
            response.raise_for_status = unittest.mock.MagicMock()
            client = AsyncMock()
            client.get = AsyncMock(return_value=response)
            return await search_duckduckgo_site_candidates(
                client,
                "Who's That Girl",
                "Eurythmics",
                "azchords.com",
                "azchords.com",
            )

        candidates = asyncio.run(run())
        self.assertGreaterEqual(len(candidates), 2)
        self.assertIn("eurythmics", candidates[0]["url"])

    def test_extract_azchords_sheet_reads_pre_content(self):
        html_text = """
        <div class="span12" id="print">
          <pre id="content">
G C G
Amazing Grace, how sweet the sound
          </pre>
        </div>
        """
        extracted = extract_azchords_sheet(html_text)
        self.assertIn("Amazing Grace, how sweet the sound", extracted)

    def test_extract_worshiptogether_sheet_reads_chord_pro_lines(self):
        html_text = """
        <div class="chord-pro-line">
          <div class="chord-pro-segment">
            <div class="chord-pro-note">&nbsp;</div>
            <div class="chord-pro-lyric">Verse 1</div>
          </div>
        </div>
        <div class="chord-pro-line">
          <div class="chord-pro-segment">
            <div class="chord-pro-note">Eb/G&nbsp;</div>
            <div class="chord-pro-lyric">All my </div>
          </div>
        </div>
        <div class="chord-pro-line">
          <div class="chord-pro-segment">
            <div class="chord-pro-note">| Ab / / Db | Ab / / / |</div>
          </div>
        </div>
        """
        extracted = extract_worshiptogether_sheet(html_text)
        self.assertIn("[Verse 1]", extracted)
        self.assertIn("Eb/G", extracted)
        self.assertIn("All my", extracted)
        self.assertIn("| Ab / / Db | Ab / / / |", extracted)

    def test_finalize_sheet_lines_splits_mixed_lines_and_keeps_headers(self):
        raw_lines = [
            "Capo 1",
            "[Verse 1]",
            "G              C             G",
            "Amazing Grace, how sweet the sound,",
            "G              C             G Amazing Grace, how sweet the sound,",
            "",
            "D           G",
            "That saved a wretch like me",
        ]
        lines = finalize_sheet_lines(raw_lines)
        self.assertEqual(
            lines,
            [
                "[Verse 1]",
                "G C G",
                "Amazing Grace, how sweet the sound,",
                "G C G",
                "Amazing Grace, how sweet the sound,",
                "",
                "D G",
                "That saved a wretch like me",
            ],
        )

    def test_has_usable_chord_lines_rejects_lyrics_only_tab_fragments(self):
        lines = [
            "[Intro]",
            "",
            "|f blood will flow when flesh and",
            "",
            "||steel are one",
            "",
            "Drying in the colour of the evening",
            "sun",
        ]
        self.assertFalse(has_usable_chord_lines(lines))

    def test_dash_style_bass_tab_is_not_treated_as_chords(self):
        raw = [
            "Intro",
            "G-----------------------------------------------------------------------",
            "D-----------------------------------------------------------------------",
            "A-----------------------------------------------------------------------",
            "E---5--5/12--0-----5/12--0----------------------------------------------",
            "",
            "Verse",
            "G---||-----(9)---------(9)---------(9)------------(9)----|",
            "D---||*--------------------------------------------------|",
            "A---||*--7--7--7--7--7--7--7--7--7--7--7--7--7--7--7--7--|",
            "E---||---------------------------------------------------|",
        ]
        self.assertFalse(token_is_chord("G-----------------------------------------------------------------------"))
        self.assertFalse(token_is_chord("E---5--5/12--0-----5/12--0----------------------------------------------"))
        self.assertTrue(TAB_LINE_RE.match("G-----------------------------------------------------------------------"))
        self.assertTrue(TAB_LINE_RE.match("E---5--5/12--0-----5/12--0----------------------------------------------"))
        sheet = finalize_sheet_lines(raw)
        self.assertFalse(has_usable_chord_lines(sheet))

    def test_has_usable_chord_lines_accepts_real_chord_sheet(self):
        lines = [
            "[Intro]",
            "",
            "Em Em7",
            "If blood will flow when flesh",
            "",
            "Am7",
            "and steel are one",
            "",
            "Bm7 Em",
            "Drying in the colour of the evening",
        ]
        self.assertTrue(is_chord_sheet_line("Em Em7"))
        self.assertTrue(has_usable_chord_lines(lines))

    def test_strip_azchords_chord_dictionary_preamble_starts_at_first_section(self):
        lines = [
            "Dm Gm7 A7aug",
            "",
            "CHORDS",
            "",
            "E-A-D-G-B-e",
            "Dsus4",
            "x-x-0-2-3-3",
            "",
            "[Intro 1]",
            "| Dsus4 | | | |",
            "G/D Am/D G5/D",
        ]
        self.assertEqual(
            strip_azchords_chord_dictionary_preamble(lines),
            ["[Intro 1]", "| Dsus4 | | | |", "G/D Am/D G5/D"],
        )


    def test_slugify_normalizes_punctuation_and_accents(self):
        self.assertEqual(slugify("Sweet Child O' Mine"), "sweet-child-o-mine")
        self.assertEqual(slugify("Black Sabbath"), "black-sabbath")
        self.assertEqual(slugify("Café del Mar"), "cafe-del-mar")

    def test_build_direct_candidates_builds_slug_urls(self):
        candidates = build_direct_candidates("Iron Man", "Black Sabbath")
        urls = [candidate["url"] for candidate in candidates]
        self.assertIn("https://www.e-chords.com/chords/black-sabbath/iron-man", urls)
        self.assertIn("https://www.cifraclub.com/black-sabbath/iron-man/", urls)
        self.assertEqual(candidates[0]["source"], "e-chords.com")

    def test_build_direct_candidates_requires_title_and_artist(self):
        self.assertEqual(build_direct_candidates("Iron Man", ""), [])
        self.assertEqual(build_direct_candidates("", "Black Sabbath"), [])

    def test_build_brave_chord_query_limits_to_supported_hosts(self):
        query = build_brave_chord_query("Iron Man", "Black Sabbath")
        self.assertIn('"Iron Man"', query)
        self.assertIn('"Black Sabbath"', query)
        self.assertIn("site:e-chords.com", query)
        self.assertIn("site:cifraclub.com", query)
        self.assertIn("site:azchords.com", query)
        self.assertIn("site:chordsbase.com", query)
        self.assertIn("site:chordie.com", query)
        self.assertIn("site:guitartabs.cc", query)
        self.assertIn("site:tabs.ultimate-guitar.com", query)

    def test_classify_chord_host_manual_vs_scrapable(self):
        self.assertEqual(classify_chord_host("tabs.ultimate-guitar.com"), "scrapable")
        self.assertEqual(classify_chord_host("www.ultimate-guitar.com"), "scrapable")
        self.assertEqual(classify_chord_host("www.e-chords.com"), "scrapable")
        self.assertEqual(classify_chord_host("chordie.com"), "scrapable")
        self.assertTrue(is_scrapable_chord_host("chordsbase.com"))
        self.assertTrue(is_scrapable_chord_host("tabs.ultimate-guitar.com"))
        self.assertEqual(classify_chord_host("example.com"), "unknown")

    def test_extract_chordsbase_sheet_reads_first_pre(self):
        html_text = """
        <html><body>
          <pre>
Capo 2
Key: G
Tuning: EADGBE
G C G
Amazing Grace, how sweet the sound
          </pre>
        </body></html>
        """
        extracted = extract_chordsbase_sheet(html_text)
        self.assertIn("Amazing Grace, how sweet the sound", extracted)
        self.assertIn("Capo 2", extracted)
        via_router = extract_sheet_from_html(
            html_text,
            "https://www.chordsbase.com/chords/amazing-grace",
        )
        self.assertEqual(extracted, via_router)

    def test_extract_chordie_sheet_reads_first_pre(self):
        html_text = "<pre>Am F\nHello darkness my old friend</pre>"
        extracted = extract_chordie_sheet(html_text)
        self.assertIn("Am F", extracted)
        self.assertIn("Hello darkness my old friend", extracted)

    def test_extract_chord_sheet_meta_captures_capo_key_tuning(self):
        raw_lines = [
            "Capo 2",
            "Key: G",
            "Tuning: E A D G B E",
            "[Verse 1]",
            "G C G",
            "Amazing Grace, how sweet the sound",
        ]
        meta = extract_chord_sheet_meta(raw_lines)
        self.assertEqual(meta["capo"], 2)
        self.assertEqual(meta["key"], "G")
        self.assertEqual(meta["tuning"], "E A D G B E")
        lines = finalize_sheet_lines(raw_lines)
        self.assertNotIn("Capo 2", lines)
        self.assertNotIn("Key: G", lines)
        self.assertNotIn("Tuning: E A D G B E", lines)
        self.assertIn("[Verse 1]", lines)
        self.assertIn("G C G", lines)

    def test_brave_chord_candidates_from_results_keeps_supported_hosts(self):
        data = {
            "web": {
                "results": [
                    {
                        "title": "Iron Man Chords - Black Sabbath",
                        "url": "https://www.e-chords.com/chords/black-sabbath/iron-man",
                        "description": "Black Sabbath guitar chords",
                    },
                    {
                        "title": "Iron Man Chords UG",
                        "url": "https://tabs.ultimate-guitar.com/tab/black-sabbath/iron-man-chords-123",
                        "description": "Ultimate Guitar chords",
                    },
                    {
                        "title": "Iron Man on Chordie",
                        "url": "https://www.chordie.com/chord.pere/www.chordie.com/iron-man",
                        "description": "Chordie chords",
                    },
                    {
                        "title": "Iron Man lyrics",
                        "url": "https://example.com/iron-man",
                        "description": "Unsupported host",
                    },
                ]
            }
        }
        candidates = brave_chord_candidates_from_results(data, "Iron Man", "Black Sabbath")
        sources = {candidate["source"] for candidate in candidates}
        self.assertIn("e-chords.com", sources)
        self.assertIn("tabs.ultimate-guitar.com", sources)
        self.assertIn("chordie.com", sources)
        self.assertEqual(len(candidates), 3)

    def test_extract_echords_sheet_keeps_chord_span_text(self):
        html_text = (
            "<pre>Iron Man \r\r"
            '<span data-chord="G5">G5</span> <span data-chord="A#5">A#5</span>\r'
            "Has he lost his mind?\r</pre>"
        )
        sheet = extract_echords_sheet(html_text)
        lines = finalize_sheet_lines(sheet.splitlines())
        self.assertIn("G5 A#5", lines)
        self.assertIn("Has he lost his mind?", lines)

    def test_extract_cifraclub_sheet_keeps_chords_and_drops_tab_lines(self):
        html_text = (
            "<pre><div>[Intro]\n</div>"
            '<div class="tabs"><span class="tab">E|--------\nB|--------\n</span></div>\n'
            '<b data-chord-name="B5">B5</b> I am Iron Man\n</pre>'
        )
        sheet = extract_cifraclub_sheet(html_text)
        lines = finalize_sheet_lines(sheet.splitlines())
        self.assertIn("[Intro]", lines)
        self.assertIn("B5", lines)
        self.assertIn("I am Iron Man", lines)
        self.assertFalse(any(line.startswith("E|") for line in lines))

    def test_collect_section_labels_returns_unique_headers(self):
        lines = ["[Intro]", "", "[Primera Parte]", "[Intro]", "Has he lost his mind?"]
        self.assertEqual(collect_section_labels(lines), ["[Intro]", "[Primera Parte]"])

    def test_section_labels_need_translation_detects_portuguese(self):
        self.assertTrue(section_labels_need_translation(["[Intro]", "[Primera Parte]"]))
        self.assertFalse(section_labels_need_translation(["[Intro]", "[Verse 1]", "[Riff 1]"]))

    def test_parse_llm_json_mapping_reads_fenced_json(self):
        mapping = parse_llm_json_mapping(
            '```json\n{"[Primera Parte]": "[First Part]"}\n```',
            ["[Primera Parte]"],
        )
        self.assertEqual(mapping, {"[Primera Parte]": "[First Part]"})

    def test_parse_llm_json_mapping_reads_reasoning_content(self):
        mapping = parse_llm_json_mapping(
            {
                "content": "",
                "reasoning_content": (
                    '```json\n{"[Primera Parte]": "[First Part]"}\n```'
                ),
            },
            ["[Primera Parte]"],
        )
        self.assertEqual(mapping, {"[Primera Parte]": "[First Part]"})

    def test_apply_section_label_translations_replaces_headers_only(self):
        lines = ["[Intro]", "", "[Primera Parte]", "Has he lost his mind?"]
        translated = apply_section_label_translations(
            lines,
            {"[Primera Parte]": "[First Part]"},
        )
        self.assertEqual(
            translated,
            ["[Intro]", "", "[First Part]", "Has he lost his mind?"],
        )

    def _ug_fixture_html(self, content, *, tab_type="Chords", capo=2, tonality="F#m"):
        payload = {
            "store": {
                "page": {
                    "data": {
                        "tab": {
                            "song_name": "Wonderwall",
                            "artist_name": "Oasis",
                            "type": tab_type,
                            "tonality_name": tonality,
                        },
                        "tab_view": {
                            "wiki_tab": {"content": content},
                            "meta": {
                                "capo": capo,
                                "tuning": {
                                    "name": "Standard",
                                    "value": "E A D G B E",
                                    "index": 1,
                                },
                                "tonality": tonality,
                            },
                        },
                    }
                }
            }
        }
        encoded = escape(json.dumps(payload), quote=True)
        return (
            '<html><body><div class="js-store" data-content="{0}"></div></body></html>'
            .format(encoded)
        )

    def test_extract_ultimate_guitar_sheet_strips_ch_and_tab_tags(self):
        html_text = self._ug_fixture_html(
            "[Intro]\r\n[ch]Em[/ch]   [ch]G[/ch]\r\n\r\n"
            "[Verse 1]\r\n[tab][ch]Em[/ch]       [ch]G[/ch]\r\n"
            "Today is gonna be the day[/tab]\r\n"
        )
        extracted = extract_ultimate_guitar_sheet(html_text)
        self.assertIsNotNone(extracted)
        self.assertNotIn("[ch]", extracted)
        self.assertNotIn("[/ch]", extracted)
        self.assertNotIn("[tab]", extracted)
        self.assertNotIn("[/tab]", extracted)
        self.assertIn("[Verse 1]", extracted)
        self.assertIn("Em", extracted)
        self.assertIn("Today is gonna be the day", extracted)
        self.assertIn("Capo 2", extracted)
        self.assertIn("Key: F#m", extracted)
        self.assertIn("Tuning: E A D G B E", extracted)

        via_router = extract_sheet_from_html(
            html_text,
            "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596",
        )
        self.assertEqual(extracted, via_router)

        meta = extract_chord_sheet_meta(extracted.splitlines())
        self.assertEqual(meta["capo"], 2)
        self.assertEqual(meta["key"], "F#m")
        self.assertEqual(meta["tuning"], "E A D G B E")
        lines = finalize_sheet_lines(extracted.splitlines())
        self.assertIn("[Verse 1]", lines)
        self.assertIn("Em G", lines)
        self.assertIn("Today is gonna be the day", lines)
        self.assertTrue(has_usable_chord_lines(lines))
        self.assertNotIn("Capo 2", lines)

    def test_extract_ultimate_guitar_sheet_rejects_non_chords_type(self):
        html_text = self._ug_fixture_html(
            "[ch]Em[/ch] Today",
            tab_type="Guitar Pro",
        )
        self.assertIsNone(extract_ultimate_guitar_sheet(html_text))

    def test_ultimate_guitar_search_html_prefers_high_vote_chords(self):
        import json
        from html import escape

        payload = {
            "store": {
                "page": {
                    "data": {
                        "results": [
                            {
                                "type": "Tabs",
                                "tab_url": "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-tabs-5200",
                                "song_name": "Wonderwall",
                                "artist_name": "Oasis",
                                "votes": 99999,
                                "rating": 5,
                            },
                            {
                                "type": "Chords",
                                "tab_url": "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-39144",
                                "song_name": "Wonderwall",
                                "artist_name": "Oasis",
                                "votes": 100,
                                "rating": 4.5,
                            },
                            {
                                "type": "Chords",
                                "tab_url": "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596",
                                "song_name": "Wonderwall",
                                "artist_name": "Oasis",
                                "votes": 11086,
                                "rating": 4.8,
                            },
                        ]
                    }
                }
            }
        }
        html_text = '<div class="js-store" data-content="{0}"></div>'.format(
            escape(json.dumps(payload))
        )
        candidates = ultimate_guitar_search_candidates_from_html(
            html_text, "Wonderwall", "Oasis"
        )
        self.assertEqual(len(candidates), 2)
        self.assertIn("wonderwall-chords-27596", candidates[0]["url"])
        self.assertTrue(all("-chords-" in item["url"] for item in candidates))

    def test_brave_prefers_ug_chords_url_over_tabs(self):
        data = {
            "web": {
                "results": [
                    {
                        "title": "Wonderwall Tabs",
                        "url": "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-tabs-5200",
                        "description": "Oasis guitar tab",
                    },
                    {
                        "title": "Wonderwall Chords",
                        "url": "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596",
                        "description": "Oasis chords",
                    },
                ]
            }
        }
        candidates = brave_chord_candidates_from_results(data, "Wonderwall", "Oasis")
        self.assertEqual(len(candidates), 2)
        self.assertIn("-chords-", candidates[0]["url"])

    def test_brave_ranks_ultimate_guitar_above_other_hosts(self):
        data = {
            "web": {
                "results": [
                    {
                        "title": "I Will Chords - The Beatles",
                        "url": "https://www.e-chords.com/chords/the-beatles/i-will",
                        "description": "Beatles guitar chords",
                    },
                    {
                        "title": "I Will Chords UG",
                        "url": "https://tabs.ultimate-guitar.com/tab/the-beatles/i-will-chords-123",
                        "description": "Ultimate Guitar chords",
                    },
                ]
            }
        }
        candidates = brave_chord_candidates_from_results(data, "I Will", "The Beatles")
        self.assertEqual(candidates[0]["source"], "tabs.ultimate-guitar.com")
        self.assertGreater(candidates[0]["score"], candidates[1]["score"])

    def test_build_brave_chord_query_can_target_ultimate_guitar_only(self):
        query = build_brave_chord_query("I Will", "The Beatles", site_host="tabs.ultimate-guitar.com")
        self.assertIn("site:tabs.ultimate-guitar.com", query)
        self.assertNotIn("e-chords.com", query)


class ChordsFetchAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_fetch_chords_url_uses_prefetched_page_html(self):
        html_text = ChordsFetchTests()._ug_fixture_html(
            "[Intro]\r\n[ch]Em[/ch]   [ch]G[/ch]\r\n\r\n"
            "[Verse 1]\r\n[tab][ch]Em[/ch]       [ch]G[/ch]\r\n"
            "Today is gonna be the day[/tab]\r\n"
        )
        result = await fetch_chords_url(
            "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596",
            page_html=html_text,
        )
        self.assertEqual(result["source"], "tabs.ultimate-guitar.com")
        self.assertIn("Today is gonna be the day", result["sheetLines"])
        self.assertTrue(any("Em" in line and "G" in line for line in result["sheetLines"]))

    async def test_translate_cifraclub_section_labels_uses_llm_mapping(self):
        sheet_lines = ["[Intro]", "[Primera Parte]", "Has he lost his mind?"]
        mock_response = unittest.mock.MagicMock()
        mock_response.raise_for_status = unittest.mock.MagicMock()
        mock_response.json.return_value = {
            "choices": [{
                "message": {
                    "content": '{"[Primera Parte]": "[First Part]"}',
                },
            }],
        }
        client = AsyncMock()
        client.post = AsyncMock(return_value=mock_response)

        translated = await translate_cifraclub_section_labels(client, sheet_lines)
        self.assertEqual(translated[1], "[First Part]")
        client.post.assert_awaited()


if __name__ == "__main__":
    unittest.main()
