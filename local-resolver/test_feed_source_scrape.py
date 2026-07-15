import unittest

from feed_source_scrape import extract_og_description, facts_from_meta


class FeedSourceScrapeTests(unittest.TestCase):
    def test_extract_og_description(self):
        html = '<html><head><meta property="og:description" content="A folk classic about roaming." /></head></html>'
        self.assertEqual(extract_og_description(html), "A folk classic about roaming.")

    def test_facts_from_meta_skips_short(self):
        self.assertEqual(facts_from_meta("short", "musixmatch", "http://x"), [])

    def test_facts_bio_not_lyrics_predicate(self):
        facts = facts_from_meta(
            "Irish folk band known for singalong choruses and pub sessions.",
            "musixmatch",
            "https://www.musixmatch.com/artist/x",
        )
        self.assertEqual(len(facts), 1)
        self.assertEqual(facts[0]["predicate"], "bio_snippet")
        self.assertEqual(facts[0]["source"], "musixmatch")
        self.assertNotEqual(facts[0]["predicate"], "lyrics")


if __name__ == "__main__":
    unittest.main()
