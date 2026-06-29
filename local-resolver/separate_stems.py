import contextlib
import io
import json
import os
import sys
import tempfile

from stem_separation import HTDEMUCS_STEMS, separate_stems_to_dir


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: separate_stems.py <audio-path> [output-dir]")

    audio_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) >= 3 and sys.argv[2] else tempfile.mkdtemp(prefix="stems-")
    capture = io.StringIO()
    with contextlib.redirect_stdout(capture):
        result = separate_stems_to_dir(audio_path, output_dir)
    payload = {
        "paths": result["paths"],
        "samplerate": result["samplerate"],
        "duration": result["duration"],
        "backend": result["backend"],
        "model": result["model"],
        "stems": list(HTDEMUCS_STEMS),
        "outputDir": output_dir,
    }
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
