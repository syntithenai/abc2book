import os
import tempfile
import unittest
from unittest.mock import patch

import server


class StaticSiteTests(unittest.TestCase):
    def test_resolve_static_file_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(server, "STATIC_SITE_DIR", tmp):
                self.assertIsNone(server.resolve_static_file("../etc/passwd"))
                self.assertIsNone(server.resolve_static_file("/etc/passwd"))

    def test_resolve_static_file_finds_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            index_path = os.path.join(tmp, "index.html")
            with open(index_path, "w", encoding="utf-8") as handle:
                handle.write("<html></html>")
            with patch.object(server, "STATIC_SITE_DIR", tmp):
                self.assertEqual(server.resolve_static_file(""), index_path)
                self.assertEqual(server.resolve_static_file("index.html"), index_path)

    def test_static_site_enabled_auto_requires_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(server, "STATIC_SITE_DIR", tmp), patch.object(
                server, "STATIC_SITE_ENABLED", "auto"
            ):
                self.assertFalse(server.static_site_enabled())
            with open(os.path.join(tmp, "index.html"), "w", encoding="utf-8") as handle:
                handle.write("<html></html>")
            with patch.object(server, "STATIC_SITE_DIR", tmp), patch.object(
                server, "STATIC_SITE_ENABLED", "auto"
            ):
                self.assertTrue(server.static_site_enabled())


if __name__ == "__main__":
    unittest.main()
