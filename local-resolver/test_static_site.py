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

    def test_resolve_static_file_blocks_sensitive_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = os.path.join(tmp, ".env")
            with open(env_path, "w", encoding="utf-8") as handle:
                handle.write("SECRET=1\n")
            nested = os.path.join(tmp, "local-resolver")
            os.makedirs(nested)
            secret_path = os.path.join(nested, "secrets.txt")
            with open(secret_path, "w", encoding="utf-8") as handle:
                handle.write("nope\n")
            with patch.object(server, "STATIC_SITE_DIR", tmp):
                self.assertIsNone(server.resolve_static_file(".env"))
                self.assertIsNone(server.resolve_static_file("local-resolver/secrets.txt"))
                self.assertTrue(server.is_sensitive_static_path(".env.local"))
                self.assertTrue(server.is_sensitive_static_path(".git/config"))


if __name__ == "__main__":
    unittest.main()
