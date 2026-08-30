#!/usr/bin/env python3
"""Export MuseScore .mscz → MusicXML (.mxl) when MuseScore CLI is installed.

Browser review cannot read native .mscx inside .mscz; use this offline then
Add score… with the exported .mxl on review_abc.html.

  python3 scripts/eurosession/mscz_export_musicxml.py ~/Downloads/tune.mscz
  python3 scripts/eurosession/mscz_export_musicxml.py tune.mscz -o tune.mxl
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def find_musescore() -> list[str]:
    for cmd in (
        "mscore4portable",
        "MuseScore4",
        "musescore4",
        "mscore3",
        "musescore3",
        "musescore",
        "mscore",
    ):
        if shutil.which(cmd):
            return [cmd]
    return []


def export_mxl(mscz: Path, out: Path, *, cmd: list[str]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [*cmd, str(mscz), "-o", str(out)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0 or not out.is_file():
        err = (proc.stderr or proc.stdout or "export failed").strip()
        raise RuntimeError(err)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Export MSCZ to MXL via MuseScore CLI")
    parser.add_argument("mscz", type=Path)
    parser.add_argument("-o", "--out", type=Path, default="", help="Output .mxl path")
    args = parser.parse_args()

    mscz = args.mscz.expanduser().resolve()
    if not mscz.is_file():
        raise SystemExit(f"missing {mscz}")
    out = Path(args.out) if args.out else mscz.with_suffix(".mxl")

    cmd = find_musescore()
    if not cmd:
        raise SystemExit(
            "MuseScore CLI not found (tried mscore, musescore, MuseScore4, …).\n"
            "Install MuseScore or export manually: File → Export → MusicXML (compressed)."
        )
    print(f"using {' '.join(cmd)}", flush=True)
    export_mxl(mscz, out, cmd=cmd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
