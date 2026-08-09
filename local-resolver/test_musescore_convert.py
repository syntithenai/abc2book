import io
import unittest
import zipfile
from unittest.mock import patch

from musescore_convert import (
    MuseScoreDownloadUnavailable,
    convert_score_file_to_musicxml,
    extract_musicxml_from_mxl_bytes,
    is_musicxml_text,
    is_mxl_bytes,
    musescore_cli_available,
)

MINIMAL_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Test</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>
"""


def _mxl_bytes_for(music_xml, root_name="score.xml"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container><rootfiles>'
            '<rootfile full-path="{0}"/>'
            '</rootfiles></container>'.format(root_name),
        )
        archive.writestr(root_name, music_xml)
    return buf.getvalue()


class MuseScoreConvertTests(unittest.TestCase):
    def test_is_musicxml_text(self):
        self.assertTrue(is_musicxml_text(MINIMAL_MUSICXML))
        self.assertFalse(is_musicxml_text("<musescore version=\"4.0\">"))

    def test_is_mxl_bytes(self):
        self.assertTrue(is_mxl_bytes(_mxl_bytes_for(MINIMAL_MUSICXML)))
        self.assertFalse(is_mxl_bytes(b"not-a-zip"))

    def test_extract_musicxml_from_mxl_bytes(self):
        text = extract_musicxml_from_mxl_bytes(_mxl_bytes_for(MINIMAL_MUSICXML))
        self.assertIn("<score-partwise", text)

    def test_musescore_cli_available_respects_env(self):
        with patch("musescore_convert.shutil.which", return_value="/usr/bin/mscore"):
            self.assertTrue(musescore_cli_available())
        with patch.dict("os.environ", {"MIDI_IMPORT_MUSESCORE": "0"}):
            self.assertFalse(musescore_cli_available())

    def test_convert_score_file_raises_when_cli_missing(self):
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            score_path = temp_dir + "/test.mid"
            with open(score_path, "wb") as handle:
                handle.write(b"MThd\x00\x00\x00\x06\x00\x00\x00\x00\x00\x00")
            with patch("musescore_convert.subprocess.run", side_effect=FileNotFoundError):
                with self.assertRaises(MuseScoreDownloadUnavailable):
                    convert_score_file_to_musicxml(score_path, temp_dir)


if __name__ == "__main__":
    unittest.main()
