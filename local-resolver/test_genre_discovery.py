import unittest

from genre_discovery import (
    extract_genres_from_text,
    genre_from_rhythm,
    normalize_genre_label,
    _parse_llm_genres,
    _format_result,
    _canonical_lookup,
)


class GenreDiscoveryHelpersTest(unittest.TestCase):
    def test_normalize_genre_label(self):
        self.assertEqual(normalize_genre_label("irish traditional"), "Irish Traditional")
        self.assertEqual(normalize_genre_label("R&B"), "R&B")
        self.assertEqual(normalize_genre_label("not-a-genre"), "")

    def test_extract_prefers_specific_phrase(self):
        genres = extract_genres_from_text(
            "A progressive bluegrass recording with bluegrass banjo"
        )
        self.assertEqual(genres[0], "Progressive Bluegrass")
        self.assertIn("Bluegrass", genres)

    def test_genre_from_rhythm(self):
        self.assertEqual(genre_from_rhythm("jig"), "Irish Traditional")
        self.assertEqual(genre_from_rhythm("strathspey"), "Scottish Traditional")
        self.assertEqual(genre_from_rhythm(""), "")

    def test_parse_llm_json(self):
        lookup = _canonical_lookup()
        parsed = _parse_llm_genres(
            '{"genres":[{"genre":"Folk","reason":"trad song"},{"genre":"Sea Shanty"}]}',
            lookup,
        )
        self.assertEqual(
            [entry["genre"] for entry in parsed],
            ["Folk", "Sea Shanty"],
        )

    def test_format_result_empty(self):
        body = _format_result([])
        self.assertTrue(body["empty"])
        self.assertEqual(body["candidates"], [])

    def test_format_result_single(self):
        body = _format_result([{"genre": "Jazz", "source": "LLM", "reason": "swing"}])
        self.assertFalse(body["multiple"])
        self.assertEqual(body["genre"], "Jazz")

    def test_format_result_multiple(self):
        body = _format_result([
            {"genre": "Jazz"},
            {"genre": "Swing"},
            {"genre": "jazz"},
        ])
        self.assertTrue(body["multiple"])
        self.assertEqual(
            [c["genre"] for c in body["candidates"]],
            ["Jazz", "Swing"],
        )


if __name__ == "__main__":
    unittest.main()
