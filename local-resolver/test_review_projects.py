"""Unit tests for review_projects path safety and catalog."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import review_projects as rp


class ReviewProjectsTests(unittest.TestCase):
    def test_safe_join_rejects_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                rp._safe_join(tmp, "../etc/passwd")
            with self.assertRaises(ValueError):
                rp._safe_join(tmp, "a/../../etc/passwd")

    def test_catalog_discovers_known_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            mk = Path(tmp) / "milliner-koken/milliner-koken-full/merged"
            mk.mkdir(parents=True)
            (mk / "milliner-koken-import.json").write_text("{}", encoding="utf-8")
            (mk / "tunes").mkdir()
            ot = Path(tmp) / "oldtimefiddletunes/public-packages"
            ot.mkdir(parents=True)
            (ot / "enrich_package_proof.json").write_text("{}", encoding="utf-8")
            with patch.dict(os.environ, {"REVIEW_PROJECTS_DIR": tmp}):
                catalog = rp.review_projects_catalog()
            self.assertTrue(catalog["available"])
            ids = [p["id"] for p in catalog["projects"]]
            self.assertEqual(ids, ["milliner-koken", "oldtimefiddletunes"])
            health = rp.review_projects_health_fields()
            self.assertTrue(health["reviewProjects"])
            self.assertEqual(health["reviewProjectsCount"], 2)

    def test_health_false_when_missing(self):
        missing = "/tmp/abc2book-review-projects-missing-" + str(os.getpid())
        with patch.dict(os.environ, {"REVIEW_PROJECTS_DIR": missing}):
            health = rp.review_projects_health_fields()
        self.assertFalse(health["reviewProjects"])
        self.assertIsNone(health["reviewProjectsDir"])


if __name__ == "__main__":
    unittest.main()
