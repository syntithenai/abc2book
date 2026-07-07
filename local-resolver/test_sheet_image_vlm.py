import unittest
from unittest.mock import AsyncMock, patch

from sheet_image_vlm import cleanup_chord_sheet_with_llm, should_try_vlm_fallback


class SheetImageVlmTests(unittest.IsolatedAsyncioTestCase):
    def test_should_try_vlm_fallback(self):
        with patch("sheet_image_vlm.vlm_fallback_enabled", return_value=True):
            self.assertTrue(should_try_vlm_fallback(0.2))
            self.assertFalse(should_try_vlm_fallback(0.9))

    async def test_cleanup_chord_sheet_with_llm(self):
        response = unittest.mock.MagicMock()
        response.raise_for_status = unittest.mock.MagicMock()
        response.json.return_value = {
            "choices": [{
                "message": {
                    "content": '{"title":"Song","artist":"Artist","lines":["Verse","C G","Hello"]}',
                },
            }],
        }
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post = AsyncMock(return_value=response)
        with patch("sheet_image_vlm.httpx.AsyncClient", return_value=mock_client):
            result = await cleanup_chord_sheet_with_llm(["Verse", "C G", "Hello"], [])
        self.assertEqual(result["title"], "Song")
        self.assertIn("Hello", result["text"])


if __name__ == "__main__":
    unittest.main()
