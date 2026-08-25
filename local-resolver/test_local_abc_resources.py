"""Tests for local abcresources title search."""

import unittest

from local_abc_resources import (
    load_abc_for_tune_id,
    load_contour_index,
    local_abc_resources_enabled,
    search_local_abc_by_contour,
    search_local_collection_titles,
    tokenize_local_search_query,
)


class LocalAbcResourcesTests(unittest.TestCase):
    def test_tokenize_strips_short_and_common_words(self):
        parts = tokenize_local_search_query("The Slångpolska af Blekinge")
        self.assertIn("slangpolska", parts)
        self.assertIn("blekinge", parts)
        self.assertNotIn("the", parts)

    @unittest.skipUnless(local_abc_resources_enabled(), "abcresources + textsearch_index not available")
    def test_finds_josefins_dopvals(self):
        rows = search_local_collection_titles("Josefins Dopvals", limit=10)
        self.assertTrue(rows)
        names = " ".join(row["name"].lower() for row in rows)
        self.assertIn("josefin", names)

    @unittest.skipUnless(local_abc_resources_enabled(), "abcresources + textsearch_index not available")
    def test_finds_crested_hens_alias(self):
        rows = search_local_collection_titles("Les Poules Huppees", limit=10)
        self.assertTrue(rows)

    @unittest.skipUnless(local_abc_resources_enabled(), "abcresources + textsearch_index not available")
    def test_finds_bourree_de_chamberat(self):
        rows = search_local_collection_titles("Bourrée de Chambérat", limit=5)
        self.assertTrue(rows)
        self.assertIn("chamberat", rows[0]["name"].lower().replace(" ", ""))

    def test_contour_roundtrip_when_index_present(self):
        index = load_contour_index()
        by_id = index.get("byId") or {}
        if not by_id:
            self.skipTest("contour index not built")
        tune_id = next(iter(by_id))
        abc = load_abc_for_tune_id(tune_id)
        self.assertTrue(abc)
        hits = search_local_abc_by_contour(abc, limit=3)
        self.assertTrue(hits)
        self.assertGreaterEqual(float(hits[0].get("contourScore") or 0), 90)


if __name__ == "__main__":
    unittest.main()
