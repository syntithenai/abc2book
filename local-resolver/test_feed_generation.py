import unittest

from feed_generation import (
    answer_grounded,
    fact_corpus,
    _heuristic_quizzes,
    generate_feed_quizzes,
    looks_like_new_release_claim,
    reject_ungrounded_new_release,
    is_thin_name_list_body,
    is_low_value_ai_article,
    is_usable_article_body,
)
import asyncio


class FeedGenerationTests(unittest.TestCase):
    def test_answer_grounded_normalizes(self):
        corpus = "Written by  The Dubliners  in Ireland."
        self.assertTrue(answer_grounded("the dubliners", corpus))
        self.assertFalse(answer_grounded("1999", corpus))

    def test_fact_corpus_includes_years(self):
        text = fact_corpus(
            [{"objectText": "Popularized early", "objectYear": 1963}],
            "Extra background",
        )
        self.assertIn("1963", text)
        self.assertIn("Extra background", text)

    def test_heuristic_quizzes_from_written_by(self):
        items = _heuristic_quizzes(
            "Wild Rover",
            "The Dubliners",
            [{"predicate": "written_by", "objectText": "The Dubliners"}],
        )
        self.assertTrue(items)
        correct = [c for c in items[0]["choices"] if c.get("correct")]
        self.assertEqual(len(correct), 1)
        self.assertEqual(correct[0]["text"], "The Dubliners")

    def test_generate_quizzes_rejects_empty_corpus(self):
        result = asyncio.run(
            generate_feed_quizzes("X", "Y", facts=[], background_info="")
        )
        self.assertEqual(result["items"], [])

    def test_rejects_invented_new_release_headlines(self):
        corpus = "Copper Kettle was written by Albert Frank Beddoe and recorded by Joan Baez in the 1960s."
        self.assertTrue(looks_like_new_release_claim('Albert Frank Beddoe Releases New Song "Copper Kettle"'))
        self.assertTrue(
            reject_ungrounded_new_release(
                'Albert Frank Beddoe Releases New Song "Copper Kettle"',
                "Beddoe has released a brand-new track.",
                corpus,
            )
        )
        # Allowed when notes already describe a new release
        self.assertFalse(
            reject_ungrounded_new_release(
                "Artist Releases New Song",
                "Details from notes.",
                "The band just released a new song last week.",
            )
        )

    def test_rejects_name_only_artist_lists(self):
        thin = "Albert Frank Beddoe\nNora Brown\nJoan Baez"
        self.assertTrue(is_thin_name_list_body(thin))
        self.assertFalse(
            is_usable_article_body("Notes on Copper Kettle", thin)
        )
        rich = (
            "Copper Kettle was written by Albert Frank Beddoe. "
            "Joan Baez recorded a well-known version in the 1960s folk revival."
        )
        self.assertFalse(is_thin_name_list_body(rich))
        self.assertTrue(is_usable_article_body("Copper Kettle", rich))

    def test_rejects_low_value_musescore_fluff(self):
        self.assertTrue(
            is_low_value_ai_article(
                "Mélisande’s transcription on Musescore",
                "A transcription has been uploaded to Musescore for download.",
            )
        )
        self.assertFalse(
            is_usable_article_body(
                "Mélisande’s transcription on Musescore",
                "A transcription has been uploaded to Musescore for download.",
            )
        )


if __name__ == "__main__":
    unittest.main()
