"""Unit tests for allowlist parsing."""

import os
import unittest
from unittest.mock import patch

from allowlists import (
    ALL_TOKEN,
    email_allowed,
    load_free_access_emails,
    load_hosted_free_access_emails,
    load_resolver_access_emails,
    music_collection_access_allowed,
    parse_email_allowlist,
    resolver_access_allowed,
)


class AllowlistTests(unittest.TestCase):
    def test_parse_csv(self):
        self.assertEqual(
            parse_email_allowlist("a@b.com, C@D.com "),
            {"a@b.com", "c@d.com"},
        )

    def test_all_token(self):
        self.assertTrue(email_allowed({ALL_TOKEN}, "anyone@example.com"))
        self.assertTrue(email_allowed({"all", "x@y.com"}, "z@z.com"))

    def test_empty_deny(self):
        self.assertFalse(email_allowed(set(), "a@b.com"))
        self.assertFalse(email_allowed(None, "a@b.com"))

    def test_membership(self):
        self.assertTrue(email_allowed({"a@b.com"}, "A@B.com"))
        self.assertFalse(email_allowed({"a@b.com"}, "other@b.com"))

    def test_free_access_no_legacy_allowed_fallback(self):
        with patch.dict(os.environ, {"FREE_ACCESS_EMAILS": "", "ALLOWED_EMAILS": "legacy@example.com"}):
            self.assertEqual(load_free_access_emails(), set())

    def test_resolver_access_legacy_allowed_fallback(self):
        with patch.dict(os.environ, {"RESOLVER_ACCESS_EMAILS": "", "ALLOWED_EMAILS": "legacy@example.com"}):
            self.assertIn("legacy@example.com", load_resolver_access_emails())

    def test_hosted_free_falls_back_to_free_access(self):
        with patch.dict(
            os.environ,
            {"HOSTED_FREE_ACCESS_EMAILS": "", "FREE_ACCESS_EMAILS": "free@example.com"},
        ):
            self.assertIn("free@example.com", load_hosted_free_access_emails())

    def test_resolver_access_empty_allows_when_auth_required(self):
        self.assertTrue(resolver_access_allowed("any@example.com", set(), True))

    def test_music_collection_free_access_grants_access(self):
        self.assertTrue(
            music_collection_access_allowed(
                "free@example.com",
                {"user@example.com"},
                {"free@example.com"},
                True,
                collection_enabled=True,
            )
        )
        self.assertFalse(
            music_collection_access_allowed(
                "other@example.com",
                {"user@example.com"},
                {"free@example.com"},
                True,
                collection_enabled=True,
            )
        )


if __name__ == "__main__":
    unittest.main()
