import unittest

from feed_generation import answer_grounded, fact_corpus, _heuristic_quizzes, generate_feed_quizzes
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


if __name__ == "__main__":
    unittest.main()
