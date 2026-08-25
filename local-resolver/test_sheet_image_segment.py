import os
import tempfile
import unittest

import numpy as np

from sheet_image_preprocess import deskew_bgr, estimate_skew_angle, preprocess_sheet_image
from sheet_image_segment import (
    is_harmony_title,
    is_junk_split_title,
    is_strong_split_title,
    looks_like_person_name_title,
    looks_like_title_line,
    segment_page_from_ocr_boxes,
    select_title_lines,
    segments_from_title_lines,
)
from sheet_image_staff_detect import staff_union_crop_box, write_staff_crop, detect_staff_regions

try:
    import cv2
except ImportError:
    cv2 = None


class SegmentTests(unittest.TestCase):
    def test_looks_like_title_line(self):
        self.assertTrue(looks_like_title_line("Bourrée d'Aurore Sand (Dm)"))
        self.assertFalse(looks_like_title_line("Dm"))
        self.assertFalse(looks_like_title_line("Dm A Gm A7"))
        self.assertFalse(looks_like_title_line("Harmony"))

    def test_is_strong_split_title(self):
        self.assertTrue(is_strong_split_title("Miserlou (Gm)"))
        self.assertTrue(is_strong_split_title("Dejól lo pont de Lion"))
        self.assertTrue(is_strong_split_title("Moshe Emes"))
        self.assertFalse(is_strong_split_title("BC CCE"))
        self.assertFalse(is_strong_split_title("Trad Occitan"))
        self.assertFalse(is_strong_split_title("Shiffra Tanzt - Harmony"))
        self.assertTrue(is_harmony_title("Shiffra Tanzt - Harmony"))
        self.assertTrue(is_harmony_title("(Harmony)"))
        self.assertFalse(is_strong_split_title("G Em Brotto Lopez"))
        self.assertFalse(is_strong_split_title("D.C. al Fine"))
        self.assertFalse(is_strong_split_title("To Coda Final time"))
        self.assertFalse(is_strong_split_title("Furosession tunebook V2.4.1 March 9994,"))
        self.assertFalse(is_strong_split_title("= | Start here Dm DR"))
        self.assertFalse(is_strong_split_title("a hii DEN C(Am)"))
        self.assertTrue(is_junk_split_title("ARTERS ATE TORE RO LT i À Å"))
        self.assertTrue(is_junk_split_title("sart . witli LA"))

    def test_segments_from_titles(self):
        titles = [
            {"text": "Tune One", "top": 40, "bottom": 70, "confidence": 0.9},
            {"text": "Tune Two", "top": 400, "bottom": 430, "confidence": 0.9},
        ]
        segments = segments_from_title_lines(titles, image_height=800)
        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[0]["title"], "Tune One")
        self.assertLess(segments[0]["bottom"], segments[1]["top"] + 1)
        self.assertEqual(segments[1]["bottom"], 800)

    def test_segment_page_from_ocr_boxes(self):
        width, height = 1000, 1200
        boxes = [
            {"text": "Bourree", "x": 350, "y": 50, "width": 120, "height": 28, "confidence": 0.95},
            {"text": "One", "x": 480, "y": 52, "width": 60, "height": 26, "confidence": 0.95},
            {"text": "Dm", "x": 40, "y": 120, "width": 30, "height": 14, "confidence": 0.9},
            {"text": "Bourree", "x": 340, "y": 520, "width": 120, "height": 28, "confidence": 0.94},
            {"text": "Two", "x": 470, "y": 522, "width": 60, "height": 26, "confidence": 0.94},
        ]
        segments = segment_page_from_ocr_boxes(boxes, width, height)
        self.assertGreaterEqual(len(segments), 2)
        self.assertIn("Bourree", segments[0]["title"])


class PreprocessTests(unittest.TestCase):
    @unittest.skipIf(cv2 is None, "opencv required")
    def test_deskew_small_rotation(self):
        # Synthetic horizontal lines, rotate, then deskew toward upright.
        canvas = np.full((400, 600), 255, dtype=np.uint8)
        for y in (80, 100, 120, 140, 160):
            canvas[y : y + 2, 40:560] = 0
        rotated = cv2.warpAffine(
            canvas,
            cv2.getRotationMatrix2D((300, 200), 3.0, 1.0),
            (600, 400),
            borderMode=cv2.BORDER_REPLICATE,
        )
        angle = estimate_skew_angle(rotated)
        self.assertNotEqual(angle, 0.0)
        bgr = cv2.cvtColor(rotated, cv2.COLOR_GRAY2BGR)
        deskewed, applied = deskew_bgr(bgr)
        self.assertNotEqual(applied, 0.0)
        # Expanded-canvas rotate grows the frame so content is not clipped.
        self.assertGreaterEqual(deskewed.shape[0] * deskewed.shape[1], bgr.shape[0] * bgr.shape[1])

    @unittest.skipIf(cv2 is None, "opencv required")
    def test_deskew_expands_canvas(self):
        from sheet_image_preprocess import rotate_expand_bgr

        canvas = np.full((200, 300, 3), 255, dtype=np.uint8)
        canvas[80:120, 40:260] = 0
        rotated = rotate_expand_bgr(canvas, 5.0)
        self.assertGreaterEqual(rotated.shape[0] * rotated.shape[1], canvas.shape[0] * canvas.shape[1])


class StaffCropTests(unittest.TestCase):
    def test_staff_union_crop_box(self):
        info = {
            "staffRegions": [
                {"top": 100, "bottom": 160},
                {"top": 200, "bottom": 260},
            ]
        }
        box = staff_union_crop_box(info, 800, 600, pad_top=10, pad_bottom=10)
        self.assertEqual(box, (0, 90, 800, 270))

    @unittest.skipIf(cv2 is None, "opencv required")
    def test_write_staff_crop_fixture(self):
        fixture = os.path.join(
            os.path.dirname(__file__),
            "test_fixtures",
            "sheet_images",
            "staff_only.png",
        )
        if not os.path.isfile(fixture):
            self.skipTest("fixture missing")
        with tempfile.TemporaryDirectory() as tmp:
            info = detect_staff_regions(fixture)
            path = write_staff_crop(fixture, tmp, staff_info=info)
            self.assertIsNotNone(path)
            self.assertTrue(os.path.isfile(path))


if __name__ == "__main__":
    unittest.main()
