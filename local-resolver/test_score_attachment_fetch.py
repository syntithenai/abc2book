import unittest

from score_attachment_fetch import _guess_attachment_kind, is_allowed_score_attachment_url


class ScoreAttachmentFetchTests(unittest.TestCase):
    def test_allowed_hosts(self):
        self.assertTrue(is_allowed_score_attachment_url("https://imslp.org/wiki/File:Test.pdf"))
        self.assertTrue(is_allowed_score_attachment_url("https://www.cpdl.org/files/pdf/test.pdf"))
        self.assertTrue(
            is_allowed_score_attachment_url("https://www.oldtimefiddletunes.net/tunes/Foo.MID")
        )
        self.assertTrue(
            is_allowed_score_attachment_url("https://oldtimefiddletunes.net/tunes/Foo.pdf")
        )
        self.assertFalse(is_allowed_score_attachment_url("https://example.com/test.pdf"))

    def test_guess_kind_pdf_and_midi(self):
        self.assertEqual(
            _guess_attachment_kind("https://x/tunes/a.pdf", "application/pdf"),
            ("pdf", "application/pdf"),
        )
        self.assertEqual(
            _guess_attachment_kind("https://x/tunes/a.MID", "audio/midi"),
            ("midi", "audio/midi"),
        )
        self.assertEqual(
            _guess_attachment_kind("https://x/tunes/a.mid", "application/octet-stream"),
            ("midi", "audio/midi"),
        )
        self.assertEqual(_guess_attachment_kind("https://x/tunes/a.txt", "text/plain"), ("", ""))


if __name__ == "__main__":
    unittest.main()
