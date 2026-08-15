import unittest

from cpdl_fetch import annotate_cpdl_candidate, build_cpdl_search_queries, is_cpdl_url
from imslp_fetch import annotate_imslp_candidate, build_imslp_manual_candidate, is_imslp_url
from notation_fetch import (
    _candidate_has_usable_payload,
    notation_source_bonus,
)


class ArchiveCandidateTests(unittest.TestCase):
    def test_pdf_candidate_payload(self):
        candidate = annotate_cpdl_candidate(
            title="Ave Verum",
            artist="Mozart",
            source_url="https://www.cpdl.org/wiki/index.php/Ave_verum",
            pdf_attachment={
                "downloadUrl": "https://www.cpdl.org/files/pdf/ave.pdf",
                "filename": "ave.pdf",
                "contentType": "application/pdf",
            },
        )
        self.assertTrue(_candidate_has_usable_payload(candidate))
        self.assertEqual(candidate["preview"], "Sheet PDF (no MusicXML)")

    def test_choral_cpdl_bonus(self):
        candidate = annotate_imslp_candidate(
            music_xml="<score-partwise/>",
            title="Mass",
            source_url="https://imslp.org/wiki/Mass",
        )
        bonus = notation_source_bonus(candidate, song_type="choral")
        self.assertGreaterEqual(bonus, 25)

    def test_archive_url_detection(self):
        self.assertTrue(is_cpdl_url("https://www.cpdl.org/wiki/index.php/Test"))
        self.assertTrue(is_imslp_url("https://imslp.org/wiki/Test"))

    def test_imslp_manual_candidate(self):
        manual = build_imslp_manual_candidate("https://imslp.org/wiki/Test", title="Test")
        self.assertEqual(manual["source"], "imslp.org")

    def test_midi_bytes_payload(self):
        from midi_fetch import annotate_midi_candidate

        candidate = annotate_midi_candidate(
            b"MThd\x00\x00\x00\x06\x00\x00\x00\x01\x00\x60MTrk\x00\x00\x00\x04\x00\xff/\x00",
            title="Moonlight Sonata",
            source_url="/midi-resources/Various Artists/Moonlight Sonata (Beethoven).mid",
        )
        self.assertTrue(_candidate_has_usable_payload(candidate))
        self.assertEqual(candidate["importFormat"], "midi")

    def test_midi_listing_without_bytes_is_usable(self):
        from midi_fetch import annotate_midi_candidate

        candidate = annotate_midi_candidate(
            b"",
            title="Moonlight Sonata",
            source_url="/midi-resources/Various Artists/Moonlight Sonata (Beethoven).mid",
        )
        self.assertFalse(candidate.get("midiBytes"))
        self.assertTrue(_candidate_has_usable_payload(candidate))


if __name__ == "__main__":
    unittest.main()
