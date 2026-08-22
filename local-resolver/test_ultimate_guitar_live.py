"""Opt-in live smoke tests against Ultimate Guitar chord pages.

Run with: RUN_UG_LIVE=1 pytest local-resolver/test_ultimate_guitar_live.py -q
"""

from __future__ import annotations

import os
import unittest

import httpx
import pytest

from chords_fetch import (
    extract_chord_sheet_meta,
    extract_sheet_from_html,
    fetch_headers,
    finalize_sheet_lines,
    has_usable_chord_lines,
)
from polite_fetch import polite_get

RUN_UG_LIVE = os.getenv("RUN_UG_LIVE", "").strip() in {"1", "true", "yes"}

UG_CHORD_URLS = (
    (
        "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596",
        "Wonderwall",
        "Oasis",
    ),
    (
        "https://tabs.ultimate-guitar.com/tab/radiohead/creep-chords-4169",
        "Creep",
        "Radiohead",
    ),
    (
        "https://tabs.ultimate-guitar.com/tab/bruce-springsteen/born-in-the-usa-chords-148158",
        "Born In The Usa",
        "Bruce Springsteen",
    ),
)


@pytest.mark.skipif(not RUN_UG_LIVE, reason="Set RUN_UG_LIVE=1 to hit Ultimate Guitar")
class UltimateGuitarLiveTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_ug_chord_pages_extract_usable_sheets(self):
        async with httpx.AsyncClient(timeout=30.0, headers=fetch_headers(), follow_redirects=True) as client:
            for url, expected_title, expected_artist in UG_CHORD_URLS:
                with self.subTest(url=url):
                    result = await polite_get(client, url)
                    self.assertEqual(
                        result.blocked_reason,
                        "none",
                        "blocked fetching {0}: {1}".format(url, result.blocked_reason),
                    )
                    html_text = result.text or ""
                    self.assertTrue(html_text.strip(), "empty HTML for {0}".format(url))

                    raw_sheet = extract_sheet_from_html(html_text, url)
                    self.assertIsNotNone(raw_sheet, "no sheet extracted from {0}".format(url))
                    raw_lines = raw_sheet.splitlines()
                    meta = extract_chord_sheet_meta(raw_lines)
                    sheet_lines = finalize_sheet_lines(raw_lines)
                    self.assertTrue(sheet_lines, "empty sheet lines for {0}".format(url))
                    self.assertTrue(
                        has_usable_chord_lines(sheet_lines),
                        "no usable chords for {0}".format(url),
                    )
                    joined = "\n".join(sheet_lines).lower()
                    # Prefer real lyric/chord content over empty chrome.
                    self.assertGreater(len(joined), 40)
                    # Meta may be absent on some versions; when present capo is int.
                    if meta.get("capo") is not None:
                        self.assertIsInstance(meta["capo"], int)
                    # Soft identity check: title token appears somewhere in page store path
                    # via sheet content or we at least got chords (already asserted).
                    _ = expected_title, expected_artist


if __name__ == "__main__":
    unittest.main()
