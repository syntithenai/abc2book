"""Tests for continental ABC collectors (Norbeck / JC)."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from continental_abc_fetch import (
    collect_continental_abc_candidates,
    collect_jc_candidates,
    collect_norbeck_candidates,
)


NORBECK_INDEX_HTML = """
<html><body>
<a href="sweden.txt">Sweden</a>
<a href="other.txt">Other</a>
</body></html>
"""

NORBECK_FILE = """
X:1
T:Slängpolska Magnus
M:3/4
L:1/8
K:Am
|:A2B2c2|d2c2B2:|
"""

JC_FIND_HTML = """
<html><body>
<a href="/~jc/music/abc/Sweden/JosefinsDopvals.abc">Josefins Dopvals</a>
</body></html>
"""

JC_ABC = """
X:1
T:Josefin's Dopvals
M:3/4
L:1/8
K:G
|:G2A2B2|c2B2A2:|
"""


class ContinentalAbcFetchTests(unittest.IsolatedAsyncioTestCase):
    async def test_collect_norbeck_candidates_from_linked_file(self):
        client = MagicMock()

        async def fake_get(url, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if url.endswith("sweden.txt") or "sweden.txt" in url:
                resp.text = NORBECK_FILE
            else:
                resp.text = NORBECK_INDEX_HTML
            return resp

        client.get = AsyncMock(side_effect=fake_get)
        cands = await collect_norbeck_candidates(client, "Slängpolska Magnus")
        self.assertTrue(cands)
        self.assertEqual(cands[0]["source"], "norbeck.nu")
        self.assertIn("K:", cands[0]["abc"])

    async def test_collect_jc_candidates_from_finder(self):
        client = MagicMock()

        async def fake_get(url, **kwargs):
            resp = MagicMock()
            resp.status_code = 200
            if url.endswith(".abc") or ".abc" in url.split("?")[0]:
                resp.text = JC_ABC
            else:
                resp.text = JC_FIND_HTML
            return resp

        client.get = AsyncMock(side_effect=fake_get)
        cands = await collect_jc_candidates(client, "Josefins Dopvals")
        self.assertTrue(cands)
        self.assertEqual(cands[0]["source"], "trillian.mit.edu")

    async def test_collect_continental_merges(self):
        with patch(
            "continental_abc_fetch.collect_norbeck_candidates",
            new_callable=AsyncMock,
            return_value=[{"source": "norbeck.nu", "abc": "X:1\nK:C\nC"}],
        ), patch(
            "continental_abc_fetch.collect_jc_candidates",
            new_callable=AsyncMock,
            return_value=[{"source": "trillian.mit.edu", "abc": "X:1\nK:G\nG"}],
        ):
            client = MagicMock()
            merged = await collect_continental_abc_candidates(client, "Tune")
        self.assertEqual(len(merged), 2)


if __name__ == "__main__":
    unittest.main()
