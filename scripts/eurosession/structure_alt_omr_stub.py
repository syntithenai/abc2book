#!/usr/bin/env python3
"""Sample STRUCTURE_ALT_OMR_CMD wrapper.

Emits JSON StructureEvent list on stdout. Replace the body with an Audiveris
(or other CLI) call when that tool is installed locally — this stub returns []
so CI / default runs stay dependency-free.

Usage (env):
  STRUCTURE_ALT_OMR_CMD='python3 scripts/eurosession/structure_alt_omr_stub.py --image {image} --bars {bars}'
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--bars", type=int, default=8)
    args = parser.parse_args()
    # Intentionally empty: wire Audiveris/other here when available, e.g.
    #   subprocess → parse MusicXML barlines → StructureEvent dicts
    _ = (args.image, args.bars)
    print(json.dumps([]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
