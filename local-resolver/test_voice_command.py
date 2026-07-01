import unittest

from voice_command import (
    apply_catalog_matches,
    match_catalog_name,
    normalize_voice_intent_from_llm,
    parse_catalog_json,
    parse_llm_voice_json,
    parse_voice_intent_regex,
)


class VoiceCommandTests(unittest.TestCase):
    def test_show_prefix_regex(self):
        intent, confidence = parse_voice_intent_regex("show down by the sally gardens")
        self.assertEqual(intent["tool"], "SHOW")
        self.assertEqual(intent["title"], "down by the sally gardens")
        self.assertGreaterEqual(confidence, 0.9)

    def test_open_tool_suffix_regex(self):
        intent, confidence = parse_voice_intent_regex("open metronome tool")
        self.assertEqual(intent["tool"], "OPEN_TOOL")
        self.assertEqual(intent["title"], "metronome")
        self.assertGreaterEqual(confidence, 0.9)

        intent, confidence = parse_voice_intent_regex("open tuner tool")
        self.assertEqual(intent["tool"], "OPEN_TOOL")
        self.assertEqual(intent["title"], "tuner")

        intent, confidence = parse_voice_intent_regex("open keyboard tool")
        self.assertEqual(intent["tool"], "OPEN_TOOL")
        self.assertEqual(intent["title"], "keyboard")

    def test_open_without_tool_suffix_is_show(self):
        intent, confidence = parse_voice_intent_regex("open wild rover")
        self.assertEqual(intent["tool"], "SHOW")
        self.assertEqual(intent["title"], "wild rover")

    def test_bare_title_regex(self):
        intent, confidence = parse_voice_intent_regex("wild rover")
        self.assertEqual(intent["tool"], "SHOW")
        self.assertEqual(intent["title"], "wild rover")
        self.assertGreaterEqual(confidence, 0.7)

    def test_punctuation_only_not_bare_title(self):
        intent, confidence = parse_voice_intent_regex("...")
        self.assertIsNone(intent)
        self.assertEqual(confidence, 0.0)

    def test_search_prefix_returns_no_immediate_intent(self):
        intent, confidence = parse_voice_intent_regex("search jigs in steve's book")
        self.assertIsNone(intent)
        self.assertGreater(confidence, 0)

    def test_match_catalog_name_exact(self):
        catalog = ["Steve's Songbook", "Session Tunes"]
        self.assertEqual(match_catalog_name("session tunes", catalog), "Session Tunes")

    def test_match_catalog_name_substring(self):
        catalog = ["Steve's Songbook"]
        self.assertEqual(match_catalog_name("steve", catalog), "Steve's Songbook")

    def test_apply_catalog_matches(self):
        intent = {
            "book": "steve's songbook",
            "tags": ["session"],
        }
        books = ["Steve's Songbook"]
        tags = ["session", "jig"]
        updated = apply_catalog_matches(intent, books, tags)
        self.assertEqual(updated["book"], "Steve's Songbook")
        self.assertEqual(updated["tags"], ["session"])

    def test_parse_llm_voice_json_fenced(self):
        data = parse_llm_voice_json({
            "content": '```json\n{"tool":"SEARCH","book":"Steve\'s Songbook","tags":["session"],"searchText":"jigs","confidence":0.9}\n```'
        })
        self.assertEqual(data["tool"], "SEARCH")
        self.assertEqual(data["book"], "Steve's Songbook")

    def test_normalize_voice_intent_from_llm(self):
        intent = normalize_voice_intent_from_llm({
            "tool": "show",
            "title": "Sally Gardens",
            "confidence": 0.88,
        }, "show sally gardens")
        self.assertEqual(intent["tool"], "SHOW")
        self.assertEqual(intent["title"], "Sally Gardens")
        self.assertEqual(intent["parseMethod"], "llm")

    def test_parse_catalog_json(self):
        books = parse_catalog_json('["A Book", "B Book"]', "books")
        self.assertEqual(books, ["A Book", "B Book"])

    def test_parse_catalog_json_invalid(self):
        with self.assertRaises(ValueError):
            parse_catalog_json('{"not":"array"}', "books")


if __name__ == "__main__":
    unittest.main()
