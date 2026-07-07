import unittest
from unittest.mock import AsyncMock

from chords_fetch import (
    apply_section_label_translations,
    azchords_candidates,
    brave_chord_candidates_from_results,
    build_direct_candidates,
    build_brave_chord_query,
    collect_section_labels,
    extract_azchords_sheet,
    extract_cifraclub_sheet,
    extract_echords_sheet,
    extract_worshiptogether_sheet,
    finalize_sheet_lines,
    has_usable_chord_lines,
    is_chord_sheet_line,
    parse_duckduckgo_result_urls,
    parse_llm_json_mapping,
    score_title_artist_match,
    section_labels_need_translation,
    slugify,
    strip_azchords_chord_dictionary_preamble,
    translate_cifraclub_section_labels,
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
                        "title": "Iron Man lyrics",
                        "url": "https://example.com/iron-man",
                        "description": "Unsupported host",
                    },
                ]
            }
        }
        candidates = brave_chord_candidates_from_results(data, "Iron Man", "Black Sabbath")
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["source"], "e-chords.com")
        self.assertEqual(
            candidates[0]["url"],
            "https://www.e-chords.com/chords/black-sabbath/iron-man",
        )

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


class ChordsFetchAsyncTests(unittest.IsolatedAsyncioTestCase):
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
