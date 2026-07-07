import unittest

from chord_sheet_utils import reconstruct_chord_sheet_details
from sheet_image_ocr import _parse_predict_result


class PaddleOcrParseTests(unittest.TestCase):
    def test_parse_predict_result(self):
        boxes = _parse_predict_result([
            {
                "res": {
                    "rec_texts": ["Verse", "C G"],
                    "rec_scores": [0.9, 0.8],
                    "rec_boxes": [[10, 10, 60, 24], [10, 40, 80, 54]],
                },
            },
        ])
        self.assertEqual(len(boxes), 2)
        self.assertEqual(boxes[0]["text"], "Verse")
        self.assertAlmostEqual(boxes[1]["x"], 10.0)

    def test_reconstruct_chord_sheet_details_preserves_geometry(self):
        boxes = [
            {"text": "C", "x": 10, "y": 40, "width": 10, "height": 12, "confidence": 0.9},
            {"text": "Hello", "x": 10, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
            {"text": "world", "x": 60, "y": 70, "width": 40, "height": 12, "confidence": 0.9},
        ]
        details = reconstruct_chord_sheet_details(boxes)
        self.assertEqual(len(details), 2)
        self.assertEqual(details[0]["text"], "C")
        self.assertEqual(details[1]["tokens"][0]["text"], "Hello")
        self.assertGreater(details[1]["tokens"][1]["start"], details[1]["tokens"][0]["start"])


if __name__ == "__main__":
    unittest.main()
