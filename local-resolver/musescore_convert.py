"""MuseScore CLI conversion helpers (no web-fetch dependencies)."""

from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import tempfile
import zipfile

MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS = 90.0

MUSICXML_MARKERS = (
    "<?xml",
    "<score-partwise",
    "<score-timewise",
)


class MuseScoreDownloadUnavailable(ValueError):
    """Raised when MuseScore CLI conversion fails."""

    def __init__(self, message=None, source=None, access_tier="unknown"):
        super().__init__(
            message
            or (
                "MuseScore could not convert that score file to MusicXML. "
                "Try exporting MusicXML from MuseScore and importing that file."
            )
        )
        self.source = source or "unknown"
        self.access_tier = access_tier or "unknown"


def musescore_cli_available() -> bool:
    if os.getenv("MIDI_IMPORT_MUSESCORE", "").strip().lower() in ("0", "false", "no"):
        return False
    return bool(
        shutil.which("mscore")
        or shutil.which("musescore")
        or shutil.which("MuseScore4")
        or os.path.isfile("/opt/musescore/AppRun")
    )


def is_musicxml_text(text: str) -> bool:
    head = (text or "")[:400].lower()
    return any(marker in head for marker in MUSICXML_MARKERS)


def is_mxl_bytes(data: bytes) -> bool:
    if not data or len(data) < 4:
        return False
    return data[:2] == b"PK"


def extract_musicxml_from_mxl_bytes(data: bytes) -> str:
    """Unzip MXL and return MusicXML text using META-INF/container.xml when present."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        root_path = None
        container_name = next(
            (name for name in names if name.replace("\\", "/").endswith("META-INF/container.xml")),
            None,
        )
        if container_name:
            container_xml = archive.read(container_name).decode("utf-8", errors="replace")
            root_match = re.search(
                r'full-path\s*=\s*["\']([^"\']+)["\']',
                container_xml,
                re.I,
            )
            if root_match:
                root_path = root_match.group(1).lstrip("./")
        if not root_path:
            for name in names:
                lower = name.lower()
                if lower.endswith("score.xml") or lower.endswith(".musicxml") or lower.endswith(".xml"):
                    if "meta-inf" in lower:
                        continue
                    root_path = name
                    break
        if not root_path:
            raise ValueError("MXL archive has no MusicXML root file")
        try:
            raw = archive.read(root_path)
        except KeyError:
            match = next(
                (name for name in names if name.replace("\\", "/").endswith(root_path.replace("\\", "/"))),
                None,
            )
            if not match:
                raise ValueError('Could not find MusicXML file "{0}" inside MXL archive'.format(root_path))
            raw = archive.read(match)
        text = raw.decode("utf-8", errors="replace")
        if not is_musicxml_text(text):
            raise ValueError("MXL archive does not contain valid MusicXML")
        return text


def convert_score_file_to_musicxml(
    score_file: str,
    temp_dir: str,
    *,
    output_stem: str = "output",
) -> str:
    """Convert a local score file (MIDI, MSCZ, etc.) to MusicXML via MuseScore CLI."""
    last_error = ""
    for ext in (".musicxml", ".mxl"):
        output_path = os.path.join(temp_dir, output_stem + ext)
        convert_attempts = (
            ("xvfb-run", "-a", "mscore", "-o", output_path, score_file),
            ("xvfb-run", "-a", "musescore", "-o", output_path, score_file),
            ("mscore", "-o", output_path, score_file),
            ("musescore", "-o", output_path, score_file),
        )
        for convert_cmd in convert_attempts:
            try:
                convert_result = subprocess.run(
                    list(convert_cmd),
                    capture_output=True,
                    text=True,
                    timeout=MUSESCORE_LIBRESCORE_TIMEOUT_SECONDS,
                )
            except FileNotFoundError:
                last_error = "Command not found: {0}".format(convert_cmd[0])
                continue
            if convert_result.returncode != 0 or not os.path.isfile(output_path):
                last_error = (convert_result.stderr or convert_result.stdout or "").strip()
                continue
            if ext == ".mxl":
                with open(output_path, "rb") as handle:
                    return extract_musicxml_from_mxl_bytes(handle.read())
            with open(output_path, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read().strip()
            if text and is_musicxml_text(text):
                return text
            last_error = "MuseScore produced invalid MusicXML"
    raise MuseScoreDownloadUnavailable(
        "MuseScore conversion failed: {0}".format(last_error or "unknown error"),
        source="musescore",
    )


# Backward-compatible alias used by musescore_fetch and server endpoints.
_convert_score_file_to_musicxml = convert_score_file_to_musicxml


def convert_midi_bytes_to_musicxml_via_musescore(midi_bytes: bytes, filename: str = "import.mid") -> str:
    """Convert MIDI bytes to MusicXML using the MuseScore CLI."""
    if not midi_bytes:
        return ""
    safe_name = os.path.basename(filename or "import.mid") or "import.mid"
    if not safe_name.lower().endswith((".mid", ".midi")):
        safe_name += ".mid"
    with tempfile.TemporaryDirectory() as temp_dir:
        mid_path = os.path.join(temp_dir, safe_name)
        with open(mid_path, "wb") as handle:
            handle.write(midi_bytes)
        try:
            return convert_score_file_to_musicxml(mid_path, temp_dir, output_stem="midi_import")
        except MuseScoreDownloadUnavailable:
            return ""
