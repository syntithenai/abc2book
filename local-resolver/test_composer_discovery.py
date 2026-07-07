import unittest

from composer_discovery import parse_title_composer_hint


class ComposerDiscoveryTests(unittest.TestCase):
    def test_parse_title_composer_hint_keeps_explicit_artist(self):
        parsed = parse_title_composer_hint("Wonderwall", "Wonderwall", "Oasis")
        self.assertEqual(parsed["title"], "Wonderwall")
        self.assertEqual(parsed["artist_hint"], "Oasis")

    def test_parse_title_composer_hint_splits_title_hint(self):
        parsed = parse_title_composer_hint("", "Oasis - Wonderwall", "")
        self.assertEqual(parsed["title"], "Wonderwall")
        self.assertEqual(parsed["artist_hint"], "Oasis")
        self.assertEqual(parsed["title_hint"], "Oasis - Wonderwall")

    def test_parse_title_composer_hint_splits_title_field(self):
        parsed = parse_title_composer_hint("Beatles - Yesterday", "", "")
        self.assertEqual(parsed["title"], "Yesterday")
        self.assertEqual(parsed["artist_hint"], "Beatles")


if __name__ == "__main__":
    unittest.main()
