import unittest
from unittest.mock import AsyncMock, patch

from image_search import _normalize_image_result, image_search_available, search_images


class ImageSearchTests(unittest.TestCase):
    def test_image_search_available_requires_api_key(self):
        with patch("image_search.BRAVE_SEARCH_API_KEY", ""):
            self.assertFalse(image_search_available())
        with patch("image_search.BRAVE_SEARCH_API_KEY", "token"):
            self.assertTrue(image_search_available())

    def test_normalize_image_result_prefers_full_url(self):
        item = {
            "title": "Lead sheet",
            "thumbnail": {"src": "https://cdn.example.com/thumb.jpg"},
            "properties": {"url": "https://cdn.example.com/full.jpg"},
            "meta_url": {"hostname": "example.com"},
        }
        normalized = _normalize_image_result(item)
        self.assertEqual(normalized["imageUrl"], "https://cdn.example.com/full.jpg")
        self.assertEqual(normalized["thumbnailUrl"], "https://cdn.example.com/thumb.jpg")
        self.assertEqual(normalized["source"], "example.com")

    def test_search_images_requires_query(self):
        with self.assertRaises(ValueError):
            import asyncio
            asyncio.run(search_images("  "))


if __name__ == "__main__":
    unittest.main()
