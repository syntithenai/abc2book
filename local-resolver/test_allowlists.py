"""Unit tests for allowlist parsing."""

import unittest

from allowlists import ALL_TOKEN, email_allowed, parse_email_allowlist


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


if __name__ == "__main__":
    unittest.main()
