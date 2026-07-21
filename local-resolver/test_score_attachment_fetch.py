import unittest

from score_attachment_fetch import is_allowed_score_attachment_url


class ScoreAttachmentFetchTests(unittest.TestCase):
    def test_allowed_hosts(self):
        self.assertTrue(is_allowed_score_attachment_url("https://imslp.org/wiki/File:Test.pdf"))
        self.assertTrue(is_allowed_score_attachment_url("https://www.cpdl.org/files/pdf/test.pdf"))
        self.assertFalse(is_allowed_score_attachment_url("https://example.com/test.pdf"))


if __name__ == "__main__":
    unittest.main()
