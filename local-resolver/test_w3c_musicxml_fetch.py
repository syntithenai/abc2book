import unittest

from w3c_musicxml_fetch import (
    annotate_w3c_candidate,
    is_w3c_musicxml_url,
    match_w3c_index_entries,
)


class W3cMusicXmlFetchTests(unittest.TestCase):
    def test_index_match(self):
        entries = match_w3c_index_entries("Ode to Joy", "Beethoven")
        self.assertTrue(entries)
        self.assertEqual(entries[0]["title"], "Ode to Joy")

    def test_w3c_url_detection(self):
        self.assertTrue(is_w3c_musicxml_url(
            "https://www.musicxml.com/wp-content/uploads/2017/12/ode-to-joy.musicxml"
        ))

    def test_annotate_w3c_candidate(self):
        candidate = annotate_w3c_candidate("<score-partwise/>", title="Example", artist="Composer")
        self.assertEqual(candidate["source"], "musicxml.com")
        self.assertEqual(candidate["tuneMeta"]["meta"]["archive"], "w3c")


if __name__ == "__main__":
    unittest.main()
