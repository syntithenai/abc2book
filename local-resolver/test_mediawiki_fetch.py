import unittest

from mediawiki_fetch import (
    extract_score_links_from_html,
    mediawiki_cookies_for_base_url,
    page_title_from_wiki_url,
    rank_score_file_urls,
    score_file_rank,
)


class MediaWikiFetchTests(unittest.TestCase):
    def test_score_file_rank_prefers_mxl_over_pdf(self):
        self.assertLess(
            score_file_rank("https://example.com/score.mxl"),
            score_file_rank("https://example.com/score.pdf"),
        )
        self.assertLess(
            score_file_rank("https://example.com/score.musicxml"),
            score_file_rank("https://example.com/score.pdf"),
        )

    def test_rank_score_file_urls(self):
        ranked = rank_score_file_urls([
            "https://example.com/a.pdf",
            "https://example.com/b.mxl",
            "https://example.com/c.musicxml",
        ])
        self.assertEqual(ranked[0], "https://example.com/b.mxl")
        self.assertEqual(ranked[-1], "https://example.com/a.pdf")

    def test_extract_score_links_from_html(self):
        html = '''
        <a href="/wiki/File:Score.mxl">MXL</a>
        <a href="https://cdn.example.org/part.pdf">PDF</a>
        '''
        links = extract_score_links_from_html(html, "https://www.cpdl.org/wiki/index.php/Work")
        self.assertTrue(any(link.endswith(".mxl") for link in links))
        self.assertTrue(any(link.endswith(".pdf") for link in links))

    def test_page_title_from_wiki_url(self):
        title = page_title_from_wiki_url("https://imslp.org/wiki/Mass_in_B_minor,_BWV_232_(Bach,_Johann_Sebastian)")
        self.assertIn("Mass in B minor", title)

    def test_imslp_disclaimer_cookie(self):
        cookies = mediawiki_cookies_for_base_url("https://imslp.org/wiki/Test")
        self.assertEqual(cookies.get("imslpdisclaimeraccepted"), "yes")


if __name__ == "__main__":
    unittest.main()
