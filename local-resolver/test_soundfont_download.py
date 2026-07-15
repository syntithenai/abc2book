import os
import tempfile
import unittest
from unittest.mock import patch

import soundfont_download as sf
import server


class SoundfontDownloadTests(unittest.TestCase):
    def test_resolve_prefers_embedded_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, "www")
            volume = os.path.join(tmp, "volume")
            bank = os.path.join(volume, "MusyngKite")
            embed = os.path.join(root, "midi-js-soundfonts", "selection", "MusyngKite", "flute-mp3")
            os.makedirs(embed)
            embed_file = os.path.join(embed, "A4.mp3")
            with open(embed_file, "wb") as handle:
                handle.write(b"embed")
            os.makedirs(os.path.join(bank, "flute-mp3"))
            volume_file = os.path.join(bank, "flute-mp3", "A4.mp3")
            with open(volume_file, "wb") as handle:
                handle.write(b"volume")
            with patch.object(sf, "DEFAULT_SOUNDFONT_DIR", volume), patch.dict(os.environ, {"SOUNDFONT_DIR": volume}):
                resolved = sf.resolve_musyngkite_file("flute-mp3/A4.mp3", root)
                self.assertEqual(resolved, embed_file)

    def test_resolve_falls_back_to_volume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, "www")
            volume = os.path.join(tmp, "volume")
            bank = os.path.join(volume, "MusyngKite", "marimba-mp3")
            os.makedirs(bank)
            os.makedirs(root)
            volume_file = os.path.join(bank, "A4.mp3")
            with open(volume_file, "wb") as handle:
                handle.write(b"volume")
            with patch.dict(os.environ, {"SOUNDFONT_DIR": volume}):
                resolved = sf.resolve_musyngkite_file("marimba-mp3/A4.mp3", root)
                self.assertEqual(resolved, volume_file)

    def test_resolve_piano_from_abcjs_embed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, "www")
            volume = os.path.join(tmp, "volume")
            piano = os.path.join(root, "midi-js-soundfonts", "abcjs", "acoustic_grand_piano-mp3")
            os.makedirs(piano)
            piano_file = os.path.join(piano, "A4.mp3")
            with open(piano_file, "wb") as handle:
                handle.write(b"piano")
            with patch.dict(os.environ, {"SOUNDFONT_DIR": volume}):
                resolved = sf.resolve_musyngkite_file("acoustic_grand_piano-mp3/A4.mp3", root)
                self.assertEqual(resolved, piano_file)

    def test_server_resolve_static_uses_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = os.path.join(tmp, "www")
            volume = os.path.join(tmp, "volume")
            embed = os.path.join(root, "midi-js-soundfonts", "selection", "MusyngKite", "accordion-mp3")
            os.makedirs(embed)
            embed_file = os.path.join(embed, "C4.mp3")
            with open(embed_file, "wb") as handle:
                handle.write(b"acc")
            with open(os.path.join(root, "index.html"), "w", encoding="utf-8") as handle:
                handle.write("<html></html>")
            with patch.object(server, "STATIC_SITE_DIR", root), patch.dict(os.environ, {"SOUNDFONT_DIR": volume}):
                self.assertEqual(
                    server.resolve_static_file("midi-js-soundfonts/MusyngKite/accordion-mp3/C4.mp3"),
                    embed_file,
                )


if __name__ == "__main__":
    unittest.main()
